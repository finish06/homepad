import { test, expect } from '@playwright/test';

// AC A3 — Each tile shows a status badge:
//   UP → green, DOWN → red, DEGRADED → yellow, UNKNOWN → gray.
//
// GREEN phase mocks the homepad backend's /api/services response so each tile
// ends up in a known state, then asserts the badge styling carries the right
// data-status attribute (drives the visible color via CSS).

test.describe('status badge colors', () => {
  test('tile shows status=UP when Gatus reports UP', async ({ page }) => {
    await page.route('**/api/services', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          services: [{ id: 'svc-1', slug: 'svc-1', name: 'Up service', description: '', url: 'https://example.com', icon: 'cog', status: 'UP' }],
        }),
      }),
    );
    await page.goto('/');
    await expect(page.getByTestId('service-tile').first().getByTestId('status-badge')).toHaveAttribute(
      'data-status',
      'UP',
    );
  });

  test('tile shows status=DOWN when Gatus reports DOWN', async ({ page }) => {
    await page.route('**/api/services', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          services: [{ id: 'svc-2', slug: 'svc-2', name: 'Down service', description: '', url: 'https://example.com', icon: 'cog', status: 'DOWN' }],
        }),
      }),
    );
    await page.goto('/');
    await expect(page.getByTestId('service-tile').first().getByTestId('status-badge')).toHaveAttribute(
      'data-status',
      'DOWN',
    );
  });

  test('tile shows status=DEGRADED when Gatus reports DEGRADED', async ({ page }) => {
    await page.route('**/api/services', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          services: [{ id: 'svc-3', slug: 'svc-3', name: 'Degraded service', description: '', url: 'https://example.com', icon: 'cog', status: 'DEGRADED' }],
        }),
      }),
    );
    await page.goto('/');
    await expect(page.getByTestId('service-tile').first().getByTestId('status-badge')).toHaveAttribute(
      'data-status',
      'DEGRADED',
    );
  });

  test('tile shows status=UNKNOWN when Gatus has no data', async ({ page }) => {
    await page.route('**/api/services', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          services: [{ id: 'svc-4', slug: 'svc-4', name: 'Unknown service', description: '', url: 'https://example.com', icon: 'cog', status: 'UNKNOWN' }],
        }),
      }),
    );
    await page.goto('/');
    await expect(page.getByTestId('service-tile').first().getByTestId('status-badge')).toHaveAttribute(
      'data-status',
      'UNKNOWN',
    );
  });
});
