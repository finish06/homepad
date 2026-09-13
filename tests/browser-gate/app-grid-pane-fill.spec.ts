import { test, expect } from './fixtures';
import { mockApi, makeBoxes } from './mockApi';

// SPEC-pane-fill-reflow (Phase 1, R1/R3/R4) — real-browser gate.
//
// Phase 1 makes each App-Grid box GROW above its --w floor to fill the row's
// dead-space (weighted by app count, capped at content-max; a lone box fills 100%),
// while tiles stay a fixed 190px (R2). Whether the outer dead space actually
// collapses to 0, whether a box honours its floor, and whether tiles stay 190px in
// a GROWN box are all layout/paint properties jsdom cannot see — only a real
// Chromium proves them. jsdom covers the computed --floor/--grow/--cap vars; this
// gate proves the pixels. Tests are named for the observed symptom (retro lesson).
//
// SPEC-app-grid §10.4 (12-column grid): a box's FLOOR is its span's share of the
// frame — boxWidthPx(span, frame) = (frame + 16) × span / 12 − 16, so 3+3+6 etc.
// fill a row exactly. contentMaxPx(n) = n×190 + (n−1)×16 + 32 is the grow cap; the
// effective cap is max(floor, contentMax), so a box never renders narrower than
// its span even with few apps.
const frameOf = (vw: number) => Math.min(vw, Math.max(1536, vw * 0.92)) - 32;
const floorOf = (span: number, vw: number) => Math.floor(((frameOf(vw) + 16) * span) / 12 - 16);

