import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { INFO_OFF, INFO_ON, mockWidgets } from './widgetMocks';

// SPEC-health-widget — the widget area in a real browser, where jsdom can't
// see layout: AC-023 (one row at 1440px and up, health below under that, no
// horizontal scroll), AC-024 (#745: no layout shift from first paint to
// loaded when the caches match) and AC-026 (reduced motion and transparency).

type Box = { x: number; y: number; w: number; h: number };

async function boxOf(page: Page, testId: string): Promise<Box | null> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, testId);
}

const scrollWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

async function open(page: Page, width: number, opts: Parameters<typeof mockWidgets>[1] = {}) {
  await page.setViewportSize({ width, height: 900 });
  const mock = await mockWidgets(page, { density: 'compact', info: INFO_ON, ...opts });
  await page.goto('/');
  await expect(page.getByTestId('tool-link').first()).toBeVisible();
  return mock;
}

test.describe('layout (AC-023)', () => {
  for (const width of [1440, 1920]) {
    test(`${width}: clock, weather and health on one row; health takes the rest`, async ({ page }) => {
      await open(page, width);
      await expect(page.getByTestId('glance-time')).toBeVisible();
      await expect(page.getByTestId('glance-weather')).toBeVisible();
      const area = (await boxOf(page, 'widget-area'))!;
      const [c, w, h] = await Promise.all(['widget-clock', 'widget-weather', 'widget-health'].map((id) => boxOf(page, id)));
      expect(Math.abs(c!.y - h!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(w!.y - h!.y)).toBeLessThanOrEqual(1);
      expect(c!.x).toBeLessThan(w!.x);
      expect(w!.x + w!.w).toBeLessThanOrEqual(h!.x);
      expect(Math.abs(h!.x + h!.w - (area.x + area.w))).toBeLessThanOrEqual(1);
      expect(h!.w).toBeGreaterThan(c!.w + w!.w);
      // One row: the cards are as tall as each other.
      expect(Math.abs(c!.h - h!.h)).toBeLessThanOrEqual(1);
      expect(await scrollWidth(page)).toBeLessThanOrEqual(width);
    });
  }

  // Kare, #772: one row only from 1440px; below that health is too narrow
  // beside the clock and weather.
  for (const width of [1100, 800, 390]) {
    test(`${width}: clock and weather share the first row, health is full width below`, async ({ page }) => {
      await open(page, width);
      await expect(page.getByTestId('glance-time')).toBeVisible();
      const area = (await boxOf(page, 'widget-area'))!;
      const [c, w, h] = await Promise.all(['widget-clock', 'widget-weather', 'widget-health'].map((id) => boxOf(page, id)));
      expect(Math.abs(c!.y - w!.y)).toBeLessThanOrEqual(1);
      expect(c!.x + c!.w).toBeLessThanOrEqual(w!.x);
      expect(h!.y).toBeGreaterThanOrEqual(c!.y + c!.h);
      expect(Math.abs(h!.w - area.w)).toBeLessThanOrEqual(1);
      expect(await scrollWidth(page)).toBeLessThanOrEqual(width);
    });
  }

  test('1440, health hidden: clock and weather share the row', async ({ page }) => {
    await open(page, 1440, { hiddenWidgets: ['health'] });
    await expect(page.getByTestId('glance-time')).toBeVisible();
    const area = (await boxOf(page, 'widget-area'))!;
    const c = (await boxOf(page, 'widget-clock'))!;
    const w = (await boxOf(page, 'widget-weather'))!;
    expect(Math.abs(c.y - w.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.w - w.w)).toBeLessThanOrEqual(1);
    expect(c.w + w.w).toBeGreaterThan(area.w * 0.9);
  });

  test('1440, only health: full width', async ({ page }) => {
    await open(page, 1440, { info: INFO_OFF });
    await expect(page.getByTestId('health-headline')).toBeVisible();
    const area = (await boxOf(page, 'widget-area'))!;
    const h = (await boxOf(page, 'widget-health'))!;
    expect(Math.abs(h.w - area.w)).toBeLessThanOrEqual(1);
    await expect(page.getByTestId('widget-clock')).toHaveCount(0);
  });

  test('nothing on or shown: no area and no gap above the grid', async ({ page }) => {
    await open(page, 1440, { info: { ...INFO_OFF, health: { enabled: false } } });
    await expect(page.getByTestId('widget-area')).toHaveCount(0);
    await expect(page.getByTestId('status-bar')).toHaveCount(0);
    const gap = await page.evaluate(() => {
      const header = document.querySelector('header')!.getBoundingClientRect();
      const section = document.querySelector('main section')!.getBoundingClientRect();
      return section.top - header.bottom;
    });
    expect(gap).toBeLessThanOrEqual(1);
  });

  // The health card's glass is a stacking context; the quick-peek popover
  // must still sit over the grid below it, not under the app boxes.
  test('the quick-peek popover opens over the grid', async ({ page }) => {
    await open(page, 1440);
    await page.getByTestId('status-bar-up').click();
    const popover = page.getByTestId('status-peek-popover');
    await expect(popover).toBeVisible();
    // Every row of the popover is on top, at its left, middle and right,
    // including where it crosses a tile.
    const covered = await popover.evaluate((pop) =>
      Array.from(pop.querySelectorAll('a')).flatMap((el) => {
        const r = el.getBoundingClientRect();
        return [0.1, 0.5, 0.9]
          .map((f) => document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2))
          .filter((top) => !top || !el.contains(top))
          .map((top) => `${el.textContent}: ${top?.className ?? 'nothing'}`);
      }),
    );
    expect(covered).toEqual([]);
    const grid = (await boxOf(page, 'app-grid'))!;
    const pop = (await popover.boundingBox())!;
    expect(pop.y + pop.height).toBeGreaterThan(grid.y);
  });

  test('390, details hidden: the verdict-only card, counts on their own line', async ({ page }) => {
    await open(page, 390, { hiddenWidgets: ['healthDetails'] });
    await expect(page.getByTestId('health-subline')).toContainText('6 online');
    await expect(page.getByTestId('health-meter')).toHaveCount(0);
    expect(await scrollWidth(page)).toBeLessThanOrEqual(390);
  });
});

