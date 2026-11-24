import { test, expect } from './fixtures';
import type { Page, Route } from '@playwright/test';
import { defaultAccounts, mockAdminAccounts, type MockAccount } from './kidMocks';
import { mockPasswords } from './passwordMocks';
import { mockApi, makeStatusTiles } from './mockApi';
import { mockServerSettings } from './serverSettingsMocks';

// SPEC-qa-cleanup-18.5.0 AC-007…AC-011 — paths QA could not reach on staging,
// because staging is plain http (no clipboard), every account there has a
// password, and its trusted proxies are set with a short Retry-After
// (#606, #607, #610). Here the API is mocked and the page is localhost, which
// browsers treat as secure, so the Copy button renders.

async function openMySettings(page: Page) {
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-my-settings').click();
  const panel = page.getByRole('dialog', { name: 'My settings' });
  await expect(panel).toBeVisible();
  return panel;
}

async function openChangePassword(page: Page) {
  const panel = await openMySettings(page);
  await panel.getByRole('button', { name: 'Change password' }).click();
  await page.getByLabel('Current password').fill('my old password');
  await page.getByLabel('New password').fill('my new password');
  await page.getByLabel('Type it again').fill('my new password');
  await page.getByRole('button', { name: 'Save password' }).click();
  return panel;
}

test.describe('#606 — an SSO-only adult', () => {
  test('Accounts: their Manage menu has no "Make a reset link"', async ({ page }) => {
    const [caleb, , maya] = defaultAccounts().accounts;
    const pat: MockAccount = { id: 'u-pat', name: 'Pat', role: 'member', lastSeenAt: null, email: 'pat@example.com', avatarColor: '', hasPassword: false };
    await mockAdminAccounts(page, { accounts: [{ ...caleb, hasPassword: true }, pat, maya] });
    await page.goto('/');
    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('menu-accounts').click();
    await page.getByRole('button', { name: 'Manage Pat' }).click();
    const menu = page.getByRole('menu', { name: 'Manage Pat' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Make admin', 'Remove Pat…']);
    await expect(menu.getByRole('menuitem', { name: 'Make a reset link' })).toHaveCount(0);
  });

  test('My settings: signed in with SSO only, there is no Password section', async ({ page }) => {
    await mockPasswords(page, { signedIn: true, hasPassword: false });
    const panel = await openMySettings(page);
    await expect(panel.getByRole('heading', { name: 'My settings' })).toBeVisible();
    await expect(panel.getByTestId('settings-password')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Change password' })).toHaveCount(0);
  });

  test('Change password: a 409 (the password was removed meanwhile) shows the single sign-on line', async ({ page }) => {
    const mock = await mockPasswords(page, { signedIn: true, changeRefusal: { status: 409 } });
    await openChangePassword(page);
    await expect(page.getByRole('alert')).toHaveText(
      'This account signs in with single sign-on. It has no password to change here.',
    );
    expect(mock.changes).toHaveLength(1);
  });
});

test('#607 — reset link on a secure page: Copy link → Copied → Copy link, and the link is on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const [caleb, , maya] = defaultAccounts().accounts;
  const jo: MockAccount = { id: 'u-jo', name: 'Jo', role: 'member', lastSeenAt: null, email: 'jo@example.com', avatarColor: '', hasPassword: true };
  await mockAdminAccounts(page, { accounts: [{ ...caleb, hasPassword: true }, jo, maya] });
  await page.route('**/api/admin/accounts/*/reset-link', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'r1', expiresAt: '2026-11-25T21:40:00Z', token: 'tok-reset-for-jo-0123456789' }),
    }),
  );
  await page.goto('/');
  expect(await page.evaluate(() => window.isSecureContext), 'localhost is a secure page').toBe(true);
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-accounts').click();
  await page.getByRole('button', { name: 'Manage Jo' }).click();
  await page.getByRole('menuitem', { name: 'Make a reset link' }).click();

  const dialog = page.getByRole('dialog', { name: 'Reset link for Jo' });
  const field = dialog.getByLabel('Reset link', { exact: true });
  await expect(field).toHaveValue(/\/#reset=tok-reset-for-jo-0123456789$/);
  // The plain-http fallback is not shown: no hint, and the button is there.
  await expect(dialog.getByText(/to copy\.$/)).toHaveCount(0);
  const copy = dialog.getByRole('button', { name: 'Copy link' });
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await field.inputValue());
  // "Copied" lasts about 2 seconds, then the button reads Copy link again.
  await expect(dialog.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 4000 });
  await expect(dialog.getByRole('status')).toHaveText('');
});

test.describe('#610 — trusted proxies help line', () => {
  async function openSystem(page: Page, trusted: string) {
    const { services, categories } = makeStatusTiles(['UP']);
    await mockApi(page, services as never, categories, 'admin');
    await mockServerSettings(page, {
      over: { HOMEPAD_TRUSTED_PROXIES: { value: trusted, envValue: trusted, source: trusted ? 'env' : 'default' } },
    });
    await page.goto('/');
    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('menu-admin-settings').click();
    const row = page.getByTestId('setting-row-HOMEPAD_TRUSTED_PROXIES');
    await expect(row).toBeVisible();
    return row;
  }

  test('empty: the row says everyone shares one sign-in limit', async ({ page }) => {
    const row = await openSystem(page, '');
    await expect(row).toContainText('Trusted proxies');
    await expect(row.getByText('When this is empty, everyone shares one sign-in limit.')).toBeVisible();
  });

  test('set: the list shows and the help line is gone', async ({ page }) => {
    const row = await openSystem(page, 'web, 10.0.0.0/8');
    await expect(row).toContainText('web, 10.0.0.0/8');
    await expect(page.getByText('When this is empty, everyone shares one sign-in limit.')).toHaveCount(0);
  });
});

test.describe('#610 — the wait line for a long Retry-After', () => {
  const text = (route: Route, body: string, status: number, headers?: Record<string, string>) =>
    route.fulfill({ status, contentType: 'text/plain', body, headers });

  async function signedOutWith(page: Page, retryAfter: string) {
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (path === '/api/auth/config') {
        return route.fulfill({ json: { oidcEnabled: false, registration: 'invite_only', setupNeeded: false } });
      }
      if (path === '/api/system/config') return route.fulfill({ json: { showUptimeDisplay: true, statusDegradedMs: 1000 } });
      if (path === '/api/login' && req.method() === 'POST') {
        return text(route, 'too many attempts', 429, { 'Retry-After': retryAfter });
      }
      return text(route, 'unauthorized', 401);
    });
    await page.goto('/');
    await page.getByLabel('Email').fill('jo@example.com');
    await page.getByLabel('Password').fill('the right password');
    await page.getByRole('button', { name: 'Sign in' }).click();
  }

  test('sign-in card: Retry-After 300 says "Wait 5 minutes"', async ({ page }) => {
    await signedOutWith(page, '300');
    await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait 5 minutes and try again.');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  });

  test('sign-in card: Retry-After 45 says "Wait a minute"', async ({ page }) => {
    await signedOutWith(page, '45');
    await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait a minute and try again.');
  });

  test('Change password: Retry-After 300 says "Wait 5 minutes"', async ({ page }) => {
    const mock = await mockPasswords(page, { signedIn: true, changeRefusal: { status: 429, retryAfter: 300 } });
    await openChangePassword(page);
    await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait 5 minutes and try again.');
    expect(mock.changes).toHaveLength(1);
  });
});
