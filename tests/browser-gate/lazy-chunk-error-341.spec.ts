import { test, expect } from './fixtures';
import { mockApi } from './mockApi';

// SPEC-ui-cleanup-18.3.0 AC-004 (#341) — the issue's own repro, in a real browser
// against the built app: block the Settings chunk, open My settings. Before the
// fix the rejected import reached no error boundary and React unmounted the
// whole tree (a blank page). Now a small dialog says so, and Close returns to a
// dashboard that still works.

test('a Settings chunk that fails to load shows a dialog, and the dashboard survives', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockApi(page);
  await page.route(/\/assets\/SettingsPanel-[^/]+\.js$/, (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByTestId('tool-link').first()).toBeVisible();

  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-my-settings').click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Couldn't load this");
  await expect(dialog.getByRole('button', { name: 'Reload' })).toBeVisible();
  // The app behind it is still mounted.
  await expect(page.getByTestId('tool-link').first()).toBeAttached();

  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  // And it still works: the account menu opens again.
  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByTestId('menu-my-settings')).toBeVisible();
});