// AC-024 (#745) — with the caches matching the loaded state, the page doesn't
// move from first paint to loaded: the services load, the info read and the
// clock/weather chunk all land inside space already held.
test.describe('no layout shift on load (AC-024)', () => {
  for (const role of ['admin', 'member'] as const)
    for (const details of [true, false])
      for (const clockWeather of [true, false])
        for (const width of [390, 1440, 1920]) {
          const name = `${role}, details ${details ? 'on' : 'off'}, clock+weather ${clockWeather ? 'on' : 'off'}, ${width}px`;
          test(name, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await mockWidgets(page, {
              role,
              density: 'compact',
              info: clockWeather ? INFO_ON : INFO_OFF,
              hiddenWidgets: details ? [] : ['healthDetails'],
            });
            // Held routes registered after the mock win; they pass on to it.
            let held: Promise<void> | null = null;
            let release = () => {};
            for (const glob of ['**/api/services', '**/api/widgets/info']) {
              await page.route(glob, async (route) => {
                if (held) await held;
                await route.fallback();
              });
            }
            await page.addInitScript(() => {
              const w = window as unknown as { __cls: number };
              w.__cls = 0;
              new PerformanceObserver((list) => {
                for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
                  if (!e.hadRecentInput) w.__cls += e.value;
                }
              }).observe({ type: 'layout-shift', buffered: true });
            });

            // First visit: the household, hidden-widgets and grid caches fill.
            await page.goto('/');
            await expect(page.getByTestId('app-grid')).toBeVisible();
            if (clockWeather) await expect(page.getByTestId('glance-weather')).toBeVisible();
            await expect
              .poll(() => page.evaluate(() => localStorage.getItem('homepad.gridShape')), { timeout: 3000 })
              .not.toBeNull();

            // Returning visit, with services and the info read held.
            held = new Promise<void>((r) => (release = r));
            await page.reload();
            await expect(page.getByTestId('health-headline')).toHaveText('Checking services…');
            release();
            held = null;
            await expect(page.getByTestId('app-grid')).toBeVisible();
            await expect(page.getByTestId('health-headline')).toHaveText('All systems operational');
            if (clockWeather) {
              await expect(page.getByTestId('glance-time')).toBeVisible();
              await expect(page.getByTestId('glance-weather')).toBeVisible();
            }
            await page.waitForTimeout(300);
            const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
            expect(cls).toBeLessThan(0.01);
          });
        }

  // #771 — how the loading and the loaded copy wrap depends on the font. Sweep
  // the phone widths, where the text sits nearest a wrap, so a different
  // font's metrics can't hide a height change: the health card is as tall
  // loading as loaded at every width.
  for (const details of [true, false]) {
    test(`the health card holds its height across phone widths, details ${details ? 'on' : 'off'} (#771)`, async ({
      page,
    }) => {
      await mockWidgets(page, { density: 'compact', info: INFO_OFF, hiddenWidgets: details ? [] : ['healthDetails'] });
      let held: Promise<void> | null = null;
      let release = () => {};
      await page.route('**/api/services', async (route) => {
        if (held) await held;
        await route.fallback();
      });
      const off: string[] = [];
      for (let width = 320; width <= 480; width += 8) {
        await page.setViewportSize({ width, height: 900 });
        held = new Promise<void>((r) => (release = r));
        await page.goto('/');
        await expect(page.getByTestId('health-headline')).toHaveText('Checking services…');
        const loading = (await boxOf(page, 'widget-health'))!.h;
        release();
        held = null;
        await expect(page.getByTestId('health-headline')).toHaveText('All systems operational');
        const loaded = (await boxOf(page, 'widget-health'))!.h;
        if (Math.abs(loading - loaded) > 0.5) off.push(`${width}px: ${loading} → ${loaded}`);
      }
      expect(off).toEqual([]);
    });
  }
});

test.describe('motion and transparency (AC-026)', () => {
  test('reduced motion: nothing in the widget area animates or transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, 1440);
    await expect(page.getByTestId('glance-time')).toBeVisible();
    const moving = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="widget-area"] *'))
        .map((el) => getComputedStyle(el))
        .filter((cs) => cs.animationName !== 'none' || cs.transitionProperty.split(',').some((p, i) => {
          const d = cs.transitionDuration.split(',')[i] ?? cs.transitionDuration.split(',')[0];
          return p.trim() !== 'none' && parseFloat(d) > 0 && ['transform', 'all'].includes(p.trim());
        })).length,
    );
    expect(moving).toBe(0);
  });

  test('reduced transparency: every widget frame goes near-solid, with no blur', async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
    });
    await open(page, 1440);
    await expect(page.getByTestId('glance-time')).toBeVisible();
    const looks = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.widget')).map((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, filter: cs.backdropFilter };
      }),
    );
    expect(looks).toHaveLength(3);
    for (const l of looks) {
      expect(l.filter).toBe('none');
      const alpha = Number(/rgba?\([^)]*,\s*([\d.]+)\)$/.exec(l.bg)?.[1] ?? '1');
      expect(alpha).toBeGreaterThanOrEqual(0.9);
    }
  });
});
