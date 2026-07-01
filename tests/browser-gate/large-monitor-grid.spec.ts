import { test, expect } from '@playwright/test';
import { mockApi, makeServices } from './mockApi';

// #201 / v14.1 — LARGE-MONITOR COLUMN-CEILING GATE (real-browser only).
//
// #201 originally required SIX columns at >=1440px. v14.1 (Caleb+Walt) lowered
// that ceiling to FOUR — 6 columns read sparse on wide monitors; 4 is the glance
// sweet spot (fieldColsFor drops the >=1300->6 tier, so the ladder is 4/3/2 at
// >=1024 / >=768 / <768). This gate now guards the NEW ceiling: at a wide viewport
// the flat (no-category) catalog must render exactly FOUR columns, never regress
// back up to 5/6 or silently down to 3.
//
// Why real-browser: v14 renders the flat catalog's tiles in `.panel-tiles`, a CSS
// grid whose track count is fed from JS as `--panel-cols` (fieldColsFor(width) ->
// repeat(<cols>, 190px)). The column count depends on the REAL painted viewport
// width crossing the breakpoints, which jsdom cannot see: it has no layout engine
// and computes no grid tracks, so a unit guard on the class string passes whether
// the field yields 4 columns or silently drifts to 3/6. Only a real browser
// resolves the computed template and reveals a regressed ceiling at 1440px.
//
// We seed more tiles than fit four columns and assert the COMPUTED track count,
// named for the observed symptom (column count at 1440px), not the px cause.

test('at a 1440px viewport the app grid renders exactly 4 columns (v14.1 ceiling)', async ({
  page,
}) => {
  // Default gate viewport is 1440x900 (playwright.gate.config.ts) — a wide monitor
  // above the >=1024 tier. 14 tiles guarantees the field wants more than four
  // columns, so the 4-col ceiling is what caps it, not a tile shortage.
  await mockApi(page, makeServices(14));
  await page.goto('/');

  // The catalog grid is the flat field's `.panel-tiles` (v14 floating-panel
  // layout — StatusBar/header use their own layout). With no categories mocked
  // there is exactly one, so `.last()` resolves it unambiguously.
  const grid = page.locator('.panel-tiles').last();
  await expect(grid).toBeVisible();

  // Resolve the computed grid template in the real browser. At the wide viewport
  // the field caps at 4 columns (v14.1 fieldColsFor), so `.panel-tiles` computes
  // `repeat(4, 190px)`; any breakpoint/panel-cols regression that moved it off 4
  // would show here.
  const trackCount = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  );
  expect(trackCount).toBe(4);
});
