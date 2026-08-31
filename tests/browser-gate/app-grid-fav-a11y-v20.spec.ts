import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// v20 (#255) — real-browser gate for the favorite ★ touch-target & contrast fix
// (specs/v20-fav-star-a11y.md §8). jsdom can assert the CSS rules but has no
// layout or hit-testing, so it CANNOT prove the two things that actually matter
// here — both of the #35 class:
//   • AC-001/AC-006: a casual CORNER tap (outside the painted 34×34 button but
//     inside the transparent 44×44 ::before) toggles the star instead of opening
//     the tool link. getBoundingClientRect can't show this — only a real
//     hit-test at a corner coordinate can.
//   • AC-003: the RENDERED default ☆ color is slate-500 (#64748b = rgb(100,116,
//     139)) — measured off the live computed style at 768px, light mode.
// Named for the observed symptoms (corner tap toggles / default ☆ contrast), not
// a theorized cause, per the retro lesson.

test.beforeEach(async ({ page }) => {
  const { services, categories } = makeCategorized(1, 1); // one box, one tool
  await mockApi(page, services, categories, 'user');
  await page.setViewportSize({ width: 768, height: 1024 }); // iPad, the primary device
});

test('AC-001/AC-006 — a corner tap OUTSIDE the 34×34 button but inside the 44×44 hit area toggles the star', async ({
  page,
}) => {
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

  // The painted button is 34×34; its own border box is what boundingBox()
  // returns. The 44×44 ::before is centered on that box, so it extends ~5px
  // beyond every edge. To prove the EXTENSION (not the old 34×34 area), click a
  // point that is OUTSIDE the painted box — 3px ABOVE its top edge — but inside
  // the ::before. On the pre-v20 button (no ::before) this coordinate would miss
  // the star entirely; here it must still toggle it.
  const box = (await star.boundingBox())!;
  const x = box.x + box.width - 4; // near the right edge, inside
  const y = box.y - 3; // 3px above the painted top edge → outside the 34px box
  expect(y).toBeLessThan(box.y); // guard: the tap really is outside the painted button
  const pagesBefore = page.context().pages().length;
  await page.mouse.click(x, y);

  await expect.poll(() => fav).not.toBeNull();
  expect(fav!.method).toBe('POST');
  expect(fav!.url).toContain('/api/favorites/svc-1');
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  // Did NOT navigate the tool link (no new tab).
  expect(page.context().pages().length).toBe(pagesBefore);
});

test('AC-003 — default ☆ renders slate-500 (#64748b) in light mode at 768px', async ({ page }) => {
  await page.goto('/');
  const star = page.getByTestId('tile-favorite').first();
  await expect(star).toBeVisible();
  const color = await star.evaluate((el) => getComputedStyle(el).color);
  expect(color).toBe('rgb(100, 116, 139)'); // #64748b — 4.76:1 on the white tile
  await page.screenshot({ path: '/home/stitch/work/v20-fav-star-light-768.png' });
});
