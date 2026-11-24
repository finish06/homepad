import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { mockApi } from './mockApi';
import { mockServerSettings } from './serverSettingsMocks';
import { mockKidSession } from './kidMocks';

// SPEC-cleanup-18.6.0 AC-003 / AC-005 (#529) — the built app runs clean under
// the Content-Security-Policy it ships with.
//
// These tests load the app from csp-server.js, which sends the headers in
// nginx-security-headers.conf on every response, exactly as the image's nginx
// does. Every `securitypolicyviolation` event and every console line about the
// policy is collected; any one fails the test. The flows are the ones a policy
// would break: the inline theme script, sign-in, tiles with icons from other
// origins and data: URLs, ⌘K, the tile editor, Inline overlay tiles on http and
// https, My settings, the Admin Panel, the kid board, and the manifest.
//
// AC-005: the last tests inject an inline script, an inline style attribute and
// an off-origin fetch. Each must be blocked and reported, so a policy that
// silently stopped arriving would fail here instead of passing everything.

// Keep in step with playwright.gate.config.ts and csp-server.js.
// CSP_GATE_URL points the same tests at another server, e.g. a real
// nginx:1.27-alpine serving dist/ with the image's config.
test.use({ baseURL: process.env.CSP_GATE_URL ?? 'http://localhost:4175' });

const PNG = readFileSync(resolve(process.cwd(), 'public/icon-192.png'));
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#6366f1"/></svg>';

const CHECKS = Array.from({ length: 20 }, (_, i) => ({
  success: i !== 7,
  timestamp: new Date(Date.UTC(2026, 10, 24, 4, i)).toISOString(),
}));

const base = {
  description: '',
  status: 'UP',
  favorite: false,
  iconLight: false,
  iconDark: false,
  categoryId: 'cat-1',
  uptimeChecks: CHECKS,
  uptimeWindows: { '24h': 99.5, '7d': 99.9, '30d': 99.95 },
};

// One tile per kind of icon source, plus two Inline overlay tiles.
const SERVICES = [
  { ...base, id: 'svc-https', slug: 'grafana', name: 'Grafana', url: 'https://grafana.example.test', icon: 'https://icons.example.test/grafana.png' },
  { ...base, id: 'svc-http', slug: 'router', name: 'Router', url: 'http://router.example.test', icon: 'http://icons.example.test/router.svg' },
  { ...base, id: 'svc-badge', slug: 'notes', name: 'Notes', url: 'https://notes.example.test', icon: '' },
  { ...base, id: 'svc-upload', slug: 'plex', name: 'Plex', url: 'https://plex.example.test', icon: '', iconLight: true, iconDark: true },
  { ...base, id: 'svc-frame', slug: 'ha', name: 'Home Assistant', url: 'https://ha.example.test/', icon: '', clickAction: 'iframe', iframeSameOrigin: false },
  { ...base, id: 'svc-frame-http', slug: 'nas', name: 'NAS', url: 'http://nas.example.test:5000/', icon: '', clickAction: 'iframe', iframeSameOrigin: false },
];
const CATEGORIES = [{ id: 'cat-1', name: 'Home', sortIndex: 0, gridWidth: 6 }];

type Watch = { problems: () => Promise<string[]> };

// Collects violations from the page's own documents and CSP lines from the
// console. Installed before the first navigation, so the inline theme script
// (the first thing the page runs) is watched too.
async function watch(page: Page): Promise<Watch> {
  const consoleLines: string[] = [];
  page.on('console', (m) => {
    if (/content security policy|refused to (load|execute|apply|connect|frame)/i.test(m.text())) consoleLines.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => {
    if (/content security policy/i.test(e.message)) consoleLines.push(`pageerror: ${e.message}`);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
    });
  });
  return {
    problems: async () => {
      const events = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp ?? []);
      return [...events, ...consoleLines];
    },
  };
}

