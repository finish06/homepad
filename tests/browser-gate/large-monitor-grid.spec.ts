import { test, expect } from '@playwright/test';
import { mockApi, makeServices } from './mockApi';

// #201 — LARGE-MONITOR COLUMN-COUNT GATE (real-browser only).
//
// spec large-monitor-grid.md / AC-004: at a >=1440px viewport the dashboard grid
// must render exactly SIX columns. The auto-fill `minmax(<min>px, 1fr)` template
// decides the column count from the REAL available width — which is the viewport
// MINUS the scrollbar (~15px) and the px-4 page padding (32px). jsdom has no
// scrollbar, no layout engine, and computes no grid tracks, so it cannot see
// this: a unit guard on the class string passes whether the min is 220px or
// 210px. Only a real browser resolves the template against the painted width and
// reveals that 220px silently drops to 5 columns at 1440px (Ada's PR #198 finding:
// 6*220 + 5*16 = 1400 > 1393 available -> 5 cols).
//
// We seed enough tiles to fill six columns and assert the COMPUTED track count,
// named for the observed symptom (column count at 1440px), not the px cause.

test('at a 1440px viewport the app grid renders exactly 6 columns (AC-004)', async ({
  page,
}) => {
  // Default gate viewport is 1440x900 (playwright.gate.config.ts) — the exact
  // width #201 regressed at. 14 tiles guarantees the grid wants >6 columns, so
  // the template's min-width is what caps it at 6, not a tile shortage.
  await mockApi(page, makeServices(14));
  await page.goto('/');

  // The catalog grid is the last .grid (StatusBar/header use their own layout).
  const grid = page.locator('.grid').last();
  await expect(grid).toBeVisible();

  // Resolve the auto-fill template against the real painted width. With the
  // scrollbar present the available width is ~1393px; only a <=210px min fits
  // six 16px-gapped tracks. 220px yields five 265.8px tracks (the #201 bug).
  const trackCount = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  );
  expect(trackCount).toBe(6);
});
