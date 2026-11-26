import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { mockApi } from './mockApi';

// SPEC-group-header-collapse (#718) in a real browser: the box header's count
// pill, status bar, "N down" badge and chevron. jsdom has no layout, colour or
// real persistence round trip, so this gate owns:
//   AC-011  collapse, reload, still collapsed; per user
//   AC-014  the width selector, box drag and the ★/pencil with a collapsed box
//           in the saved set (the unchanged gates run with an empty set)
//   AC-015  one line for the metadata at every density, 390 and 1440, view and
//           admin arrange mode, never into the edit controls, no sideways scroll
//   AC-017  pill and badge text 4.5:1, bar bands 3:1, light and dark
//   §3.4    the chevron's hit area, and a folded box is its header row only

const base = {
  description: '',
  icon: '',
  favorite: false,
  iconLight: false,
  iconDark: false,
};
let n = 0;
const app = (categoryId: string, status: string, name?: string) => {
  n += 1;
  return { ...base, id: `svc-${n}`, slug: `svc-${n}`, name: name ?? `App ${n}`, url: `https://a${n}.test`, status, categoryId };
};

// A long title beside every kind of status, a one-app box, a quarter box and an
// empty box: the header's worst cases.
const CATEGORIES = [
  { id: 'cat-1', name: 'Media and home automation services', sortIndex: 0, gridWidth: 6 },
  { id: 'cat-2', name: 'Games', sortIndex: 1, gridWidth: 6 },
  { id: 'cat-3', name: 'Tools', sortIndex: 2, gridWidth: 3 },
  { id: 'cat-4', name: 'Empty', sortIndex: 3, gridWidth: 3 },
];
const SERVICES = [
  app('cat-1', 'UP', 'Plex'),
  app('cat-1', 'UP'),
  app('cat-1', 'DOWN'),
  app('cat-1', 'DEGRADED'),
  app('cat-1', 'UNKNOWN'),
  app('cat-1', 'NOT_MONITORED'),
  app('cat-2', 'UP', 'Steam'),
  app('cat-3', 'NOT_MONITORED'),
  app('cat-3', 'UNKNOWN'),
];

// The server's collapse sets, per user, with the real contract: GET returns the
// set, PUT replaces it and answers 204 with no body.
type Server = { sets: Record<string, string[]>; puts: string[][]; user: string };

async function setup(
  page: Page,
  opts: { width?: number; density?: 'large' | 'compact' | 'list'; role?: 'member' | 'admin'; sets?: Record<string, string[]> } = {},
): Promise<Server> {
  const server: Server = { sets: { u1: [], u2: [], ...opts.sets }, puts: [], user: 'u1' };
  await page.setViewportSize({ width: opts.width ?? 1440, height: 900 });
  await mockApi(page, SERVICES, CATEGORIES, opts.role ?? 'member', opts.density ?? 'large');
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: { id: server.user, email: `${server.user}@ohana.test`, role: opts.role ?? 'member', themePref: 'system', showHealthBar: false },
    }),
  );
  await page.route('**/api/me/collapsed-categories', async (route) => {
    const req = route.request();
    if (req.method() === 'PUT') {
      const ids = (req.postDataJSON() as { collapsed: string[] }).collapsed;
      server.puts.push(ids);
      server.sets[server.user] = ids.filter((id) => CATEGORIES.some((c) => c.id === id));
      return route.fulfill({ status: 204, body: '' });
    }
    return route.fulfill({ json: { collapsed: server.sets[server.user] ?? [] } });
  });
  return server;
}

const box = (page: Page, id: string) => page.locator(`[data-box-id="${id}"]`);

async function enterArrange(page: Page) {
  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByTestId('tile-favorite').first().waitFor({ state: 'visible' });
}

