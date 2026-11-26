import { mockAdminAccounts } from '../browser-gate/kidMocks';
import { test, expect } from './fixtures';

// #739 — the fixture in ./fixtures.ts turns backdrop-filter off in WebKit only.
// Checked on the built app, because a grep of fixtures.ts cannot show that the
// style lands before the dashboard paints or that it wins over the app's CSS.

test('WebKit pages paint without backdrop-filter; Chromium keeps the glass', async ({ page, browserName }) => {
  await mockAdminAccounts(page);
  await page.goto('/');
  const tile = page.getByTestId('tool-link').first();
  await expect(tile).toBeVisible();

  const filter = await tile.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.backdropFilter || s.getPropertyValue('-webkit-backdrop-filter');
  });
  // The style is in place before the app's own script runs, so even the first
  // frame is painted without the blur.
  const beforeApp = await page.evaluate(() => {
    const style = document.querySelector('style[data-e2e="no-backdrop-filter"]');
    const app = document.querySelector('script[type="module"]');
    return !!style && !!app && !!(style.compareDocumentPosition(app) & Node.DOCUMENT_POSITION_FOLLOWING);
  });

  if (browserName === 'webkit') {
    expect(filter).toBe('none');
    expect(beforeApp).toBe(true);
  } else {
    expect(filter).toContain('blur(');
    await expect(page.locator('style[data-e2e="no-backdrop-filter"]')).toHaveCount(0);
  }
});
