import { test, expect } from '@playwright/test';
import { mockApi, makeServices } from './mockApi';

// #201 — LARGE-MONITOR COLUMN-COUNT GATE (real-browser only).
//
// spec large-monitor-grid.md / AC-004: at a >=1440px viewport the dashboard grid
// must render exactly SIX columns. v14 replaced the old single auto-fill catalog
// `.grid` with the floating-panel field — a flat (no-category) catalog now renders
// its tiles in `.panel-tiles`, a CSS grid whose track count is fed from JS as
// `--panel-cols` (fieldColsFor(width) -> repeat(<cols>, 190px)). The column count
// therefore depends on the REAL painted viewport width crossing the 1300px
// breakpoint, which jsdom cannot see: it has no layout engine and computes no grid
// tracks, so a unit guard on the class string passes whether the field yields 6
// columns or silently drops to 4/5. Only a real browser resolves the computed
// template and reveals a regressed breakpoint or a mis-sized panel at 1440px.
//
// We seed enough tiles to fill six columns and assert the COMPUTED track count,
// named for the observed symptom (column count at 1440px), not the px cause.

test('at a 1440px viewport the app grid renders exactly 6 columns (AC-004)', async ({
  page,
}) => {
  // Default gate viewport is 1440x900 (playwright.gate.config.ts) — the exact
  // width #201 regressed at. 14 tiles guarantees the field wants >6 columns, so
  // the field's column count is what caps it at 6, not a tile shortage.
  await mockApi(page, makeServices(14));
  await page.goto('/');

  // The catalog grid is the flat field's `.panel-tiles` (v14 floating-panel
  // layout — StatusBar/header use their own layout). With no categories mocked
  // there is exactly one, so `.last()` resolves it unambiguously.
  const grid = page.locator('.panel-tiles').last();
  await expect(grid).toBeVisible();

  // Resolve the computed grid template in the real browser. At >=1300px the field
  // is 6 columns (fieldColsFor), so `.panel-tiles` computes `repeat(6, 190px)`;
  // any breakpoint/panel-cols regression that dropped it below 6 would show here.
  const trackCount = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  );
  expect(trackCount).toBe(6);
});
