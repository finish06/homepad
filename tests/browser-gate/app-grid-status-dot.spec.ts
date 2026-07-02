import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-242 — per-tile status dot on the App Grid, real-browser GATE.
//
// The dot's contract is almost entirely paint + hit-test: WHERE it lands (top-left,
// clear of the favorite ★), what COLOUR each state paints, and that it adds no
// layout (the 120px tile height must not budge). jsdom has no layout engine and no
// computed paint, so — like the #35 / A1 gates — only a real Chromium proves these.
// Tests are named for the observed symptom, not a theorized cause (retro lesson).

const STATES = ['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'NOT_MONITORED'];

// One tile-status locator per state (tiles are named "App {STATE}").
function dot(page: import('@playwright/test').Page, state: string) {
  return page
    .locator('.app-grid-tool-wrap', { hasText: `App ${state}` })
    .getByTestId('tile-status');
}

test.describe('SPEC-242 per-tile status dot', () => {
  // Gate 1 — the dot sits in the tile's TOP-LEFT corner (8/8) and never overlaps
  // the favorite ★ (top-right). This is the whole point of D-1's top-left choice:
  // top-right is already taken by the star. Measured against real geometry.
  test('the status dot sits top-left of the tile and does not overlap the favorite star', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(STATES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const wraps = page.locator('.app-grid-tool-wrap');
    await expect(wraps).toHaveCount(STATES.length);

    for (const state of STATES) {
      const wrap = page.locator('.app-grid-tool-wrap', { hasText: `App ${state}` });
      const tile = await wrap.getByTestId('tool-link').boundingBox();
      const pip = await dot(page, state).boundingBox();
      const star = await wrap.getByTestId('tile-favorite').boundingBox();
      expect(tile).not.toBeNull();
      expect(pip).not.toBeNull();
      expect(star).not.toBeNull();

      // Top-left inset ≈ 8px (border box; box-shadow ring is outside boundingBox).
      expect(pip!.x - tile!.x).toBeGreaterThanOrEqual(6);
      expect(pip!.x - tile!.x).toBeLessThanOrEqual(10);
      expect(pip!.y - tile!.y).toBeGreaterThanOrEqual(6);
      expect(pip!.y - tile!.y).toBeLessThanOrEqual(10);

      // The pip lives in the LEFT half; the star in the RIGHT half — no overlap:
      // the pip's right edge is entirely left of the star's left edge.
      expect(pip!.x + pip!.width).toBeLessThan(star!.x);
    }
  });

  // Gate 2 — each state paints its OWN colour (AC-002..006). Solids carry a fill;
  // NOT_MONITORED is the sole hollow/dashed shape (transparent fill + dashed ring,
  // AC-017). Read from getComputedStyle so it's the real cascade, not a class guess.
  test('each state paints its distinct colour, NOT_MONITORED a dashed hollow ring', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(STATES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const styleOf = (state: string) =>
      dot(page, state).evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          background: s.backgroundColor,
          borderStyle: s.borderStyle,
          borderColor: s.borderColor,
          boxShadow: s.boxShadow,
        };
      });

    expect((await styleOf('UP')).background).toBe('rgb(16, 185, 129)');
    expect((await styleOf('DOWN')).background).toBe('rgb(239, 68, 68)');
    expect((await styleOf('DEGRADED')).background).toBe('rgb(251, 191, 36)');
    expect((await styleOf('UNKNOWN')).background).toBe('rgb(163, 163, 163)');

    // NOT_MONITORED: hollow (transparent) + dashed ring — the colour-blind-safe shape.
    const nm = await styleOf('NOT_MONITORED');
    expect(nm.background).toBe('rgba(0, 0, 0, 0)');
    expect(nm.borderStyle).toBe('dashed');
    expect(nm.borderColor).toBe('rgb(115, 115, 115)');

    // Glow ON for the failure states, OFF for UNKNOWN + NOT_MONITORED (§4/D-3).
    expect((await styleOf('UP')).boxShadow).toContain('16, 185, 129');
    expect((await styleOf('DOWN')).boxShadow).toContain('244, 63, 94');
    // UNKNOWN keeps only the 1px definition ring — no coloured glow layers.
    const unknownShadow = (await styleOf('UNKNOWN')).boxShadow;
    expect(unknownShadow).not.toContain('16, 185, 129');
    expect(unknownShadow).not.toContain('244, 63, 94');
  });

  // Gate 3 — the pip adds NO layout height (AC-007). It's absolute + pointer-
  // events:none, so it's out of flow: the .app-grid-tool-wrap must be the EXACT
  // same height as the .app-grid-tool link it wraps — if the dot were in flow the
  // wrap would be taller. And every tile stays a uniform height (the dot never
  // pushes a name/sparkline down on one tile vs another).
  test('the status dot adds zero layout height — wrap height equals the tile height', async ({
    page,
  }) => {
    const { services, categories } = makeStatusTiles(STATES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const wraps = page.locator('.app-grid-tool-wrap');
    await expect(wraps).toHaveCount(STATES.length);

    const tileHeights: number[] = [];
    for (const state of STATES) {
      const wrap = page.locator('.app-grid-tool-wrap', { hasText: `App ${state}` });
      const wrapBox = await wrap.boundingBox();
      const tileBox = await wrap.getByTestId('tool-link').boundingBox();
      expect(wrapBox).not.toBeNull();
      expect(tileBox).not.toBeNull();
      // The out-of-flow pip contributes no height: wrap == tile, to the pixel.
      expect(Math.abs(wrapBox!.height - tileBox!.height)).toBeLessThanOrEqual(1);
      tileHeights.push(Math.round(tileBox!.height));
    }
    // Uniform across every state — the dot never makes one tile taller (AC-008).
    expect(Math.max(...tileHeights) - Math.min(...tileHeights)).toBeLessThanOrEqual(1);
  });
});
