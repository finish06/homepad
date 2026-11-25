import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { makeBoxes, mockApi } from './mockApi';

// SPEC-dashboard-empty-loading — the loading skeleton in a real browser.
// AC-002 (ghost tiles measure as real ones), AC-003 (no layout shift with a
// matching cache), AC-004 (the fallback keeps the first box and column), AC-005
// (the Recently opened row is reserved), AC-006 (the shape is written after a
// load), AC-007 (motion and reduced transparency), AC-008 (ghost contrast),
// AC-020 (a collapsed box is its header row only).
//
// The "returning visit" is real: a first load writes the shape cache, a reload
// holds GET /api/services so the skeleton stays up, and the release swaps in
// the grid. jsdom has no layout, so only this gate can see any of it.

const SHAPE_KEY = 'homepad.gridShape';

type BoxSnap = { x: number; y: number; w: number; h: number; cols: number[]; tile: { w: number; h: number } | null };
type Snap = { boxes: BoxSnap[]; footerTop: number; sectionTop: number };

// The real fixture: a 30-app box beside a 3-app box, then an empty full box.
const FIXTURE = makeBoxes([
  { width: 6, tools: Array.from({ length: 30 }, (_, i) => `App ${i + 1}`) },
  { width: 6, tools: ['Plex', 'Sonarr', 'Radarr'] },
  { width: 12, tools: [] },
]);

async function setup(
  page: Page,
  opts: {
    width: number;
    density?: 'large' | 'compact' | 'list';
    kid?: boolean;
    recent?: boolean;
    healthBar?: boolean;
    admin?: boolean;
  } = { width: 1440 },
) {
  await page.setViewportSize({ width: opts.width, height: 900 });
  await mockApi(page, FIXTURE.services, FIXTURE.categories, 'member', opts.density ?? 'large');
  // The health panel's chips and meter mount only once services load (StatusBar,
  // not this spec), which moves everything below it. The page-level checks run
  // with it hidden; one case below runs with it on and measures the grid inside
  // its own section. See the spec's AC-003 note.
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: opts.kid
        ? { id: 'kid-1', email: '', role: 'kid', themePref: 'system', showHealthBar: !!opts.healthBar }
        : {
            id: 'u1',
            email: 'nani@ohana.test',
            role: opts.admin ? 'admin' : 'member',
            themePref: 'system',
            showHealthBar: !!opts.healthBar,
          },
    }),
  );
  if (opts.recent) {
    await page.addInitScript(() => {
      if (!localStorage.getItem('homepad.recentlyOpened')) {
        localStorage.setItem('homepad.recentlyOpened', JSON.stringify(['svc-1', 'svc-31']));
      }
    });
  }
  // Sum every layout-shift from the moment the test says "start" (the first
  // paint of the skeleton) — see clsSince().
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) w.__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  let release: (() => void) | null = null;
  let held: Promise<void> | null = null;
  await page.route('**/api/services', async (route) => {
    if (held) await held;
    await route.fulfill({ json: { services: FIXTURE.services } });
  });
  return {
    hold() {
      held = new Promise<void>((r) => (release = r));
    },
    release() {
      release?.();
      held = null;
    },
  };
}

const frames = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function snap(page: Page, gridSelector: string): Promise<Snap> {
  return page.evaluate((sel) => {
    const grid = document.querySelector(sel)!;
    const boxes = Array.from(grid.querySelectorAll(':scope > .app-grid-box')).map((b) => {
      const r = b.getBoundingClientRect();
      const cols = Array.from(
        new Set(
          Array.from(b.querySelectorAll('.app-grid-tool-wrap')).map((t) =>
            Math.round(t.getBoundingClientRect().left),
          ),
        ),
      ).sort((a, c) => a - c);
      const t = b.querySelector('.app-grid-tool')?.getBoundingClientRect();
      return {
        x: r.left,
        y: r.top + window.scrollY,
        w: r.width,
        h: r.height,
        cols,
        tile: t ? { w: t.width, h: t.height } : null,
      };
    });
    const footer = document.querySelector('[data-testid="app-footer"]')!.getBoundingClientRect();
    const section = grid.closest('section:not(.app-grid-box)')!.getBoundingClientRect();
    return { boxes, footerTop: footer.top + window.scrollY, sectionTop: section.top + window.scrollY };
  }, gridSelector);
}
const SKELETON = '[data-testid="app-grid-loading"] .app-grid';
const REAL = '[data-testid="app-grid"]';

// First visit: let the grid load and write its shape (debounced 500 ms).
async function firstVisit(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('app-grid')).toBeVisible();
  await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), SHAPE_KEY), { timeout: 3000 }).not.toBeNull();
}

