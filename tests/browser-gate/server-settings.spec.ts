import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { mockApi, makeStatusTiles } from './mockApi';
import { mockServerSettings } from './serverSettingsMocks';

// SPEC-admin-server-settings UX §2.3, §8, §10 — what only a real browser shows:
// the rows stack at phone width with no sideways scroll, every button is a
// 44px target there, a confirm dialog traps a real Tab and Escape closes only
// it, and the UI badge's accent text clears 4.5:1 in light and dark.

async function openSystem(page: Page, width: number, height: number, scheme: 'light' | 'dark' = 'light') {
  const { services, categories } = makeStatusTiles(['UP']);
  await page.setViewportSize({ width, height });
  await page.emulateMedia({ colorScheme: scheme });
  await mockApi(page, services as never, categories, 'admin');
  const mock = await mockServerSettings(page, {
    over: {
      GATUS_BASE_URL: {
        value: 'https://status.example.com/a/very/long/path/that/has/to/wrap/on/a/phone',
        source: 'ui',
        updatedAt: '2026-11-23T18:04:00Z',
        updatedBy: { id: 'u1', name: 'Caleb' },
      },
    },
  });
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  await expect(page.getByTestId('setting-row-GATUS_BASE_URL')).toBeVisible();
  return mock;
}

for (const [label, w, h] of [['phone 390', 390, 844], ['desktop 1440', 1440, 900]] as const) {
  test(`${label} — no sideways scroll; rows fit the panel`, async ({ page }) => {
    await openSystem(page, w, h);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const panel = (await page.getByTestId('settings-panel').boundingBox())!;
    for (const key of ['GATUS_BASE_URL', 'OIDC_REDIRECT_URL', 'HOMEPAD_TRUSTED_PROXIES']) {
      const row = (await page.getByTestId(`setting-row-${key}`).boundingBox())!;
      expect(row.x + row.width, `${key} runs past the panel`).toBeLessThanOrEqual(panel.x + panel.width + 0.5);
    }
  });
}

test('phone 390 — the row stacks and its buttons are 44px tall', async ({ page }) => {
  await openSystem(page, 390, 844);
  const row = page.getByTestId('setting-row-GATUS_BASE_URL');
  const dt = (await row.locator('dt').boundingBox())!;
  const dd = (await row.locator('dd').boundingBox())!;
  expect(dd.y, 'value sits under the label').toBeGreaterThanOrEqual(dt.y + dt.height - 1);
  for (const name of ['Reset Gatus address to env', 'Edit Gatus address']) {
    const b = (await row.getByRole('button', { name }).boundingBox())!;
    // 43.5: the panel scales by a sub-pixel; 43.92 is a 44px box.
    expect(b.height, `${name} is ${b.height}px tall`).toBeGreaterThanOrEqual(43.5);
  }
});

test('a confirm dialog traps a real Tab, and Escape closes only the dialog', async ({ page }) => {
  const mock = await openSystem(page, 390, 844);
  const sw = page.getByTestId('setting-row-COOKIE_SECURE').getByRole('switch', { name: 'Secure cookies' });
  await sw.click();
  const dialog = page.getByRole('alertdialog', { name: 'Turn off secure cookies?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Turn off' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Admin Panel' })).toBeVisible();
  await expect(sw).toBeFocused();
  expect(mock.patches).toEqual([]);
});

// UX §10 — "the UI badge's accent tint must reach 4.5:1 for its text in light
// and dark. Measure before merge." Composites the badge background over the
// panel behind it, then measures the text against that.
for (const scheme of ['light', 'dark'] as const) {
  test(`the UI badge text clears 4.5:1 (${scheme})`, async ({ page }) => {
    await openSystem(page, 1440, 900, scheme);
    const badge = page.getByTestId('setting-row-GATUS_BASE_URL').locator('.settings-src-badge');
    await expect(badge).toHaveAttribute('data-source', 'ui');
    const ratio = await badge.evaluate((el) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      // Let the browser resolve any color syntax (color-mix, color(srgb …)) to RGBA.
      const rgba = (css: string): [number, number, number, number] => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#000';
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      };
      const over = (top: number[], under: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
      // Walk up to the first opaque background, then composite down.
      const layers: [number, number, number, number][] = [];
      let n: Element | null = el;
      while (n) {
        const c = rgba(getComputedStyle(n).backgroundColor);
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 1) break;
        n = n.parentElement;
      }
      const dark = document.documentElement.classList.contains('dark');
      let bg = dark ? [11, 13, 22] : [238, 243, 251];
      for (const l of layers.reverse()) bg = over(l, bg);
      const fg = over(rgba(getComputedStyle(el).color), bg);
      const lum = (c: number[]) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const [a, b] = [lum(fg), lum(bg)];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio, `UI badge contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
}
