import { test, expect } from '@playwright/test';

// AC A8 — Cold LAN load: TTI < 1.5s desktop, FCP < 800ms desktop.
//
// The authoritative measurement lives in Lighthouse CI (`npm run lhci`,
// thresholds in `lighthouserc.cjs`). This Playwright spec is a fast smoke
// check using PerformanceNavigationTiming so the regular E2E suite catches
// gross regressions without needing a Lighthouse run.

test('first contentful paint under 800ms on desktop', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'paint timing API only stable in Chromium');

  await page.goto('/', { waitUntil: 'networkidle' });

  const fcp = await page.evaluate(() => {
    const entries = performance.getEntriesByType('paint');
    const fcpEntry = entries.find((e) => e.name === 'first-contentful-paint');
    return fcpEntry ? fcpEntry.startTime : -1;
  });

  expect(fcp, 'first-contentful-paint timing should be measurable').toBeGreaterThan(0);
  expect(fcp, `FCP must be < 800ms per AC A8 (got ${fcp}ms)`).toBeLessThan(800);
});

test('DOMContentLoaded under 1500ms (TTI proxy) on desktop', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'navigation timing API only stable in Chromium');

  await page.goto('/', { waitUntil: 'networkidle' });

  const dcl = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return nav ? nav.domContentLoadedEventEnd - nav.startTime : -1;
  });

  expect(dcl, 'navigation timing should be measurable').toBeGreaterThan(0);
  expect(dcl, `DOMContentLoaded must be < 1500ms per AC A8 (got ${dcl}ms)`).toBeLessThan(1500);
});
