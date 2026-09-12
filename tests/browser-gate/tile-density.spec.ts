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

test.describe('SPEC-tile-density — the density switch', () => {
  test('a fresh device defaults to Compact and the switch reflects it', async ({ page }) => {
    const { services, categories } = makeStatusTiles(['UP']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user', null); // null → do NOT seed density
    await page.goto('/');
    await expect(page.locator('.app-grid')).toHaveAttribute('data-density', 'compact');
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
      dotX.push(Math.round(pip!.x));
    }
    // The rail is FIXED: every dot shares the same x down the column (±2px).
    expect(Math.max(...dotX) - Math.min(...dotX)).toBeLessThanOrEqual(2);
  });

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

    await page.getByRole('radio', { name: /list/i }).click();
    await expect(page.locator('.app-grid')).toHaveAttribute('data-density', 'list');
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
