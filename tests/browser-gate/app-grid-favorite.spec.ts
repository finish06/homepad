import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// #240 (#35 hit-test gate) — real-browser only. The App Grid restored a per-tile
// favorite ★ toggle. It's a <button> layered over the tool's <a> (interactive
// content can't nest in an anchor), so this is exactly the #35 class of bug jsdom
// can't see: does a REAL center click land on the star, or does the anchor —
// painted in the same cell — swallow it? A center click must toggle the favorite
// (POST /api/favorites/{id}) and flip aria-pressed, and must NOT navigate the tool
// link. jsdom has no layout/paint/hit-testing, so only a real Chromium proves it.

test.beforeEach(async ({ page }) => {
  const { services, categories } = makeCategorized(1, 1); // one box, one tool
  await mockApi(page, services, categories, 'user');
});

test('a real center click on the ★ toggles favorite without navigating the tool', async ({
  page,
}) => {
  // Capture the favorite call (mockApi already 204s favorites; register AFTER so
  // this LIFO handler wins and records the method + id).
  let fav: { method: string; url: string } | null = null;
  await page.route('**/api/favorites/**', async (route) => {
    const req = route.request();
    fav = { method: req.method(), url: req.url() };
    await route.fulfill({ status: 204, body: '' });
  });

  await page.goto('/');
  const star = page.getByTestId('tile-favorite').first();
  await expect(star).toBeVisible();
  await expect(star).toHaveAttribute('aria-pressed', 'false');

  const pagesBefore = page.context().pages().length;

  // Real center click (hit-test), NOT dispatchEvent — this is the whole point.
  await star.click();

  // The click landed on the star: favorite was POSTed and the control flipped.
  await expect.poll(() => fav).not.toBeNull();
  expect(fav!.method).toBe('POST');
  expect(fav!.url).toContain('/api/favorites/svc-1');
  await expect(star).toHaveAttribute('aria-pressed', 'true');

  // And it did NOT navigate the tool link (no new tab opened).
  expect(page.context().pages().length).toBe(pagesBefore);
});
