import { test, expect } from '@playwright/test';
import { mockPasswords } from '../browser-gate/passwordMocks';

// SPEC-password-reset-link — end to end against the BUILT app (vite preview),
// with the homepad-api contract mocked (tests/browser-gate/passwordMocks.ts).
// Runs on both projects in playwright.config.ts: desktop 1440 and iPhone 13.

test('TC-001 — a reset link: the reset screen, token gone from the address bar, Save lands on the dashboard', async ({ page }) => {
  const mock = await mockPasswords(page, { token: 'tok-reset-123' });
  await page.goto('/#reset=tok-reset-123');

  await expect(page.getByRole('heading', { name: 'Set a new password for alex@example.com.' })).toBeVisible();
  expect(page.url()).not.toContain('tok-reset-123');
  await expect(page.getByText('Saving signs you out on your other devices.')).toBeVisible();

  await page.getByLabel('New password').fill('a new password');
  await page.getByLabel('Type it again').fill('a new passw0rd');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();
  expect(mock.accepts).toEqual([]);

  await page.getByLabel('Type it again').fill('a new password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  expect(mock.accepts).toEqual([{ token: 'tok-reset-123', password: 'a new password' }]);
  // The token only ever travelled in POST bodies.
  expect(mock.urls.some((u) => u.includes('tok-reset-123'))).toBe(false);
});

test('TC-002 — a dead reset link: one message, and a way to sign in', async ({ page }) => {
  await mockPasswords(page, { token: 'tok-reset-123' });
  await page.goto('/#reset=tok-used');
  await expect(page.getByText("This reset link doesn't work anymore.")).toBeVisible();
  await expect(page.getByText('Ask for a new one.')).toBeVisible();
  expect(page.url()).not.toContain('tok-used');
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await expect(page.getByText('Sign in to your dashboard')).toBeVisible();
});

test('TC-003 — Change password in My settings: a wrong current password, then saved', async ({ page }) => {
  const mock = await mockPasswords(page, { signedIn: true, current: 'my old password' });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  // Focus and Enter: on the iPhone 13 (WebKit) project a pointer click on a
  // menu item can miss Playwright's "stable" check (see household.spec.ts).
  const mySettings = page.getByTestId('menu-my-settings');
  await expect(mySettings).toBeVisible();
  await mySettings.focus();
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByLabel('Current password')).toBeFocused();
  await page.getByLabel('Current password').fill('not it at all');
  await page.getByLabel('New password').fill('my new password');
  await page.getByLabel('Type it again').fill('my new password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText("That's not your current password.")).toBeVisible();
  await expect(page.getByLabel('Current password')).toHaveValue('');

  await page.getByLabel('Current password').fill('my old password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('✓ Password changed. Your other devices are signed out.')).toBeVisible();
  expect(mock.changes).toHaveLength(2);
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
});
