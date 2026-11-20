import { test, expect } from '@playwright/test';
import { mockHousehold } from '../browser-gate/householdMocks';

// SPEC-household-basics — end to end against the BUILT app (vite preview), with
// the homepad-api contract mocked (tests/browser-gate/householdMocks.ts). Runs
// on both projects in playwright.config.ts: desktop 1440 and iPhone 13.

test('TC-001 — fresh install: Set up Homepad, then a sign-in with no "Create account"', async ({ page }) => {
  const mock = await mockHousehold(page);
  await page.goto('/');

  await expect(page.getByText('Set up Homepad')).toBeVisible();
  await expect(page.getByText('This first account is the admin.')).toBeVisible();
  await expect(page.getByRole('button', { name: /pocketid/i })).toHaveCount(0);
  await page.getByLabel('Email').fill('caleb@ohana.test');
  await page.getByLabel('Password').fill('longenough');
  await page.getByRole('button', { name: 'Create admin account' }).click();

  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  expect(mock.registers).toEqual([{ email: 'caleb@ohana.test', password: 'longenough' }]);

  await page.getByTestId('user-menu-trigger').click();
  // Sign out from the keyboard. On the CI runner's iPhone 13 (WebKit) project
  // a pointer click on the menu's last item never passes Playwright's
  // "stable" check (the same timeout kid-accounts TC-001 hits there); focus
  // and Enter is a real user path that doesn't depend on it.
  const signOut = page.getByTestId('menu-logout');
  await expect(signOut).toBeVisible();
  await signOut.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Sign in to your dashboard')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: /create account/i })).toHaveCount(0);
  await expect(page.getByText('Set up Homepad')).toHaveCount(0);
});

test('TC-002 — sign-up closed: the sign-in card offers no way to make an account', async ({ page }) => {
  await mockHousehold(page, { setupDone: true });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByRole('button', { name: /create account/i })).toHaveCount(0);
});

test('TC-009 — sign-up kept open: "Create account" still shows', async ({ page }) => {
  await mockHousehold(page, { setupDone: true, registration: 'open' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
});

test('TC-003 — an invite link: Join screen, token gone from the address bar, Join lands on the dashboard', async ({ page }) => {
  const mock = await mockHousehold(page, { setupDone: true, token: 'tok-live-123' });
  await page.goto('/#invite=tok-live-123');

  await expect(page.getByRole('heading', { name: 'Join Homepad' })).toBeVisible();
  await expect(page.getByText('Caleb invited you.')).toBeVisible();
  await expect(page.getByText("You'll be a member.")).toBeVisible();
  expect(page.url()).not.toContain('tok-live-123');
  await expect(page.getByLabel('Name')).toHaveValue('Alex');

  await page.getByLabel('Email').fill('alex@example.com');
  await page.getByLabel('Password').fill('longenough');
  await page.getByRole('button', { name: 'Join' }).click();

  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  expect(mock.accepts).toEqual([
    { token: 'tok-live-123', email: 'alex@example.com', password: 'longenough', name: 'Alex' },
  ]);
  // The token only ever travelled in POST bodies.
  expect(mock.urls.some((u) => u.includes('tok-live-123'))).toBe(false);
});

test('TC-004 — a dead link: one message, and a way to sign in', async ({ page }) => {
  await mockHousehold(page, { setupDone: true, token: 'tok-live-123' });
  await page.goto('/#invite=tok-used');
  await expect(page.getByText("This invite link doesn't work anymore.")).toBeVisible();
  await expect(page.getByText('Ask for a new one.')).toBeVisible();
  expect(page.url()).not.toContain('tok-used');
  await page.getByRole('button', { name: 'Go to sign in' }).click();
  await expect(page.getByText('Sign in to your dashboard')).toBeVisible();
});