// Reload with services held; return the skeleton snapshot, the loaded one, and
// the layout shift summed from the skeleton's first paint to the loaded grid.
async function returningVisit(page: Page, api: Awaited<ReturnType<typeof setup>>) {
  api.hold();
  await page.reload();
  await expect(page.getByTestId('app-grid-loading')).toBeVisible();
  await frames(page);
  const skeleton = await snap(page, SKELETON);
  const base = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  api.release();
  await expect(page.getByTestId('app-grid')).toBeVisible();
  await frames(page);
  await page.waitForTimeout(200);
  const real = await snap(page, REAL);
  const cls = (await page.evaluate(() => (window as unknown as { __cls: number }).__cls)) - base;
  return { skeleton, real, cls };
}

// The grid's own placement: a box's top measured from the top of the content
// section that holds the grid. Used for adults, whose health panel (StatusBar)
// grows when services arrive and moves the whole section — see the spec's
// AC-003 note; the skeleton cannot and does not try to hide that.
const relY = (s: Snap, i: number) => s.boxes[i].y - s.sectionTop;

function expectSameGrid(skeleton: Snap, real: Snap, y: (s: Snap, i: number) => number) {
  expect(skeleton.boxes).toHaveLength(real.boxes.length);
  for (let i = 0; i < real.boxes.length; i++) {
    expect(Math.abs(skeleton.boxes[i].x - real.boxes[i].x)).toBeLessThanOrEqual(1);
    expect(Math.abs(y(skeleton, i) - y(real, i))).toBeLessThanOrEqual(1);
    expect(skeleton.boxes[i].cols).toEqual(real.boxes[i].cols);
    expect(Math.abs(skeleton.boxes[i].w - real.boxes[i].w)).toBeLessThanOrEqual(1);
    expect(Math.abs(skeleton.boxes[i].h - real.boxes[i].h)).toBeLessThanOrEqual(1);
  }
}

test.describe('dashboard skeleton — geometry (AC-002, AC-003, AC-005)', () => {
  for (const width of [390, 1440, 1920]) {
    // A kid has no health panel (SPEC-kid-accounts OQ-3), so nothing else on the
    // page changes height on load: the page-level layout-shift sum is the
    // skeleton's alone.
    test(`a matching cache loads with no layout shift at ${width}px (AC-003, page level)`, async ({ page }) => {
      const api = await setup(page, { width, kid: true });
      await firstVisit(page);
      const { skeleton, real, cls } = await returningVisit(page, api);
      expect(cls).toBeLessThan(0.01);
      // Every box corner, size and tile column holds, and so does the footer.
      expectSameGrid(skeleton, real, (s, i) => s.boxes[i].y);
      expect(Math.abs(skeleton.footerTop - real.footerTop)).toBeLessThanOrEqual(1);
    });

    test(`a matching cache: an adult's grid does not move inside its section at ${width}px (AC-003)`, async ({
      page,
    }) => {
      const api = await setup(page, { width, healthBar: true });
      await firstVisit(page);
      const { skeleton, real } = await returningVisit(page, api);
      expectSameGrid(skeleton, real, relY);
      // … and the grid ends where it did: the footer holds relative to the section.
      const below = (x: Snap) => x.footerTop - x.sectionTop;
      expect(Math.abs(below(skeleton) - below(real))).toBeLessThanOrEqual(1);
    });
  }

  // The admin's empty box carries the Browse the App Library button; the
  // skeleton reserves its height so that box does not grow on load.
  test("a matching cache: an admin's grid, empty box and all, does not move (AC-003)", async ({ page }) => {
    const api = await setup(page, { width: 1440, admin: true });
    await firstVisit(page);
    await expect(page.getByTestId('box-add-from-library')).toBeVisible();
    const { skeleton, real } = await returningVisit(page, api);
    expectSameGrid(skeleton, real, relY);
    // … and the grid ends where it did: the footer holds relative to the section.
    const below = (x: Snap) => x.footerTop - x.sectionTop;
    expect(Math.abs(below(skeleton) - below(real))).toBeLessThanOrEqual(1);
  });

  const cases: { density: 'large' | 'compact' | 'list'; width: number; kid?: boolean }[] = [
    { density: 'large', width: 1440 },
    { density: 'compact', width: 1440 },
    { density: 'list', width: 1440 },
    { density: 'large', width: 390 },
    { density: 'compact', width: 390 },
    { density: 'list', width: 390 },
    { density: 'large', width: 1440, kid: true },
  ];
  for (const c of cases) {
    test(`a ghost tile measures as a real one: ${c.kid ? 'kid ' : ''}${c.density} at ${c.width}px (AC-002)`, async ({
      page,
    }) => {
      const api = await setup(page, c);
      await firstVisit(page);
      const { skeleton, real } = await returningVisit(page, api);
      const g = skeleton.boxes[0].tile!;
      const r = real.boxes[0].tile!;
      expect(Math.abs(g.w - r.w)).toBeLessThanOrEqual(1);
      expect(Math.abs(g.h - r.h)).toBeLessThanOrEqual(1);
      if (c.density === 'large' && c.width === 1440) expect(Math.round(g.w)).toBe(190);
      if (c.density === 'compact' && c.width === 1440) {
        expect(Math.round(g.w)).toBe(236);
        expect(Math.round(g.h)).toBe(68);
      }
      if (c.density === 'list') expect(Math.round(g.h)).toBe(44);
      // The kid's grid is Large whatever the device cache says.
      if (c.kid) {
        await expect(page.locator(REAL)).toHaveAttribute('data-density', 'large');
      }
    });
  }

  test('the Recently opened row is reserved when the cache says it drew (AC-005)', async ({ page }) => {
    const api = await setup(page, { width: 1440, recent: true });
    await firstVisit(page);
    await expect(page.getByTestId('recently-opened-row')).toBeVisible();
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), SHAPE_KEY))!).recent).toBe(true);
    const inSection = (id: string) =>
      page.evaluate((tid) => {
        const el = document.querySelector(`[data-testid="${tid}"]`)!;
        const r = el.getBoundingClientRect();
        const sec = el.closest('section')!.getBoundingClientRect();
        return { y: r.top - sec.top, h: r.height };
      }, id);
    api.hold();
    await page.reload();
    await expect(page.getByTestId('skeleton-recent')).toBeVisible();
    const ghost = await inSection('skeleton-recent');
    api.release();
    await expect(page.getByTestId('recently-opened-row')).toBeVisible();
    const row = await inSection('recently-opened-row');
    expect(Math.abs(ghost.y - row.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(ghost.h - row.h)).toBeLessThanOrEqual(1);
  });

  test('the full returning visit with the row shifts nothing (AC-003 + AC-005)', async ({ page }) => {
    const api = await setup(page, { width: 1440, recent: true, kid: true });
    await firstVisit(page);
    await expect(page.getByTestId('recently-opened-row')).toBeVisible();
    const { skeleton, real, cls } = await returningVisit(page, api);
    expect(cls).toBeLessThan(0.01);
    expectSameGrid(skeleton, real, (s, i) => s.boxes[i].y);
  });
});

