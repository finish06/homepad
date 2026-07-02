import { type Page } from '@playwright/test';

// A real-browser fixture for the App Grid stacking gate (SPEC-app-grid §2). We
// deliberately do NOT stand up the Go API + DB in CI — the bug this gate catches
// (z-index hit-testing) lives entirely in the browser's layout/paint/event
// pipeline, so a built app served by `vite preview` with the /api/* layer mocked
// via route interception exercises it faithfully.
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

// A minimal Category literal for the fixture (camelCase, as api.categories()
// consumes it; gridWidth defaults to 3 via the client backfill when omitted).
type FixtureCategory = { id: string; name: string; sortIndex: number; gridWidth?: number };

// makeBoxes builds the exact A1 layout fixture: one box per spec, at the given
// `width` (--w), each filled with `tools` named verbatim (so a spec can hand a box
// a short 1-line name AND a long 2-line name to compare tile heights). Drives the
// A1 fixed-tile browser gate — tile-width uniformity, two-up wrap, name-height.
export function makeBoxes(
  specs: { width: number; tools: string[] }[],
): { services: (typeof SERVICE)[]; categories: FixtureCategory[] } {
  const categories: FixtureCategory[] = [];
  const services: (typeof SERVICE)[] = [];
  let sid = 0;
  specs.forEach((spec, c) => {
    const cid = `cat-${c + 1}`;
    categories.push({ id: cid, name: `Group ${c + 1}`, sortIndex: c, gridWidth: spec.width });
    for (const name of spec.tools) {
      sid += 1;
      services.push({ ...SERVICE, id: `svc-${sid}`, slug: `svc-${sid}`, name, categoryId: cid });
    }
  });
  return { services, categories };
}

// header-zindex.spec fixture: `nCats` categories of `appsPer` apps each. In the
// App Grid, each category renders as a glass box that packs left→right across the
// 6-column page grid, so the rightmost top-row box (its width selector + tool
// links) lands under the right-anchored UserMenu dropdown (the #57 overlap).
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
  services: (typeof SERVICE)[] = [SERVICE],
  categories: FixtureCategory[] = [],
  // The App Grid width selector is admin-only; pass 'admin' when a gate needs it
  // in the contested row.
  role: 'user' | 'admin' = 'user',
): Promise<void> {
  // Catch-all registered FIRST so the specific handlers below (LIFO order) take
  // precedence — anything unmocked resolves empty instead of hanging the page.
  await page.route('**/api/**', (route) => route.fulfill({ status: 200, json: {} }));

  await page.route('**/api/me', (route) => route.fulfill({ json: { ...USER, role } }));
  await page.route('**/api/auth/config', (route) => route.fulfill({ json: { oidcEnabled: false } }));
  await page.route('**/api/services', (route) => route.fulfill({ json: { services } }));
  await page.route('**/api/categories', (route) => route.fulfill({ json: { categories } }));
  await page.route('**/api/me/collapsed-categories', (route) =>
    route.fulfill({ json: { collapsed: [] } }),
  );
  await page.route('**/api/favorites/**', (route) => route.fulfill({ status: 204, body: '' }));
}
