import { test, expect } from './fixtures';
import { mockApi, makeBoxes } from './mockApi';

// SPEC-app-grid Amendment A1 (fixed-width tile layout) — real-browser gate.
//
// A1 corrects the 1fr regression: a tool tile must be the SAME fixed pixel width
// in every box regardless of the box's --w, boxes are content-sized and pack with
// flex-wrap, and the tile is a fixed-height module so 1- and 2-line names don't
// make tiles jump. These are layout/paint properties jsdom cannot see (no layout
// engine), so — exactly like the #35 gate — only a real Chromium proves them.
//
// The four checks below ARE the A1 acceptance gate (dispatch PROCESS §browser-gate).
// Tests are named for the observed symptom, not a theorized cause (retro lesson).

test.describe('A1 fixed-tile layout', () => {
  // Gate 1 — the invariant Caleb requires: a tile in a width-1 box and a tile in a
  // width-4 box render at IDENTICAL pixel width (AC-001-A1). Under the old 1fr
  // model they differed (box_width ÷ --w); under fixed 190px tiles they must match.
  test('a tile in a width-1 box and a tile in a width-4 box are the same pixel width', async ({
    page,
  }) => {
    const { services, categories } = makeBoxes([
      { width: 1, tools: ['Plex'] },
      { width: 4, tools: ['Grafana'] },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const w1 = await boxes.nth(0).getByTestId('tool-link').first().boundingBox();
    const w4 = await boxes.nth(1).getByTestId('tool-link').first().boundingBox();
    expect(w1).not.toBeNull();
    expect(w4).not.toBeNull();
    // Same fixed width (allow sub-pixel rounding). This is the whole point of A1.
    expect(Math.abs(w1!.width - w4!.width)).toBeLessThanOrEqual(1);
    // …and it is the fixed 190px slot, not a fluid fraction of the box.
    expect(Math.round(w1!.width)).toBe(190);
  });

  // Gate 2 — two consecutive width-3 boxes sit two-up at 1440px (AC-003-A2). Each
  // is 634px; two + the 16px page gap = 1284px, which clears 1440 comfortably.
  test('two width-3 boxes sit two-up at 1440px', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 3, tools: ['Plex', 'Sonarr', 'Radarr'] },
      { width: 3, tools: ['Grafana', 'Prometheus', 'Loki'] },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const a = await boxes.nth(0).boundingBox();
    const b = await boxes.nth(1).boundingBox();
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Same row → tops aligned, and the second sits to the RIGHT of the first.
    expect(Math.abs(a!.y - b!.y)).toBeLessThanOrEqual(2);
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  });

  // Gate 3 — at 1280px the second width-3 box wraps WHOLE to the next row (graceful
  // auto-fill wrap, AC-003-A2) with NO horizontal page scroll (D-3: (b) is rejected
  // outright). The box drops down; the document never scrolls sideways.
  test('at 1280px the second box wraps to the next row with no horizontal page scroll', async ({
    page,
  }) => {
    const { services, categories } = makeBoxes([
      { width: 3, tools: ['Plex', 'Sonarr', 'Radarr'] },
      { width: 3, tools: ['Grafana', 'Prometheus', 'Loki'] },
    ]);
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const a = await boxes.nth(0).boundingBox();
    const b = await boxes.nth(1).boundingBox();
    // Second box wrapped to a new row (its top is below the first box).
    expect(b!.y).toBeGreaterThan(a!.y + 1);
    // No horizontal page scroll — the killer UX D-3 forbids.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // Gate 5 — a width-N box's FLOOR actually packs at least N tiles across its top
  // row (AC-004–008). Regression guard: a 1px box border shrank the content to 806px
  // so auto-fill dropped a width-4 box to 3 columns (the 4th tile fell to row 2). The
  // top row of a width-4 box with ≥4 tools must hold ≥4 tiles.
  // SPEC-pane-fill-reflow (Phase 1): this box is alone in its row, so R4 grows it to
  // 100% and it may reveal MORE than 4 columns (tiles stay 190px — R2). The guard is
  // therefore ≥4 (floor honoured), not ==4 (the pre-Phase-1 fixed-width invariant).
  test('a width-4 box packs at least 4 tiles across its top row (not 3)', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 4, tools: ['Plex', 'Jellyfin', 'Sonarr', 'Radarr', 'Tautulli'] },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const tools = page.getByTestId('tool-link');
    await expect(tools).toHaveCount(5);
    const tops = await tools.evaluateAll((els) =>
      els.map((e) => Math.round(e.getBoundingClientRect().top)),
    );
    const topRow = Math.min(...tops);
    const inTopRow = tops.filter((t) => Math.abs(t - topRow) <= 2).length;
    expect(inTopRow).toBeGreaterThanOrEqual(4);
  });

  // Gate 4 — a 1-line-name tile and a 2-line-name tile are the SAME height (D-2:
  // name block reserves 2 lines on every tile, fixed min-height:120px), so tiles
  // never jump. "ArchiveTeam Warrior1" wraps to two lines; "Plex" stays one.
  test('a 1-line-name tile and a 2-line-name tile are the same height', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 4, tools: ['Plex', 'ArchiveTeam Warrior1'] },
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const tools = page.getByTestId('tool-link');
    await expect(tools).toHaveCount(2);
    const short = await tools.nth(0).boundingBox();
    const long = await tools.nth(1).boundingBox();
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    // Identical height — no jump between a 1-line and a 2-line label.
    expect(Math.abs(short!.height - long!.height)).toBeLessThanOrEqual(1);
  });
});