test.describe('dashboard skeleton — the fallback (AC-004, AC-019)', () => {
  const firstColumn = (s: Snap) => s.boxes[0].cols[0];

  test('with no cache the first box top and first tile column still land where the grid puts them', async ({
    page,
  }) => {
    const api = await setup(page, { width: 1440 });
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const skeleton = await snap(page, SKELETON);
    expect(skeleton.boxes).toHaveLength(3); // two half boxes and one full box
    api.release();
    await expect(page.getByTestId('app-grid')).toBeVisible();
    const real = await snap(page, REAL);
    expect(Math.abs(relY(skeleton, 0) - relY(real, 0))).toBeLessThanOrEqual(1);
    expect(Math.abs(firstColumn(skeleton) - firstColumn(real))).toBeLessThanOrEqual(1);
  });

  test('a cache for another user draws the fallback, never that user\'s shape', async ({ page }) => {
    const api = await setup(page, { width: 1440 });
    await page.addInitScript((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({ v: 1, user: 'someone-else', recent: true, boxes: [{ span: 12, count: 40, collapsed: false }] }),
      );
    }, SHAPE_KEY);
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const skeleton = await snap(page, SKELETON);
    expect(skeleton.boxes).toHaveLength(3);
    await expect(page.getByTestId('skeleton-recent')).toHaveCount(0);
    api.release();
    await expect(page.getByTestId('app-grid')).toBeVisible();
    const real = await snap(page, REAL);
    expect(Math.abs(relY(skeleton, 0) - relY(real, 0))).toBeLessThanOrEqual(1);
    expect(Math.abs(firstColumn(skeleton) - firstColumn(real))).toBeLessThanOrEqual(1);
    // The next load overwrites it with this user's shape.
    await expect
      .poll(async () => JSON.parse((await page.evaluate((k) => localStorage.getItem(k), SHAPE_KEY))!).user)
      .toBe('u1');
  });

  test('a collapsed box draws as its header row only, at its full width (AC-020)', async ({ page }) => {
    const api = await setup(page, { width: 1440 });
    await page.addInitScript((k) => {
      localStorage.setItem(
        k,
        JSON.stringify({
          v: 1,
          user: 'u1',
          recent: false,
          boxes: [
            { span: 6, count: 30, collapsed: true },
            { span: 6, count: 30, collapsed: false },
          ],
        }),
      );
    }, SHAPE_KEY);
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const s = await snap(page, SKELETON);
    expect(s.boxes[0].tile).toBeNull();
    expect(Math.abs(s.boxes[0].w - s.boxes[1].w)).toBeLessThanOrEqual(1);
    const header = await page.locator(`${SKELETON} .app-grid-box`).first().locator('.app-grid-box-header').boundingBox();
    // Header plus the box's 16px padding top and bottom, nothing more.
    expect(Math.abs(s.boxes[0].h - (header!.height + 32))).toBeLessThanOrEqual(1);
  });
});

