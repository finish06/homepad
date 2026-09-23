import { test, expect, type Page } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-tile-density — the v16 density switch, real-browser GATE.
//
// Density is layout + paint: WHERE the status dot lands (the fixed right rail, not
// top-left), that it HOLDS that rail down a column of tiles (the whole point — "a
// column of tiles scans as a column of dots"), and that the tile reshapes per
// density. jsdom has none of layout/paint, so — like the #35 / SPEC-242 gates —
// only a real Chromium proves these. Named for the observed symptom, not a cause.

// Pin the device density before the app boots (per-device localStorage, OQ-9).
async function setDensity(page: Page, density: 'large' | 'compact' | 'list') {
  await page.addInitScript((d) => localStorage.setItem('homepad:tile-density', d), density);
}

function tile(page: Page, name: string) {
  return page.locator('.app-grid-tool-wrap', { hasText: name });
}


// SPEC-density-to-my-settings — the density switch moved off the dashboard and
// into My settings, so the gate has to open the panel to reach it. Everything
// these tests assert about the GRID is unchanged; only the route to the control
// moved.
async function openDensityControl(page: import('@playwright/test').Page) {
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-my-settings').click();
  await page.getByTestId('density-toggle').waitFor();
}

async function closeSettings(page: import('@playwright/test').Page) {
  await page.getByTestId('settings-close').click();
  await page.getByTestId('settings-panel').waitFor({ state: 'detached' });
}

test.describe('SPEC-tile-density — the density switch', () => {
  test('a fresh device defaults to Compact and the switch reflects it', async ({ page }) => {
    const { services, categories } = makeStatusTiles(['UP']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', null); // null → do NOT seed density
    await page.goto('/');
    await expect(page.locator('.app-grid')).toHaveAttribute('data-density', 'compact');
    await openDensityControl(page);
    await expect(page.getByRole('radio', { name: /compact/i })).toHaveAttribute('aria-checked', 'true');
  });

  test('the status dot sits on the fixed RIGHT rail in compact — and holds it down a column', async ({
    page,
  }) => {
    // A single column of tiles, all UP, so their dots should line up on one x.
    const { services, categories } = makeStatusTiles(['UP', 'UP', 'UP', 'UP']);
    await setDensity(page, 'compact');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', 'compact');
    await page.goto('/');

    const wraps = page.locator('.app-grid-tool-wrap');
    await expect(wraps).toHaveCount(4);

    const dotX: number[] = [];
    for (let i = 0; i < 4; i++) {
      const wrap = wraps.nth(i);
      const link = await wrap.getByTestId('tool-link').boundingBox();
      const pip = await wrap.getByTestId('tile-status').boundingBox();
      expect(link).not.toBeNull();
      expect(pip).not.toBeNull();
      // RIGHT rail: the pip sits in the right quarter of the tile, not the left.
      expect(pip!.x - link!.x).toBeGreaterThan(link!.width * 0.7);
      // Vertically centred, not pinned to the top.
      const pipMid = pip!.y + pip!.height / 2;
      const linkMid = link!.y + link!.height / 2;
      expect(Math.abs(pipMid - linkMid)).toBeLessThanOrEqual(6);
      dotX.push(Math.round(pip!.x - link!.x));
    }
    // Within each tile, the pip sits at the same rail offset (±2 px) — right:12px is fixed.
    expect(Math.max(...dotX) - Math.min(...dotX)).toBeLessThanOrEqual(2);
  });

  // SPEC-242 D-1a (re-measured 2026-09-13): the favorite ★ and the right-rail dot
  // must not overlap in the horizontal densities. Named for the symptom: before
  // the fix the 34px star's disc sat 8px into the dot on a 68px compact tile.
  for (const density of ['compact', 'list'] as const) {
    test(`the favorite ★ does not overlap the status dot in ${density}`, async ({ page }) => {
      const { services, categories } = makeStatusTiles(['UP']);
      services[0].favorite = true;
      await setDensity(page, density);
      await page.setViewportSize({ width: 1440, height: 900 });
      await mockApi(page, services, categories, 'user', density);
      await page.goto('/');
      const wrap = page.locator('.app-grid-tool-wrap').first();
      const star = await wrap.getByTestId('tile-favorite').boundingBox();
      const pip = await wrap.getByTestId('tile-status').boundingBox();
      expect(star).not.toBeNull();
      expect(pip).not.toBeNull();
      const overlap = !(
        star!.x + star!.width <= pip!.x ||
        pip!.x + pip!.width <= star!.x ||
        star!.y + star!.height <= pip!.y ||
        pip!.y + pip!.height <= star!.y
      );
      expect(overlap, `★ ${JSON.stringify(star)} overlaps dot ${JSON.stringify(pip)}`).toBe(false);
    });
  }

  test('the compact status line degrades gracefully with no response-time field', async ({ page }) => {
    // Fixture services carry no responseTimeMs → the line must read the state word
    // alone, never a fabricated "-- ms" placeholder (AC-DEN-009).
    const { services, categories } = makeStatusTiles(['UP']);
    await setDensity(page, 'compact');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', 'compact');
    await page.goto('/');

    const line = tile(page, 'App UP').getByTestId('tile-statusline');
    await expect(line).toHaveText('Online');
    await expect(line).not.toContainText('ms');
    await expect(line).not.toContainText('--');
  });

  test('switching to List reshapes the grid to a single full-width column', async ({ page }) => {
    const { services, categories } = makeStatusTiles(['UP', 'UP']);
    await setDensity(page, 'compact');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', 'compact');
    await page.goto('/');

    await openDensityControl(page);
    await page.getByRole('radio', { name: /list/i }).click();
    // AC-003 — the grid re-renders live, with the panel still open.
    await expect(page.locator('.app-grid')).toHaveAttribute('data-density', 'list');
    await closeSettings(page);
    // One column: the two rows share an x and stack (different y).
    const a = await tile(page, 'App UP').first().getByTestId('tool-link').boundingBox();
    const b = await tile(page, 'App UP').nth(1).getByTestId('tool-link').boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Math.abs(a!.x - b!.x)).toBeLessThanOrEqual(2);
    expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2);
  });

  test('Large keeps the legacy top-left dot (density is a real switch, not a rename)', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(['UP']);
    await setDensity(page, 'large');
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', 'large');
    await page.goto('/');

    const link = await tile(page, 'App UP').getByTestId('tool-link').boundingBox();
    const pip = await tile(page, 'App UP').getByTestId('tile-status').boundingBox();
    expect(link).not.toBeNull();
    expect(pip).not.toBeNull();
    // Top-left: within ~10px of the tile origin (the SPEC-242 legacy placement).
    expect(pip!.x - link!.x).toBeLessThanOrEqual(10);
    expect(pip!.y - link!.y).toBeLessThanOrEqual(10);
    // No status line in the large tile.
    await expect(tile(page, 'App UP').getByTestId('tile-statusline')).toHaveCount(0);
  });
});
