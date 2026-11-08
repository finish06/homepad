import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { INFO_ON, mockWidgets } from './widgetMocks';

// SPEC-status-widgets — the real-browser gate for what jsdom can't see: tile
// heights per density, the line truncating so the FIRST field stays readable
// on a phone, and the glance strip dropping its parts in the right order as
// the screen narrows (spec §2.2, AC-008, AC-009, UX §2, §4, §11).

const tile = (page: Page, name: string) => page.locator('.app-grid-tool-wrap', { hasText: name }).getByTestId('tool-link');

async function heightOf(page: Page, name: string): Promise<number> {
  const box = await tile(page, name).boundingBox();
  expect(box, `${name} tile`).not.toBeNull();
  return Math.round(box!.height);
}

// The first field is never clipped: fully inside its line, and not cut short.
async function expectFirstFieldWhole(page: Page, name: string, text: string) {
  const wrap = page.locator('.app-grid-tool-wrap', { hasText: name });
  const first = wrap.locator('.tile-widget-first');
  await expect(first).toHaveText(text);
  const m = await first.evaluate((el) => {
    const line = el.parentElement!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { clipped: el.scrollWidth > el.clientWidth + 1, right: r.right, lineRight: line.right, width: r.width };
  });
  expect(m.clipped, `${name}: first field clipped`).toBe(false);
  expect(m.width).toBeGreaterThan(10);
  expect(m.right, `${name}: first field overflows its line`).toBeLessThanOrEqual(m.lineRight + 1);
}

test.describe('the tile widget line (AC-007…AC-009)', () => {
  test('Large: a row with a widget tile grows by one line and every tile in it matches; a row without keeps today’s height', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWidgets(page, { density: 'large' });
    await page.goto('/');
    await expect(page.getByTestId('tile-widget').first()).toHaveText('2 playing · 1,204 movies');

    // Today's Large tile, measured on a row with no widget tile. (The CSS
    // comment says 120px; with its 1px border the tile renders 124.)
    const plain = await heightOf(page, 'Grafana');
    expect(await heightOf(page, 'Vault')).toBe(plain);

    // Gitea has no widget but shares a row with Jellyfin and Sonarr: the row
    // stretches it to match, so the row keeps one height.
    const tops = await Promise.all(
      ['Jellyfin', 'Gitea', 'Sonarr'].map(async (n) => Math.round((await tile(page, n).boundingBox())!.y)),
    );
    expect(new Set(tops).size, `one grid row: ${tops}`).toBe(1);
    const row = await Promise.all(['Jellyfin', 'Gitea', 'Sonarr'].map((n) => heightOf(page, n)));
    expect(new Set(row).size, `row heights ${row}`).toBe(1);
    // One extra line, not more.
    expect(row[0]).toBeGreaterThan(plain);
    expect(row[0] - plain).toBeLessThanOrEqual(20);
  });

  test('Compact: the values take the status line and the tile stays 68px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWidgets(page, { density: 'compact' });
    await page.goto('/');
    const line = page.locator('.app-grid-tool-wrap', { hasText: 'Sonarr' }).getByTestId('tile-statusline');
    await expect(line).toHaveText('3 this week · 1 in queue');
    expect(await heightOf(page, 'Sonarr')).toBe(68);
    expect(await heightOf(page, 'Gitea')).toBe(68);
    await expect(page.locator('.app-grid-tool-wrap', { hasText: 'Radarr' }).getByTestId('tile-statusline')).toHaveText(
      '◷ 1 this week · 0 in queue',
    );
  });

  test('List: three fields, and the row stays 44px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWidgets(page, { density: 'list' });
    await page.goto('/');
    const line = page.locator('.app-grid-tool-wrap', { hasText: 'Sonarr' }).getByTestId('tile-statusline');
    await expect(line).toHaveText('3 this week · 1 in queue · 12 missing');
    expect(await heightOf(page, 'Sonarr')).toBe(44);
  });

  for (const [density, width] of [
    ['compact', 390],
    ['list', 390],
    ['compact', 320],
    ['list', 320],
    ['large', 320],
  ] as const) {
    test(`${density} at ${width}px: one line, and the first field stays whole`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await mockWidgets(page, { density });
      await page.goto('/');
      await expectFirstFieldWhole(page, 'Sonarr', '3 this week');
      await expectFirstFieldWhole(page, 'Jellyfin', '2 playing');
      // Still a single line: the line box is one line-height tall.
      const lineSel = density === 'large' ? 'tile-widget' : 'tile-statusline';
      const h = await page
        .locator('.app-grid-tool-wrap', { hasText: 'Sonarr' })
        .getByTestId(lineSel)
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(h).toBeLessThan(20);
    });
  }

  test('the status dot keeps its place and colour on a widget tile', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWidgets(page, { density: 'compact' });
    await page.goto('/');
    const dot = (n: string) => page.locator('.app-grid-tool-wrap', { hasText: n }).getByTestId('tile-status');
    const a = await dot('Sonarr').evaluate((el) => getComputedStyle(el).backgroundColor);
    const b = await dot('Gitea').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(a).toBe(b);
  });
});

