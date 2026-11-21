import type { Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-iframe-sandbox-optin — what jsdom can't see: the switch row's geometry at
// 390 and 1440 (UX §2.1, §2.2), the dimmed track with a full-colour reason line
// (UX §4), real keyboard activation (Space toggles, Enter must not), and the
// sandbox attribute the built overlay actually renders (AC-001, AC-002, AC-004).

type Overrides = { url?: string; clickAction?: string; iframeSameOrigin?: boolean };

async function boot(page: import('@playwright/test').Page, width: number, o: Overrides = {}) {
  const { services, categories } = makeStatusTiles(['UP']);
  const svc = { ...services[0], clickAction: 'iframe', iframeSameOrigin: false, ...o };
  await page.setViewportSize({ width, height: 900 });
  await mockApi(page, [svc] as never, categories, 'admin');
  // The overlay frame would try to load the app; keep it off the network.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.fulfill({ status: 200, body: '<p>app</p>' }));
  await page.goto('/');
}

async function openEditor(page: import('@playwright/test').Page) {
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByTestId('tile-edit').first().click();
  await expect(page.getByRole('group', { name: 'Click action' })).toBeVisible();
}

const LABEL = 'Let this app keep its sign-in';

// The editor rises in (tile-edit-rise: translateY 8px→0, 160ms). Each
// boundingBox() is its own round trip, so measured mid-rise the switch and the
// label are read at different offsets and look misaligned by up to ~3px. Wait
// for the modal's animations to finish before measuring.
const settled = (el: Locator) =>
  el.evaluate((n) => Promise.all(n.getAnimations({ subtree: true }).map((a) => a.finished)).then(() => undefined));

for (const width of [390, 1440]) {
  test(`UX §2 — the switch row is ≥44px, the switch sits right and top-aligned — ${width}`, async ({ page }) => {
    await boot(page, width);
    await openEditor(page);
    const sw = page.getByRole('switch', { name: LABEL });
    await expect(sw).toBeVisible();
    await settled(page.getByTestId('tile-edit-modal'));
    const s = (await sw.boundingBox())!;
    const label = (await page.getByText(LABEL, { exact: true }).boundingBox())!;
    const group = (await page.getByRole('group', { name: 'Click action' }).boundingBox())!;
    expect(s.height, 'a 44px target').toBeGreaterThanOrEqual(44);
    expect(s.width).toBeGreaterThanOrEqual(44);
    expect(s.x + s.width, 'the switch ends at the field edge').toBeLessThanOrEqual(group.x + group.width + 1);
    expect(s.x, 'the switch is right of the label').toBeGreaterThan(label.x + label.width - 1);
    // The label's box includes its 12px top padding, so its top is the row's.
    expect(Math.abs(s.y - label.y), `top-aligned: switch ${s.y}, label ${label.y}`).toBeLessThanOrEqual(2);
    expect(s.x + s.width).toBeLessThanOrEqual(width);
    // The help line sits under the row.
    const help = (await page.getByTestId('tile-signin-help').boundingBox())!;
    expect(help.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
  });
}

test('UX §4 — greyed out dims only the switch; the reason keeps the help colour', async ({ page }) => {
  await boot(page, 1440);
  await openEditor(page);
  const helpColor = await page.getByTestId('tile-click-action-hint').evaluate((el) => getComputedStyle(el).color);
  // The page's own origin, whatever port this run serves on.
  await page.getByTestId('tile-field-url').fill(`${new URL(page.url()).origin}/grafana/`);
  const sw = page.getByRole('switch', { name: LABEL });
  await expect(sw).toHaveAttribute('aria-disabled', 'true');
  expect(await sw.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.5');
  const reason = page.getByTestId('tile-signin-help');
  await expect(reason).toHaveText("Not available for pages on this Homepad's own address.");
  expect(await reason.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  expect(await reason.evaluate((el) => getComputedStyle(el).color)).toBe(helpColor);
});

test('UX §4 — Space toggles, Enter does not, and neither saves', async ({ page }) => {
  let patched = 0;
  await boot(page, 1440);
  await page.route('**/api/services/**', (route) => {
    if (route.request().method() === 'PATCH') patched += 1;
    return route.fallback();
  });
  await openEditor(page);
  await page.getByTestId('tile-click-action-iframe').focus();
  await page.keyboard.press('Tab');
  const sw = page.getByRole('switch', { name: LABEL });
  await expect(sw).toBeFocused();
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tile-edit-modal')).toBeVisible();
  expect(patched, 'toggling must not PATCH; only Save does').toBe(0);
});

test('AC-002 — an opted-in app on another origin keeps its origin in the overlay', async ({ page }) => {
  await boot(page, 1440, { url: 'https://grafana.example.test', iframeSameOrigin: true });
  await page.getByTestId('tool-link').first().click();
  await expect(page.getByTestId('iframe-overlay-frame')).toHaveAttribute(
    'sandbox',
    'allow-scripts allow-same-origin allow-forms allow-popups',
  );
});

test('AC-001 — an app with the opt-in off gets the strict sandbox', async ({ page }) => {
  await boot(page, 1440, { url: 'https://grafana.example.test', iframeSameOrigin: false });
  await page.getByTestId('tool-link').first().click();
  await expect(page.getByTestId('iframe-overlay-frame')).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
});

test("AC-004 — an opted-in app on Homepad's own origin never keeps it", async ({ page }) => {
  // The page origin is this run's baseURL.
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await boot(page, 1440, { url: `${origin}/grafana/`, iframeSameOrigin: true });
  await page.getByTestId('tool-link').first().click();
  await expect(page.getByTestId('iframe-overlay-frame')).toHaveAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
});