test.describe('pane-fill box grow (R1/R3/R4)', () => {
  // R1 + R3 + R3-2 — two populated boxes on a wide row grow to fill the frame with
  // NO dead space at the right edge, and the box with MORE apps ends up wider
  // (weighted grow). Develop(12 apps) + Friends(6 apps), both width-2 so both can
  // grow well above their 428px floor. This is Caleb's dead-space complaint, cured.
  // Density (12+6) keeps the combined content-max (2488+1252) above the FLUID
  // frame at every gated viewport — 3840 gates the SPEC-ultrawide-fluid-frame
  // band (frame ~3501px there, vs the old fixed 1504px island).
  for (const vw of [1920, 2560, 3840]) {
    test(`two populated boxes fill the row with no right-edge dead space at ${vw}px`, async ({
      page,
    }) => {
      const { services, categories } = makeBoxes([
        { width: 3, tools: ['Dev1', 'Dev2', 'Dev3', 'Dev4', 'Dev5', 'Dev6', 'Dev7', 'Dev8', 'Dev9', 'Dev10', 'Dev11', 'Dev12'] },
        { width: 3, tools: ['Fr1', 'Fr2', 'Fr3', 'Fr4', 'Fr5', 'Fr6'] },
      ]);
      await page.setViewportSize({ width: vw, height: 1000 });
      await mockApi(page, services, categories, 'user');
      await page.goto('/');

      const grid = page.getByTestId('app-grid');
      const boxes = page.getByTestId('app-grid-box');
      await expect(boxes).toHaveCount(2);

      const gridBox = await grid.boundingBox();
      const develop = await boxes.nth(0).boundingBox();
      const friends = await boxes.nth(1).boundingBox();
      expect(gridBox && develop && friends).toBeTruthy();

      // Same row (tops aligned) — this is the packed row, not a wrap.
      expect(Math.abs(develop!.y - friends!.y)).toBeLessThanOrEqual(2);
      // FLUID FRAME (SPEC-ultrawide-fluid-frame): past the ~1670px crossover the
      // CONTENT_WIDTH frame is 92vw, not the old fixed 1536px island — the grid
      // itself must be wide before "no dead space" means anything at 2560/3840.
      const expectedFrame = Math.min(vw, Math.max(1536, vw * 0.92)) - 32;
      expect(Math.abs(gridBox!.width - expectedFrame)).toBeLessThanOrEqual(2);
      // DEAD SPACE GONE: the rightmost box's right edge reaches the grid's right
      // edge (the CONTENT_WIDTH frame). Pre-Phase-1 this gap was 384px@1920 /
      // 1024px@2560; now it is ~0.
      const gridRight = gridBox!.x + gridBox!.width;
      const lastBoxRight = friends!.x + friends!.width;
      const deadSpace = gridRight - lastBoxRight;
      expect(deadSpace).toBeLessThanOrEqual(2);
      // Weighted grow (AC-R3-2): Develop (12 apps) claims more width than Friends (6).
      expect(develop!.width).toBeGreaterThan(friends!.width + 1);
      // No horizontal page scroll.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  // R3 AC-R3-4 / TC-003 — the admin span is a FLOOR that always holds. A half (6)
  // box with 2 apps is alone in its row, so R4 lifts it to 100% — but it must
  // never render below its half-frame floor, and its tiles are still 190px
  // (grown boxes reveal more 190px columns, they don't stretch tiles).
  test('a half-span box never renders below its floor at 1440px', async ({ page }) => {
    const { services, categories } = makeBoxes([{ width: 6, tools: ['Wide1', 'Wide2'] }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const box = page.getByTestId('app-grid-box').first();
    const bb = await box.boundingBox();
    expect(bb).not.toBeNull();
    // Floor honoured: never narrower than half the frame (allow sub-px).
    expect(bb!.width).toBeGreaterThanOrEqual(floorOf(6, 1440) - 1);
    // Tiles stay a fixed 190px even though the box is far wider than its 2 apps.
    const tile = await box.getByTestId('tool-link').first().boundingBox();
    expect(Math.round(tile!.width)).toBe(190);
  });

  // R3 AC-R3-3 / TC-002 under §10.4 — a low-app box holds its SPAN, no more: the
  // cap is max(floor, content-max), so a quarter (3) box with 1 app sharing a
  // 2560 row with a big half (6) box renders exactly a quarter of the frame — it
  // neither balloons into the row's slack nor shrinks to one tile.
  test('a 1-app quarter box holds its quarter — no balloon into the row at 2560px', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 3, tools: ['Solo'] },
      { width: 6, tools: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] },
    ]);
    await page.setViewportSize({ width: 2560, height: 1000 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const solo = await boxes.nth(0).boundingBox();
    expect(Math.abs(solo!.width - floorOf(3, 2560))).toBeLessThanOrEqual(3);
  });

  // R3 residual rule + SPEC-ultrawide-fluid-frame — when EVERY box in a row is
  // already at its cap and fluid-band row space still remains (few apps on a 4K
  // monitor), the packed cluster CENTERS instead of left-packing against a
  // ragged right void. Two quarter (3) boxes with 1 and 2 apps on a ~3501px
  // frame: their caps are their quarter floors (content-max is smaller), so
  // together they take half the row — equal gaps either side, no balloon.
  test('capped boxes center as a cluster in the fluid band at 3840px', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 3, tools: ['Solo'] },
      { width: 3, tools: ['PairA', 'PairB'] },
    ]);
    await page.setViewportSize({ width: 3840, height: 1200 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const grid = await page.getByTestId('app-grid').boundingBox();
    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const solo = await boxes.nth(0).boundingBox();
    const pair = await boxes.nth(1).boundingBox();
    expect(grid && solo && pair).toBeTruthy();

    // Same row, both still at their quarter cap — centering must not re-balloon the glass.
    expect(Math.abs(solo!.y - pair!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(solo!.width - floorOf(3, 3840))).toBeLessThanOrEqual(3);
    expect(Math.abs(pair!.width - floorOf(3, 3840))).toBeLessThanOrEqual(3);
    // The cluster is CENTERED: symmetric residual gaps (not a 0px left gap).
    const leftGap = solo!.x - grid!.x;
    const rightGap = grid!.x + grid!.width - (pair!.x + pair!.width);
    expect(leftGap).toBeGreaterThan(100);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);
  });

  // R4 AC-R4-1 — a box alone in its row fills 100% of the frame (tiles left-packed),
  // even from a quarter (3) floor.
  test('a lone box fills 100% of the frame at 1920px', async ({ page }) => {
    const { services, categories } = makeBoxes([{ width: 3, tools: ['One', 'Two', 'Three'] }]);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const grid = await page.getByTestId('app-grid').boundingBox();
    const box = await page.getByTestId('app-grid-box').first().boundingBox();
    expect(grid && box).toBeTruthy();
    // The box spans the full grid content width (both edges align, ~0 gap each side).
    expect(Math.abs(box!.x - grid!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(box!.width - grid!.width)).toBeLessThanOrEqual(2);
    // Tiles left-packed and still 190px.
    const tile = await page.getByTestId('tool-link').first().boundingBox();
    expect(Math.round(tile!.width)).toBe(190);
  });
});
