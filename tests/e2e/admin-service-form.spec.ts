import { test, expect, type Page } from '@playwright/test';

// AC A6 (WEB) — An admin can CREATE a new catalog entry and EDIT an existing
// one from edit mode. The backend CRUD (POST/PATCH/DELETE /api/services) is
// already done and tested in homepad-api; this drives the web form end-to-end.
//
// Like status-badge.spec.ts, every endpoint is route-mocked so the spec runs
// without a live backend: /api/me makes the session an admin (unlocking the
// Edit toggle), /api/services seeds the catalog, and POST/PATCH stand in for
// the real CRUD so we can assert the request body and the resulting tile.

const ADMIN = { id: 'u-admin', email: 'admin@ohana', role: 'admin' };

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

// Wire the read endpoints an admin session needs on first paint. Individual
// tests add their own POST/PATCH routes on top before acting.
async function seedAdmin(page: Page) {
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ADMIN) }),
  );
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ oidcEnabled: false }) }),
  );
  await page.route('**/api/services', (route) => {
    // Only intercept the catalog GET here; POST is overridden per-test.
    if (route.request().method() !== 'GET') return route.fallback();
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ services: SEED }) });
  });
}

// Open edit mode, then the add/edit form. v7 §6: the admin Edit affordance moved
// from a bar button into the avatar menu (open the menu, then "Edit dashboard").
async function openEditMode(page: Page) {
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-edit').click();
}

test.describe('A6 — admin create service', () => {
  test('fills the form, POSTs the catalog fields and shows the new tile', async ({ page }) => {
    await seedAdmin(page);

    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/services', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      posted = route.request().postDataJSON();
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'svc-new',
          slug: posted!.slug,
          name: posted!.name,
          description: posted!.description,
          url: posted!.url,
          icon: posted!.icon,
          status: 'UNKNOWN',
          favorite: false,
          iconLight: false,
          iconDark: false,
        }),
      });
    });

    await openEditMode(page);
    await page.getByTestId('add-service').click();

    await page.getByTestId('field-name').fill('Prometheus');
    await page.getByTestId('field-slug').fill('prometheus');
    await page.getByTestId('field-url').fill('https://prom.example.com');
    await page.getByTestId('field-description').fill('metrics');
    await page.getByTestId('field-icon').fill('https://example.com/prom.png');
    await page.getByTestId('field-gatus_key').fill('prometheus');
    await page.getByTestId('form-submit').click();

    // Form closes and the new tile appears alongside the seeded one.
    await expect(page.getByTestId('service-form')).toHaveCount(0);
    await expect(page.getByTestId('service-tile')).toHaveCount(2);
    await expect(page.getByText('Prometheus')).toBeVisible();

    expect(posted).toMatchObject({
      name: 'Prometheus',
      slug: 'prometheus',
      url: 'https://prom.example.com',
      description: 'metrics',
      icon: 'https://example.com/prom.png',
      gatus_key: 'prometheus',
    });
  });

  test('surfaces a 409 slug collision inline and adds no tile', async ({ page }) => {
    await seedAdmin(page);
    await page.route('**/api/services', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      route.fulfill({ status: 409, contentType: 'text/plain', body: 'slug already in use' });
    });

    await openEditMode(page);
    await page.getByTestId('add-service').click();
    await page.getByTestId('field-name').fill('Grafana 2');
    await page.getByTestId('field-slug').fill('grafana');
    await page.getByTestId('field-url').fill('https://grafana2.example.com');
    await page.getByTestId('form-submit').click();

    await expect(page.getByTestId('form-error')).toContainText('slug already in use');
    await expect(page.getByTestId('service-form')).toBeVisible();
    await expect(page.getByTestId('service-tile')).toHaveCount(1);
  });

  test('surfaces a 422 validation error inline', async ({ page }) => {
    await seedAdmin(page);
    await page.route('**/api/services', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      route.fulfill({ status: 422, contentType: 'text/plain', body: 'url must be http(s)' });
    });

    await openEditMode(page);
    await page.getByTestId('add-service').click();
    await page.getByTestId('field-name').fill('Bad');
    await page.getByTestId('field-slug').fill('bad');
    await page.getByTestId('field-url').fill('ftp://nope');
    await page.getByTestId('form-submit').click();

    await expect(page.getByTestId('form-error')).toContainText('url must be http(s)');
    await expect(page.getByTestId('service-tile')).toHaveCount(1);
  });
});

test.describe('A6 — admin edit service', () => {
  test('prefills the form, PATCHes the changed fields and reflects the update', async ({ page }) => {
    await seedAdmin(page);

    let patched: Record<string, unknown> | null = null;
    await page.route('**/api/services/svc-1', (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback();
      patched = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...SEED[0], ...patched, id: 'svc-1' }),
      });
    });

    await openEditMode(page);
    await page.getByTestId('edit-service').click();

    // The form opens prefilled with the seeded service's current values.
    await expect(page.getByTestId('field-name')).toHaveValue('Grafana');
    await expect(page.getByTestId('field-slug')).toHaveValue('grafana');
    await expect(page.getByTestId('field-url')).toHaveValue('https://grafana.example.com');

    await page.getByTestId('field-name').fill('Grafana Cloud');
    await page.getByTestId('form-submit').click();

    await expect(page.getByTestId('service-form')).toHaveCount(0);
    await expect(page.getByText('Grafana Cloud')).toBeVisible();
    expect(patched).toMatchObject({ name: 'Grafana Cloud', slug: 'grafana' });
  });
});
