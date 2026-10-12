import { test, expect } from './fixtures';
import type { Page, Locator } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// #423: the custom-app form (ServiceForm, add mode, opened from the gear menu's
// "Add custom app") had no real-browser gate, and QA couldn't reach it on staging
// (no admin user). The unit suite covers its logic in jsdom. Pinned here in a real
// browser:
//   - the form fits at the iPad and phone widths, and Add can be hit (the classic
//     modal failure is a footer pushed off-screen or under the scrim);
//   - validation stops the request: nothing is POSTed for empty fields or a
//     javascript: URL;
//   - typing a name fills the slug, as the backend's slugify does;
//   - a valid add POSTs the exact body, files the category with the follow-up
//     PATCH (#84), closes, and the new tile appears in the grid.

async function openForm(page: Page, width: number, height: number) {
  const { services, categories } = makeStatusTiles(['UP']);
  await page.setViewportSize({ width, height });
  await mockApi(page, services as never, categories, 'admin');
  const calls: { method: string; url: string; body: unknown }[] = [];
  // mockApi's '**/api/services' answers every method with the GET payload, so
  // POSTs are taken over here. Registered later, so this wins (LIFO).
  await page.route('**/api/services', async (r) => {
    if (r.request().method() !== 'POST') return r.fallback();
    const body = r.request().postDataJSON();
    calls.push({ method: 'POST', url: r.request().url(), body });
    await r.fulfill({
      status: 201,
      json: { ...body, id: 'svc-new', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false, categoryId: null },
    });
  });
  await page.route('**/api/services/svc-new', async (r) => {
    const body = r.request().postDataJSON();
    calls.push({ method: r.request().method(), url: r.request().url(), body });
    await r.fulfill({
      json: { id: 'svc-new', name: 'My NAS', slug: 'my-nas', url: 'https://nas.example.test', description: '', icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false, ...body },
    });
  });
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-add-custom-app').click();
  const form = page.getByRole('dialog', { name: 'Add app' });
  await expect(form).toBeVisible();
  return { form, calls };
}

async function expectHitTestable(el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const hit = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === node || node.contains(top));
  });
  expect(hit, `${what} is covered by another element at its centre`).toBe(true);
}

for (const [label, w, h] of [['iPad 768', 768, 1024], ['phone 375', 375, 812]] as const) {
  test.describe(`Add custom app form — ${label}`, () => {
    test('fits the viewport, and Add and Close can be hit', async ({ page }) => {
      const { form } = await openForm(page, w, h);
      const box = (await form.boundingBox())!;
      expect(box.x, 'form starts off-screen left').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'form runs past the right edge').toBeLessThanOrEqual(w + 0.5);
      expect(box.y + box.height, 'form runs past the bottom edge').toBeLessThanOrEqual(h + 0.5);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'page scrolls horizontally with the form open').toBeLessThanOrEqual(0);
      await expectHitTestable(page.getByTestId('form-submit'), 'Add');
      await expectHitTestable(page.getByTestId('form-close'), 'Close');
    });

    test('validation blocks the request: empty fields, then a javascript: URL', async ({ page }) => {
      const { calls } = await openForm(page, w, h);
      await page.getByTestId('form-submit').click();
      await expect(page.getByTestId('form-error')).toHaveText('Name, slug and URL are required.');

      await page.getByTestId('field-name').fill('My NAS');
      await page.getByTestId('field-url').fill('javascript:alert(1)');
      await page.getByTestId('form-submit').click();
      await expect(page.getByTestId('form-error')).toHaveText('URL must be http:// or https://.');
      expect(calls, 'a request was sent despite failed validation').toEqual([]);
    });

    test('a valid add POSTs, files the category, closes, and shows the tile', async ({ page }) => {
      const { form, calls } = await openForm(page, w, h);
      await page.getByTestId('field-name').fill('My NAS');
      // Real input events drive the slug, as the backend's slugify would.
      await expect(page.getByTestId('field-slug')).toHaveValue('my-nas');
      await page.getByTestId('field-url').fill('https://nas.example.test');
      await page.getByTestId('field-category').selectOption('cat-1');
      await page.getByTestId('form-submit').click();

      await expect(form).toBeHidden();
      expect(calls.map((c) => c.method)).toEqual(['POST', 'PATCH']);
      expect(calls[0].body).toEqual({
        name: 'My NAS',
        slug: 'my-nas',
        url: 'https://nas.example.test',
        description: '',
        icon: '',
        gatus_key: '',
      });
      expect(calls[1].body).toEqual({ categoryId: 'cat-1' });
      await expect(page.getByText('My NAS', { exact: true }).first()).toBeVisible();
    });
  });
}
