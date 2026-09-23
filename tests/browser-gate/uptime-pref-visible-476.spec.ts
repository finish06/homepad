import { test, expect } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// #476 — resolved by Caleb 2026-09-23: the 24h/7d/30d line SHOULD NOT show at
// compact density. So the `display: none` rule is correct by design and is not
// the defect.
//
// The defect was that the line was the preference's ONLY subject, which made
// "Show uptime display" a no-op at DEFAULT_DENSITY = 'compact' — it persisted
// perfectly and controlled nothing a user could see (shipped as v16.4.0).
//
// This asserts the property that actually matters, at the density people are
// actually on: toggling the preference must change what is RENDERED. It is a
// real-browser gate because the whole failure was invisible to every check that
// looked at state instead of the screen — the API round-tripped, the migration
// seeded, AC-020 held, and the product was still wrong.

const AT_COMPACT = { width: 1440, height: 900 };

async function boot(page: import('@playwright/test').Page, showUptime: boolean) {
  const { services, categories } = makeStatusTiles(['UP', 'UP', 'DOWN']);
  // Give the tiles per-check history so the sparkline has something to draw.
  const withChecks = services.map((s: Record<string, unknown>) => ({
    ...s,
    uptimeChecks: [
      { success: true, timestamp: '2026-09-23T04:07:00Z' },
      { success: false, timestamp: '2026-09-23T04:08:00Z' },
      { success: true, timestamp: '2026-09-23T04:09:00Z' },
    ],
  }));
  await page.addInitScript(
    (v) => localStorage.setItem('homepad:show-uptime-display', v),
    showUptime ? 'true' : 'false',
  );
  await page.setViewportSize(AT_COMPACT);
  await mockApi(page, withChecks as never, categories, 'user', 'compact');
  await page.goto('/');
  await expect(page.locator('.app-grid')).toHaveAttribute('data-density', 'compact');
}

test.describe('#476 — the uptime preference controls something visible at the default density', () => {
  test('the long-window line stays hidden at compact — Caleb 2026-09-23, by design', async ({
    page,
  }) => {
    await boot(page, true);
    // Present in the DOM is not the claim; PAINTED is. A hidden element still
    // matches a selector, which is how this went unnoticed for a release.
    await expect(page.getByTestId('tile-uptime').first()).toBeHidden();
  });

  test('the preference ON renders the sparkline at compact', async ({ page }) => {
    await boot(page, true);
    await expect(page.getByTestId('uptime-sparkline').first()).toBeVisible();
    expect(await page.getByTestId('uptime-dot').count()).toBeGreaterThan(0);
  });

  test('the preference OFF removes it — the toggle is NOT a no-op here', async ({ page }) => {
    await boot(page, false);
    await expect(page.getByTestId('uptime-sparkline')).toHaveCount(0);
    // The rest of the tile is untouched: this is a render gate, not a data purge.
    await expect(page.getByTestId('tile-status').first()).toBeVisible();
    expect(await page.getByTestId('tool-link').count()).toBeGreaterThan(0);
  });

  test('the dots occupy real painted area INSIDE the tile at compact', async ({ page }) => {
    // Stronger than presence, and correctly scoped: compact/list tiles are
    // FIXED height, so the strip fits inside existing padding rather than
    // growing them — an assertion that the tile gets taller would be wrong
    // here, and was, on the first draft of this test.
    //
    // What matters instead is that the dots are painted and CONTAINED. A strip
    // overflowing a fixed-height tile would still satisfy toBeVisible() while
    // spilling over the tile below.
    await boot(page, true);
    const tile = (await page.getByTestId('tool-link').first().boundingBox())!;
    const strip = (await page.getByTestId('uptime-sparkline').first().boundingBox())!;
    expect(strip.width).toBeGreaterThan(0);
    expect(strip.height).toBeGreaterThan(0);
    expect(strip.y).toBeGreaterThanOrEqual(tile.y);
    expect(strip.y + strip.height).toBeLessThanOrEqual(tile.y + tile.height);
  });

  test('at Large the tile DOES grow — the preference changes layout, not just ink', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(['UP']);
    const withChecks = services.map((s: Record<string, unknown>) => ({
      ...s,
      uptimeChecks: [
        { success: true, timestamp: '2026-09-23T04:07:00Z' },
        { success: false, timestamp: '2026-09-23T04:08:00Z' },
      ],
    }));
    const heights: number[] = [];
    for (const on of [true, false]) {
      await page.addInitScript(
        (v) => localStorage.setItem('homepad:show-uptime-display', v),
        on ? 'true' : 'false',
      );
      await page.setViewportSize(AT_COMPACT);
      await mockApi(page, withChecks as never, categories, 'user', 'large');
      await page.goto('/');
      heights.push((await page.getByTestId('tool-link').first().boundingBox())!.height);
    }
    expect(heights[0]).toBeGreaterThan(heights[1]);
  });
});
