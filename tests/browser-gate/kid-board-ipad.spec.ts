import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';
import { kidUser, mockKidSession, type KidMock } from './kidMocks';

// SPEC-kid-accounts TASK-406 / AC-015 / UX §5 — the kid board on an iPad, in
// both orientations, in a real browser. jsdom can't measure a touch target or
// see a sticky header eat a tap; this can. It also drives the whole kid surface
// (menu, favorites, ⌘K) and then asserts the mocked server answered NOTHING
// with 403: a kid dashboard that calls a route it may not use is a bug even
// when no error shows (server.go's kid-forbidden and admin-only classes).

const MAYA_APPS = ['plex', 'jellyfin', 'abs', 'kavita', 'immich'];

async function hitTestable(el: Locator, what: string) {
  await el.scrollIntoViewIfNeeded();
  const hit = await el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (top === node || node.contains(top));
  });
  expect(hit, `${what} is covered by another element at its centre`).toBe(true);
}

async function minSide(el: Locator): Promise<number> {
  const b = (await el.boundingBox())!;
  return Math.min(b.width, b.height);
}

async function openBoard(page: Page, w: number, h: number, apps = MAYA_APPS): Promise<KidMock> {
  await page.setViewportSize({ width: w, height: h });
  const mock = await mockKidSession(page, apps);
  await page.goto('/');
  return mock;
}

for (const [label, w, h] of [
  ['iPad portrait 820×1180', 820, 1180],
  ['iPad landscape 1180×820', 1180, 820],
] as const) {
  test.describe(`kid board — ${label}`, () => {
    test('renders only the kid shell: tiles by section, no admin or edit affordances', async ({ page }) => {
      await openBoard(page, w, h);
      await expect(page.getByTestId('tool-link')).toHaveCount(MAYA_APPS.length);
      await expect(page.getByTestId('box-title')).toHaveText(['Media', 'Photos']);
      for (const id of ['settings-gear', 'alert-bell', 'status-bar', 'tile-edit', 'add-box', 'width-selector']) {
        await expect(page.getByTestId(id), `${id} must not render for a kid`).toHaveCount(0);
      }
      await expect(page.getByTestId('app-grid')).toHaveAttribute('data-density', 'large');
      await expect(page.getByTestId('user-menu-trigger')).toContainText('Maya');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'the kid board scrolls sideways').toBeLessThanOrEqual(0);
    });

    test('every kid control is a ≥44px target nothing covers', async ({ page }) => {
      await openBoard(page, w, h);
      await expect(page.getByTestId('tool-link').first()).toBeVisible();
      const controls: [Locator, string][] = [
        [page.getByTestId('user-menu-trigger'), 'menu trigger'],
        [page.getByTestId('kid-favorites-toggle'), 'Pick favorites'],
        [page.getByTestId('launcher-trigger'), '⌘K trigger'],
        [page.getByTestId('tool-link').first(), 'first tile'],
        [page.getByTestId('tool-link').last(), 'last tile'],
      ];
      for (const [el, what] of controls) {
        await hitTestable(el, what);
        expect(await minSide(el), `${what} is under 44px`).toBeGreaterThanOrEqual(44);
      }
      await page.getByTestId('user-menu-trigger').click();
      const signOut = page.getByRole('menuitem', { name: 'Sign out' });
      await hitTestable(signOut, 'Sign out');
      expect((await signOut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });

    test('menu, favorites and ⌘K never call a route a kid is refused', async ({ page }) => {
      const mock = await openBoard(page, w, h);
      await expect(page.getByTestId('tool-link').first()).toBeVisible();

      await page.getByTestId('user-menu-trigger').click();
      const menu = page.getByTestId('user-menu');
      await expect(menu.getByRole('menuitem')).toHaveText(['Sign out']);
      await expect(menu.getByTestId('user-menu-role')).toHaveCount(0);
      // The kid may change its theme: that PATCH carries themePref only.
      await menu.getByTestId('theme-dark').click();
      await page.keyboard.press('Escape');

      await page.getByTestId('kid-favorites-toggle').click();
      await page.getByRole('button', { name: 'Pin Jellyfin to favorites' }).click();
      await expect.poll(() => mock.favorites).toEqual(['POST jellyfin']);
      await page.getByTestId('kid-favorites-toggle').click();

      await page.getByTestId('launcher-trigger').click();
      await expect(page.getByTestId('launcher-results').getByRole('option')).toHaveCount(MAYA_APPS.length);
      await page.keyboard.press('Escape');

      // A poll cycle on returning to the tab.
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await page.waitForTimeout(250);

      expect(mock.mePatches.every((b) => Object.keys(b).every((k) => k === 'themePref'))).toBe(true);
      expect(mock.forbidden, 'the kid board called a kid-forbidden route').toEqual([]);
    });
  });
}

test('empty board at 820: the plain-words empty state, nothing to tap', async ({ page }) => {
  await openBoard(page, 820, 1180, []);
  const empty = page.getByTestId('kid-empty');
  await expect(empty).toHaveText('No apps yet. Ask a grown-up to add some.');
  await expect(empty.getByRole('button')).toHaveCount(0);
  await expect(page.getByTestId('app-grid')).toHaveCount(0);
});

test('a device signed out from Accounts shows the normal login screen (TC-005)', async ({ page }) => {
  const mock = await openBoard(page, 820, 1180);
  await expect(page.getByTestId('tool-link').first()).toBeVisible();
  mock.revoke();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText('Sign in to your dashboard')).toBeVisible();
  await expect(page.getByText(/removed/i)).toHaveCount(0);
});

test('Sign out returns to the login screen', async ({ page }) => {
  await openBoard(page, 1180, 820);
  await page.getByTestId('user-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByText('Sign in to your dashboard')).toBeVisible();
});

test('a kid with the health bar on sees only their own apps counted, and no Retry', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await mockKidSession(page, MAYA_APPS, { user: { ...kidUser(), showHealthBar: true } });
  await page.goto('/');
  await expect(page.getByTestId('health-subline')).toContainText(`${MAYA_APPS.length} services`);
  await expect(page.getByTestId('health-retry')).toHaveCount(0);
});
