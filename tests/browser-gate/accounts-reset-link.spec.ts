import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { defaultAccounts, mockAdminAccounts, type MockAccount } from './kidMocks';

// SPEC-password-reset-link UX §2 and §7 checkpoints 1, 2 and 5 in a real
// browser: "Make a reset link" in an adult's Manage menu (second, ≥44px), not
// on an SSO-only adult, and the reset-link dialog fitting a phone with its
// buttons at touch size. The accounts API is mocked (kidMocks.ts); the
// reset-link route is mocked here. homepad-api's route tests prove the server.

const JO: MockAccount = { id: 'u-jo', name: 'Jo', role: 'user', lastSeenAt: null, email: 'jo@example.com', avatarColor: '', hasPassword: true };
const PAT: MockAccount = { id: 'u-pat', name: 'Pat', role: 'user', lastSeenAt: null, email: 'pat@example.com', avatarColor: '', hasPassword: false };

function accounts(): MockAccount[] {
  const [caleb, , maya] = defaultAccounts().accounts;
  return [{ ...caleb, hasPassword: true }, JO, PAT, maya];
}

const settled = (el: Locator) =>
  el.evaluate((n) => Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => undefined));

async function openAccounts(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h });
  await mockAdminAccounts(page, { accounts: accounts() });
  const made: string[] = [];
  // Registered after the accounts mock, so Playwright asks this one first.
  await page.route('**/api/admin/accounts/*/reset-link', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/')[4];
    made.push(`${route.request().method()} ${id}`);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'r1', expiresAt: '2026-11-21T21:40:00Z', token: 'tok-a-long-reset-token-for-jo-0123456789' }),
    });
  });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('account-row')).toHaveCount(4);
  await settled(panel);
  return { panel, made };
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
  test.describe(`Make a reset link — ${label}`, () => {
    test('second in the menu, ≥44px, untruncated; an SSO-only adult has none', async ({ page }) => {
      await openAccounts(page, w, h);
      await page.getByRole('button', { name: 'Manage Jo' }).click();
      const menu = page.getByRole('menu', { name: 'Manage Jo' });
      await expect(menu.getByRole('menuitem')).toHaveText(['Make admin', 'Make a reset link', 'Remove Jo…']);
      await settled(menu);
      await fitsViewport(menu, w, h, 'menu');
      const item = menu.getByRole('menuitem', { name: 'Make a reset link' });
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await notTruncated(item), 'the item truncates').toBe(true);
      await hitTestable(item, 'Make a reset link');

      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Manage Pat' }).click();
      await expect(page.getByRole('menu', { name: 'Manage Pat' }).getByRole('menuitem')).toHaveText(['Make admin', 'Remove Pat…']);
    });

    test('the dialog fits, its buttons are ≥44px, and Escape closes only it', async ({ page }) => {
      const { panel, made } = await openAccounts(page, w, h);
      await page.getByRole('button', { name: 'Manage Jo' }).click();
      await page.getByRole('menuitem', { name: 'Make a reset link' }).click();
      const dialog = page.getByRole('dialog', { name: 'Reset link for Jo' });
      await expect(dialog.getByLabel('Reset link', { exact: true })).toHaveValue(/\/#reset=tok-a-long-reset-token-for-jo-0123456789$/);
      await expect(dialog).toContainText("Jo's password stays the same until they use it. A new link replaces this one.");
      await settled(dialog);
      await fitsViewport(dialog, w, h, 'reset-link dialog');
      const field = (await dialog.getByLabel('Reset link', { exact: true }).boundingBox())!;
      const card = (await dialog.boundingBox())!;
      expect(field.x + field.width, 'the field stays inside the card').toBeLessThanOrEqual(card.x + card.width + 0.5);
      for (const b of await dialog.getByRole('button').all()) {
        if ((await b.getAttribute('aria-label'))?.startsWith('Close')) continue; // the ✕, sized like every panel's
        expect((await b.boundingBox())!.height, `${await b.textContent()} is under 44px`).toBeGreaterThanOrEqual(44);
        await hitTestable(b, `${await b.textContent()}`);
      }
      expect(made).toEqual(['POST u-jo']);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(panel).toBeVisible();
      await expect(page.getByRole('button', { name: 'Manage Jo' })).toBeFocused();
    });

    // #617 — the link field sat in a ~220px box: `.kid-field`'s 220px flex
    // basis, meant as a width in the kid editor's row, became a height in this
    // column. The field box ends where its last line does, and Copy link sits
    // one row gap (14px) under the field.
    test('no empty gap between the link and Copy link', async ({ page }) => {
      await openAccounts(page, w, h);
      await page.getByRole('button', { name: 'Manage Jo' }).click();
      await page.getByRole('menuitem', { name: 'Make a reset link' }).click();
      const dialog = page.getByRole('dialog', { name: 'Reset link for Jo' });
      const input = dialog.getByLabel('Reset link', { exact: true });
      await expect(input).toBeVisible();
      await settled(dialog);
      const slack = await input.evaluate((el) => {
        const box = el.parentElement!;
        const last = box.lastElementChild!;
        return box.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom;
      });
      expect(slack, 'empty space at the bottom of the link field').toBeLessThanOrEqual(1);
      const fieldBottom = (await input.boundingBox())!;
      const copy = (await dialog.getByRole('button', { name: 'Copy link' }).boundingBox())!;
      expect(copy.y - (fieldBottom.y + fieldBottom.height), 'gap between the link and Copy link').toBeLessThanOrEqual(20);
    });
  });
}
