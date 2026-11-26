import { type Page, type Route } from '@playwright/test';
import { test, expect } from './fixtures';

// SPEC-signin-hardening — end to end against the BUILT app (vite preview),
// with the homepad-api contract mocked here. Runs on both projects in
// playwright.config.ts: desktop 1440 and iPhone 13 (390).

const text = (route: Route, body: string, status: number, headers?: Record<string, string>) =>
  route.fulfill({ status, contentType: 'text/plain', body, headers });

async function signedOut(page: Page, opts: { oidcEnabled?: boolean } = {}) {
  const logins: unknown[] = [];
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/auth/config') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ oidcEnabled: opts.oidcEnabled ?? true, registration: 'invite_only', setupNeeded: false }),
      });
    }
    if (path === '/api/system/config') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"showUptimeDisplay":true,"statusDegradedMs":1000}' });
    }
    if (path === '/api/login' && req.method() === 'POST') {
      logins.push(req.postDataJSON());
      // TC-001: the eleventh try for one email is locked for 15 minutes.
      return text(route, 'too many attempts', 429, { 'Retry-After': '900' });
    }
    return text(route, 'unauthorized', 401);
  });
  return { logins };
}

for (const [code, line] of [
  ['email_unverified', "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified."],
  ['not_invited', "You don't have a Homepad account yet. Ask your admin for an invite."],
  ['too_many', 'Too many tries. Wait a minute and try again.'],
] as const) {
  test(`AC-003 — /#signin-error=${code} shows its line and leaves the address bar`, async ({ page }) => {
    await signedOut(page);
    await page.goto(`/#signin-error=${code}`);
    await expect(page.getByRole('alert')).toHaveText(line);
    expect(page.url()).not.toContain('signin-error');
    await expect(page.getByRole('button', { name: 'Log in with PocketID' })).toBeEnabled();
  });
}

test('TC-001 — a locked email: the wait line, and the button stays enabled', async ({ page }) => {
  const mock = await signedOut(page);
  await page.goto('/');
  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('the right password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Too many tries. Wait 15 minutes and try again. You can still use PocketID.',
  );
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  expect(mock.logins).toHaveLength(1);
});

test('the wait line without single sign-on says nothing about PocketID', async ({ page }) => {
  await signedOut(page, { oidcEnabled: false });
  await page.goto('/');
  await page.getByLabel('Email').fill('jo@example.com');
  await page.getByLabel('Password').fill('the right password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many tries. Wait 15 minutes and try again.');
});
