import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// #428 — Kare §8.1: the click-action control is three ≥44px segments that fill the
// field at every width. That is GEOMETRY, which jsdom cannot see: the unit suite can
// assert `min-h-[44px]` and `flex-1` are present and still be green while the
// segments render 32px tall or "Inline overlay" wraps to two lines. So it is measured
// here, in a real browser, at the two widths §8.1.3 names.

async function openTileEditor(page: import('@playwright/test').Page, width: number, height: number) {
  const { services, categories } = makeStatusTiles(['UP']);
  await page.setViewportSize({ width, height });
  await mockApi(page, services as never, categories, 'admin');
  await page.goto('/');
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByTestId('tile-edit').first().click();
  await expect(page.getByRole('group', { name: 'Click action' })).toBeVisible();
}

const SEGMENTS = ['tile-click-action-new_tab', 'tile-click-action-same_tab', 'tile-click-action-iframe'];

// iPad portrait (the primary device), the phone width §8.1.3 calls out, and 320px —
// the narrowest width this app supports (the #405 header guard tests it too).
//
// 320 is the case that gives the `whitespace-nowrap` assertion teeth. Measured:
// without nowrap, "Inline overlay" wraps to TWO lines at 320, 340 and 360px and only
// holds together from 375. Testing at 375 and 768 alone — this file's first draft —
// passed with nowrap removed, i.e. it could not fail.
for (const [label, w, h] of [['iPad 768', 768, 1024], ['phone 375', 375, 812], ['smallest phone 320', 320, 640]] as const) {
  test(`§8.1.3/8.1.5 — segments are ≥44px tall, fill the field, and never wrap — ${label}`, async ({ page }) => {
    await openTileEditor(page, w, h);
    const boxes = [];
    for (const id of SEGMENTS) boxes.push((await page.getByTestId(id).boundingBox())!);

    for (const b of boxes) expect(b.height, `segment height ${b.height}`).toBeGreaterThanOrEqual(44);

    // Equal widths hold from 375 up — the widths §8.1.3 sizes for (~108px a segment).
    // At 320 each equal share is ~79px and "Inline overlay" needs ~96px; with nowrap,
    // flex-1 cannot shrink it below that, so it takes 96 and the others ~72. Readable
    // on one line beats equal on two — nowrap wins there, and the PR flags it to Kare.
    const widths = boxes.map((b) => b.width);
    if (w >= 375) expect(Math.max(...widths) - Math.min(...widths), `widths ${widths}`).toBeLessThanOrEqual(1.5);

    // §8.1.3: white-space: nowrap so "Inline overlay" never wraps mid-word. Measured
    // as the label's own line count, not inferred from the class.
    const lines = await page.getByTestId('tile-click-action-iframe').evaluate((el) => {
      const r = document.createRange(); r.selectNodeContents(el);
      return new Set(Array.from(r.getClientRects()).map((x) => Math.round(x.top))).size;
    });
    expect(lines, '"Inline overlay" must sit on one line').toBe(1);
    // And the label must not be clipped by its own segment.
    const fits = await page.getByTestId('tile-click-action-iframe').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    expect(fits, '"Inline overlay" overflows its segment').toBe(true);

    // The control spans the field column (flex-1 ×3 inside w-full).
    const group = (await page.getByRole('group', { name: 'Click action' }).boundingBox())!;
    const sum = widths.reduce((a, b) => a + b, 0);
    expect(group.width - sum, 'segments should fill the group (only the 2px border/padding left)').toBeLessThanOrEqual(8);
    // ...and never pushes past the viewport, which an unshrinkable label could do.
    expect(group.x + group.width, 'group overflows the viewport').toBeLessThanOrEqual(w);
  });
}

test('§8.1.5 — Tab walks the three segments in order; Enter selects without saving', async ({ page }) => {
  let patched = 0;
  await page.route('**/api/services/**', (route) => {
    if (route.request().method() === 'PATCH') patched += 1;
    return route.fallback();
  });
  await openTileEditor(page, 768, 1024);
  await page.getByTestId(SEGMENTS[0]).focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId(SEGMENTS[1])).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId(SEGMENTS[2])).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId(SEGMENTS[2])).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tile-click-action-hint')).toContainText('Some sites block embedding');
  expect(patched, 'selecting a segment must not PATCH — only Save does').toBe(0);
});

test('§8.1.4 — the active segment is white on indigo (≥4.5:1), in light and dark', async ({ page }) => {
  await openTileEditor(page, 768, 1024);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const [fg, bg] = await page.getByTestId(SEGMENTS[0]).evaluate((el) => {
      const s = getComputedStyle(el); return [s.color, s.backgroundColor];
    });
    const lum = (c: string) => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number).map((v) => {
        const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (L1 + 0.05) / (L2 + 0.05);
    expect(ratio, `${scheme}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  }
});
