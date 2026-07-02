import { test, expect } from '@playwright/test';
import { mockApi } from './mockApi';

// #35 REGRESSION GATE — real-browser only.
//
// This file is the teeth behind the "browser gate" CI check. Every assertion
// here is INVISIBLE to jsdom: jsdom has no layout, no paint, no z-index, and no
// hit-testing, so a center `.click()` always dispatches on its target element
// regardless of what visually covers it. The #35 bug was exactly that — the
// tile's <a> link painted on top of the "⋯" trigger's centre, so a real mouse
// click hit the link and the menu never opened. In a real Chromium, Playwright's
// actionability hit-test refuses to click an element another element intercepts,
// so removing the `z-20` lift makes the FIRST test below go red. (Proof of teeth
// is recorded in the PR: revert `z-20` on the ⋯ container → red; restore → green.)
//
// The touch tests cover the second half of #35 — a tap opened the menu and the
// trailing synthetic mouse event slammed it shut (MENU_OPEN→MENU_CLOSE), again
// only observable with real pointer-event synthesis.

test.beforeEach(async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  // The tile (and its ⋯ trigger) must render before we exercise the gesture.
  await expect(page.getByTestId('tile-menu')).toBeVisible();
});

test('mouse: a real centre click on the ⋯ trigger opens the menu', async ({ page }) => {
  await expect(page.getByRole('menu')).toHaveCount(0);
  // .click() targets the element CENTRE and hit-tests it. Without z-20 the tile
  // <a> intercepts pointer events here and this call fails — that is the gate.
  await page.getByTestId('tile-menu').click();
  await expect(page.getByRole('menu')).toBeVisible();
});

test('mouse: an outside click dismisses the menu', async ({ page }) => {
  await page.getByTestId('tile-menu').click();
  await expect(page.getByRole('menu')).toBeVisible();
  // Click well away from the tile + menu.
  await page.mouse.click(5, 5);
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('touch: a tap opens the menu and it STAYS open', async ({ page }) => {
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('tile-menu').tap();
  await expect(page.getByRole('menu')).toBeVisible();
  // The #35 touch regression: the trailing synthetic mouse event re-closed the
  // menu within a frame. Give it room to (mis)fire, then assert it survived.
  await page.waitForTimeout(150);
  await expect(page.getByRole('menu')).toBeVisible();
});

test('touch: an outside tap dismisses the menu', async ({ page }) => {
  await page.getByTestId('tile-menu').tap();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.touchscreen.tap(5, 5);
  await expect(page.getByRole('menu')).toHaveCount(0);
});
