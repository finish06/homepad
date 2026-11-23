import { test, expect } from './fixtures';
import type { Page, Locator } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';
import { mockServerSettings, type ServerSettingsMock } from './serverSettingsMocks';

// #423: the Admin Panel (SettingsPanel, scope="admin") had no real-browser gate.
// QA couldn't reach it on staging either: a fresh staging DB has no admin user, so
// the surface went untested in both places. The unit suite covers its logic in
// jsdom. What only a real browser can show is pinned here:
//   - the panel fits the viewport at the iPad and phone widths;
//   - its controls are hit-testable (nothing sticky or translucent on top);
//   - a typed value round-trips into the PATCH body (SPEC-admin-server-settings:
//     the "Slow" threshold is a server-settings row now);
//   - a refused save keeps what the admin typed and shows the server's words;
//   - Escape dismisses it.

const SAVED_MS = 1500;

let mock: ServerSettingsMock;

async function openAdminPanel(page: Page, width: number, height: number) {
  const { services, categories } = makeStatusTiles(['UP']);
  await page.setViewportSize({ width, height });
  await mockApi(page, services as never, categories, 'admin');
  await page.route('**/api/system/config', (r) =>
    r.fulfill({ json: { showUptimeDisplay: true, statusDegradedMs: SAVED_MS } }),
  );
  mock = await mockServerSettings(page, { over: { GATUS_DEGRADED_MS: { value: SAVED_MS, envValue: SAVED_MS, source: 'env' } } });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  // The settings load async. Wait for them, so the layout being measured is final.
  await expect(page.getByTestId('setting-row-GATUS_BASE_URL')).toBeVisible();
  return panel;
}

// The element actually under a control's centre must be the control (or inside
// it). A sticky header or scrim on top passes every visibility check and still
// eats the tap.
async function expectHitTestable(el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const hit = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === node || node.contains(top));
  });
  expect(hit, `${what} is covered by another element at its centre`).toBe(true);
}

for (const [label, w, h] of [['iPad 768', 768, 1024], ['phone 375', 375, 812]] as const) {
  test.describe(`Admin Panel — ${label}`, () => {
    test('fits the viewport, and its controls can be hit', async ({ page }) => {
      const panel = await openAdminPanel(page, w, h);
      const box = (await panel.boundingBox())!;
      expect(box.x, 'panel starts off-screen left').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'panel runs past the right edge').toBeLessThanOrEqual(w + 0.5);
      expect(box.height, 'panel is taller than the viewport (it must scroll inside)').toBeLessThanOrEqual(h + 0.5);
      // No horizontal page scroll introduced by the panel.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'page scrolls horizontally with the panel open').toBeLessThanOrEqual(0);

      await expectHitTestable(page.getByRole('button', { name: 'Close admin panel' }), 'Close');
      await expectHitTestable(page.getByRole('button', { name: 'Edit "Slow" threshold' }), 'Slow threshold Edit');
      await expectHitTestable(page.getByTestId('settings-switch-uptime'), 'Uptime switch');
    });

    test('a typed threshold is PATCHed and confirmed', async ({ page }) => {
      await openAdminPanel(page, w, h);
      const row = page.getByTestId('setting-row-GATUS_DEGRADED_MS');
      await row.getByRole('button', { name: 'Edit "Slow" threshold' }).click();
      const input = row.getByRole('textbox', { name: '"Slow" threshold' });
      await expect(input).toHaveValue(String(SAVED_MS));
      await input.fill('2500');
      await expectHitTestable(row.getByRole('button', { name: 'Save' }), 'Save');
      await row.getByRole('button', { name: 'Save' }).click();
      await expect(row.getByText('Saved ✓')).toBeVisible();
      await expect(row.getByText('2500 ms')).toBeVisible();
      expect(mock.patches).toEqual([{ set: { GATUS_DEGRADED_MS: 2500 } }]);
    });

    test('a refused save keeps the draft and says why', async ({ page }) => {
      await openAdminPanel(page, w, h);
      await page.route('**/api/admin/server-settings', (r) =>
        r.request().method() === 'PATCH'
          ? r.fulfill({ status: 400, json: { error: 'invalid', key: 'GATUS_DEGRADED_MS', message: 'Too slow to be useful.' } })
          : r.fallback(),
      );
      const row = page.getByTestId('setting-row-GATUS_DEGRADED_MS');
      await row.getByRole('button', { name: 'Edit "Slow" threshold' }).click();
      const input = row.getByRole('textbox');
      await input.fill('3000');
      await input.press('Enter');
      await expect(row.getByRole('alert')).toHaveText('Too slow to be useful.');
      await expect(input).toHaveValue('3000');
    });

    test('Escape closes it', async ({ page }) => {
      const panel = await openAdminPanel(page, w, h);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });
  });
}
