import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { mockAdminAccounts, type MockInvite } from './kidMocks';

// SPEC-household-basics UX §3 (plan TASK-210) — Add an adult in a real browser:
// the Accounts head, the open-sign-up warning, the dialog (form, link-once,
// clipboard fallback), Pending invites and Revoke, at the iPad width and at
// desktop. TC-003 step 1, TC-007, TC-010.

const JORDAN: MockInvite = {
  id: 'i-jordan',
  name: 'Jordan',
  role: 'admin',
  createdAt: '2026-11-07T10:00:00Z',
  expiresAt: '2026-11-14T12:00:00Z',
  createdBy: { id: 'u-admin', name: 'Caleb' },
};

async function openAccounts(page: Page, w: number, h: number, opts: Parameters<typeof mockAdminAccounts>[2] = {}) {
  await page.setViewportSize({ width: w, height: h });
  const mock = await mockAdminAccounts(page, {}, opts);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  await expect(page.getByTestId('account-row')).toHaveCount(4);
  return mock;
}

async function atLeast44(el: Locator, what: string) {
  const box = (await el.boundingBox())!;
  expect(box.height, `${what} is under 44px tall`).toBeGreaterThanOrEqual(44);
}

async function fitsViewport(el: Locator, w: number, h: number, what: string) {
  const box = (await el.boundingBox())!;
  expect(box.x, `${what} starts off-screen`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} runs past the right edge`).toBeLessThanOrEqual(w + 0.5);
  expect(box.height, `${what} is taller than the viewport`).toBeLessThanOrEqual(h + 0.5);
}

for (const [label, w, h] of [
  ['iPad 820', 820, 1180],
  ['desktop 1440', 1440, 900],
] as const) {
  test.describe(`Add an adult — ${label}`, () => {
    test('head, warning, member pill and Pending invites', async ({ page }) => {
      await openAccounts(page, w, h, { registration: 'open', invites: [JORDAN] });
      const add = page.getByRole('button', { name: '+ Add an adult' });
      await expect(add).toBeVisible();
      await atLeast44(add, '+ Add an adult');
      const note = page.getByRole('note');
      await expect(note).toContainText('Anyone who can open Homepad can create an account.');
      await expect(note).toContainText('A kid who signs out could make an adult account.');
      await expect(page.getByTestId('account-row').nth(1).locator('.role-pill')).toHaveText('member');
      const row = page.getByTestId('invite-row');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('Jordan');
      await atLeast44(row.getByRole('button', { name: "Revoke Jordan's invite" }), 'Revoke');
    });

    test('TC-003 — make a member link, copy it, and see it pending; then revoke it', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      const mock = await openAccounts(page, w, h);
      await page.getByRole('button', { name: '+ Add an adult' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add an adult' });
      await fitsViewport(dialog, w, h, 'Add an adult dialog');
      await dialog.getByLabel('Name').fill('Alex');
      await expect(dialog.getByRole('radio', { name: 'Member' })).toBeChecked();
      await dialog.getByRole('button', { name: 'Create link' }).click();

      const link = page.getByRole('dialog', { name: 'Invite for Alex' });
      await expect(link).toContainText('Send Alex this link.');
      const field = link.getByLabel('Invite link');
      await expect(field).toHaveValue(/\/#invite=tok-i-new-\d+$/);
      await link.getByRole('button', { name: 'Copy link' }).click();
      await expect(link.getByRole('button', { name: 'Copied' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.inputValue());
      await link.getByRole('button', { name: 'Done' }).click();
      expect(mock.inviteCreates).toEqual([{ name: 'Alex', role: 'user' }]);

      const row = page.getByTestId('invite-row').filter({ hasText: 'Alex' });
      await expect(row).toContainText('member');
      await row.getByRole('button', { name: "Revoke Alex's invite" }).click();
      const confirm = page.getByRole('alertdialog', { name: "Revoke Alex's invite?" });
      await expect(confirm).toContainText('The link stops working.');
      await confirm.getByRole('button', { name: 'Revoke' }).click();
      await expect(page.getByTestId('invite-row')).toHaveCount(0);
      expect(mock.revoked).toHaveLength(1);
    });

    test('picking Admin shows the amber line; Escape closes only the dialog', async ({ page }) => {
      await openAccounts(page, w, h);
      await page.getByRole('button', { name: '+ Add an adult' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add an adult' });
      await dialog.getByRole('radio', { name: 'Admin' }).check();
      await expect(dialog.getByText('Admins can do everything you can, including inviting other admins.')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
    });
  });
}

test('TC-010 — no clipboard (plain http): the link field is selected, with the hint', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'isSecureContext', { value: false }));
  await openAccounts(page, 820, 1180);
  await page.getByRole('button', { name: '+ Add an adult' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an adult' });
  await dialog.getByLabel('Name').fill('Alex');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const link = page.getByRole('dialog', { name: 'Invite for Alex' });
  await expect(link.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
  await expect(link.getByText(/^Press (⌘C|Ctrl\+C|and hold) to copy\.$/)).toBeVisible();
  const field = link.getByLabel('Invite link');
  await expect(field).toBeFocused();
  const selected = await field.evaluate((el: HTMLInputElement) => el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0));
  expect(selected).toBe(await field.inputValue());
});

test('TC-007 — at the cap, the dialog and the kid editor say so; the rest of Accounts works', async ({ page }) => {
  // Four accounts in the default seed: a cap of 4 is already full.
  await openAccounts(page, 1440, 900, { maxAccounts: 4 });
  await page.getByRole('button', { name: '+ Add an adult' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add an adult' });
  await dialog.getByLabel('Name').fill('Alex');
  await dialog.getByRole('button', { name: 'Create link' }).click();
  await expect(dialog.getByText('This Homepad has reached its limit of 4 accounts.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: '+ Add a kid' }).click();
  const kid = page.getByRole('dialog', { name: 'Add a kid' });
  await kid.getByLabel('Name').fill('Sam');
  await kid.getByRole('button', { name: 'Save' }).click();
  await expect(kid.getByRole('alert')).toHaveText('This Homepad has reached its limit of 4 accounts.');
});
