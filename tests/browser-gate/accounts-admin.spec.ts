import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { mockAdminAccounts } from './kidMocks';

// SPEC-kid-accounts TASK-406 — the admin side in a real browser: the Accounts
// section (UX §2), the kid editor (§3) and the sign-in-here confirm (§4), at the
// iPad width the admin sets a kid's iPad up on and at desktop. Then the whole
// TC-001 hand-over: sign in this device as the kid, reload, kid board.

async function hitTestable(el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const hit = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === node || node.contains(top));
  });
  expect(hit, `${what} is covered by another element at its centre`).toBe(true);
}

async function openAccounts(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  const mock = await mockAdminAccounts(page);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('account-row')).toHaveCount(4);
  return { mock, panel };
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
  test.describe(`Accounts — ${label}`, () => {
    test('the section comes first and kid rows are ≥44px targets', async ({ page }) => {
      const { panel } = await openAccounts(page, w, h);
      const titles = await panel.locator('h3.settings-section-title').allTextContents();
      expect(titles.slice(0, 2)).toEqual(['Accounts', 'System']);
      const rows = page.getByTestId('account-row');
      await expect(rows.nth(0)).toContainText('you');
      await expect(rows.nth(1)).toContainText('alex@example.com');
      await expect(rows.nth(2)).toContainText('5 apps · 1 device');
      await expect(rows.nth(3)).toContainText('0 apps · no devices');
      const maya = rows.nth(2).getByRole('button');
      await hitTestable(maya, 'Maya row');
      expect((await maya.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
    });

    test('the editor fits, its chips are ≥44px, and Escape closes one layer', async ({ page }) => {
      await openAccounts(page, w, h);
      await page.getByTestId('account-row').nth(2).getByRole('button').click();
      const editor = page.getByRole('dialog', { name: 'Maya' });
      await expect(editor).toBeVisible();
      await expect(page.getByTestId('kid-app-count')).toHaveText('5 of 12');
      await fitsViewport(editor, w, h, 'kid editor');
      const chip = editor.locator('.kid-chip').first();
      await hitTestable(chip, 'first chip');
      expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      const tri = editor.getByRole('checkbox', { name: 'Select all in Photos' });
      await expect(tri).toHaveAttribute('aria-checked', 'mixed');
      expect((await tri.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      await page.keyboard.press('Escape');
      await expect(editor).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
    });

    test('the sign-in confirm fits and names the kid', async ({ page }) => {
      await openAccounts(page, w, h);
      await page.getByTestId('account-row').nth(2).getByRole('button').click();
      await page.getByRole('button', { name: 'Sign in this device as Maya' }).click();
      const confirm = page.getByRole('alertdialog', { name: 'Sign in this device as Maya?' });
      await expect(confirm).toBeVisible();
      await fitsViewport(confirm, w, h, 'sign-in confirm');
      await hitTestable(confirm.getByRole('button', { name: 'Sign in as Maya' }), 'Sign in as Maya');
      await page.keyboard.press('Escape');
      await expect(confirm).toHaveCount(0);
      await expect(page.getByRole('dialog', { name: 'Maya' })).toBeVisible();
    });
  });
}

test('a duplicate kid name is caught inline (409)', async ({ page }) => {
  await openAccounts(page, 820, 1180);
  await page.getByTestId('accounts-add-kid').click();
  const add = page.getByRole('dialog', { name: 'Add a kid' });
  await add.getByLabel('Name').fill('maya');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add.getByText('Another kid already has this name.')).toBeVisible();
  await expect(add.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
});

test('the accounts error state offers Retry and the rest of the panel still works', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await mockAdminAccounts(page, {}, { accountsStatus: 500 });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  await expect(page.getByText("Couldn't load accounts.")).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByTestId('degraded-threshold-input')).toBeVisible();
});

test('TC-001: add Sam, tick four apps, sign this device in as Sam, land on Sam’s board', async ({ page }) => {
  const { mock } = await openAccounts(page, 820, 1180);
  await page.getByTestId('accounts-add-kid').click();
  const add = page.getByRole('dialog', { name: 'Add a kid' });
  await add.getByLabel('Name').fill('Sam');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toHaveCount(0);
  const sam = page.getByTestId('account-row').filter({ hasText: 'Sam' });
  await expect(sam).toContainText('0 apps · no devices');

  await sam.getByRole('button').click();
  const editor = page.getByRole('dialog', { name: 'Sam' });
  const search = editor.getByRole('searchbox', { name: 'Search apps' });
  for (const app of ['Jellyfin', 'Audiobookshelf', 'Immich', 'Khan Academy']) {
    await search.fill(app);
    await editor.getByRole('checkbox', { name: app }).check();
  }
  await search.fill('');
  await expect(page.getByTestId('kid-app-count')).toHaveText('4 of 12');
  await expect(editor.getByRole('button', { name: 'Sign in this device as Sam' })).toBeDisabled();
  await expect(editor.getByText('Save first')).toBeVisible();
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toHaveCount(0);
  await expect(sam).toContainText('4 apps');
  expect(mock.serviceWrites.at(-1)!.body).toEqual({ serviceIds: ['jellyfin', 'abs', 'immich', 'khan'] });

  await sam.getByRole('button').click();
  await page.getByRole('button', { name: 'Sign in this device as Sam' }).click();
  await page.getByRole('button', { name: 'Sign in as Sam' }).click();

  // The reload boots as Sam: exactly the four tiles, in their sections, and no
  // admin or edit affordance anywhere.
  await expect(page.getByTestId('tool-link')).toHaveCount(4);
  await expect(page.getByTestId('user-menu-trigger')).toContainText('Sam');
  for (const id of ['settings-gear', 'alert-bell', 'tile-edit', 'add-box']) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  expect(mock.signIns).toEqual([expect.stringMatching(/^k-new-/)]);
});
