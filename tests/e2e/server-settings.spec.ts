import { test, expect, type Page } from '@playwright/test';
import { mockApi, makeStatusTiles } from '../browser-gate/mockApi';
import { mockServerSettings, AUTHORIZE_URL, type ServerSettingsOpts } from '../browser-gate/serverSettingsMocks';

// SPEC-admin-server-settings TC-001, TC-005, TC-007, TC-008 — end to end
// against the BUILT app (vite preview), with the server-settings contract
// mocked (tests/browser-gate/serverSettingsMocks.ts). Runs on both projects in
// playwright.config.ts: desktop 1440 and iPhone 13 (390).

async function openSystem(page: Page, opts: ServerSettingsOpts = {}) {
  const { services, categories } = makeStatusTiles(['UP']);
  await mockApi(page, services as never, categories, 'admin');
  const mock = await mockServerSettings(page, opts);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  await expect(page.getByTestId('setting-row-GATUS_BASE_URL')).toBeVisible();
  return mock;
}

test('TC-001 — change the Gatus address, then reset it', async ({ page }) => {
  const mock = await openSystem(page);
  const row = page.getByTestId('setting-row-GATUS_BASE_URL');
  await expect(row.locator('.settings-src-badge')).toHaveText(/env/);
  await row.getByRole('button', { name: 'Edit Gatus address' }).click();
  const field = row.getByRole('textbox', { name: 'Gatus address' });
  await field.fill('https://status.example.com');
  await field.press('Enter');
  await expect(row.getByText('Saved ✓')).toBeVisible();
  await expect(row.locator('.settings-src-badge')).toHaveText(/UI/);
  await expect(row.getByText('Saved by Caleb, Nov 23')).toBeVisible();
  expect(mock.patches).toEqual([{ set: { GATUS_BASE_URL: 'https://status.example.com' } }]);

  await row.getByRole('button', { name: 'Reset Gatus address to env' }).click();
  await expect(row.getByText('Reset to env: http://gatus.example.com:8080?')).toBeVisible();
  await row.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(row.locator('.settings-src-badge')).toHaveText(/env/);
  await expect(row.getByText('http://gatus.example.com:8080')).toBeVisible();
  expect(mock.deletes).toEqual(['GATUS_BASE_URL']);
});

