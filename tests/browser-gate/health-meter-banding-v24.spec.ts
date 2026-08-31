import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-v24 — health-meter status banding, real-browser GATE.
//
// The whole point of the feature is a PAINT read: the ticks group into three
// contiguous colour bands (GREEN → GRAY → RED, healthy-first) so the fleet
// distribution reads at a glance. jsdom has no layout or paint, so it can assert
// DOM order but not that the flex strip actually renders those ticks left→right
// in banded order, nor that the strip paints exactly three colours (DEGRADED
// folded into RED — no amber survives). Only a real Chromium proves that.
// Named for the observed symptom (banded strip), not a cause (retro lesson).

// Layout order deliberately interleaves all three bands so a pass proves grouping.
const STATES = ['UP', 'DOWN', 'NOT_MONITORED', 'UP', 'DEGRADED', 'UNKNOWN', 'DOWN', 'UP'];

// Which band a wire status belongs to (SPEC-v24 §3.2).
const BAND: Record<string, 'green' | 'gray' | 'red'> = {
  UP: 'green',
  NOT_MONITORED: 'gray',
  UNKNOWN: 'gray',
  DOWN: 'red',
  DEGRADED: 'red',
};

test.describe('SPEC-v24 health-meter status banding', () => {
  // Gate — reading the strip LEFT → RIGHT by real x-geometry, the ticks appear
  // in three contiguous bands (all green, then all gray, then all red) and the
  // strip paints exactly three colours: DEGRADED shares the DOWN (red) fill, so
  // no fourth amber colour appears (the 3-band decision, §8.B).
  test('renders ticks in contiguous GREEN → GRAY → RED bands painting exactly three colours', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(STATES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const meter = page.getByTestId('health-meter');
    await expect(meter).toBeVisible();
    const ticks = meter.locator('[data-tick]');
    await expect(ticks).toHaveCount(STATES.length);

    // Read each tick's real geometry + painted fill from the browser.
    const painted = await ticks.evaluateAll((els) =>
      els.map((el) => ({
        status: el.getAttribute('data-status'),
        x: el.getBoundingClientRect().x,
        bg: getComputedStyle(el).backgroundColor,
      })),
    );

    // Sort by painted x-position (left → right) — the true visual order, not DOM.
    const byX = [...painted].sort((a, b) => a.x - b.x);
    const bands = byX.map((t) => BAND[t.status ?? '']);

    // Three contiguous bands, healthy-first, matching the interleaved fixture's
    // banded expectation: green×3, gray×2, red×3.
    expect(bands).toEqual(['green', 'green', 'green', 'gray', 'gray', 'red', 'red', 'red']);

    // Exactly three painted colours — DEGRADED did NOT introduce a fourth (amber)
    // fill; it paints the same red as DOWN.
    const distinct = new Set(painted.map((t) => t.bg));
    expect(distinct.size).toBe(3);
    const red = painted.find((t) => t.status === 'DOWN')!.bg;
    const degradedBg = painted.find((t) => t.status === 'DEGRADED')!.bg;
    expect(degradedBg).toBe(red);
    // The three bands are mutually distinct fills (green ≠ gray ≠ red).
    const green = painted.find((t) => t.status === 'UP')!.bg;
    const gray = painted.find((t) => t.status === 'NOT_MONITORED')!.bg;
    expect(new Set([green, gray, red]).size).toBe(3);
  });
});