test.describe('dashboard skeleton — motion, transparency, contrast (AC-007, AC-008)', () => {
  test('reduced motion: nothing under the skeleton animates', async ({ page }) => {
    const api = await setup(page, { width: 1440 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const r = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="app-grid-loading"]')!;
      const running = document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target;
          return t instanceof Element && root.contains(t);
        }).length;
      const ghost = root.querySelector('.app-grid-skel')!;
      const bar = root.querySelector('.app-grid-skel-bar')!;
      return {
        running,
        ghost: getComputedStyle(ghost).animationName,
        bar: getComputedStyle(bar, '::before').animationName,
      };
    });
    expect(r).toEqual({ running: 0, ghost: 'none', bar: 'none' });
    api.release();
  });

  test('no-preference: the shimmer animates opacity only', async ({ page }) => {
    const api = await setup(page, { width: 1440 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const props = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="app-grid-loading"]')!;
      const anims = document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target;
        return t instanceof Element && root.contains(t);
      });
      const keys = new Set<string>();
      for (const a of anims) {
        for (const k of (a.effect as KeyframeEffect).getKeyframes()) {
          for (const p of Object.keys(k)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(p)) keys.add(p);
        }
      }
      return { count: anims.length, keys: [...keys] };
    });
    expect(props.count).toBeGreaterThan(0);
    expect(props.keys).toEqual(['opacity']);
    api.release();
  });

  test('reduced transparency: ghost boxes follow the real boxes\' near-solid rule', async ({ page }) => {
    const api = await setup(page, { width: 1440 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    api.hold();
    await page.goto('/');
    await expect(page.getByTestId('app-grid-loading')).toBeVisible();
    const look = (sel: string) =>
      page.evaluate((s) => {
        const cs = getComputedStyle(document.querySelector(s)!);
        return { bg: cs.backgroundColor, filter: cs.backdropFilter };
      }, sel);
    const ghost = await look(`${SKELETON} > .app-grid-box`);
    api.release();
    await expect(page.getByTestId('app-grid')).toBeVisible();
    const real = await look(`${REAL} > .app-grid-box`);
    expect(ghost).toEqual(real);
    expect(ghost.filter).toBe('none');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`ghost shapes keep 3:1 against the box in ${scheme} mode (AC-008)`, async ({ page }) => {
      const api = await setup(page, { width: 1440 });
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      api.hold();
      await page.goto('/');
      await expect(page.getByTestId('app-grid-loading')).toBeVisible();
      const ratio = await page.evaluate(() => {
        const parse = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number);
          return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 };
        };
        const over = (top: string, under: string) => {
          const t = parse(top);
          const u = parse(under);
          return { r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a) };
        };
        const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
          const f = (v: number) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const root = getComputedStyle(document.documentElement);
        const box = getComputedStyle(document.querySelector('[data-testid="app-grid-loading"] .app-grid-box')!).backgroundColor;
        const ghost = getComputedStyle(document.querySelector('[data-testid="app-grid-loading"] .app-grid-skel')!).backgroundColor;
        const bar = getComputedStyle(
          document.querySelector('[data-testid="app-grid-loading"] .app-grid-skel-bar')!,
          '::before',
        ).backgroundColor;
        // The box is translucent glass: composite it over both ends of the page
        // gradient and keep the worse ratio.
        const ratios: number[] = [];
        for (const v of ['--bg-1', '--bg-2']) {
          const page = root.getPropertyValue(v).trim();
          const hex = page.replace('#', '');
          const pageRgb = `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
          const boxRgb = over(box, pageRgb);
          const boxCss = `rgb(${boxRgb.r}, ${boxRgb.g}, ${boxRgb.b})`;
          for (const g of [ghost, bar]) ratios.push(contrast(lum(over(g, boxCss)), lum(boxRgb)));
        }
        return Math.min(...ratios);
      });
      expect(ratio).toBeGreaterThanOrEqual(3);
      api.release();
    });
  }
});
