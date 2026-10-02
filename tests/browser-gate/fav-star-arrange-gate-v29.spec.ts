import { test, expect } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC v29 — the ★ is a control only in arrange mode.
//
// This is a REAL-BROWSER gate because the load-bearing half of the change is a
// hit-test, and jsdom cannot see hit-tests at all.
//
// The ★ carries a 44x44 invisible `::before` hit area, added in v20/#255 so the
// 34px glyph meets the touch target minimum. Outside arrange mode the star
// becomes a non-interactive <span> — and that hit area would still sit over the
// top-right corner of the tile, swallowing taps aimed at the app underneath. The
// fix (`pointer-events: none` plus `content: none` on the ::before) is pure CSS,
// so the unit suite can assert the element is not a button and still be perfectly
// green while the corner of every favorited tile is dead to the touch.
//
// That failure would be strictly worse than the stray-tap this spec set out to
// fix: today a mis-tap favorites something recoverable; a dead zone makes part of
// the tile simply stop opening the app.

const DESKTOP = { width: 1440, height: 900 };

async function boot(page: import('@playwright/test').Page, favorite: boolean) {
  const { services, categories } = makeStatusTiles(['UP']);
  const withFav = services.map((s: Record<string, unknown>) => ({ ...s, favorite }));
  await page.setViewportSize(DESKTOP);
  await mockApi(page, withFav as never, categories, 'user', 'compact');
  await page.goto('/');
  await expect(page.getByTestId('app-grid')).toBeVisible();
}

const openArrange = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
};

test.describe('v29 — the favorite ★ outside arrange mode', () => {
  test('AC-001/003 — no favorite control is painted while browsing', async ({ page }) => {
    await boot(page, false);
    await expect(page.getByTestId('tile-favorite')).toHaveCount(0);
    await expect(page.getByTestId('tile-favorite-indicator')).toHaveCount(0);
  });

  test('AC-002 — a favorited tile still PAINTS a ★ while browsing', async ({ page }) => {
    await boot(page, true);
    const ind = page.getByTestId('tile-favorite-indicator').first();
    // Painted, not merely present: a display:none indicator would satisfy a DOM
    // query and tell the user nothing.
    await expect(ind).toBeVisible();
    const box = (await ind.boundingBox())!;
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test('the indicator does NOT create a dead zone over the tile', async ({ page }) => {
    // The whole reason this file exists. Hit-test the centre of the indicator and
    // assert the element that would receive the click is the TILE LINK, not the
    // indicator — i.e. the ★ is visually on top but transparent to pointers.
    await boot(page, true);
    const ind = page.getByTestId('tile-favorite-indicator').first();
    const box = (await ind.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          tag: el?.tagName ?? null,
          testid: el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null,
          insideLink: !!el?.closest('[data-testid="tool-link"]'),
        };
      },
      { x: cx, y: cy },
    );

    expect(
      hit.testid,
      `the point over the ★ indicator hit ${JSON.stringify(hit)} — if this is ` +
        `tile-favorite-indicator then pointer-events:none is missing and the tile corner is dead`,
    ).not.toBe('tile-favorite-indicator');
    expect(hit.insideLink, `expected the tile link to receive the pointer, got ${JSON.stringify(hit)}`).toBe(true);
  });

  test('clicking where the ★ sits opens the app rather than toggling the favorite', async ({ page }) => {
    // Companion to the hit-test above — and NECESSARY BUT NOT SUFFICIENT, which
    // is worth stating because it looks like the stronger test.
    //
    // Verified by negative control: with `pointer-events: none` removed, the
    // dead zone is real and the hit-test above fails — while THIS test still
    // passes. A click landing on the inert span calls no API either way, so
    // "the favorites API was not called" cannot distinguish "the click reached
    // the tile" from "the click hit a dead element". The elementFromPoint
    // assertion is the guard; this one only rules out an accidental handler.
    await boot(page, true);
    let favoriteCalls = 0;
    await page.route('**/api/favorites/**', (route) => {
      favoriteCalls += 1;
      return route.fulfill({ status: 204, body: '' });
    });
    const ind = page.getByTestId('tile-favorite-indicator').first();
    const box = (await ind.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(250);
    expect(favoriteCalls, 'a click over the inert ★ must not call the favorites API').toBe(0);
  });
});

test.describe('v29 — arrange mode restores the control', () => {
  test('AC-004/005 — a NON-ADMIN can enter arrange mode and toggle the star', async ({ page }) => {
    await boot(page, false);
    await openArrange(page);
    const star = page.getByTestId('tile-favorite').first();
    await expect(star).toBeVisible();
    await expect(star).toHaveAttribute('aria-pressed', 'false');

    let posted = 0;
    await page.route('**/api/favorites/**', (route) => {
      posted += 1;
      return route.fulfill({ status: 204, body: '' });
    });
    await star.click();
    await expect.poll(() => posted).toBeGreaterThan(0);
  });

  test('AC-006 — a non-admin in arrange mode gets no admin affordance', async ({ page }) => {
    await boot(page, false);
    await openArrange(page);
    await expect(page.getByTestId('tile-edit')).toHaveCount(0);
    await expect(page.getByTestId('gear-menu-section-admin')).toHaveCount(0);
  });
});