test.describe('saved per user (AC-011)', () => {
  test('collapse, reload, still collapsed; the second user stays expanded', async ({ page }) => {
    const server = await setup(page);
    await page.goto('/');
    const chevron = box(page, 'cat-2').getByRole('button', { name: 'Games apps' });
    await expect(chevron).toHaveAttribute('aria-expanded', 'true');
    await chevron.click();
    await expect(chevron).toHaveAttribute('aria-expanded', 'false');
    await expect(box(page, 'cat-2').getByTestId('box-tools')).toHaveCount(0);
    await expect.poll(() => server.puts).toEqual([['cat-2']]);

    await page.reload();
    await expect(page.getByTestId('app-grid')).toBeVisible();
    await expect(box(page, 'cat-2').getByRole('button', { name: 'Games apps' })).toHaveAttribute('aria-expanded', 'false');
    await expect(box(page, 'cat-2').getByTestId('box-tools')).toHaveCount(0);
    await expect(box(page, 'cat-1').getByTestId('box-tools')).toHaveCount(1);

    // User B on the same device: their own (empty) set.
    server.user = 'u2';
    await page.reload();
    await expect(page.getByTestId('app-grid')).toBeVisible();
    await expect(box(page, 'cat-2').getByRole('button', { name: 'Games apps' })).toHaveAttribute('aria-expanded', 'true');
    await expect(box(page, 'cat-2').getByTestId('box-tools')).toHaveCount(1);
    expect(server.sets.u1).toEqual(['cat-2']);
    expect(server.puts).toHaveLength(1);
  });
});

test.describe('the folded box (§3.4, AC-007)', () => {
  for (const density of ['large', 'compact', 'list'] as const) {
    test(`at ${density}: header row only, same width, header height unchanged, neighbours stay put`, async ({ page }) => {
      await setup(page, { density });
      await page.goto('/');
      await expect(page.getByTestId('app-grid')).toBeVisible();
      const geo = () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('[data-testid="app-grid"] > .app-grid-box')).map((b) => {
            const r = b.getBoundingClientRect();
            const h = b.querySelector('.app-grid-box-header')!.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height, header: h.height };
          }),
        );
      const before = await geo();
      await box(page, 'cat-1').getByTestId('box-chevron').click();
      await page.waitForTimeout(50);
      const after = await geo();
      // Same width, same place; only its height shrinks, to header + padding.
      expect(Math.abs(after[0].w - before[0].w)).toBeLessThanOrEqual(1);
      expect(Math.abs(after[0].x - before[0].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after[0].header - before[0].header)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(after[0].h - (after[0].header + 32))).toBeLessThanOrEqual(1);
      // Its row-mate keeps its x and width.
      expect(Math.abs(after[1].x - before[1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(after[1].w - before[1].w)).toBeLessThanOrEqual(1);
      // The header is the title's line height: the chevron, pill, badge and bar
      // add nothing to it (so the skeleton's header-only box matches).
      const title = await box(page, 'cat-1').getByTestId('box-title').boundingBox();
      expect(Math.abs(after[0].header - title!.height)).toBeLessThanOrEqual(0.5);
    });
  }

  // The gate's project has touch on, which is `pointer: coarse`: 44×44 at every
  // density there. A mouse-only context gets 24×24 at Compact and List.
  for (const touch of [false, true]) {
    test.describe(touch ? 'touch' : 'mouse', () => {
      test.use({ hasTouch: touch });
      for (const density of ['large', 'compact', 'list'] as const) {
        const side = touch || density === 'large' ? 44 : 24;
        test(`the chevron hit area at ${density} is ${side}×${side} and nothing covers it`, async ({ page }) => {
          await setup(page, { density });
          await page.goto('/');
          const c = box(page, 'cat-2').getByTestId('box-chevron');
          await expect(c).toBeVisible();
          const b = (await c.boundingBox())!;
          expect(Math.round(b.width)).toBe(side);
          expect(Math.round(b.height)).toBe(side);
          // Corners 3px in (the button's own 8px radius rounds off the very
          // corner), plus the centre: every one hits the chevron.
          const misses = await c.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const pts = [
              [r.left + 3, r.top + 3],
              [r.right - 3, r.top + 3],
              [r.left + 3, r.bottom - 3],
              [r.right - 3, r.bottom - 3],
              [r.left + r.width / 2, r.top + r.height / 2],
            ];
            return pts
              .filter(([x, y]) => !el.contains(document.elementFromPoint(x, y)))
              .map(([x, y]) => `${x},${y}: ${document.elementFromPoint(x, y)?.className}`);
          });
          expect(misses).toEqual([]);
        });
      }
    });
  }
});

