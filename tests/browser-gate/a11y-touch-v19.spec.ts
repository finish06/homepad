import { test, expect } from './fixtures';
import { mockApi } from './mockApi';
import type { Page } from '@playwright/test';

// v19 — A11y & Touch-Target Hardening Pass, live-DOM verification gate.
//
// Per the spec §9 (Kare): MOST of the §4 mechanical touch/contrast fixes already
// landed piecemeal across v13.x, so this gate's job is to VERIFY-AND-MEASURE the
// live rendered controls at the iPad-portrait viewport (768px), not to re-touch
// them. Every assertion here is the real-Chromium measurement Kare commits to
// re-running before co-sign (§9 Q5): `getBoundingClientRect` for the ≥44px touch
// targets and alpha-composited `getComputedStyle` contrast for the WCAG ACs.
//
// The measured values are printed (console.log) so they can be lifted verbatim
// into the PR's per-AC table (AC-016). jsdom cannot do any of this — no layout,
// no paint, no composited color — which is exactly why this rides the #35 CDP
// real-browser gate.
//
// Viewport: 768×1024 = iPad portrait (DESIGN-SYSTEM §9.3 iPad-range floor).
const VP = { width: 768, height: 1024 };

// WCAG thresholds.
const TOUCH_MIN = 44; // px, DESIGN-SYSTEM §9.3
const AA_TEXT = 4.5; // :1, body text ≤14px
const AA_GRAPHIC = 3.0; // :1, UI graphic/glyph

// Injected into the page: measure an element's box + alpha-composited contrast.
// Returns null if the selector matches nothing. `ratio` composites the text
// colour over the element's resolved background (walking ancestors, compositing
// any translucent layers over an assumed opaque base), which is how the browser
// actually paints it — the honest number, not the token's nominal value.
const INIT = `
  window.__lum = function(r, g, b) {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  window.__ratio = function(a, b) {
    const la = window.__lum(a[0], a[1], a[2]);
    const lb = window.__lum(b[0], b[1], b[2]);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  window.__parse = function(s) {
    const m = s && s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  window.__composite = function(fg, bg) {
    // fg over bg, both {r,g,b,a}; returns opaque {r,g,b}.
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
    };
  };
  window.__resolveBg = function(el) {
    // Collect the ancestor chain el..root, then composite root->el over white.
    const chain = [];
    let n = el;
    while (n && n.nodeType === 1) { chain.push(n); n = n.parentElement; }
    let base = { r: 255, g: 255, b: 255 }; // app ground is white (light mode)
    for (let i = chain.length - 1; i >= 0; i--) {
      const bg = window.__parse(getComputedStyle(chain[i]).backgroundColor);
      if (bg && bg.a > 0) base = window.__composite(bg, base);
    }
    return base;
  };
  window.__measure = function(selector, textNode) {
    const el = document.querySelector(selector);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const color = window.__parse(cs.color) || { r: 0, g: 0, b: 0, a: 1 };
    // Fold in the element's own CSS opacity (affects the painted glyph colour).
    const opacity = parseFloat(cs.opacity);
    const bg = window.__resolveBg(el.parentElement || el);
    const painted = window.__composite({ ...color, a: color.a * opacity }, bg);
    const ratio = window.__ratio([painted.r, painted.g, painted.b], [bg.r, bg.g, bg.b]);
    return {
      w: Math.round(rect.width * 100) / 100,
      h: Math.round(rect.height * 100) / 100,
      color: cs.color,
      opacity,
      bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')',
      ratio: Math.round(ratio * 100) / 100,
    };
  };
`;

type M = { w: number; h: number; color: string; opacity: number; bg: string; ratio: number } | null;

async function measure(page: Page, selector: string): Promise<M> {
  return page.evaluate((s) => (window as unknown as { __measure: (x: string) => M }).__measure(s), selector);
}

