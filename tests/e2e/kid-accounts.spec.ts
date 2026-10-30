import { test, expect } from '@playwright/test';
import { mockAdminAccounts, mockKidSession } from '../browser-gate/kidMocks';

// SPEC-kid-accounts — end to end against the BUILT app (vite preview), with the
// homepad-api contract mocked (tests/browser-gate/kidMocks.ts). Runs on both
// projects in playwright.config.ts: desktop 1440 and iPhone 13.

test('TC-001 — an admin creates a kid, picks four apps, and hands this device over', async ({ page }) => {
  const mock = await mockAdminAccounts(page);
  await page.goto('/');

  // Administration → Accounts opens the Admin Panel on the Accounts section.
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();

  await page.getByRole('button', { name: '+ Add a kid' }).click();
  const add = page.getByRole('dialog', { name: 'Add a kid' });
  await add.getByLabel('Name').fill('Sam');
  await add.getByRole('button', { name: 'Save' }).click();
  await expect(add).toBeHidden();

  const sam = page.getByTestId('account-row').filter({ hasText: 'Sam' });
  await sam.getByRole('button').click();
  const editor = page.getByRole('dialog', { name: 'Sam' });
  await expect(editor.getByText('New apps you add later stay hidden until you tick them.')).toBeVisible();
  await expect(editor.getByTestId('kid-zero-warning')).toHaveText('Sam will see an empty dashboard.');
  const search = editor.getByRole('searchbox', { name: 'Search apps' });
  for (const app of ['Jellyfin', 'Audiobookshelf', 'Immich', 'Khan Academy']) {
    await search.fill(app);
    await editor.getByRole('checkbox', { name: app }).check();
  }
  await editor.getByRole('button', { name: 'Save' }).click();
  await expect(editor).toBeHidden();
  await expect(sam).toContainText('4 apps · no devices');

  await sam.getByRole('button').click();
  await page.getByRole('button', { name: 'Sign in this device as Sam' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Sign in this device as Sam?' });
  await expect(confirm).toContainText("You'll be signed out here");
  await confirm.getByRole('button', { name: 'Sign in as Sam' }).click();

  // Expected: exactly 4 tiles in their sections, no admin or edit affordances,
  // and Sam's name in the menu.
  await expect(page.getByTestId('tool-link')).toHaveCount(4);
  await expect(page.getByTestId('box-title')).toHaveText(['Media', 'Photos', 'Learning']);
  await expect(page.getByTestId('user-menu-trigger')).toContainText('Sam');
  await expect(page.getByTestId('settings-gear')).toHaveCount(0);
  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByTestId('user-menu').getByRole('menuitem')).toHaveText(['Sign out']);
  expect(mock.signIns).toHaveLength(1);
});

test('TC-006 — a kid stars an app and switches theme; only allowed writes go out', async ({ page }) => {
  const kid = await mockKidSession(page, ['plex', 'jellyfin', 'immich']);
  await page.goto('/');
  await expect(page.getByTestId('tool-link')).toHaveCount(3);

  await page.getByRole('button', { name: 'Pick favorites' }).click();
  await page.getByRole('button', { name: 'Pin Jellyfin to favorites' }).click();
  await expect.poll(() => kid.favorites).toEqual(['POST jellyfin']);

  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('theme-dark').click();
  await expect.poll(() => kid.mePatches).toEqual([{ themePref: 'dark' }]);
  await expect(page.locator('html')).toHaveClass(/dark/);

  // Reload: both persisted server-side (the mock keeps state like the API).
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Pick favorites' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Jellyfin from favorites' })).toBeVisible();
  expect(kid.forbidden).toEqual([]);
});
