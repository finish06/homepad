import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-ui-quick-wins (#725) — the real-browser half of the seven quick wins.
// jsdom has no layout, no paint, no real focus movement and no hover, so what
// the unit tests cannot see is pinned here, on the built app with /api mocked:
// theme-color and color-scheme as the browser reads them, the freshness button
// pressed with the keyboard, toast pause / dismiss / View with a real pointer,
// Gear arrow keys, the pip shapes at every density, the Library groups and
// filter, and the sign-in show/hide toggle.

const LIGHT_BG = '#eef3fb'; // :root:not(.dark)[data-theme="blue"] --bg-1
const DARK_BG = '#0d1526'; // .dark[data-theme="blue"] --bg-1

const themeColor = (page: Page) =>
  page.locator('meta[name="theme-color"]').getAttribute('content');
const colorScheme = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

// ── Item 1: browser chrome ─────────────────────────────────────────────────

for (const scheme of ['light', 'dark'] as const) {
  test(`AC-001: theme-color is the page background (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByTestId('app-grid')).toBeVisible();
    const expected = scheme === 'dark' ? DARK_BG : LIGHT_BG;
    await expect.poll(() => themeColor(page)).toBe(expected);
    // It is the token the page actually paints with, not a second copy of it.
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg-1').trim(),
    );
    expect(bg).toBe(expected);
  });

  test(`AC-002: color-scheme is ${scheme} before the bundle runs and after it mounts`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await mockApi(page);
    // Block every script bundle: what is left is the HTML, the stylesheet and
    // the inline theme script, i.e. the page as it first paints.
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.goto('/');
    expect(await colorScheme(page)).toBe(scheme);
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(scheme === 'dark');

    await page.unroute('**/assets/*.js');
    await page.goto('/');
    await expect(page.getByTestId('app-grid')).toBeVisible();
    expect(await colorScheme(page)).toBe(scheme);
  });
}

test('AC-001: theme-color follows an accent change and a theme change in the menu', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await mockApi(page);
  await page.route('**/api/me', (route) =>
    route.fulfill({ json: { id: 'u1', email: 'm@ohana.test', role: 'member', themePref: 'light' } }),
  );
  await page.goto('/');
  await expect.poll(() => themeColor(page)).toBe(LIGHT_BG);
  await page.getByTestId('user-menu-trigger').click();
  await page.getByRole('button', { name: 'Teal accent' }).click();
  await expect.poll(() => themeColor(page)).toBe('#e9f6f6');
  await page.getByTestId('theme-dark').click();
  await expect.poll(() => themeColor(page)).toBe('#08201f');
});

// ── Items 2 + 3: the freshness button, and the toasts it can surface ────────

// Tiles that flip UP → DOWN on the first manual refresh: the refresh reloads
// the list, the merge sees the flips, and a toast fires per tile (the real path).
async function bootWithFlip(page: Page, tiles = 1) {
  const { services, categories } = makeStatusTiles(Array.from({ length: tiles }, () => 'UP'));
  await mockApi(page, services, categories, 'admin');
  let flipped = false;
  let posts = 0;
  await page.route('**/api/status/refresh', async (route) => {
    posts += 1;
    flipped = true;
    // Hold the answer briefly so the in-flight state is observable.
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ json: { as_of: `2026-11-25T10:00:0${posts}Z` } });
  });
  await page.route('**/api/services', (route) =>
    route.fulfill({
      json: { services: services.map((s) => ({ ...s, status: flipped ? 'DOWN' : 'UP' })) },
    }),
  );
  await page.goto('/');
  await expect(page.getByTestId('status-last-updated')).toBeVisible();
  return { posts: () => posts };
}

test('AC-004 / AC-006: Enter on the freshness button refreshes once, shows "Refreshing…", then announces', async ({ page }) => {
  const api = await bootWithFlip(page);
  const btn = page.getByTestId('status-last-updated');
  await expect(btn).toHaveAccessibleName(/^Updated .+\. Refresh status$/);
  await btn.focus();
  await page.keyboard.press('Enter');
  await expect(btn).toHaveText('Refreshing…');
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  // Pressed again while busy: ignored, and focus stays on it (aria-disabled).
  await page.keyboard.press('Enter');
  await expect(btn).toBeFocused();
  await expect(page.getByTestId('status-refresh-live')).toHaveText('Status refreshed');
  await expect(btn).toHaveText(/^Updated (just now|\d+s ago)$/);
  expect(api.posts()).toBe(1);
  // Space works too (a native button).
  await page.keyboard.press(' ');
  await expect.poll(() => api.posts()).toBe(2);
});

test('AC-007 / AC-008: a hovered toast never closes; Dismiss is ≥24×24 and returns focus to the bell', async ({ page }) => {
  await page.clock.install();
  await bootWithFlip(page);
  await page.getByTestId('status-last-updated').click();
  const toast = page.getByTestId('toast');
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText('App UP went DOWN');

  await toast.hover();
  await page.clock.runFor(10_000);
  await expect(toast).toHaveCount(1);
  await expect(toast).toHaveAttribute('data-paused', 'true');

  const dismiss = toast.getByTestId('toast-dismiss');
  const box = await dismiss.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);

  await dismiss.focus();
  await page.mouse.move(0, 0);
  // Focused: still paused after the pointer left.
  await page.clock.runFor(10_000);
  await expect(toast).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('alert-bell')).toBeFocused();
});

// #725 review — Chrome focuses a button on mouse click. That focus must not be
// handed to the next toast, or that toast pauses (AC-007) and never closes.
test('AC-007 / AC-008: a mouse Dismiss leaves the next toast on its timer', async ({ page }) => {
  await page.clock.install();
  await bootWithFlip(page, 2);
  await page.getByTestId('status-last-updated').click();
  const toasts = page.getByTestId('toast');
  await expect(toasts).toHaveCount(2);
  await toasts.first().getByTestId('toast-dismiss').click();
  await expect(toasts).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect(toasts.first()).toHaveAttribute('data-paused', 'false');
  await page.clock.runFor(4_100);
  await expect(toasts).toHaveCount(0);
});

test('AC-007: an untouched toast still closes after 4s', async ({ page }) => {
  await page.clock.install();
  await bootWithFlip(page);
  await page.getByTestId('status-last-updated').click();
  await expect(page.getByTestId('toast')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await page.clock.runFor(4_100);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('AC-009: View opens the alert history and closes the toast', async ({ page }) => {
  await bootWithFlip(page);
  await page.getByTestId('status-last-updated').click();
  const toast = page.getByTestId('toast');
  await expect(toast).toHaveCount(1);
  await toast.getByTestId('toast-view').click();
  await expect(page.getByTestId('alert-panel-close')).toBeVisible();
  await expect(toast).toHaveCount(0);
  await expect(page.getByTestId('alert-row')).toHaveCount(1);
});

// ── Item 4: Gear arrow keys ────────────────────────────────────────────────

test('AC-010: Gear menu arrows walk every item including Arrange apps; Home/End; Escape returns focus', async ({ page }) => {
  await mockApi(page, undefined, [], 'admin');
  await page.goto('/');
  const gear = page.getByTestId('settings-gear');
  await gear.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('gear-add-apps')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('gear-edit-dashboard')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('gear-add-custom-app')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('gear-add-apps')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByTestId('gear-add-custom-app')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('gear-add-apps')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gear-menu')).toHaveCount(0);
  await expect(gear).toBeFocused();
});

test('AC-010 / AC-017: a member\'s Gear has Arrange apps (focused on open) and no Add apps', async ({ page }) => {
  await mockApi(page, undefined, [], 'member');
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await expect(page.getByTestId('gear-edit-dashboard')).toBeFocused();
  await expect(page.getByTestId('gear-add-apps')).toHaveCount(0);
});

test('AC-010: the user menu arrows wrap and skip the theme group', async ({ page }) => {
  await mockApi(page, undefined, [], 'admin');
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await expect(page.getByTestId('menu-go-dashboard')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('menu-logout')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('menu-go-dashboard')).toBeFocused();
});

// ── Item 5: pip shapes ─────────────────────────────────────────────────────

const STATES = ['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'NOT_MONITORED'];

for (const density of ['large', 'compact', 'list'] as const) {
  test(`AC-012 / AC-013: DOWN is a diamond, DEGRADED a rounded square, and no tile moves (${density})`, async ({ page }) => {
    const { services, categories } = makeStatusTiles(STATES);
    await mockApi(page, services, categories, 'member', density);
    await page.goto('/');
    await expect(page.getByTestId('tile-status')).toHaveCount(STATES.length);

    const shapes = await page.getByTestId('tile-status').evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el);
        return {
          status: el.getAttribute('data-status'),
          rotate: s.rotate,
          radius: s.borderTopLeftRadius,
          w: (el as HTMLElement).offsetWidth,
          h: (el as HTMLElement).offsetHeight,
          role: el.getAttribute('role'),
          label: el.getAttribute('aria-label'),
        };
      }),
    );
    const by = Object.fromEntries(shapes.map((x) => [x.status, x]));
    for (const st of STATES) {
      // Same 9px box at every density (SPEC-242), same accessible image.
      expect(by[st].w, st).toBe(9);
      expect(by[st].h, st).toBe(9);
      expect(by[st].role, st).toBe('img');
      expect(by[st].label, st).toMatch(/^status: /i);
    }
    expect(by.UP.radius).toBe('9999px');
    expect(by.UNKNOWN.radius).toBe('9999px');
    expect(by.UP.rotate).toBe('none');
    expect(by.DOWN.rotate).toBe('45deg');
    expect(by.DOWN.radius).toBe('1.5px');
    expect(by.DEGRADED.rotate).toBe('none');
    expect(by.DEGRADED.radius).toBe('2px');
    // Three distinct solid shapes; NOT_MONITORED stays the only hollow one.
    const key = (x: { rotate: string; radius: string }) => `${x.rotate}/${x.radius}`;
    expect(new Set([key(by.UP), key(by.DOWN), key(by.DEGRADED)]).size).toBe(3);

    // No tile moves or changes size: the same page with every pip forced back
    // to a plain circle lays out identically.
    const rects = () =>
      page.locator('.app-grid-tool-wrap').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map(Math.round);
        }),
      );
    const shaped = await rects();
    await page.addStyleTag({
      content: '.app-grid-tool-status { rotate: none !important; border-radius: 9999px !important; }',
    });
    expect(await rects()).toEqual(shaped);
  });
}

test('AC-013: the DOWN breathe stops under reduced motion and the diamond stays', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { services, categories } = makeStatusTiles(['DOWN']);
  await mockApi(page, services, categories, 'member');
  await page.goto('/');
  const pip = page.getByTestId('tile-status');
  await expect(pip).toHaveCount(1);
  const s = await pip.evaluate((el) => {
    const c = getComputedStyle(el);
    return { anim: c.animationName, rotate: c.rotate };
  });
  expect(s.anim).toBe('none');
  expect(s.rotate).toBe('45deg');
});

// ── Item 6: the App Library ────────────────────────────────────────────────

const LIBRARY = [
  { id: 'L1', name: 'Sonarr', url: 'https://s.x', icon: '', description: 'TV', suggestedCategory: 'Media', sortIndex: 0, added: true },
  { id: 'L2', name: 'Pi-hole', url: 'https://p.x', icon: '', description: 'DNS', suggestedCategory: 'Network', sortIndex: 1, added: false },
  { id: 'L3', name: 'Notes', url: 'https://n.x', icon: '', description: 'Notes', suggestedCategory: '', sortIndex: 2, added: false },
  { id: 'L4', name: 'Plex', url: 'https://x.x', icon: '', description: 'Movies', suggestedCategory: 'Media', sortIndex: 3, added: false },
];

test('AC-014..AC-016: the Library groups by category and filters by Added', async ({ page }) => {
  await mockApi(page, undefined, [], 'admin');
  await page.route('**/api/library', (route) => route.fulfill({ json: { library: LIBRARY } }));
  await page.route('**/api/library/*/add', (route) =>
    route.fulfill({
      status: 201,
      json: { id: 'svc-new', slug: 'plex', name: 'Plex', description: '', url: 'https://x.x', icon: '', status: 'UNKNOWN', favorite: false, iconLight: false, iconDark: false, categoryId: null },
    }),
  );
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-add-apps').click();
  const dialog = page.getByTestId('library-browse');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('library-group-title')).toHaveText(['Media (2)', 'Network (1)', 'Other (1)']);

  // Keyboard: the text filter, then the radio group (one stop), arrows inside it.
  await dialog.getByLabel('Filter the App Library').focus();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('radio', { name: 'All' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('radio', { name: 'Not added' })).toBeChecked();
  await expect(dialog.getByTestId('library-group-title')).toHaveText(['Media (1)', 'Network (1)', 'Other (1)']);

  // Adding under "Not added" moves the row out, announces it, keeps focus inside.
  await dialog.getByTestId('library-add-L4').click();
  await expect(dialog.getByTestId('library-live')).toHaveText('Plex added');
  await expect(dialog.getByTestId('library-group-title')).toHaveText(['Network (1)', 'Other (1)']);
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);

  // The radio is visually hidden inside its pill label; a pointer clicks the pill.
  await dialog.locator('label', { hasText: /^Added$/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Added', exact: true })).toBeChecked();
  await expect(dialog.getByTestId('library-group-title')).toHaveText(['Media (2)']);
});

// ── Item 7: sign-in ────────────────────────────────────────────────────────

test('AC-018: show/hide keeps the value, focus and caret in the password field', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/me', (route) => route.fulfill({ status: 401, body: 'unauthorized' }));
  await page.goto('/');
  const field = page.getByLabel('Password', { exact: true });
  await field.fill('correct horse');
  await field.evaluate((el: HTMLInputElement) => el.setSelectionRange(4, 4));
  const toggle = page.getByRole('button', { name: 'Show password' });
  const box = await toggle.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await toggle.click();
  await expect(field).toHaveAttribute('type', 'text');
  await expect(field).toHaveValue('correct horse');
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([4, 4]);
  await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');

  // Keyboard: Tab onto the toggle, press Space; focus returns to the field.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Hide password' })).toBeFocused();
  await page.keyboard.press(' ');
  await expect(field).toHaveAttribute('type', 'password');
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4);
});
