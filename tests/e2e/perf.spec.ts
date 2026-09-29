import { test, expect, type Browser, type Page } from '@playwright/test';

// What this spec is, and — more importantly — what it is NOT.
//
// AC A8 ("cold LAN load: TTI < 1.5s desktop, FCP < 800ms desktop") is a budget
// about a real network. It is verified by Lighthouse CI (`npm run lhci`,
// thresholds in `lighthouserc.cjs`), which throttles CPU and transport. This
// spec loads over loopback with no throttling, so it CANNOT verify A8 and no
// longer claims to: measured against the built bundle on a dev machine, FCP is
// ~40ms and DCL ~16ms, i.e. 20x and 90x inside A8's numbers. An assertion at
// 800/1500 here passes no matter what ships.
//
// #498 — until this change the spec was worse than decorative: playwright.config
// served `npm run dev`, so it measured Vite's unbundled dev graph (DCL median
// 49.7ms, cold outliers past 500ms) rather than the artifact users get.
//
// So: this is a SMOKE check against the built app. It catches the gross,
// qualitative failures that survive a green unit suite — a blocking request
// before first paint, a boot script that throws, an entry chunk that no longer
// parses, paint timing that stops being reported at all. The bounds below are
// set to be un-flaky on a shared CI runner, which necessarily makes them loose.
//
// #501 QA (gracie) found the consequence of loosening these bounds: on her pod a
// DEV-server build measured DCL 728.9ms, under the 800ms bound, so the timing
// checks alone would have accepted the wrong artifact. That hole is closed
// structurally rather than by re-tightening — `sample()` refuses to report a
// number for a page that is not the built bundle — so these bounds can stay loose
// enough never to flake without the suite losing the #498 protection.
//
// The DETERMINISTIC regression guard is `tests/infra/bundle-budget.test.ts`:
// byte budgets and the code-splitting contract, measured off dist/ with no
// timing involved. Tighten that when you want to catch a 20% regression. Do not
// tighten the numbers here to do a byte budget's job — wall-clock on a shared
// runner cannot hold that line, and a flaky perf gate gets deleted.

// Chosen for flake-immunity, NOT for detection. The deterministic regression
// guard is tests/infra/bundle-budget.test.ts; this pair only has to catch gross,
// qualitative failures, so headroom here costs nothing.
//
// Raised from 500/400 after QA on #500: on gracie's verification pod the DEV
// server measured a best-of-5 DCL of 728.9ms — past the old 400ms bound. That
// says nothing about the built bundle (which is 16.7ms here), but it does say the
// spread across environments is far wider than the "~5x this machine" I assumed
// when picking 400. A bound that a slow pod can breach is a bound that will
// eventually flake, and a flaky perf gate gets deleted.
const FCP_SMOKE_MS = 1_000;
const DCL_SMOKE_MS = 800;

const SAMPLES = 5;

const USER = { id: 'u1', email: 'perf@homepad', role: 'user', themePref: 'light' };
const SEED = [
  {
    id: 'svc-1',
    slug: 'grafana',
    name: 'Grafana',
    description: 'dashboards',
    url: 'https://grafana.example.com',
    icon: 'https://example.com/grafana.png',
    status: 'UP',
    favorite: false,
    iconLight: false,
    iconDark: false,
  },
];

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

// Mock every endpoint the first-paint path touches, catch-all FIRST and
// specifics after — the same idiom as tests/browser-gate/mockApi.ts, where a
// later `page.route` registration takes precedence over an earlier one.
//
// The catch-all is not tidiness, it is the measurement. `vite preview` inherits
// `server.proxy` from vite.config.ts, so any /api/* request left unmocked is
// proxied to :8080. In CI that is an instant connection refusal which
// `waitUntil: 'networkidle'` then times — noise with no product meaning. On a
// dev machine with the Go backend up it is worse: the suite would read (and a
// PATCH would write) a real database, so the number would depend on whoever's
// laptop ran it.
async function mockApi(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill(json({})));
  await page.route('**/api/me', (route) => route.fulfill(json(USER)));
  await page.route('**/api/auth/config', (route) => route.fulfill(json({ oidcEnabled: false })));
  await page.route('**/api/services', (route) => route.fulfill(json({ services: SEED })));
  await page.route('**/api/categories', (route) => route.fulfill(json({ categories: [] })));
  await page.route('**/api/system/config', (route) => route.fulfill(json({})));
}

type Sample = { fcp: number; dcl: number };

// Is this page the BUILT app? dist/index.html references a hashed entry chunk;
// the dev server serves /src/main.tsx and /@vite/client.
//
// Returns the reason it is NOT built, or null when it is, so both the standalone
// assertion below and every timing sample can share one definition.
async function notBuiltReason(page: Page): Promise<string | null> {
  const scripts = await page
    .locator('script[src]')
    .evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).getAttribute('src') ?? ''));
  const hashedEntry = scripts.some((x) => /^\/assets\/index-[A-Za-z0-9_-]+\.js$/.test(x));
  const devUrls = scripts.some((x) => x.includes('/src/') || x.includes('/@vite/'));
  if (devUrls) return `dev-server module URLs present: ${JSON.stringify(scripts)}`;
  if (!hashedEntry) return `no hashed /assets/index-<hash>.js entry chunk: ${JSON.stringify(scripts)}`;
  return null;
}

