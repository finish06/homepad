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
// boxWidthPx(w) = w×190 + (w−1)×16 + 32 :  w1=222 · w2=428 · w3=634 · w4=840 · w6=1252
// contentMaxPx(n) = same formula, unclamped (the grow cap).

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
        { width: 2, tools: ['Dev1', 'Dev2', 'Dev3', 'Dev4', 'Dev5', 'Dev6', 'Dev7', 'Dev8', 'Dev9', 'Dev10', 'Dev11', 'Dev12'] },
        { width: 2, tools: ['Fr1', 'Fr2', 'Fr3', 'Fr4', 'Fr5', 'Fr6'] },
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

  // R3 AC-R3-4 / TC-003 — the admin --w is a FLOOR that always holds. A width-6 box
  // (floor 1252px) renders at least that wide at 1440, and its tiles are still 190px
  // (grown boxes reveal more 190px columns, they don't stretch tiles).
  test('a width-6 box never renders below its 1252px floor at 1440px', async ({ page }) => {
    const { services, categories } = makeBoxes([{ width: 6, tools: ['Wide1', 'Wide2'] }]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const box = page.getByTestId('app-grid-box').first();
    const bb = await box.boundingBox();
    expect(bb).not.toBeNull();
    // Floor honoured: never narrower than boxWidthPx(6) = 1252 (allow sub-px).
    expect(bb!.width).toBeGreaterThanOrEqual(1251);
    // Tiles stay a fixed 190px even though the box is far wider than its 2 apps.
    const tile = await box.getByTestId('tool-link').first().boundingBox();
    expect(Math.round(tile!.width)).toBe(190);
  });

  // R3 AC-R3-3 / TC-002 — a low-app box is capped at its content-max: no empty glass
  // extends past its tiles. A width-1 box with 1 app, sharing a 2560 row with a big
  // 6-app box, must stay ~one-tile wide (≤ ~240px), NOT balloon into a void.
  test('a 1-app box stays at its content-max — no empty glass at 2560px', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 1, tools: ['Solo'] },
      { width: 6, tools: ['B1', 'B2', 'B3', 'B4', 'B5', 'B6'] },
    ]);
    await page.setViewportSize({ width: 2560, height: 1000 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');

    const boxes = page.getByTestId('app-grid-box');
    await expect(boxes).toHaveCount(2);
    const solo = await boxes.nth(0).boundingBox();
    // content-max for 1 app is 222px; it must not stretch beyond a single tile + pad.
    expect(solo!.width).toBeLessThanOrEqual(240);
  });

  // R3 residual rule + SPEC-ultrawide-fluid-frame — when EVERY box in a row is
  // already at its content-max and fluid-band row space still remains (few apps
  // on a 4K monitor), the packed cluster CENTERS instead of left-packing against
  // a ragged right void. Two capped boxes (1 app + 2 apps, ~666px together) on a
  // ~3501px frame: equal gaps either side, boxes still content-max, no balloon.
  test('capped boxes center as a cluster in the fluid band at 3840px', async ({ page }) => {
    const { services, categories } = makeBoxes([
      { width: 1, tools: ['Solo'] },
      { width: 1, tools: ['PairA', 'PairB'] },
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

    // Same row, both still content-max — centering must not re-balloon the glass.
    expect(Math.abs(solo!.y - pair!.y)).toBeLessThanOrEqual(2);
    expect(solo!.width).toBeLessThanOrEqual(240);
    expect(pair!.width).toBeLessThanOrEqual(446);
    // The cluster is CENTERED: symmetric residual gaps (not a 0px left gap).
    const leftGap = solo!.x - grid!.x;
    const rightGap = grid!.x + grid!.width - (pair!.x + pair!.width);
    expect(leftGap).toBeGreaterThan(100);
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2);
  });

  // R4 AC-R4-1 — a box alone in its row fills 100% of the frame (tiles left-packed).
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
