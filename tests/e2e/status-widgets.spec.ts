import { test, expect } from '@playwright/test';
import { INFO_OFF, INFO_ON, mockWidgets } from '../browser-gate/widgetMocks';

// SPEC-status-widgets — the user test cases that run against the built app
// with the API mocked (tests/browser-gate/widgetMocks.ts). Both projects in
// playwright.config.ts: desktop 1440 and iPhone 13.

test('TC-001 — an admin attaches Jellyfin, tests it and saves', async ({ page }) => {
  const mock = await mockWidgets(page, { role: 'admin', density: 'compact' });
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByRole('button', { name: 'Edit Jellyfin' }).click();

  const section = page.getByTestId('widget-section');
  await expect(section.getByText('Suggested')).toBeVisible();
  await section.getByLabel('Address').fill('http://jellyfin.home.arpa:8096');
  await section.getByLabel('API key').fill('k-test');
  await section.getByRole('button', { name: 'Test connection' }).click();
  const result = section.getByTestId('widget-test-result');
  await expect(result).toContainText('✓ Connected to Jellyfin 10.10.3.');
  await expect(result).toContainText('0 playing · 1,204 movies');
  expect(mock.tests[0]).toMatchObject({ kind: 'jellyfin', secret: 'k-test' });

  await page.getByTestId('tile-edit-save').click();
  await expect(page.getByTestId('tile-edit-modal')).toBeHidden();
  expect(mock.puts[0]).toMatchObject({
    kind: 'jellyfin',
    address: 'http://jellyfin.home.arpa:8096',
    fields: ['playing', 'movies', 'series'],
    intervalS: 60,
  });
});

test('TC-008 — the admin turns on the clock and the weather; the strip appears', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (/open-meteo\.com/.test(r.url())) external.push(r.url());
  });
  const mock = await mockWidgets(page, { role: 'admin', density: 'compact', info: INFO_OFF });
  await page.goto('/');
  await expect(page.getByTestId('tool-link').first()).toBeVisible();
  await expect(page.getByTestId('glance-strip')).toHaveCount(0);

  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  const widgets = page.getByTestId('settings-widgets');
  await widgets.getByRole('switch', { name: 'Clock' }).click();
  await widgets.getByLabel('Place').fill('Rotterdam');
  await widgets.getByRole('button', { name: 'Find' }).click();
  await widgets.getByRole('button', { name: 'Rotterdam, South Holland, Netherlands' }).click();
  await expect(widgets.getByText('Rotterdam, Netherlands ✓')).toBeVisible();
  await widgets.getByRole('switch', { name: 'Weather' }).click();
  await expect(widgets.getByRole('switch', { name: 'Weather' })).toHaveAttribute('aria-checked', 'true');
  expect(mock.settings).toEqual([
    { clockEnabled: true },
    { weatherPlace: 'Rotterdam', weatherLat: 51.92, weatherLon: 4.48 },
    { weatherEnabled: true },
  ]);
  await page.getByTestId('settings-close').click();

  const strip = page.getByTestId('glance-strip');
  await expect(strip).toBeVisible();
  await expect(strip.getByTestId('glance-time')).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
  expect(external, 'the browser called Open-Meteo').toEqual([]);
});

test('TC-009 — ⌘K searches the web after the app matches', async ({ page, context }) => {
  await mockWidgets(page, { role: 'user', density: 'compact', info: INFO_ON });
  await page.goto('/');
  await expect(page.getByTestId('launcher-trigger')).toBeVisible();
  await page.getByTestId('launcher-trigger').click();
  const input = page.getByTestId('launcher-input');
  await input.fill('jelly');
  const rows = page.getByRole('option');
  await expect(rows.first()).toContainText('Jellyfin');
  await expect(rows.last()).toHaveText(/Search the web for “jelly”/);

  // TC-009's multi-word query. The app ranker doesn't match "jelly fin
  // subtitles" to Jellyfin (it never did), so here the web row is the only
  // row, selected, and the words are encoded.
  await input.fill('jelly fin subtitles');
  const web = page.getByTestId('launcher-web-row');
  await expect(rows).toHaveCount(1);
  await expect(web).toHaveAttribute('aria-selected', 'true');
  await expect(web).toHaveAttribute('href', 'https://duckduckgo.com/?q=jelly%20fin%20subtitles');
  // Don't leave the sandbox: answer the new tab locally.
  await context.route('https://duckduckgo.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  const [tab] = await Promise.all([context.waitForEvent('page'), web.click()]);
  expect(tab.url()).toContain('q=jelly%20fin%20subtitles');
});

test('TC-011 — Show widgets off hides the tile lines and the strip, for this user only', async ({ page }) => {
  const mock = await mockWidgets(page, { role: 'user', density: 'compact', info: INFO_ON });
  await page.goto('/');
  const line = page.locator('.app-grid-tool-wrap', { hasText: 'Sonarr' }).getByTestId('tile-statusline');
  await expect(line).toHaveText('3 this week · 1 in queue');
  await expect(page.getByTestId('glance-strip')).toBeVisible();

  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-my-settings').click();
  await page.getByRole('switch', { name: 'Show widgets' }).click();
  await page.getByTestId('settings-close').click();

  await expect(line).toHaveText('Online · 41 ms');
  await expect(page.getByTestId('glance-strip')).toHaveCount(0);
  const patch = mock.responses.find((r) => r.method === 'PATCH' && r.path === '/api/me');
  expect(patch, 'the choice is saved on the account').toBeDefined();
});