test.describe('the glance strip (UX §4)', () => {
  async function strip(page: Page, width: number, height = 900) {
    await page.setViewportSize({ width, height });
    await mockWidgets(page, { density: 'compact', info: INFO_ON });
    await page.goto('/');
    const s = page.getByTestId('glance-strip');
    await expect(s).toBeVisible();
    const box = await s.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    return s;
  }

  test('1440: time, long date, weather, place, high/low and the credit', async ({ page }) => {
    const s = await strip(page, 1440);
    await expect(s.getByTestId('glance-time')).toBeVisible();
    await expect(s.getByTestId('glance-date-long')).toBeVisible();
    await expect(s.getByTestId('glance-date-short')).toBeHidden();
    await expect(s.getByText('Rotterdam', { exact: true })).toBeVisible();
    await expect(s.getByText(/H 9°/)).toBeVisible();
    await expect(s.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
    // Clock left, weather right.
    const clock = await s.getByTestId('glance-clock').boundingBox();
    const weather = await s.getByTestId('glance-weather').boundingBox();
    expect(weather!.x).toBeGreaterThan(clock!.x + clock!.width);
  });

  test('820: the short date, and the place drops first', async ({ page }) => {
    const s = await strip(page, 820, 1180);
    await expect(s.getByTestId('glance-date-short')).toBeVisible();
    await expect(s.getByTestId('glance-date-long')).toBeHidden();
    await expect(s.getByText('Rotterdam', { exact: true })).toBeHidden();
    await expect(s.getByText(/H 9°/)).toBeVisible();
  });

  test('390: time and temperature only, plus the credit, on one row', async ({ page }) => {
    const s = await strip(page, 390, 844);
    await expect(s.getByTestId('glance-time')).toBeVisible();
    await expect(s.getByTestId('glance-temp')).toBeVisible();
    await expect(s.getByTestId('glance-date-short')).toBeHidden();
    await expect(s.getByText(/H 9°/)).toBeHidden();
    await expect(s.getByRole('link', { name: 'Open-Meteo' })).toBeVisible();
    const t = await s.getByTestId('glance-time').boundingBox();
    const c = await s.getByRole('link', { name: 'Open-Meteo' }).boundingBox();
    expect(Math.abs(t!.y + t!.height / 2 - (c!.y + c!.height / 2))).toBeLessThan(16);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(390);
  });

  test('no strip, no request to Open-Meteo from the browser', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => {
      if (/open-meteo/.test(r.url())) external.push(r.url());
    });
    await strip(page, 1440);
    expect(external).toEqual([]);
  });
});

test('kid board at 1180×820: the strip shows, tiles carry no numbers (TC-007)', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await mockWidgets(page, { role: 'kid', info: INFO_ON });
  await page.goto('/');
  await expect(page.getByTestId('glance-strip')).toBeVisible();
  await expect(page.getByTestId('tool-link')).toHaveCount(6);
  await expect(page.getByTestId('tile-widget')).toHaveCount(0);
  await expect(page.getByText('this week')).toHaveCount(0);
});