test.describe('header fits (AC-015)', () => {
  for (const density of ['large', 'compact', 'list'] as const) {
    for (const width of [390, 1440]) {
      for (const mode of ['view', 'arrange'] as const) {
        test(`${density} at ${width}px, ${mode}: title, pill, badge and bar on one line, clear of the edit controls`, async ({
          page,
        }) => {
          await setup(page, { density, width, role: mode === 'arrange' ? 'admin' : 'member' });
          await page.goto('/');
          await expect(page.getByTestId('app-grid')).toBeVisible();
          if (mode === 'arrange') {
            await enterArrange(page);
            await expect(page.getByTestId('width-selector').first()).toBeVisible();
          }
          const report = await page.evaluate(() => {
            const out: string[] = [];
            const boxes = Array.from(document.querySelectorAll('[data-testid="app-grid"] > .app-grid-box'));
            for (const b of boxes) {
              const id = b.getAttribute('data-box-id');
              const meta = ['.app-grid-box-chevron', '.app-grid-box-title', '.app-grid-box-count', '.app-grid-box-down', '.app-grid-box-bar']
                .map((s) => b.querySelector(s))
                .filter((e): e is Element => !!e)
                .map((e) => ({ cls: e.className, r: e.getBoundingClientRect() }));
              const mid = (r: DOMRect) => r.top + r.height / 2;
              const m0 = mid(meta[0].r);
              for (const m of meta) {
                if (Math.abs(mid(m.r) - m0) > 1.5) out.push(`${id}: ${m.cls} is not on the title's line`);
                if (m.r.width <= 0) out.push(`${id}: ${m.cls} has no width`);
              }
              // In order, left to right, without overlapping each other.
              for (let i = 1; i < meta.length; i++) {
                if (meta[i].r.left < meta[i - 1].r.right - 0.5) out.push(`${id}: ${meta[i].cls} overlaps ${meta[i - 1].cls}`);
              }
              const box = b.getBoundingClientRect();
              const bar = b.querySelector('.app-grid-box-bar');
              if (bar) {
                const r = bar.getBoundingClientRect();
                if (Math.abs(r.width - 64) > 0.5 || Math.abs(r.height - 5) > 0.5) out.push(`${id}: bar is ${r.width}×${r.height}`);
                if (r.right > box.right - 16 + 0.5) out.push(`${id}: bar runs past the box padding`);
                const segs = Array.from(bar.children).reduce((a, s) => a + s.getBoundingClientRect().width, 0);
                if (Math.abs(segs - 64) > 0.5) out.push(`${id}: bar segments sum to ${segs}`);
              }
              const controls = ['.app-grid-box-actions', '[data-testid="width-selector"]']
                .map((s) => b.querySelector(s))
                .filter((e): e is Element => !!e)
                .map((e) => e.getBoundingClientRect());
              for (const c of controls) {
                for (const m of meta) {
                  const r = m.r;
                  const overlap = r.left < c.right && c.left < r.right && r.top < c.bottom && c.top < r.bottom;
                  if (overlap) out.push(`${id}: ${m.cls} overlaps an edit control`);
                }
              }
            }
            const doc = document.documentElement;
            if (doc.scrollWidth > doc.clientWidth) out.push(`page scrolls sideways (${doc.scrollWidth} > ${doc.clientWidth})`);
            return { out, boxes: boxes.length };
          });
          expect(report.boxes).toBe(4);
          expect(report.out).toEqual([]);
          if (mode === 'arrange') await expect(page.getByTestId('box-chevron')).toHaveCount(0);
          else await expect(page.getByTestId('box-chevron')).toHaveCount(4);
        });
      }
    }
  }
});

