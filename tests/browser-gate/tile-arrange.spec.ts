import { test, expect } from '@playwright/test';
import { mockApi, makeServices, toggleArrange } from './mockApi';

// #166 ⨯ #174 RECONCILIATION GATE — real-browser only.
//
// The combined tile-control model after reconciling the #166 Arrange work with
// the v12.2.0 (#174) per-tile "⋯" menu that shipped to prod:
//
//   • The "⋯" menu (Favorite ★ + Remove from dashboard) is ALWAYS present — in
//     both the normal launcher view AND Arrange mode. Favoriting is NOT gated.
//   • The per-tile reorder GRIP is gated behind Arrange mode: hidden in the
//     normal view, revealed when the header settings gear turns Arrange on.
//
// jsdom can't see the half that matters here — the grip's reveal is a real
// render toggle (unit-testable), but that the menu and grip COEXIST as real,
// separately hit-testable controls, and that a real reorder gesture lands, is
// only honest in a real browser with layout + paint + pointer synthesis.

test('the ⋯ menu is present in the normal view; the reorder grip is hidden until Arrange', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  // Menu present without entering any mode (the v12.2.0 always-on control).
  await expect(page.getByTestId('tile-menu')).toBeVisible();
  // Grip gated off by default — decluttered launcher.
  await expect(page.getByTestId('drag-handle')).toHaveCount(0);
});

test('the gear menu Arrange item toggles Arrange: grip appears while the ⋯ menu stays present', async ({ page }) => {
  await mockApi(page);
  await page.goto('/');
  await expect(page.getByTestId('settings-gear')).toBeVisible();
  await expect(page.getByTestId('tile-menu')).toBeVisible();

  // Enter Arrange via the v18 gear menu — grip revealed, menu STILL present (the
  // two coexist).
  await toggleArrange(page);
  await expect(page.getByTestId('drag-handle')).toBeVisible();
  await expect(page.getByTestId('tile-menu')).toBeVisible();

  // A real centre click on the revealed grip must land on the grip itself, not
  // be intercepted by the tile <a> painted nearby — Playwright's actionability
  // hit-test throws if another element covers the centre. A plain click does not
  // reorder (8px drag activation), so this purely proves the grip is reachable.
  await page.getByTestId('drag-handle').click();
  await expect(page.getByTestId('tile-menu')).toBeVisible();

  // Leave Arrange (same gear-menu path) — grip tucks away again, menu persists.
  await toggleArrange(page);
  await expect(page.getByTestId('drag-handle')).toHaveCount(0);
  await expect(page.getByTestId('tile-menu')).toBeVisible();
});

test('mouse: in Arrange a real grip drag reorders and persists the new id order', async ({ page }) => {
  await mockApi(page, makeServices(3));
  await page.goto('/');
  await toggleArrange(page);
  const grips = page.getByTestId('drag-handle');
  await expect(grips).toHaveCount(3);

  // A real pointer drag of tile 1's grip onto tile 2's grip. The 8px activation
  // distance means a stray click never reorders — only a genuine drag does. This
  // is the half jsdom can't run: real hit-testing picks the grip under the
  // cursor and synthesises the pointer-move stream dnd-kit needs.
  const g1 = (await grips.nth(0).boundingBox())!;
  const g2 = (await grips.nth(1).boundingBox())!;
  const putBody = page.waitForRequest(
    (r) => r.url().includes('/api/layout') && r.method() === 'PUT',
  );
  await page.mouse.move(g1.x + g1.width / 2, g1.y + g1.height / 2);
  await page.mouse.down();
  await page.mouse.move(g1.x + g1.width / 2 + 12, g1.y + g1.height / 2, { steps: 3 });
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2, { steps: 8 });
  await page.mouse.up();

  // The reorder persists the FULL new id order via PUT /api/layout — tile 1 and
  // tile 2 have swapped slots (svc-2 now leads).
  const order = (await putBody).postDataJSON().order as string[];
  expect(order).toEqual(['svc-2', 'svc-1', 'svc-3']);
});
