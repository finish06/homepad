import { test, expect, type Page } from '@playwright/test';

// AC v5 (WEB) — Collapsible category sections + per-user persistence. The backend
// (migration 0005, GET/PUT /api/me/collapsed-categories) is already done + tested
// in homepad-api; this drives the web disclosure end-to-end. Like
// categories.spec.ts, every endpoint is route-mocked so the spec runs without a
// live backend; the collapsed set is held in a closure to emulate per-user
// persistence across the PUT and a reload.

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

// Wire the read endpoints a first paint needs, plus a stateful collapsed-set
// store: GET returns the current set, PUT replaces it (204), so a reload reflects
// what the user folded — the web half of A3 (persists per-user across sessions).
async function seed(
  page: Page,
  services: Record<string, unknown>[],
  cats: Record<string, unknown>[],
  initialCollapsed: string[] = [],
) {
  const store = { collapsed: initialCollapsed };
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }),
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
  await page.route('**/api/me/collapsed-categories', (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      store.collapsed = (req.postDataJSON() as { collapsed: string[] }).collapsed;
      return route.fulfill({ status: 204, body: '' });
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ collapsed: store.collapsed }) });
  });
  return store;
}

const CATS = [
  { id: 'media', name: 'Media', sortIndex: 0 },
  { id: 'infra', name: 'Infra', sortIndex: 1 },
];
const SERVICES = [
  tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media' }),
  tile({ id: 'b', name: 'Grafana', categoryId: 'infra', categoryName: 'Infra' }),
];

test.describe('v5 — collapsible category sections', () => {
  test('A1/A2 — default expanded; clicking a header folds the section, clicking again unfolds', async ({ page }) => {
    await seed(page, SERVICES, CATS);
    await page.goto('/');

    const media = page.getByRole('button', { name: /Media/ });
    await expect(media).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Plex')).toBeVisible();

    await media.click();
    await expect(media).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Plex')).toHaveCount(0);
    // Infra is untouched — collapse is per-section.
    await expect(page.getByText('Grafana')).toBeVisible();

    await media.click();
    await expect(media).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText('Plex')).toBeVisible();
  });

  test('A3 — a folded section stays folded across a reload (per-user persistence)', async ({ page }) => {
    await seed(page, SERVICES, CATS);
    await page.goto('/');

    await page.getByRole('button', { name: /Media/ }).click();
    await expect(page.getByRole('button', { name: /Media/ })).toHaveAttribute('aria-expanded', 'false');

    await page.reload();
    // The stored set drove first paint: Media is still folded, Infra still open.
    await expect(page.getByRole('button', { name: /Media/ })).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByText('Plex')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Infra/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('Q2 — Favorites and Uncategorized have no disclosure toggle', async ({ page }) => {
    await seed(
      page,
      [
        tile({ id: 'a', name: 'Plex', categoryId: 'media', categoryName: 'Media', favorite: true }),
        tile({ id: 'c', name: 'Notion' }), // uncategorized
      ],
      [{ id: 'media', name: 'Media', sortIndex: 0 }],
    );
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Favorites/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Uncategorized/ })).toHaveCount(0);
    // The real category is still a disclosure button.
    await expect(page.getByRole('button', { name: /Media/ })).toHaveAttribute('aria-expanded', 'true');
  });
});
