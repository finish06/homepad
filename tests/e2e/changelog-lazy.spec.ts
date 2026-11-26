import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';

// The changelog overlay (and src/changelog.json inside it) is a lazy chunk.
// tests/infra/bundle-budget.test.ts proves the chunk exists in dist/; this
// proves the built app does not fetch it on load and still opens it from the
// footer badge. Every endpoint is route-mocked, as in theme-mode.spec.ts.

const USER = { id: 'u1', email: 'lilo@ohana', role: 'member', themePref: 'light' };

async function seedUser(page: Page) {
  // Catch-all first, specifics after (later registration wins).
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.route('**/api/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }),
  );
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ oidcEnabled: false }) }),
  );
  await page.route('**/api/services', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ services: [] }) }),
  );
}

test('the changelog chunk loads only when the footer badge is clicked', async ({ page }) => {
  const chunks: string[] = [];
  page.on('request', (req) => {
    if (/\/assets\/ChangelogOverlay-[A-Za-z0-9_-]+\.js$/.test(req.url())) chunks.push(req.url());
  });
  await seedUser(page);
  await page.goto('/');

  const badge = page.getByRole('button', { name: 'Open changelog' });
  await expect(badge).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(chunks, 'ChangelogOverlay chunk fetched before the badge was clicked').toHaveLength(0);

  await badge.click();
  const dialog = page.getByRole('dialog', { name: 'Changelog' });
  await expect(dialog).toBeVisible();
  expect(chunks).toHaveLength(1);
  // The data came with it: the version list has releases in it.
  await expect(dialog.getByRole('navigation', { name: 'Versions' }).getByRole('button', { name: /^v\d/ }).first())
    .toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Keyboard path (AC-009): Enter on the focused badge opens it again, now from
  // the cached chunk, and Escape hands focus back to the badge. Driven by the
  // keyboard because WebKit does not focus a button on click, so a click-opened
  // dialog there has no trigger to return focus to.
  await badge.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close changelog' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(badge).toBeFocused();
  expect(chunks).toHaveLength(1);
});

// #590 — on the first load after an upgrade, What's new opens on its own at
// the running version; once closed, a reload leaves it closed. A browser with
// no record (the test above) never gets it.
test("What's new opens once on the first load after an upgrade", async ({ page }) => {
  const { version } = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as { version: string };
  await seedUser(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open changelog' })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Changelog' });
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('homepad:whats-new-seen'))).toBe(version);

  // As if this browser last saw an older release.
  await page.evaluate(() => localStorage.setItem('homepad:whats-new-seen', '0.0.1'));
  await page.reload();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: new RegExp(`^v${version.replace(/\./g, '\\.')}\\b`) })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await page.getByRole('button', { name: 'Close changelog' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Open changelog' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(dialog).toHaveCount(0);
});
