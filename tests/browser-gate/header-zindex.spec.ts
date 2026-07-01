import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// #57 REGRESSION GATE (retargeted for SPEC-app-grid §2) — real-browser only.
//
// #57: an open header dropdown was painted UNDER interactive dashboard content,
// so the content swallowed clicks meant for the menu. The fix lifts AppHeader to
// z-20 (PR #58) and the dropdown to z-50 so its whole subtree stacks above the
// page content. This is INVISIBLE to jsdom (no z-index, no paint, no hit-testing;
// `document.elementFromPoint` is meaningless there) — only a real Chromium
// resolves "which element actually occupies this pixel".
//
// §2 REPLACE: App Grid replaced the Catalog tile/grip surface this gate used to
// probe (drag-grips at z-10). The retained real assertion is layout-independent —
// the open UserMenu dropdown must own every pixel it overlaps — so it now probes
// the App Grid's own interactive content (glass boxes carry a `backdrop-filter`,
// which creates a stacking context; their tool links + width buttons are the
// elements that would contest the dropdown's pixels under a z regression).
//
// Teeth: the App Grid packs boxes left→right across the top row, so the top-right
// box's header (width selector) + tool links land directly beneath the right-
// anchored dropdown. Drop AppHeader/dropdown below the content's stacking and a
// tool link / width button wins the contested centre — this spec goes red.

test.beforeEach(async ({ page }) => {
  // Admin so the per-box width selector renders (an extra interactive element in
  // the contested top row); four categories of two apps pack the row so the
  // rightmost box sits under the dropdown.
  const { services, categories } = makeCategorized(4, 2);
  await mockApi(page, services, categories, 'admin');
  await page.goto('/');
  await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  await expect(page.getByTestId('app-grid-box').first()).toBeVisible();
  await expect(page.getByTestId('tool-link').first()).toBeVisible();
});

test('mouse: the open UserMenu dropdown sits above App Grid content', async ({ page }) => {
  // Open the dropdown.
  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByRole('menu')).toBeVisible();

  // Find every interactive App Grid element (tool link or width button) that
  // overlaps the dropdown box and, at the CENTRE of each overlap, ask the browser
  // which element owns that pixel. With the header/dropdown stacked above content
  // the dropdown wins every contested pixel; under the regression a tool link or
  // width button does. We assert in real Chromium, where elementFromPoint is
  // honest.
  const probe = await page.evaluate(() => {
    // Ignore sub-pixel near-misses (issue #63): require ≥MIN_OVERLAP_PX overlap on
    // BOTH axes so only genuine interior overlaps are tested (a thin boundary
    // touch is Chromium-version-sensitive and would flake without a real
    // regression). Test-robustness only; the z regression teeth are unchanged.
    const MIN_OVERLAP_PX = 2;
    const menu = document.querySelector('[data-testid="user-menu"]') as HTMLElement;
    const mb = menu.getBoundingClientRect();
    const results: { id: string | null; x: number; y: number; hitInMenu: boolean; hitTestid: string | null }[] = [];
    const contenders = document.querySelectorAll(
      '[data-testid="tool-link"], [data-testid^="width-btn-"]',
    );
    for (const g of Array.from(contenders)) {
      const r = g.getBoundingClientRect();
      const ox = Math.max(r.left, mb.left);
      const oX = Math.min(r.right, mb.right);
      const oy = Math.max(r.top, mb.top);
      const oY = Math.min(r.bottom, mb.bottom);
      if (oX - ox < MIN_OVERLAP_PX || oY - oy < MIN_OVERLAP_PX) continue;
      const x = (ox + oX) / 2;
      const y = (oy + oY) / 2;
      const hit = document.elementFromPoint(x, y);
      const owner = hit?.closest('[data-testid]') ?? null;
      results.push({
        id: g.getAttribute('data-testid'),
        x,
        y,
        hitInMenu: !!hit && menu.contains(hit),
        hitTestid: owner?.getAttribute('data-testid') ?? null,
      });
    }
    return results;
  });

  // The gate only has teeth if an App Grid element actually underlaps the
  // dropdown — guard the fixture so a future layout change that removes the
  // overlap fails loudly here instead of passing vacuously.
  expect(
    probe.length,
    'expected at least one App Grid tool link / width button to overlap the open dropdown (gate fixture must keep a box in the top-right column)',
  ).toBeGreaterThan(0);

  // Every contested pixel must belong to the dropdown, never a tool link/button.
  // Under the regression hitTestid is "tool-link"/"width-btn-N" and hitInMenu false.
  for (const p of probe) {
    expect(
      p.hitInMenu,
      `App Grid element ${p.id} intercepts the dropdown at (${p.x},${p.y}); owner=${p.hitTestid}`,
    ).toBe(true);
  }
});
