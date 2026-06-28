import { test, expect } from '@playwright/test';
import { mockApi, makeServices } from './mockApi';

// #57 REGRESSION GATE — real-browser only (issue #59).
//
// #57: the open UserMenu dropdown was painted UNDER the tiles' drag-grips, so a
// grip swallowed clicks meant for the dropdown. The fix lifts AppHeader to z-20
// (PR #58) so its whole subtree — including the absolutely-positioned dropdown —
// stacks above the grips' z-10. Revert the header to z-10 and the grip (later in
// DOM) repaints over the dropdown again.
//
// This is INVISIBLE to jsdom exactly like #35: jsdom has no z-index, no paint,
// and no hit-testing — `document.elementFromPoint` there is meaningless. Only a
// real Chromium resolves "which element actually occupies this pixel". The teeth:
// flip AppHeader z-20 → z-10 and rebuild → this spec goes red (elementFromPoint
// at the overlap returns the drag-grip, not the dropdown); restore → green.
// (Proof recorded in the PR: revert z-20 → red; restore → green.)
//
// We render EIGHT tiles so the grid fills its right column at the 1440px gate
// viewport — that puts a tile's bottom-right grip directly beneath the
// right-anchored dropdown, which is the only place the two can overlap.
//
// #166: the per-tile reorder grip is now revealed by per-user Arrange mode (the
// header settings gear) rather than always-on, so we enter Arrange first. The
// z-stacking this gate guards (header z-20 over grip z-10) is unchanged.

test.beforeEach(async ({ page }) => {
  await mockApi(page, makeServices(8));
  await page.goto('/');
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  await expect(page.getByTestId('service-tile').first()).toBeVisible();
  // Reveal the per-tile reorder grips (#166 Arrange mode) so they can contest
  // the dropdown's pixels.
  await page.getByTestId('settings-gear').click();
  await expect(page.getByTestId('drag-handle').first()).toBeVisible();
});

test('mouse: the open UserMenu dropdown sits above tile drag-grips', async ({ page }) => {
  // Open the dropdown (issue #59 step 1).
  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Step 2/3: find every drag-grip that overlaps the dropdown box and, at the
  // CENTRE of each overlap, ask the browser which element owns that pixel. With
  // the header at z-20 the dropdown wins every contested pixel; at z-10 a grip
  // does. We assert in real Chromium, where elementFromPoint is honest.
  const probe = await page.evaluate(() => {
    // Ignore sub-pixel near-misses (issue #63): the grid can place a row-2 tile's
    // grip-top exactly at the dropdown's bottom edge (e.g. grip.top=334.00 vs
    // menu.bottom=334.17), yielding a ~0.17px sliver of "overlap". Probing the
    // centre of so thin a band is Chromium-version-sensitive — elementFromPoint
    // can round to the grip and flake the gate without any real regression.
    // Require at least MIN_OVERLAP_PX of overlap on BOTH axes so only genuine,
    // interior overlaps (like svc-4's 36px band) are tested. Test-robustness
    // only; the z-20 regression teeth are unchanged.
    const MIN_OVERLAP_PX = 2;
    const menu = document.querySelector('[data-testid="user-menu"]') as HTMLElement;
    const mb = menu.getBoundingClientRect();
    const results: { sid: string | null; x: number; y: number; hitInMenu: boolean; hitTestid: string | null }[] = [];
    for (const g of Array.from(document.querySelectorAll('[data-testid="drag-handle"]'))) {
      const r = g.getBoundingClientRect();
      const ox = Math.max(r.left, mb.left);
      const oX = Math.min(r.right, mb.right);
      const oy = Math.max(r.top, mb.top);
      const oY = Math.min(r.bottom, mb.bottom);
      // Skip when the contested region is empty OR thinner than MIN_OVERLAP_PX
      // on either axis (a sub-pixel boundary touch, not a real stacking overlap).
      if (oX - ox < MIN_OVERLAP_PX || oY - oy < MIN_OVERLAP_PX) continue;
      const x = (ox + oX) / 2;
      const y = (oy + oY) / 2;
      const hit = document.elementFromPoint(x, y);
      const owner = hit?.closest('[data-testid]') ?? null;
      results.push({
        sid: g.getAttribute('data-service-id'),
        x,
        y,
        hitInMenu: !!hit && menu.contains(hit),
        hitTestid: owner?.getAttribute('data-testid') ?? null,
      });
    }
    return results;
  });

  // The gate only has teeth if a grip actually underlaps the dropdown — guard the
  // fixture so a future layout change that removes the overlap fails loudly here
  // instead of passing vacuously.
  expect(
    probe.length,
    'expected at least one drag-grip to overlap the open dropdown (gate fixture must keep a tile in the grid right column)',
  ).toBeGreaterThan(0);

  // Every contested pixel must belong to the dropdown, never a grip. Under the
  // #57 regression (header z-10) hitTestid is "drag-handle" and hitInMenu false.
  for (const p of probe) {
    expect(
      p.hitInMenu,
      `grip ${p.sid} intercepts the dropdown at (${p.x},${p.y}); owner=${p.hitTestid}`,
    ).toBe(true);
  }
});
