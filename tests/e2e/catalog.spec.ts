import { test, expect } from '@playwright/test';

// AC A2 — Logged-in user sees the shared catalog (name, icon, description, URL) per tile.
//
// GREEN phase will: seed catalog via the API as admin, log in as a regular user,
// then assert tiles render with the seeded fields.

test('catalog renders all seeded services with name/icon/desc/url', async ({ page }) => {
  // TODO(green): seed catalog via POST /api/services as admin, then log in.
  await page.goto('/');

  const tiles = page.getByTestId('service-tile');
  await expect(tiles).toHaveCount(3, { timeout: 5_000 });

  const first = tiles.first();
  await expect(first.getByTestId('service-tile-name')).toBeVisible();
  await expect(first.getByTestId('service-tile-description')).toBeVisible();
  await expect(first.getByTestId('service-tile-icon')).toBeVisible();

  const url = await first.getByRole('link').first().getAttribute('href');
  expect(url).toMatch(/^https?:\/\//);
});
