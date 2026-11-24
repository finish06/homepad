import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { defaultAccounts, mockAdminAccounts, type MockAccount, type MockInvite } from './kidMocks';

// SPEC-household-manage-adults UX §2–§4 in a real browser: the "Manage ▾"
// menu on other adults' rows (touch size, where it opens, what never
// truncates), one-layer Escape, and the three confirms fitting a phone. The
// API is mocked (kidMocks.ts); the route tests in homepad-api prove the server.

const ALEX_ADMIN: MockAccount = {
  id: 'u-alex', name: 'Alex', role: 'admin', lastSeenAt: null, email: 'alex.a.very.long.address@example.com', avatarColor: '',
};
const JO: MockAccount = { id: 'u-jo', name: 'Jo', role: 'member', lastSeenAt: null, email: 'jo@example.com', avatarColor: '' };

function accounts(): MockAccount[] {
  const [caleb, , maya] = defaultAccounts().accounts;
  return [caleb, ALEX_ADMIN, JO, maya];
}

const PAT: MockInvite = {
  id: 'i-pat',
  name: 'Pat',
  role: 'member',
  createdAt: '2026-11-19T10:00:00Z',
  expiresAt: '2026-11-26T10:00:00Z',
  createdBy: { id: 'u-alex', name: 'Alex' },
};

// Let entrance animations (the menu's and the card's scale-in) finish before
// measuring, so a box isn't read mid-scale.
const settled = (el: Locator) =>
  el.evaluate((n) => Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => undefined));

async function openAccounts(page: Page, w: number, h: number, opts: Parameters<typeof mockAdminAccounts>[2] = {}) {
  await page.setViewportSize({ width: w, height: h });
  const mock = await mockAdminAccounts(page, { accounts: accounts() }, opts);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('account-row')).toHaveCount(4);
  await settled(panel);
  return { mock, panel };
}

async function hitTestable(el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const hit = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === node || node.contains(top));
  });
  expect(hit, `${what} is covered by another element at its centre`).toBe(true);
}

async function fitsViewport(el: Locator, w: number, h: number, what: string) {
  const box = (await el.boundingBox())!;
  expect(box.x, `${what} starts off-screen`).toBeGreaterThanOrEqual(0);
  expect(box.y, `${what} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${what} runs past the right edge`).toBeLessThanOrEqual(w + 0.5);
  expect(box.y + box.height, `${what} runs past the bottom`).toBeLessThanOrEqual(h + 0.5);
}

const notTruncated = (el: Locator) => el.evaluate((n) => n.scrollWidth <= n.clientWidth + 1);

