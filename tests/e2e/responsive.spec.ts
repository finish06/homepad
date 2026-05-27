import { test, expect } from '@playwright/test';

// AC A7 — Layout is usable on 390×844 (iPhone 13) and 1440×900 (desktop)
// without horizontal scroll or overlap.
//
// We probe two viewports via the project matrix (see playwright.config.ts) and
// also explicitly inside this file so the AC is self-documenting.

const VIEWPORTS = [
  { label: 'mobile-iphone-13', width: 390, height: 844 },
  { label: 'desktop-1440',     width: 1440, height: 900 },
] as const;

for (const vp of VIEWPORTS) {
  test(`no horizontal scroll at ${vp.label} (${vp.width}x${vp.height})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const overflow = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      return Math.max(
        html.scrollWidth - html.clientWidth,
        body.scrollWidth - body.clientWidth,
      );
    });
    expect(overflow, `horizontal overflow detected at ${vp.label}`).toBeLessThanOrEqual(0);
  });

  test(`service tiles don't overlap at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/');

    const tiles = await page.getByTestId('service-tile').all();
    expect(tiles.length, 'expected at least 2 tiles to test overlap').toBeGreaterThanOrEqual(2);

    const boxes = await Promise.all(tiles.map((t) => t.boundingBox()));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          a.x < b.x + b.width &&
          a.x + a.width > b.x &&
          a.y < b.y + b.height &&
          a.y + a.height > b.y;
        expect(overlap, `tiles ${i} and ${j} overlap at ${vp.label}`).toBe(false);
      }
    }
  });
}
