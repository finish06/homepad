import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// AG-EDIT (#35 dnd gate) — real-browser only. Edit Dashboard restores drag-to-
// reorder for the App Grid boxes (a regression: the App Grid replaced Catalog and
// dropped edit + reorder). The reorder is @dnd-kit sortable — jsdom has no
// pointer/keyboard drag model, so the actual "grab, move, drop, persist" round
// trip can only be exercised in a real Chromium. This spec drives the KEYBOARD
// path (the a11y contract + the deterministic one for CI): focus a box's grip,
// Space to grab, Arrow to move, Space to drop, then assert the DOM order changed
// AND the new order was persisted via PUT /api/categories/order.

test.beforeEach(async ({ page }) => {
  // Admin so the gear exposes "Edit dashboard" and the boxes get drag grips.
  // Width-1 boxes so four fit on the top row left→right (a stable order to move).
  const { services, categories } = makeCategorized(4, 1);
  await mockApi(page, services, categories, 'admin');
  await page.goto('/');
  await expect(page.getByTestId('app-grid-box').first()).toBeVisible();
});

async function enterEditMode(page: import('@playwright/test').Page) {
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
}

test('drag grips appear only in Edit Dashboard mode', async ({ page }) => {
  // View mode: no grips.
  expect(await page.getByTestId('box-drag-handle').count()).toBe(0);
  await enterEditMode(page);
  // Edit mode: one grip per real category box (4).
  await expect(page.getByTestId('box-drag-handle')).toHaveCount(4);
});

test('keyboard-reordering a box persists the new order (PUT /api/categories/order)', async ({
  page,
}) => {
  // Capture the persisted order — the real backend answers this PUT with 204 No
  // Content (categories_test.go: "must return 204"), and setCategoryOrder only
  // treats 204 as success, so the mock MUST 204 too or the optimistic reorder
  // rolls straight back. We read the body before fulfilling.
  let persisted: string[] | null = null;
  await page.route('**/api/categories/order', async (route) => {
    persisted = route.request().postDataJSON()?.order ?? null;
    await route.fulfill({ status: 204, body: '' });
  });

  await enterEditMode(page);

  const titlesBefore = await page.getByTestId('box-title').allTextContents();
  expect(titlesBefore).toEqual(['Group 1', 'Group 2', 'Group 3', 'Group 4']);

  // Grab the FIRST box's grip and move it right via the keyboard. dnd-kit's
  // KeyboardSensor needs a beat to enter (and settle within) the drag before it
  // will honour the next key — firing Space→Arrow→Arrow→Space back-to-back drops
  // keys and the move silently no-ops. So: wait for the grab to actually register
  // (aria-pressed flips true) before arrowing, and let each arrow settle.
  const firstGrip = page.getByTestId('box-drag-handle').first();
  await firstGrip.focus();
  await page.keyboard.press('Space'); // grab
  await expect(firstGrip).toHaveAttribute('aria-pressed', 'true'); // grab registered
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.press('Space'); // drop

  // The dropped box (Group 1) must have moved out of first place, and the new
  // order must have been persisted as the full id list.
  await expect
    .poll(async () => (await page.getByTestId('box-title').allTextContents())[0])
    .not.toBe('Group 1');
  await expect.poll(() => persisted).not.toBeNull();
  expect(persisted).toHaveLength(4);
  expect(persisted).toContain('cat-1');
  // Group 1 (cat-1) is no longer the first id in the persisted order.
  expect(persisted![0]).not.toBe('cat-1');
});
