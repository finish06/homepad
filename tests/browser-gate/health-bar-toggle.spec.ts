import { test, expect, type Page } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-health-bar-visibility-toggle — the per-user bar visibility, real-browser GATE.
//
// AC-004 is a LAYOUT claim: with the distribution block gone the panel must
// collapse with no residual gap. jsdom has no layout, so only a real Chromium can
// tell "the element is absent" from "the element is absent but its 26px of row
// height is still reserved". Checked at all three widths the design was drawn for.
//
// Screenshots go through testInfo.outputPath() — never an absolute path. A
// hardcoded one is why app-grid-fav-a11y-v20.spec.ts passes on exactly one
// machine and ENOENTs everywhere else.

// Seed the device cache before boot so the first paint already has the
// preference (AC-011) — the same trick tile-density.spec.ts uses for density.
async function setBarPref(page: Page, show: boolean) {
  await page.addInitScript(
    (v) => localStorage.setItem('homepad:show-health-bar', v),
    show ? 'true' : 'false',
  );
}

const WIDTHS = [
  { name: 'small', width: 390, height: 844 },
  { name: 'medium', width: 1024, height: 900 },
  { name: 'large', width: 1440, height: 900 },
];

test.describe('SPEC-health-bar-visibility-toggle — bar visibility', () => {
  for (const vp of WIDTHS) {
    test(`AC-004 — at ${vp.name} (${vp.width}px) hiding the bar leaves no gap`, async ({
      page,
    }, testInfo) => {
      const { services, categories } = makeStatusTiles(['UP', 'UP', 'DOWN', 'NOT_MONITORED']);
      await page.setViewportSize({ width: vp.width, height: vp.height });

      await setBarPref(page, true);
      await mockApi(page, services, categories, 'user', null);
      await page.goto('/');
      const panel = page.locator('.health');
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('health-meter')).toBeVisible();
      const shownHeight = (await panel.boundingBox())!.height;

      await setBarPref(page, false);
      await page.reload();
      await expect(panel).toBeVisible();
      await expect(page.getByTestId('health-meter')).toHaveCount(0);
      const hiddenHeight = (await panel.boundingBox())!.height;

      // The panel must actually shrink. An element merely hidden with
      // display:none/visibility would leave this height unchanged.
      expect(hiddenHeight).toBeLessThan(shownHeight);

      await page.screenshot({
        path: testInfo.outputPath(`health-bar-hidden-${vp.name}.png`),
        fullPage: false,
      });
    });
  }

  test('AC-003/AC-013 — an incident is still reported with the bar hidden', async ({ page }, testInfo) => {
    const { services, categories } = makeStatusTiles(['UP', 'DOWN', 'DOWN']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await setBarPref(page, false);
    await mockApi(page, services, categories, 'user', null);
    await page.goto('/');

    // A display preference may never conceal an outage.
    await expect(page.getByTestId('health-led')).toHaveAttribute('data-variant', 'attention');
    await expect(page.getByTestId('health-headline')).toContainText(/attention/i);
    await expect(page.getByTestId('health-meter')).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath('health-bar-hidden-incident.png'),
      fullPage: false,
    });
  });

  test('AC-003 — the freshness stamp survives the bar being hidden', async ({ page }) => {
    const { services, categories } = makeStatusTiles(['UP', 'UP']);
    await page.setViewportSize({ width: 1440, height: 900 });
    await setBarPref(page, false);
    await mockApi(page, services, categories, 'user', null);
    await page.goto('/');
    // It normally rides in the legend row, INSIDE the hidden block; it must
    // re-home onto the verdict rather than disappear with it.
    await expect(page.getByTestId('health-updated')).toBeVisible();
  });
});
