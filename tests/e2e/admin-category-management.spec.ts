import { test, expect, type Page } from '@playwright/test';

// AC v4 (WEB) — PART 2: ADMIN CATEGORY MANAGEMENT. An admin can create, rename,
// reorder and delete categories, and assign an app to a category — all behind
// the existing admin Edit mode. The backend (category CRUD/reorder/assign) is
// already done + tested in homepad-api; this drives the web UI end-to-end.
// Like admin-service-form.spec.ts, every endpoint is route-mocked so the spec
// runs without a live backend.

const ADMIN = { id: 'u-admin', email: 'admin@ohana', role: 'admin', themePref: 'light' };

function tile(over: Record<string, unknown>) {
  return {
    id: 'svc',
    slug: 'svc',
    name: 'Service',
    description: 'd',
    url: 'https://svc.example.com',
    icon: 'https://example.com/i.png',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
    categoryId: null,
    categoryName: null,
    ...over,
  };
}

// Wire the read endpoints an admin session needs on first paint. Individual
// tests layer the mutating POST/PATCH/PUT/DELETE routes on top before acting.
async function seedAdmin(
  page: Page,
  services: Record<string, unknown>[],
  cats: Record<string, unknown>[],
) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN) }),
  );
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ oidcEnabled: false }) }),
  );
  await page.route('**/api/services', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ services }) });
  });
  await page.route('**/api/categories', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ categories: cats }) });
  });
}

test.describe('v4 — admin creates a category', () => {
  test('POSTs the name and the new section appears', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'a', name: 'Plex' })], []);

    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/categories', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted = route.request().postDataJSON();
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'media', name: posted!.name, sortIndex: 0 }),
      });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();
    await page.getByTestId('category-name-input').fill('Media');
    await page.getByTestId('category-create').click();

    expect(posted).toMatchObject({ name: 'Media' });
    await expect(page.getByTestId('category-header')).toHaveText(['Media', 'Uncategorized']);
  });

  test('surfaces a 409 duplicate-name inline', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' })], [
      { id: 'media', name: 'Media', sortIndex: 0 },
    ]);
    await page.route('**/api/categories', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      route.fulfill({ status: 409, contentType: 'text/plain', body: 'a category with that name already exists' });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();
    await page.getByTestId('category-name-input').fill('Media');
    await page.getByTestId('category-create').click();

    await expect(page.getByTestId('category-create-error')).toContainText('already exists');
  });
});

test.describe('v4 — admin renames a category', () => {
  test('PATCHes the new name and the section header updates', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' })], [
      { id: 'media', name: 'Media', sortIndex: 0 },
    ]);

    let patched: Record<string, unknown> | null = null;
    await page.route('**/api/categories/media', (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patched = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'media', name: patched!.name, sortIndex: 0 }),
      });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();
    const row = page.locator('[data-category-id="media"]');
    await row.getByTestId('category-rename-input').fill('Infra');
    await row.getByTestId('category-rename').click();

    expect(patched).toMatchObject({ name: 'Infra' });
    await expect(page.getByTestId('category-header')).toHaveText(['Infra']);
  });
});

test.describe('v4 — admin reorders categories', () => {
  test('PUTs the new order and the sections reorder', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'c', name: 'Notion' })], [
      { id: 'media', name: 'Media', sortIndex: 0 },
      { id: 'infra', name: 'Infra', sortIndex: 1 },
    ]);

    let ordered: Record<string, unknown> | null = null;
    await page.route('**/api/categories/order', (route) => {
      if (route.request().method() !== 'PUT') return route.fallback();
      ordered = route.request().postDataJSON();
      route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();
    await expect(page.getByTestId('category-header')).toHaveText(['Media', 'Infra', 'Uncategorized']);

    const mediaRow = page.locator('[data-category-id="media"]');
    await mediaRow.getByTestId('category-move-down').click();

    expect(ordered).toEqual({ order: ['infra', 'media'] });
    await expect(page.getByTestId('category-header')).toHaveText(['Infra', 'Media', 'Uncategorized']);
  });
});

test.describe('v4 — admin deletes a category', () => {
  test('DELETEs it; its app falls back to Uncategorized (flat render), not deleted', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' })], [
      { id: 'media', name: 'Media', sortIndex: 0 },
    ]);

    let deleted = false;
    await page.route('**/api/categories/media', (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback();
      deleted = true;
      route.fulfill({ status: 204, body: '' });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();
    const row = page.locator('[data-category-id="media"]');
    await row.getByTestId('category-delete').click();

    await expect.poll(() => deleted).toBe(true);
    // Only category gone → flat render, no headers; the app survives.
    await expect(page.getByTestId('category-header')).toHaveCount(0);
    await expect(page.getByText('Plex')).toBeVisible();
  });
});

test.describe('v4 — admin assigns an app to a category', () => {
  test('PATCHes the service categoryId and moves the tile into that section', async ({ page }) => {
    await seedAdmin(page, [tile({ id: 'a', name: 'Plex' })], [
      { id: 'media', name: 'Media', sortIndex: 0 },
    ]);

    let patched: Record<string, unknown> | null = null;
    await page.route('**/api/services/a', (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patched = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
      });
    });

    await page.goto('/');
    await page.getByTestId('edit-toggle').click();

    // Plex starts in Uncategorized; assign it to Media via the tile's <select>.
    const uncat = page.locator('section', { has: page.getByText('Uncategorized') });
    await uncat.getByTestId('category-select').selectOption('media');

    expect(patched).toEqual({ categoryId: 'media' });
    const media = page.locator('section', { has: page.getByTestId('category-header').filter({ hasText: 'Media' }) });
    await expect(media.getByText('Plex')).toBeVisible();
  });
});
