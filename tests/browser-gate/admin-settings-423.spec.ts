import { test, expect } from './fixtures';
import type { Page, Locator } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// #423: the Admin Panel (SettingsPanel, scope="admin") had no real-browser gate.
// QA couldn't reach it on staging either: a fresh staging DB has no admin user, so
// the surface went untested in both places. The unit suite covers its logic in
// jsdom. What only a real browser can show is pinned here:
//   - the panel fits the viewport at the iPad and phone widths;
//   - its controls are hit-testable (nothing sticky or translucent on top);
//   - a real number <input> round-trips a typed value into the PATCH body;
//   - the error path reverts what the admin typed;
//   - Escape dismisses it.

const SAVED_MS = 1500;

async function openAdminPanel(page: Page, width: number, height: number) {
  const { services, categories } = makeStatusTiles(['UP']);
  await page.setViewportSize({ width, height });
  await mockApi(page, services as never, categories, 'admin');
  await page.route('**/api/system/config', (r) =>
    r.fulfill({ json: { showUptimeDisplay: true, statusDegradedMs: SAVED_MS } }),
  );
  await page.route('**/api/admin/env-config', (r) =>
    r.fulfill({ json: [{ key: 'GATUS_URL', value: 'http://gatus.test' }, { key: 'LOG_LEVEL', value: 'info' }] }),
  );
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  const panel = page.getByRole('dialog', { name: 'Admin Panel' });
  await expect(panel).toBeVisible();
  // The env list loads async. Wait for it, so the layout being measured is final.
  await expect(page.getByTestId('settings-env-list')).toContainText('GATUS_URL');
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
      await expectHitTestable(page.getByTestId('degraded-threshold-input'), 'Slow threshold input');
      await expectHitTestable(page.getByTestId('settings-switch-uptime'), 'Uptime switch');
    });

    test('a typed threshold is PATCHed and confirmed', async ({ page }) => {
      await openAdminPanel(page, w, h);
      const bodies: unknown[] = [];
      await page.route('**/api/admin/settings', async (r) => {
        if (r.request().method() !== 'PATCH') return r.fallback();
        const body = r.request().postDataJSON();
        bodies.push(body);
        await r.fulfill({ json: { showUptimeDisplay: true, ...body } });
      });
      const input = page.getByTestId('degraded-threshold-input');
      await expect(input).toHaveValue(String(SAVED_MS));
      await input.fill('2500');
      await expectHitTestable(page.getByTestId('degraded-threshold-save'), 'Save');
      await page.getByTestId('degraded-threshold-save').click();
      await expect(page.getByText('Saved ✓')).toBeVisible();
      expect(bodies).toEqual([{ statusDegradedMs: 2500 }]);
    });

    test('a failed save reverts the input and says so', async ({ page }) => {
      await openAdminPanel(page, w, h);
      await page.route('**/api/admin/settings', (r) =>
        r.request().method() === 'PATCH' ? r.fulfill({ status: 500, body: 'boom' }) : r.fallback(),
      );
      const input = page.getByTestId('degraded-threshold-input');
      await input.fill('3000');
      await page.getByTestId('degraded-threshold-save').click();
      await expect(page.getByText("Couldn't save — try again.")).toBeVisible();
      await expect(input).toHaveValue(String(SAVED_MS));
    });

    test('Escape closes it', async ({ page }) => {
      const panel = await openAdminPanel(page, w, h);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
    });
  });
}