test('TC-002 — a bad account limit is refused before it is sent', async ({ page }) => {
  const mock = await openSystem(page);
  const row = page.getByTestId('setting-row-HOMEPAD_MAX_ACCOUNTS');
  await row.getByRole('button', { name: 'Edit Account limit' }).click();
  await row.getByRole('textbox').fill('-3');
  await expect(row.getByText('Enter a whole number from 0 to 10000.')).toBeVisible();
  await expect(row.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(mock.patches).toEqual([]);
});

test('TC-005 — secure cookies on, on plain http: the dialog leads with it', async ({ page }) => {
  const mock = await openSystem(page, { over: { COOKIE_SECURE: { value: false, envValue: false } } });
  const row = page.getByTestId('setting-row-COOKIE_SECURE');
  await row.getByRole('switch', { name: 'Secure cookies' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Turn on secure cookies?' });
  await expect(dialog).toContainText("This page is on http://. After this, nobody can sign in here until it's on https://.");
  expect(mock.patches).toEqual([]);
  await dialog.getByRole('button', { name: 'Turn on' }).click();
  await expect(row.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  await expect(row.locator('.settings-src-badge')).toHaveText(/UI/);
  expect(mock.patches).toEqual([{ set: { COOKIE_SECURE: true }, confirm: ['cookie_secure_on'] }]);
});

test('TC-003 — an account limit under the count asks with the numbers', async ({ page }) => {
  const mock = await openSystem(page, { accountCount: 9 });
  const row = page.getByTestId('setting-row-HOMEPAD_MAX_ACCOUNTS');
  await row.getByRole('button', { name: 'Edit Account limit' }).click();
  await row.getByRole('textbox').fill('5');
  await row.getByRole('button', { name: 'Save' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Lower the account limit?' });
  await expect(dialog).toContainText('There are 7 accounts and 2 pending invites. Nobody is removed.');
  await dialog.getByRole('button', { name: 'Set limit to 5' }).click();
  await expect(row.getByText('5', { exact: true })).toBeVisible();
  expect(mock.patches.at(-1)).toEqual({ set: { HOMEPAD_MAX_ACCOUNTS: 5 }, confirm: ['max_accounts_below_count'] });
});

test('TC-007 — set the member group and save the Sign-in group', async ({ page }) => {
  const mock = await openSystem(page);
  const row = page.getByTestId('setting-row-OIDC_MEMBER_GROUP');
  await row.getByRole('button', { name: 'Edit Member group' }).click();
  await row.getByRole('textbox', { name: 'Member group' }).fill('homepad');
  await row.getByRole('button', { name: 'Done' }).click();
  await expect(row.getByText('changed, not saved')).toBeVisible();
  await expect(page.getByTestId('signin-footer')).toContainText('1 change not saved.');
  expect(mock.patches).toEqual([]);

  await page.getByRole('button', { name: 'Review and save' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Save sign-in settings?' });
  await expect(dialog).toContainText('Member group: — → homepad');
  await expect(dialog).toContainText('The redirect URL must be registered with your provider first.');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('signin-footer')).toContainText('Sign-in settings saved ✓');
  await expect(row.locator('.settings-src-badge')).toHaveText(/UI/);
  expect(mock.patches).toEqual([{ set: { OIDC_MEMBER_GROUP: 'homepad' } }]);
});

test('TC-008 — an SSO-only admin changes the client ID: blocked, tested, saved', async ({ page, context }) => {
  const mock = await openSystem(page, { noAdminPassword: true });
  const row = page.getByTestId('setting-row-OIDC_CLIENT_ID');
  await row.getByRole('button', { name: 'Edit Client ID' }).click();
  await row.getByRole('textbox', { name: 'Client ID' }).fill('homepad-2');
  await row.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Review and save' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Save sign-in settings?' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('No admin has a password, so a mistake here could lock everyone out.');

  const tabOpened = context.waitForEvent('page');
  await dialog.getByRole('button', { name: 'Test sign-in' }).click();
  const tab = await tabOpened;
  await expect.poll(() => tab.url()).toBe(AUTHORIZE_URL);
  await tab.close();
  const foot = page.getByTestId('signin-footer');
  await expect(foot).toContainText('Test passed ✓', { timeout: 10_000 });
  expect(mock.tests).toEqual([{ OIDC_CLIENT_ID: 'homepad-2' }]);

  await page.getByRole('button', { name: 'Review and save' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Save' }).click();
  await expect(foot).toContainText('Sign-in settings saved ✓');
  expect(mock.patches.at(-1)).toEqual({ set: { OIDC_CLIENT_ID: 'homepad-2' }, oidcTest: 'tok-1' });
  // Still signed in: the admin menu is there.
  await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
});

test('TC-006 — env-only: the banner, Edit off, Reset still works', async ({ page }) => {
  const mock = await openSystem(page, {
    envOnly: true,
    over: { COOKIE_SECURE: { saved: true, savedValue: true } },
  });
  await expect(page.getByTestId('settings-envonly-banner')).toContainText('Server settings come from the environment only.');
  await expect(page.getByTestId('setting-row-GATUS_BASE_URL').getByRole('button', { name: 'Edit Gatus address' })).toBeDisabled();
  const cookie = page.getByTestId('setting-row-COOKIE_SECURE');
  await expect(cookie.getByText('Saved value ignored: On')).toBeVisible();
  await cookie.getByRole('button', { name: 'Reset Secure cookies to env' }).click();
  await cookie.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(cookie.getByText('Saved value ignored')).toHaveCount(0);
  expect(mock.deletes).toEqual(['COOKIE_SECURE']);
});

for (const [result, line] of [['passed', 'Test sign-in passed.'], ['failed', 'Test sign-in failed.']] as const) {
  test(`the test sign-in tab lands on /#oidc-test=${result} and shows only that`, async ({ page }) => {
    const { services, categories } = makeStatusTiles(['UP']);
    await mockApi(page, services as never, categories, 'admin');
    await page.goto(`/#oidc-test=${result}`);
    await expect(page.getByRole('heading', { name: line })).toBeVisible();
    await expect(page.getByText('You can close this tab.', { exact: false })).toBeVisible();
    await expect(page.getByTestId('user-menu-trigger')).toHaveCount(0);
  });
}
