import { test, expect } from './fixtures';
import { mockApi, makeStatusTiles } from './mockApi';

// SPEC-ui-cleanup-18.3.0 AC-001 (#262) and AC-002 (#263) — the SHARED .status-dot
// (⌘K launcher rows, alert history), separate from the App Grid pip that SPEC-242
// already fixed. Read off the real cascade with getComputedStyle, in light and
// dark, on the launcher row the user actually sees.
//
// AC-001: every filled state carries a 1px definition ring, so even emerald,
//         amber and the grey UNKNOWN fill clear 3:1 on white (WCAG 1.4.11).
// AC-002: the glow follows the state. UNKNOWN (infra noise) gets the ring only,
//         NOT_MONITORED gets nothing, and only DOWN is rose.

const STATES = ['UP', 'DOWN', 'DEGRADED', 'UNKNOWN', 'NOT_MONITORED'];
const RING = { light: 'rgba(15, 23, 42, 0.55) 0px 0px 0px 1px', dark: 'rgba(255, 255, 255, 0.28) 0px 0px 0px 1px' };
const GLOW: Record<string, string | null> = {
  UP: 'rgba(16, 185, 129',
  DOWN: 'rgba(244, 63, 94',
  DEGRADED: 'rgba(251, 191, 36',
  UNKNOWN: null,
};

// WCAG relative luminance / contrast, for the composited ring on white.
const lum = ([r, g, b]: number[]) => {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

for (const scheme of ['light', 'dark'] as const) {
  test(`the shared status dot: ring on every filled state, glow by state (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const { services, categories } = makeStatusTiles(STATES);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockApi(page, services, categories, 'user');
    await page.goto('/');
    await page.getByTestId('launcher-trigger').click();
    await expect(page.getByTestId('launcher-result-status')).toHaveCount(STATES.length);

    const shadowOf = (state: string) =>
      page.locator(`[data-testid="launcher-result-status"][data-status="${state}"]`).evaluate((el) => getComputedStyle(el).boxShadow);

    for (const state of ['UP', 'DOWN', 'DEGRADED', 'UNKNOWN']) {
      const shadow = await shadowOf(state);
      expect(shadow, `${state} ring`).toContain(RING[scheme]);
      const glow = GLOW[state];
      if (glow) expect(shadow, `${state} glow`).toContain(glow);
      else expect(shadow, `${state} has the ring only`).toBe(RING[scheme]);
      if (state !== 'DOWN') expect(shadow, `${state} is never rose`).not.toContain('rgba(244, 63, 94');
    }
    expect(await shadowOf('NOT_MONITORED')).toBe('none');
  });
}

test('the light ring clears 3:1 against a white tile (WCAG 1.4.11)', () => {
  // rgba(15,23,42,0.55) composited on #fff.
  const a = 0.55;
  const ring = [15, 23, 42].map((c) => Math.round(c * a + 255 * (1 - a)));
  expect(contrast(ring, [255, 255, 255])).toBeGreaterThanOrEqual(3);
});
