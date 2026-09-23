import { test, expect } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// 16.5.1 — the header search trigger must sit on the header's true centre line.
//
// This is a LAYOUT claim and jsdom cannot see it: the markup is a three-child
// `justify-between` row, which reads as centred in the source and is not. The
// middle child only lands on centre when the flanking items happen to be equal
// width, and here they never are — a short "homepad" wordmark on the left
// against LastUpdated + gear + bell + avatar on the right. Only a real browser
// resolves where the box actually is.
//
// Tolerance is 4px. Not 0: sub-pixel rounding and the pill's own border make an
// exact match meaningless. Not 20px either — the whole defect is a drift small
// enough to look deliberate and large enough to see.

const WIDTHS = [
  { name: 'medium', width: 1024, height: 900 },
  { name: 'large', width: 1440, height: 900 },
  { name: 'ultrawide', width: 2560, height: 1080 },
];

const TOLERANCE_PX = 4;

test.describe('header — the search trigger sits on the header centre line', () => {
  for (const vp of WIDTHS) {
    test(`centred at ${vp.name} (${vp.width}px)`, async ({ page }, testInfo) => {
      const { services, categories } = makeStatusTiles(['UP', 'UP', 'DOWN']);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await mockApi(page, services, categories, 'user', null);
      await page.goto('/');

      const trigger = page.getByTestId('launcher-trigger');
      await expect(trigger).toBeVisible();

      // Measure against the header ROW (the content-width flex container), not
      // the viewport: the row is what the wordmark and the right-hand cluster
      // are distributed within, so it is the line the eye reads as centre.
      const row = page.locator('header > div').first();

      const t = (await trigger.boundingBox())!;
      const r = (await row.boundingBox())!;

      const triggerCentre = t.x + t.width / 2;
      const rowCentre = r.x + r.width / 2;
      const drift = triggerCentre - rowCentre;

      // Reported signed and named, so a failure says WHICH way it drifted —
      // a bare "expected 4, got 87" would not.
      expect(
        Math.abs(drift),
        `search trigger is ${Math.abs(Math.round(drift))}px ${drift < 0 ? 'LEFT' : 'RIGHT'} of the header centre at ${vp.width}px`,
      ).toBeLessThanOrEqual(TOLERANCE_PX);

      await page.screenshot({
        path: testInfo.outputPath(`header-search-${vp.name}.png`),
        clip: { x: r.x, y: 0, width: r.width, height: Math.max(r.height + r.y + 8, 64) },
      });
    });
  }

  test('the trigger never overlaps the wordmark or the right-hand cluster', async ({ page }) => {
    // Centring by flexing the two sides equally can push the middle child into
    // its neighbours once the right cluster outgrows its share. 1024px is the
    // narrowest width at which all three groups are still rendered.
    const { services, categories } = makeStatusTiles(['UP']);
    await page.setViewportSize({ width: 1024, height: 900 });
    await mockApi(page, services, categories, 'user', null);
    await page.goto('/');

    const trigger = await page.getByTestId('launcher-trigger').boundingBox();
    const wordmark = await page.locator('.wordmark').boundingBox();
    expect(trigger).not.toBeNull();
    expect(wordmark).not.toBeNull();

    // Wordmark ends before the trigger starts.
    expect(wordmark!.x + wordmark!.width).toBeLessThanOrEqual(trigger!.x);
  });
});