for (const [label, w, h] of [
  ['phone 390', 390, 844],
  ['iPad 820', 820, 1180],
  ['desktop 1280', 1280, 800],
] as const) {
  test.describe(`Manage adults — ${label}`, () => {
    test('Manage ▾ on other adults only, ≥44px, and the name, pill and button never truncate', async ({ page }) => {
      await openAccounts(page, w, h);
      const rows = page.getByTestId('account-row');
      await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
      for (const i of [1, 2]) {
        const btn = rows.nth(i).getByRole('button', { name: /^Manage / });
        await expect(btn).toHaveText('Manage ▾');
        await hitTestable(btn, `row ${i} Manage`);
        expect((await btn.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        expect(await notTruncated(btn), 'the Manage button truncates').toBe(true);
        expect(await notTruncated(rows.nth(i).locator('.accounts-name')), 'the name truncates').toBe(true);
        expect(await notTruncated(rows.nth(i).locator('.role-pill')), 'the pill truncates').toBe(true);
        const row = (await rows.nth(i).boundingBox())!;
        const b = (await btn.boundingBox())!;
        expect(b.x + b.width, 'Manage sits inside its row').toBeLessThanOrEqual(row.x + row.width + 0.5);
      }
      await expect(rows.nth(3).getByRole('button', { name: /^Manage/ })).toHaveCount(0);
    });

    test('the menu opens under the button, right-aligned, ≥200px wide, items ≥44px', async ({ page }) => {
      await openAccounts(page, w, h);
      const btn = page.getByRole('button', { name: 'Manage Jo' });
      await btn.click();
      const menu = page.getByRole('menu', { name: 'Manage Jo' });
      await expect(menu).toBeVisible();
      await expect(btn).toHaveText('Manage ▴');
      await settled(menu);
      const m = (await menu.boundingBox())!;
      const b = (await btn.boundingBox())!;
      expect(m.width).toBeGreaterThanOrEqual(200);
      expect(Math.abs(m.x + m.width - (b.x + b.width)), 'right edges line up').toBeLessThanOrEqual(1.5);
      expect(m.y, 'opens below the button').toBeGreaterThanOrEqual(b.y + b.height - 0.5);
      await fitsViewport(menu, w, h, 'menu');
      for (const item of await menu.getByRole('menuitem').all()) {
        expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await hitTestable(item, 'menu item');
      }
      await expect(menu.getByRole('menuitem')).toHaveText(['Make admin', 'Remove Jo…']);
    });

    test('Escape closes the menu and only the menu', async ({ page }) => {
      const { panel } = await openAccounts(page, w, h);
      await page.getByRole('button', { name: 'Manage Alex' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(panel).toBeVisible();
      await expect(page.getByRole('button', { name: 'Manage Alex' })).toBeFocused();
    });
  });
}

test('Remove at 390: the invites and single sign-on lines fit, and the row and invite leave', async ({ page }) => {
  const { mock } = await openAccounts(page, 390, 844, { oidcEnabled: true, invites: [PAT] });
  await page.getByRole('button', { name: 'Manage Alex' }).click();
  await page.getByRole('menuitem', { name: 'Remove Alex…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove Alex?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Alex's 1 pending invite will stop working.");
  await expect(dialog).toContainText('If Alex uses single sign-on, they can sign in again that way.');
  await settled(dialog);
  await fitsViewport(dialog, 390, 844, 'remove confirm');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  for (const b of await dialog.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await dialog.getByRole('button', { name: 'Remove Alex' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('account-row')).toHaveCount(3);
  await expect(page.getByTestId('pending-invites')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Manage Jo' })).toBeFocused();
  expect(mock.adultWrites).toEqual(['DELETE u-alex']);
});

// #591 (SPEC-qa-cleanup-18.5.0 AC-003) — a member, not only an admin, is
// removed from Manage ▾. The confirm names them; your own row never gets a menu.
test('Remove a member at 820: the confirm names Jo, Jo leaves, your row stays without a menu', async ({ page }) => {
  const { mock } = await openAccounts(page, 820, 1180);
  await page.getByRole('button', { name: 'Manage Jo' }).click();
  await page.getByRole('menuitem', { name: 'Remove Jo…' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Remove Jo?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Remove Jo' }).click();
  await expect(dialog).toHaveCount(0);
  const rows = page.getByTestId('account-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'Jo' })).toHaveCount(0);
  await expect(rows.nth(0)).toContainText('Caleb');
  await expect(rows.nth(0).getByRole('button')).toHaveCount(0);
  expect(mock.adultWrites).toEqual(['DELETE u-jo']);
});

test('Make admin at 1280: the amber line, then the pill reads admin', async ({ page }) => {
  const { mock } = await openAccounts(page, 1280, 800);
  await page.getByRole('button', { name: 'Manage Jo' }).click();
  await page.getByRole('menuitem', { name: 'Make admin' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Make Jo an admin?' });
  await expect(dialog.locator('.add-adult-warn')).toHaveText('Admins can do everything you can, including inviting other admins.');
  await dialog.getByRole('button', { name: 'Make admin' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('account-row').nth(2).locator('.role-pill')).toHaveText('admin');
  expect(mock.adultWrites).toEqual(['PATCH u-jo admin']);
});

test('last_admin at 390: the line shows inside the confirm, which fits', async ({ page }) => {
  await openAccounts(page, 390, 844, { adultConflict: 'last_admin' });
  await page.getByRole('button', { name: 'Manage Alex' }).click();
  await page.getByRole('menuitem', { name: 'Make member' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Make Alex a member?' });
  await dialog.getByRole('button', { name: 'Make member' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Homepad needs at least one admin.');
  await expect(dialog.getByRole('button', { name: 'Make member' })).toBeDisabled();
  await fitsViewport(dialog, 390, 844, 'confirm with an error');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
});
