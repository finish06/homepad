import { test, expect, type Page } from '@playwright/test';

// AC v4 (WEB) — Grouped catalog render (PART 1, display only). The backend
// (migration 0004, category CRUD/reorder/assign, categoryId/Name on the list
// view) is already done + tested in homepad-api; this drives the web grouped
// render end-to-end. The admin category-management UI is a separate follow-up.
// Like admin-service-form.spec.ts, every endpoint is route-mocked so the spec
// runs without a live backend.

const ADMIN = { id: 'u-admin', email: 'admin@ohana', role: 'admin', themePref: 'light' };
const USER = { id: 'u1', email: 'lilo@ohana', role: 'user', themePref: 'light' };

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

// Wire the read endpoints a session needs on first paint: who am I, oidc off,
// the catalog, and the category list. Individual tests layer POST/PATCH on top.
async function seed(
  page: Page,
  who: typeof ADMIN | typeof USER,
  services: Record<string, unknown>[],
  cats: Record<string, unknown>[],
) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(who) }),
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

test.describe('v4 — grouped catalog render', () => {
  test('a user sees Favorites, categories in admin order, then Uncategorized', async ({ page }) => {
    await seed(
      page,
      USER,
      [
        tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', favorite: true }),
        tile({ id: 'b', name: 'Grafana', categoryId: 'infra', categoryName: 'Infra' }),
        tile({ id: 'c', name: 'Notion' }),
      ],
      [
        { id: 'media', name: 'Media', sortIndex: 0 },
        { id: 'infra', name: 'Infra', sortIndex: 1 },
      ],
    );
    await page.goto('/');

    await expect(page.getByTestId('category-header')).toHaveText([
      'Favorites',
      'Media',
      'Infra',
      'Uncategorized',
    ]);
    // The favorited app appears in BOTH Favorites and its category (Q3).
    await expect(page.getByText('Plex')).toHaveCount(2);
  });

  test('with no categories the catalog renders the flat v1 grid (no headers)', async ({ page }) => {
    await seed(page, USER, [tile({ id: 'a', name: 'Plex' }), tile({ id: 'b', name: 'Grafana' })], []);
    await page.goto('/');

    await expect(page.getByTestId('service-tile')).toHaveCount(2);
    await expect(page.getByTestId('category-header')).toHaveCount(0);
  });
});
