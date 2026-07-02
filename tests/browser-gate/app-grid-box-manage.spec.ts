import { test, expect } from './fixtures';
import { mockApi, makeCategorized } from './mockApi';

// #241 (Edit Dashboard surface) — real-browser check that box rename + delete
// work end to end through a real click path (the retired CategoryManager, ported
// per-box). Component tests cover the DOM contract; this proves the controls are
// actually reachable + operable in the built app served by vite preview, with the
// categories PATCH/DELETE mocked at their real status codes (200 / 204).

test.beforeEach(async ({ page }) => {
  const { services, categories } = makeCategorized(2, 1); // two boxes so a delete is observable
  await mockApi(page, services, categories, 'admin');
  // Real category PATCH (rename → 200 + canonical body) and DELETE (→ 204).
  // Registered AFTER mockApi so this LIFO handler wins for /api/categories/{id}.
  await page.route('**/api/categories/*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const name = req.postDataJSON()?.name ?? '';
      await route.fulfill({ status: 200, json: { id: 'cat-1', name, sortIndex: 0, gridWidth: 3 } });
    } else if (req.method() === 'DELETE') {
      await route.fulfill({ status: 204, body: '' });
    } else {
      await route.fulfill({ status: 200, json: {} });
    }
  });
  await page.goto('/');
  await expect(page.getByTestId('app-grid-box').first()).toBeVisible();
});

async function enterEditMode(page: import('@playwright/test').Page) {
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
}

test('rename a box: real click → editor → Save updates the title', async ({ page }) => {
  await enterEditMode(page);
  const first = page.getByTestId('app-grid-box').first();
  await expect(first.getByTestId('box-title')).toHaveText('Group 1');

  await first.getByTestId('box-rename').click();
  const input = first.getByTestId('box-rename-input');
  await expect(input).toBeVisible();
  await input.fill('Movies');
  await first.getByTestId('box-rename-save').click();

  await expect(first.getByTestId('box-title')).toHaveText('Movies');
  await expect(first.getByTestId('box-rename-input')).toHaveCount(0);
});

test('delete a box: real click → confirm → box is removed', async ({ page }) => {
  await enterEditMode(page);
  await expect(page.getByTestId('box-title')).toHaveCount(2);

  const first = page.getByTestId('app-grid-box').first();
  await first.getByTestId('box-delete').click();
  await expect(first.getByTestId('box-delete-confirm')).toBeVisible();
  await first.getByTestId('box-delete-yes').click();

  // Group 1 gone; its one app re-homes to Uncategorized, so a box still remains.
  await expect
    .poll(async () => (await page.getByTestId('box-title').allTextContents()))
    .not.toContain('Group 1');
});