test.describe('arrange mode with a collapsed box in the saved set (AC-013, AC-014)', () => {
  for (const density of ['large', 'compact', 'list'] as const) {
    test(`${density}: the folded box opens, its ★ and pencil each answer at their centre, and nothing is saved`, async ({
      page,
    }) => {
      const server = await setup(page, { density, role: 'admin', sets: { u1: ['cat-1', 'cat-2'] } });
      await page.goto('/');
      await expect(box(page, 'cat-1').getByTestId('box-tools')).toHaveCount(0);
      await enterArrange(page);
      await expect(box(page, 'cat-1').getByTestId('box-tools')).toHaveCount(1);
      await expect(page.getByTestId('box-chevron')).toHaveCount(0);
      const plex = page.locator('.app-grid-tool-wrap', { hasText: 'Plex' });
      for (const id of ['tile-favorite', 'tile-edit']) {
        const ok = await plex.getByTestId(id).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
        });
        expect(ok, `${id} is covered`).toBe(true);
        // The full 44px rule at Large is the #513 gate's; here, WCAG 2.5.8.
        const b = (await plex.getByTestId(id).boundingBox())!;
        expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(24);
      }
      // Box drag (keyboard path, the rearrange gate's recipe) still moves a
      // formerly folded box.
      const grip = box(page, 'cat-1').getByTestId('box-drag-handle');
      await grip.focus();
      await page.keyboard.press('Space');
      await expect(grip).toHaveAttribute('aria-pressed', 'true');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      await page.keyboard.press('Space');
      await expect
        .poll(async () => (await page.getByTestId('box-title').allTextContents())[0])
        .not.toBe('Media and home automation services');
      // The width selector still works on the formerly folded box.
      await box(page, 'cat-1').getByTestId('width-btn-12').click();
      await expect(box(page, 'cat-1').getByTestId('width-btn-12')).toHaveAttribute('aria-pressed', 'true');
      // Leaving the mode brings the saved state back; nothing was PUT.
      await page.getByTestId('settings-gear').click();
      await page.getByTestId('gear-edit-dashboard').click();
      await expect(box(page, 'cat-1').getByTestId('box-tools')).toHaveCount(0);
      await expect(box(page, 'cat-2').getByTestId('box-tools')).toHaveCount(0);
      expect(server.puts).toEqual([]);
    });
  }
});

test.describe('contrast (AC-017)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`pill and badge text keep 4.5:1, bar bands 3:1 against the box, in ${scheme} mode`, async ({ page }) => {
      await setup(page);
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.getByTestId('app-grid')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*dark).*$/);
      const r = await page.evaluate(() => {
        type C = { r: number; g: number; b: number; a: number };
        const parse = (c: string): C => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
        };
        const over = (top: C, under: C): C => ({
          r: top.r * top.a + under.r * (1 - top.a),
          g: top.g * top.a + under.g * (1 - top.a),
          b: top.b * top.a + under.b * (1 - top.a),
          a: 1,
        });
        const lum = ({ r, g, b }: C) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const contrast = (a: C, b: C) => {
          const [x, y] = [lum(a), lum(b)];
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const root = getComputedStyle(document.documentElement);
        const hex = (v: string): C => {
          const h = root.getPropertyValue(v).trim().replace('#', '');
          return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 };
        };
        const boxEl = document.querySelector('[data-box-id="cat-1"]')!;
        const boxBg = parse(getComputedStyle(boxEl).backgroundColor);
        const pill = boxEl.querySelector('.app-grid-box-count')!;
        const badge = boxEl.querySelector('.app-grid-box-down')!;
        const segs = Array.from(boxEl.querySelectorAll('.app-grid-box-bar-seg'));
        const res: Record<string, number> = {};
        // The box is translucent glass over the page gradient: check both ends.
        for (const v of ['--bg-1', '--bg-2']) {
          const box = over(boxBg, hex(v));
          for (const [name, el] of [
            ['pill', pill],
            ['badge', badge],
          ] as const) {
            const cs = getComputedStyle(el);
            const bg = over(parse(cs.backgroundColor), box);
            const ratio = contrast(over(parse(cs.color), bg), bg);
            res[name] = Math.min(res[name] ?? 99, ratio);
          }
          for (const s of segs) {
            const name = `bar ${s.className.replace('app-grid-box-bar-seg ', '')}`;
            const ratio = contrast(over(parse(getComputedStyle(s).backgroundColor), box), box);
            res[name] = Math.min(res[name] ?? 99, ratio);
          }
        }
        return res;
      });
      expect(Object.keys(r)).toEqual(['pill', 'badge', 'bar health-tick-up', 'bar health-tick-idle', 'bar health-tick-down']);
      expect(r.pill, JSON.stringify(r)).toBeGreaterThanOrEqual(4.5);
      expect(r.badge, JSON.stringify(r)).toBeGreaterThanOrEqual(4.5);
      for (const k of ['bar health-tick-up', 'bar health-tick-idle', 'bar health-tick-down']) {
        expect(r[k], `${k}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
