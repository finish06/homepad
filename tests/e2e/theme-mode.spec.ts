import { test, expect, type Page } from '@playwright/test';

// AC v3 (WEB) — the System / Light / Dark theme control. The backend
// (GET/PATCH /api/me {themePref}) is already done + tested in homepad-api; this
// drives the web slice end-to-end. Every endpoint is route-mocked (like
// admin-service-form.spec.ts) so the spec runs without a live backend:
//   • GET  /api/me      → a logged-in user (so the catalog + control render)
//   • PATCH /api/me     → 200 echo, and we capture the body to assert the pref
//   • /api/auth/config  → oidc off
//   • /api/services     → one seeded tile

const USER = { id: 'u1', email: 'lilo@ohana', role: 'user', themePref: 'light' };

const SEED = [
  {
    id: 'svc-1',
    slug: 'grafana',
    name: 'Grafana',
    description: 'dashboards',
    url: 'https://grafana.example.com',
    icon: 'https://example.com/grafana.png',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
  },
];

// Wire the reads a logged-in session needs, plus a PATCH /api/me capture.
// `patched` collects each PATCH body so a test can assert what was persisted.
async function seedUser(page: Page, patched: Record<string, unknown>[], pref = 'light') {
  await page.route('**/api/me', (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      patched.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...USER, themePref: body.themePref }),
      });
    }
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...USER, themePref: pref }),
    });
  });
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ oidcEnabled: false }) }),
  );
  await page.route('**/api/services', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ services: SEED }) }),
  );
}

const htmlIsDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('dark'));

// v7 §6.3 — the theme control moved into the avatar menu's Appearance group, so
// open the menu before reaching the segments. (Selecting a theme keeps the menu
// open for quick A/B per §6.4.)
const openMenu = (page: Page) => page.getByTestId('user-menu-trigger').click();

test.describe('v3 — theme control', () => {
  test('Dark / Light segments flip the surface and PATCH /api/me', async ({ page }) => {
    const patched: Record<string, unknown>[] = [];
    await seedUser(page, patched);
    await page.goto('/');
    await openMenu(page);

    // The control renders inside the menu, all three segments present.
    await expect(page.getByTestId('theme-control')).toBeVisible();
    await expect(page.getByTestId('theme-system')).toBeVisible();
    await expect(page.getByTestId('theme-light')).toBeVisible();
    await expect(page.getByTestId('theme-dark')).toBeVisible();

    // Starts light (stored pref).
    expect(await htmlIsDark(page)).toBe(false);

    await page.getByTestId('theme-dark').click();
    await expect.poll(() => htmlIsDark(page)).toBe(true);
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('theme-light').click();
    await expect.poll(() => htmlIsDark(page)).toBe(false);

    expect(patched).toEqual([{ themePref: 'dark' }, { themePref: 'light' }]);
  });

  test('System follows the OS preference live (A4)', async ({ page }) => {
    const patched: Record<string, unknown>[] = [];
    await seedUser(page, patched, 'system');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await openMenu(page);

    await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-pressed', 'true');
    expect(await htmlIsDark(page)).toBe(false);

    // Flip the OS to dark — System re-resolves with no reload.
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => htmlIsDark(page)).toBe(true);
  });
});

test.describe('v3 — anti-flash first paint (A8)', () => {
  test('a dark localStorage cache paints dark before React mounts', async ({ page }) => {
    const patched: Record<string, unknown>[] = [];
    await seedUser(page, patched);
    // Seed the first-paint cache before any document script runs.
    await page.addInitScript(() => localStorage.setItem('homepad.theme', 'dark'));

    await page.goto('/');
    // The inline boot script sets the dark class synchronously at first paint —
    // before #root has any children (i.e. before the React bundle mounts).
    expect(await htmlIsDark(page)).toBe(true);
  });
});