// Other origins: icons answer with an image, apps with a page. Nothing leaves
// the machine. A request the policy blocks never reaches this handler.
async function mockOtherOrigins(page: Page) {
  await page.route(/^https?:\/\/(?!localhost[:/])/, (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'icons.example.test') {
      return url.pathname.endsWith('.svg')
        ? route.fulfill({ contentType: 'image/svg+xml', body: SVG })
        : route.fulfill({ contentType: 'image/png', body: PNG });
    }
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${url.hostname}</title><p>app ${url.hostname}</p>` });
  });
}

async function mockUploadedIcons(page: Page) {
  await page.route('**/api/services/*/icon/**', (route) => route.fulfill({ contentType: 'image/png', body: PNG }));
}

async function bootAdmin(page: Page) {
  await mockApi(page, SERVICES as never, CATEGORIES, 'admin');
  await page.route('**/api/system/config', (route) =>
    route.fulfill({ json: { showUptimeDisplay: true, statusDegradedMs: 1000 } }),
  );
  await mockUploadedIcons(page);
  await mockOtherOrigins(page);
}

// Every <img> on the page has loaded (an icon the policy blocked never does).
async function expectImagesLoaded(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src.slice(0, 80)),
      ),
    )
    .toEqual([]);
}

async function expectClean(w: Watch) {
  // Violation events are queued as tasks; give the last ones a moment to land.
  await new Promise((r) => setTimeout(r, 250));
  expect(await w.problems(), 'CSP violations').toEqual([]);
}

test('the page is served with the enforcing policy from nginx-security-headers.conf', async ({ page }) => {
  await bootAdmin(page);
  const res = await page.goto('/');
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'sha256-/);
  expect(res?.headers()['content-security-policy-report-only']).toBeUndefined();
  expect(res?.headers()['x-frame-options']).toBe('DENY');
});

test('the inline theme script runs (its hash is allowed) and the dark class lands before the bundle', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  await page.addInitScript(() => {
    localStorage.setItem('homepad.theme', 'dark');
    // Read the class the moment the bundle's module script is parsed. Only
    // the inline script can have set it by then.
    const w = window as unknown as { __darkBeforeBundle?: boolean };
    new MutationObserver((_m, obs) => {
      const mod = document.querySelector('script[type="module"]');
      if (mod) {
        w.__darkBeforeBundle = document.documentElement.classList.contains('dark');
        obs.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await expect(page.getByTestId('app-grid')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __darkBeforeBundle?: boolean }).__darkBeforeBundle)).toBe(true);
  await expectClean(w);
});

test('sign-in: the signed-out card, SSO button and a password sign-in', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  let signedIn = false;
  await page.route('**/api/me', (route) =>
    signedIn
      ? route.fulfill({ json: { id: 'u1', email: 'admin@homepad.test', role: 'admin', themePref: 'system' } })
      : route.fulfill({ status: 401, contentType: 'text/plain', body: 'unauthorized' }),
  );
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { oidcEnabled: true, registration: 'invite_only', setupNeeded: false } }),
  );
  await page.route('**/api/login', (route) => {
    signedIn = true;
    return route.fulfill({ json: { id: 'u1', email: 'admin@homepad.test', role: 'admin', themePref: 'system' } });
  });
  await page.goto('/');
  await page.getByLabel('Email').fill('admin@homepad.test');
  await page.getByLabel('Password').fill('correct horse');
  await expectImagesLoaded(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByTestId('app-grid')).toBeVisible();
  await expectClean(w);
});

test('dashboard: tiles with https, http, data: and uploaded icons, the sparkline, ⌘K and the tile editor', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  await page.goto('/');
  await expect(page.getByTestId('tool-link')).toHaveCount(SERVICES.length);
  await expect(page.getByTestId('uptime-dot').first()).toBeVisible();
  await expectImagesLoaded(page);
  const srcs = await page.getByTestId('tool-link').locator('img').evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src));
  expect(srcs.some((s) => s.startsWith('https://icons.example.test/'))).toBe(true);
  expect(srcs.some((s) => s.startsWith('http://icons.example.test/'))).toBe(true);
  expect(srcs.some((s) => s.startsWith('data:image/svg+xml'))).toBe(true);
  expect(srcs.some((s) => s.includes('/api/services/svc-upload/icon/'))).toBe(true);

  await page.getByTestId('launcher-trigger').click();
  await page.getByTestId('launcher-input').fill('a');
  await expect(page.getByTestId('launcher-result').first()).toBeVisible();
  await expectImagesLoaded(page);
  await page.keyboard.press('Escape');

  await page.getByTestId('settings-gear').click();
  await page.getByTestId('gear-edit-dashboard').click();
  await page.getByTestId('tile-edit').first().click();
  await expect(page.getByTestId('tile-edit-modal')).toBeVisible();
  await expectImagesLoaded(page);
  await page.keyboard.press('Escape');
  await expectClean(w);
});

for (const [label, name, host] of [
  ['https', 'Home Assistant', 'ha.example.test'],
  ['http', 'NAS', 'nas.example.test'],
] as const) {
  test(`an Inline overlay tile frames an ${label} app`, async ({ page }) => {
    const w = await watch(page);
    await bootAdmin(page);
    await page.goto('/');
    await page.getByRole('link', { name }).click();
    const frame = page.frameLocator('[data-testid="iframe-overlay-frame"]');
    await expect(frame.getByText(`app ${host}`)).toBeVisible();
    await page.getByTestId('iframe-overlay-close').click();
    await expectClean(w);
  });
}

test('My settings and the Admin Panel', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  await mockServerSettings(page);
  await page.goto('/');
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-my-settings').click();
  await expect(page.getByTestId('settings-panel')).toBeVisible();
  await page.getByTestId('settings-close').click();
  await page.getByTestId('user-menu-trigger').click();
  await page.getByTestId('menu-admin-settings').click();
  await expect(page.getByTestId('setting-row-GATUS_BASE_URL')).toBeVisible();
  // Walk the whole panel so every lazy section renders.
  await page.getByTestId('settings-panel').evaluate(async (el) => {
    const scroller = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 10) ?? el;
    for (let y = 0; y <= scroller.scrollHeight; y += 300) {
      scroller.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  await expectImagesLoaded(page);
  await expectClean(w);
});

test('the kid board', async ({ page }) => {
  const w = await watch(page);
  await mockKidSession(page, ['plex', 'jellyfin', 'immich']);
  await mockOtherOrigins(page);
  await mockUploadedIcons(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/');
  await expect(page.getByTestId('tool-link')).toHaveCount(3);
  await page.getByTestId('kid-favorites-toggle').click();
  await page.getByTestId('launcher-trigger').click();
  await expect(page.getByTestId('launcher-results').getByRole('option')).toHaveCount(3);
  await page.keyboard.press('Escape');
  await expectImagesLoaded(page);
  await expectClean(w);
});

test('PWA: the manifest loads under manifest-src, and no service worker is registered', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  await page.goto('/');
  await expect(page.getByTestId('app-grid')).toBeVisible();
  // Asks Chromium to fetch and parse the manifest the page links, as an
  // install prompt would. A manifest-src block shows up as an error here.
  const cdp = await page.context().newCDPSession(page);
  const m = (await cdp.send('Page.getAppManifest')) as { url: string; errors: { message: string }[]; data?: string };
  expect(m.url).toMatch(/\/manifest\.webmanifest$/);
  expect(m.errors).toEqual([]);
  expect(JSON.parse(m.data ?? '{}').name).toBe('homepad');
  // Homepad has no service worker today (SPEC-cleanup-18.6.0 §2). If one is
  // added, worker-src 'self' allows it and this line is where to test it.
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations())?.length ?? 0)).toBe(0);
  await expectClean(w);
});

// AC-005 — controls. The policy must block and report these, so the watch
// above is known to see a violation when there is one.
test('control: an injected inline script, an inline style attribute and an off-origin fetch are blocked and reported', async ({ page }) => {
  const w = await watch(page);
  await bootAdmin(page);
  await page.goto('/');
  await expect(page.getByTestId('app-grid')).toBeVisible();
  const outcome = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.textContent = 'window.__inlineRan = true';
    document.head.appendChild(s);
    const d = document.createElement('div');
    d.setAttribute('style', 'outline: 3px solid red');
    document.body.appendChild(d);
    let fetched = 'allowed';
    try {
      await fetch('https://elsewhere.example.test/steal');
    } catch {
      fetched = 'blocked';
    }
    return {
      inlineRan: (window as unknown as { __inlineRan?: boolean }).__inlineRan === true,
      styleApplied: getComputedStyle(d).outlineStyle === 'solid',
      fetched,
    };
  });
  expect(outcome).toEqual({ inlineRan: false, styleApplied: false, fetched: 'blocked' });
  await expect
    .poll(async () => (await w.problems()).filter((p) => !p.startsWith('console:')).map((p) => p.split(' ')[0]).sort())
    .toEqual(['connect-src', 'script-src-elem', 'style-src-attr']);
});
