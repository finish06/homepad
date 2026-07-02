import { expect, type Page } from '@playwright/test';

// v18 — the header gear is no longer a direct Arrange toggle; it now opens a
// dropdown edit-dashboard menu. Entering (or leaving) Arrange mode is a two-step
// gesture: click the gear to open its menu, then click the "Arrange tiles" item
// (available to every user). The grips' reveal/tuck and the z-stacking these
// gates guard are unchanged — only the entry path moved behind the menu. Helper
// so each gate drives the real flow once, in one place.
export async function toggleArrange(page: Page): Promise<void> {
  await page.getByTestId('settings-gear').click();
  await expect(page.getByTestId('gear-menu')).toBeVisible();
  await page.getByTestId('gear-arrange').click();
}

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
  categoryId: null as string | null, // Uncategorized by default; makeCategorized sets it.
};

// header-zindex.spec needs SEVERAL tiles so the grid fills its right column and a
// drag-grip lands under the right-anchored UserMenu dropdown (the #57 overlap).
// Clones of SERVICE with distinct ids/slugs/names; the visual is identical.
export function makeServices(n: number): (typeof SERVICE)[] {
  return Array.from({ length: n }, (_, i) => ({
    ...SERVICE,
    id: `svc-${i + 1}`,
    slug: `svc-${i + 1}`,
    name: `Service ${i + 1}`,
  }));
}

// A minimal Category literal for the fixture (camelCase, as api.categories()
// consumes it; layout fields default server-side and are omitted here).
type FixtureCategory = { id: string; name: string; sortIndex: number };

// header-zindex.spec fixture: `nCats` categories of `appsPer` apps each. v14.1
// capped the field at 4 columns, so a single flat catalog left-aligns and never
// reaches the right-anchored dropdown. Grouping the apps into categories makes
// each render as its own glass panel that PACKS left→right across the field, so
// the rightmost panel's tile grip lands under the dropdown again (the #57 overlap)
// at the 4-col ceiling. 4×2 fills the 1440px gate row with a grip well inside the
// dropdown box (verified in real Chromium: svc grip at x≈1320, menu x∈[1163,1407]).
export function makeCategorized(
  nCats: number,
  appsPer: number,
): { services: (typeof SERVICE)[]; categories: FixtureCategory[] } {
  const categories: FixtureCategory[] = [];
  const services: (typeof SERVICE)[] = [];
  let sid = 0;
  for (let c = 0; c < nCats; c++) {
    const cid = `cat-${c + 1}`;
    categories.push({ id: cid, name: `Group ${c + 1}`, sortIndex: c });
    for (let i = 0; i < appsPer; i++) {
      sid += 1;
      services.push({
        ...SERVICE,
        id: `svc-${sid}`,
        slug: `svc-${sid}`,
        name: `Service ${sid}`,
        categoryId: cid,
      });
    }
  }
  return { services, categories };
}

export async function mockApi(
  page: Page,
  // Defaults to the single-tile fixture (tile-menu.spec). Pass a wider set for
  // gates that need tiles in the grid's right column (header-zindex.spec).
  services: (typeof SERVICE)[] = [SERVICE],
  // Optional categories. Empty (default) → the flat v1 render (one grid, no
  // panels). Non-empty → the grouped v14 render where each category is a glass
  // panel that packs left→right (header-zindex needs this to reach the dropdown).
  categories: FixtureCategory[] = [],
): Promise<void> {
  // Catch-all registered FIRST so the specific handlers below (LIFO order) take
  // precedence — anything unmocked resolves empty instead of hanging the page.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: {} }));

  await page.route('**/api/me', (route) => route.fulfill({ json: USER }));
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: { oidcEnabled: false } }));
  await page.route('**/api/services', (route) => route.fulfill({ json: { services } }));
  await page.route('**/api/categories', (route) => route.fulfill({ json: { categories } }));
  await page.route('**/api/me/collapsed-categories', (route) =>
    route.fulfill({ json: { collapsed: [] } }),
  );
  await page.route('**/api/favorites/**', (route) => route.fulfill({ status: 204, body: '' }));
}