// Each sample gets a FRESH context: cold HTTP cache, like a first visit.
// Reloading one page would measure a warm cache and quietly drift away from the
// thing being claimed.
async function sample(browser: Browser): Promise<Sample> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    await mockApi(page);
    await page.goto('/', { waitUntil: 'networkidle' });

    // Every timing sample refuses to measure anything but the built artifact.
    //
    // QA on #501 (gracie) found the hole this closes: her pod's DEV server
    // measured a best-of-5 DCL of 728.9ms, which is UNDER the 800ms bound this
    // file loosened to — so on that hardware a dev-server build would have
    // satisfied the timing checks. The bounds are deliberately loose (the real
    // regression guard is tests/infra/bundle-budget.test.ts), which meant the
    // timing pair had stopped contributing anything to catching #498's class on
    // slower machines, leaving the standalone assertion below as the sole guard.
    //
    // Making identity a PRECONDITION of measurement fixes that without
    // re-tightening the bounds: a dev server now cannot produce a passing timing
    // number on any hardware, at any threshold.
    const wrong = await notBuiltReason(page);
    if (wrong) {
      throw new Error(
        `refusing to report a timing number for a page that is not the built artifact — ${wrong}. ` +
          `Check playwright.config.ts is serving \`npm run preview:e2e\` and not the dev server (#498).`,
      );
    }

    return await page.evaluate(() => {
      const paint = performance
        .getEntriesByType('paint')
        .find((e) => e.name === 'first-contentful-paint');
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return {
        fcp: paint ? paint.startTime : -1,
        dcl: nav ? nav.domContentLoadedEventEnd - nav.startTime : -1,
      };
    });
  } finally {
    await ctx.close();
  }
}

// Load-timing noise is one-sided: contention makes a load slower, never faster.
// So the BEST of N is the stable estimator, and it lets the bound stay tight
// without retry-flake. A single cold sample is what made the old numbers swing
// by an order of magnitude.
async function best(browser: Browser): Promise<Sample & { all: Sample[] }> {
  const all: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) all.push(await sample(browser));
  return {
    fcp: Math.min(...all.map((s) => s.fcp)),
    dcl: Math.min(...all.map((s) => s.dcl)),
    all,
  };
}

test.describe('built-bundle load smoke (not AC A8 — see Lighthouse CI)', () => {
  test('first contentful paint is reported and fast on the built bundle', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'paint timing API only stable in Chromium');

    const { fcp, all } = await best(browser);
    const seen = all.map((s) => s.fcp.toFixed(1)).join(', ');

    // A missing paint entry is a real failure mode, not an excuse to pass:
    // if the boot script throws, `getEntriesByType('paint')` can come back
    // empty and a `> 0` check is the only thing standing between that and a
    // green run.
    expect(fcp, `first-contentful-paint must be measurable (samples: ${seen})`).toBeGreaterThan(0);
    expect(
      fcp,
      `FCP smoke bound ${FCP_SMOKE_MS}ms — best of ${SAMPLES} was ${fcp.toFixed(1)}ms (samples: ${seen}). ` +
        `This is NOT AC A8; a real regression is more likely to trip tests/infra/bundle-budget.test.ts first.`,
    ).toBeLessThan(FCP_SMOKE_MS);
  });

  test('DOMContentLoaded is reported and fast on the built bundle', async ({
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'navigation timing API only stable in Chromium');

    const { dcl, all } = await best(browser);
    const seen = all.map((s) => s.dcl.toFixed(1)).join(', ');

    expect(dcl, `navigation timing must be measurable (samples: ${seen})`).toBeGreaterThan(0);
    expect(
      dcl,
      `DCL smoke bound ${DCL_SMOKE_MS}ms — best of ${SAMPLES} was ${dcl.toFixed(1)}ms (samples: ${seen}).`,
    ).toBeLessThan(DCL_SMOKE_MS);
  });

  // The assertion the old spec was missing entirely: prove we are measuring the
  // BUILT app, not a dev server. dist/index.html references a hashed entry
  // chunk; the dev server serves /src/main.tsx.
  //
  // This is the ONLY environment-independent catcher for that regression. The
  // timing assertions above may or may not also fire, depending on the machine:
  // reverting the config to `npm run dev` left both of them passing here, while
  // on gracie's QA pod the DCL check fired too (728.9ms). An earlier version of
  // this comment claimed the timing tests "still pass" as though it were a
  // property of the change — it is a property of the hardware. This assertion is
  // the one that holds everywhere, and with the bounds now deliberately loose it
  // is the only one that will.
  test('the page under test is the built artifact, not the dev server', async ({ page }) => {
    await mockApi(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const wrong = await notBuiltReason(page);
    expect(
      wrong,
      `this suite must run against the built app; instead: ${wrong}. ` +
        `Check playwright.config.ts is serving \`npm run preview:e2e\` and not the dev server (#498). ` +
        `NOTE: the timing tests above now enforce this too, so weakening THIS test no longer ` +
        `removes the protection — that was the case until #501 QA pointed it out.`,
    ).toBeNull();
  });
});