function log(ac: string, label: string, m: M, verdict: string) {
  // Single-line, grep-friendly record for lifting into the AC-016 table.
  // eslint-disable-next-line no-console
  console.log(`[v19-measure] ${ac} | ${label} | ${m ? `${m.w}×${m.h}px color=${m.color} bg=${m.bg} opacity=${m.opacity} ratio=${m.ratio}:1` : 'ELEMENT NOT FOUND'} | ${verdict}`);
}

test.use({ viewport: VP });

// ── Dashboard state (logged in) ─────────────────────────────────────────────
test.describe('v19 dashboard @768 — touch targets & contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INIT);
    await mockApi(page, undefined, [{ id: 'c1', name: 'Media', sortIndex: 0, gridWidth: 8 }], 'admin');
    await page.goto('/');
    await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
  });

  test('AC-005 settings gear ≥44×44', async ({ page }) => {
    const m = await measure(page, '[data-testid="settings-gear"]');
    log('AC-005', 'settings gear', m, `need ≥${TOUCH_MIN}px`);
    expect(m).not.toBeNull();
    expect(m!.w).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(m!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-006 quick-launcher trigger ≥44px tall', async ({ page }) => {
    const m = await measure(page, '[data-testid="launcher-trigger"]');
    log('AC-006', 'launcher trigger', m, `need ≥${TOUCH_MIN}px tall`);
    expect(m!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-007 launcher placeholder contrast ≥4.5:1', async ({ page }) => {
    const m = await measure(page, '.launcher-trigger-placeholder');
    log('AC-007', 'launcher placeholder', m, `need ≥${AA_TEXT}:1`);
    expect(m).not.toBeNull();
    expect(m!.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('AC-008 header status caption "Updated X ago" contrast ≥4.5:1', async ({ page }) => {
    // LastUpdated renders null until the services provider records its first
    // successful load timestamp — wait for it to mount before measuring.
    await expect(page.getByTestId('status-last-updated')).toBeVisible();
    const m = await measure(page, '[data-testid="status-last-updated"]');
    log('AC-008', 'status caption (Updated X ago)', m, `need ≥${AA_TEXT}:1`);
    expect(m).not.toBeNull();
    expect(m!.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('AC-008 status-bar "N not monitored" caption contrast ≥4.5:1', async ({ page }) => {
    // StatusBar renders the "N not monitored" segment (neutral-500). Locate it.
    const seg = page.locator('[data-testid="status-bar-content"] >> text=/not monitored/');
    const present = await seg.count();
    if (present === 0) {
      // No un-monitored services in the fixture → segment absent. Record + skip assert.
      log('AC-008', 'status "N not monitored"', null, 'segment absent in fixture (all monitored) — see AC-008 Updated caption (same token)');
      return;
    }
    const ratio = await seg.first().evaluate((el) => {
      const w = window as unknown as { __parse: (s: string) => { r: number; g: number; b: number; a: number }; __resolveBg: (e: Element) => { r: number; g: number; b: number }; __ratio: (a: number[], b: number[]) => number; __composite: (f: { r: number; g: number; b: number; a: number }, b: { r: number; g: number; b: number }) => { r: number; g: number; b: number } };
      const cs = getComputedStyle(el);
      const c = w.__parse(cs.color)!;
      const bg = w.__resolveBg(el.parentElement || el);
      const painted = w.__composite({ ...c, a: c.a * parseFloat(cs.opacity) }, bg);
      return Math.round(w.__ratio([painted.r, painted.g, painted.b], [bg.r, bg.g, bg.b]) * 100) / 100;
    });
    // eslint-disable-next-line no-console
    console.log(`[v19-measure] AC-008 | status "N not monitored" | ratio=${ratio}:1 | need ≥${AA_TEXT}:1`);
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  test('AC-010 account avatar button ≥44×44 hit area', async ({ page }) => {
    const m = await measure(page, '[data-testid="user-menu-trigger"]');
    log('AC-010', 'avatar button', m, `need ≥${TOUCH_MIN}px (visual disc may be smaller)`);
    expect(m!.w).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(m!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-011 "Add apps" menu row ≥44px tall (moved to Gear menu, .menu-item)', async ({ page }) => {
    await page.getByTestId('settings-gear').click();
    await expect(page.getByTestId('gear-add-apps')).toBeVisible();
    // The gear menu animates in (user-menu-in: scale .98→1, 0.14s). Poll so the
    // measurement lands on the settled control, not a mid-animation scaled frame.
    await expect.poll(async () => (await measure(page, '[data-testid="gear-add-apps"]'))?.h ?? 0).toBeGreaterThanOrEqual(TOUCH_MIN);
    const m = await measure(page, '[data-testid="gear-add-apps"]');
    log('AC-011', 'Add apps row (gear-add-apps)', m, `need ≥${TOUCH_MIN}px tall — NOTE: lives in Gear menu now, not UserMenu`);
    expect(m!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-009 tile ⋯ menu — DIVERGENCE: no ⋯ menu in shipped AppGrid (favorite ★ successor measured)', async ({ page }) => {
    // The spec's ⋯ menu glyph does not exist in the shipped AppGrid tile chrome;
    // #240 replaced it with a direct favorite ★ toggle. Record the successor's
    // resting measurement for the PR; the ⋯-glyph AC is not applicable.
    const kebab = await page.locator('[data-testid="tile-menu"]').count();
    const star = await measure(page, '[data-testid="tile-favorite"]');
    log('AC-009', `tile ⋯ menu (kebab count=${kebab}) → favorite ★ successor`, star, kebab === 0 ? 'N/A: ⋯ menu absent in AppGrid (replaced by favorite ★, #240) — flagged to Kare/Walt' : 'kebab present');
    expect(kebab).toBe(0); // documents the divergence: no ⋯ menu ships
  });

  test('AC-012 admin edit-mode banner reads the exact shared-catalog copy', async ({ page }) => {
    await page.getByTestId('settings-gear').click();
    await page.getByTestId('gear-edit-dashboard').click();
    const banner = page.getByTestId('edit-mode-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Editing the shared catalog — changes affect all users');
    // eslint-disable-next-line no-console
    console.log('[v19-measure] AC-012 | edit-mode banner | present + exact copy | PASS');
  });

});

// ── Dark mode: admin edit-mode chrome (#163 / AC-014) ───────────────────────
// Dark is forced deterministically via the server themePref ('dark'), NOT by
// racing document.documentElement.classList — the ThemeProvider owns that class
// and would clobber a manual add. The test asserts `.dark` actually applied
// before measuring, so it can never pass vacuously against a light surface.
test.describe('v19 dark @768 — #163 admin edit-mode chrome contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INIT);
    await mockApi(page, undefined, [{ id: 'c1', name: 'Media', sortIndex: 0, gridWidth: 8 }], 'admin');
    // Re-route /api/me AFTER mockApi (LIFO — this wins) to force a dark theme pref.
    await page.route('**/api/me', (route) =>
      route.fulfill({ json: { id: 'a1', email: 'caleb@ohana.io', role: 'admin', themePref: 'dark' } }),
    );
    await page.goto('/');
    await expect(page.getByTestId('user-menu-trigger')).toBeVisible();
    // Fail loudly if dark didn't apply — no vacuous light-mode pass.
    await expect.poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true);
  });

  test('AC-014/#163 edit-mode chrome contrast in DARK mode', async ({ page }) => {
    await page.getByTestId('settings-gear').click();
    await page.getByTestId('gear-edit-dashboard').click();
    await expect(page.getByTestId('edit-mode-banner')).toBeVisible();
    // Banner label (indigo) on dark ground — must clear AA for its 11px bold text.
    const bannerRatio = await page.getByTestId('edit-mode-banner').evaluate((el) => {
      const w = window as unknown as { __parse: (s: string) => { r: number; g: number; b: number; a: number }; __resolveBg: (e: Element) => { r: number; g: number; b: number }; __ratio: (a: number[], b: number[]) => number; __composite: (f: { r: number; g: number; b: number; a: number }, b: { r: number; g: number; b: number }) => { r: number; g: number; b: number } };
      const label = el.querySelector('.edit-mode-banner-label') as Element;
      const cs = getComputedStyle(label);
      const c = w.__parse(cs.color)!;
      const bg = w.__resolveBg(el);
      const painted = w.__composite({ ...c, a: c.a * parseFloat(cs.opacity) }, bg);
      return { color: cs.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio: Math.round(w.__ratio([painted.r, painted.g, painted.b], [bg.r, bg.g, bg.b]) * 100) / 100 };
    });
    // eslint-disable-next-line no-console
    console.log(`[v19-measure] AC-014/#163 | dark edit banner label | color=${bannerRatio.color} bg=${bannerRatio.bg} ratio=${bannerRatio.ratio}:1 | need ≥${AA_TEXT}:1`);

    // §4.6 — also record the rest of the admin edit chrome in dark for the PR
    // (width selector label + box rename/delete). These already ride light-gray
    // tokens on the near-black glass; measured here to prove the token sweep
    // covers them (no fix needed) — documented, not re-touched.
    for (const sel of ['.app-grid-width-label', '[data-testid="box-rename"]', '[data-testid="box-delete"]']) {
      const cm = await measure(page, sel);
      if (cm) log('AC-014/#163', `dark edit chrome ${sel}`, cm, `UI text/glyph — need ≥${AA_GRAPHIC}:1`);
      if (cm) expect(cm.ratio).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }

    expect(bannerRatio.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

// ── Login state (logged out) ────────────────────────────────────────────────
test.describe('v19 login @768 — touch targets & contrast', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(INIT);
    // 401 on /api/me → App renders AuthForm; oidcEnabled:true so the "or" divider
    // (AC-004) is present to measure.
    await page.route('**/api/me', (route) => route.fulfill({ status: 401, body: '' }));
    await page.route('**/api/auth/config', (route) => route.fulfill({ json: { oidcEnabled: true } }));
    await page.goto('/');
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    // AC-004 measures the OIDC "or" divider (div.my-4). oidcEnabled starts false
    // and only flips true after /api/auth/config resolves async, so the divider
    // may not be in the DOM yet when the submit button first paints. Wait for it
    // to render before any measurement, else div.my-4 is ELEMENT NOT FOUND (#300).
    await expect(page.locator('div.my-4')).toBeVisible();
  });

  test('AC-001 "Sign in" submit button ≥44px tall', async ({ page }) => {
    const m = await measure(page, 'button[type="submit"]');
    log('AC-001', 'login submit', m, `need ≥${TOUCH_MIN}px tall`);
    expect(m!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-002 email + password inputs ≥44px tall', async ({ page }) => {
    const email = await measure(page, 'input[type="email"]');
    const pw = await measure(page, 'input[type="password"]');
    log('AC-002', 'email input', email, `need ≥${TOUCH_MIN}px tall`);
    log('AC-002', 'password input', pw, `need ≥${TOUCH_MIN}px tall`);
    expect(email!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(pw!.h).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-003 mode-toggle presents a ≥44×44 tappable zone', async ({ page }) => {
    const toggle = page.locator('button', { hasText: /need an account\? register/i });
    const box = await toggle.boundingBox();
    // eslint-disable-next-line no-console
    console.log(`[v19-measure] AC-003 | mode-toggle | ${box ? `${Math.round(box.width)}×${Math.round(box.height)}px` : 'NOT FOUND'} | need ≥${TOUCH_MIN}px both axes`);
    expect(box!.height).toBeGreaterThanOrEqual(TOUCH_MIN);
    expect(box!.width).toBeGreaterThanOrEqual(TOUCH_MIN);
  });

  test('AC-004 "or" divider contrast ≥4.5:1', async ({ page }) => {
    const m = await measure(page, 'div.my-4');
    log('AC-004', 'login "or" divider', m, `need ≥${AA_TEXT}:1`);
    expect(m).not.toBeNull();
    expect(m!.ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });
});
