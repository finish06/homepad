import type { Page } from '@playwright/test';

// A real-browser fixture for the #35-class tile/menu/dnd gate. We deliberately
// do NOT stand up the Go API + DB in CI — the bug this gate catches (z-index
// hit-testing + synthetic-event ordering) lives entirely in the browser's
// layout/paint/event pipeline, so a built app served by `vite preview` with the
// /api/* layer mocked via route interception exercises it faithfully. One
// regular user, one catalog tile, no categories — the minimum that renders a
// tile with its "⋯" TileMenu.
const USER = { id: 'u1', email: 'kid@ohana.test', role: 'user', themePref: 'system' };

const SERVICE = {
  id: 'svc-1',
  slug: 'grafana',
  name: 'Grafana',
  description: 'Dashboards',
  url: 'https://grafana.example.test',
  icon: '', // empty → iconSrc falls back to the bundled DEFAULT_ICON (no network)
  status: 'UP',
  favorite: false,
  iconLight: false,
  iconDark: false,
};

export async function mockApi(page: Page): Promise<void> {
  // Catch-all registered FIRST so the specific handlers below (LIFO order) take
  // precedence — anything unmocked resolves empty instead of hanging the page.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: {} }));

  await page.route('**/api/me', (route) => route.fulfill({ json: USER }));
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: { oidcEnabled: false } }));
  await page.route('**/api/services', (route) => route.fulfill({ json: { services: [SERVICE] } }));
  await page.route('**/api/categories', (route) => route.fulfill({ json: { categories: [] } }));
  await page.route('**/api/me/collapsed-categories', (route) =>
    route.fulfill({ json: { collapsed: [] } }),
  );
  await page.route('**/api/favorites/**', (route) => route.fulfill({ status: 204, body: '' }));
}
