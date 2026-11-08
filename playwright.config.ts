import { defineConfig, devices } from '@playwright/test';

// The tests/e2e suite runs against the BUILT app served by `vite preview`, not
// the dev server.
//
// #498: this config used to run `npm run dev`, so every spec here measured
// Vite's unbundled dev graph — a different artifact from the one that ships.
// It mattered most for perf.spec.ts (DCL median 49.7ms dev vs 16.7ms built,
// with cold outliers past 500ms) and for no-gatus-leak.spec.ts, which reads
// dist/ off disk and therefore SKIPPED on every run, because `npm run dev`
// never produces a dist/.
//
// Nothing in this suite needs a live backend any more: theme-mode route-mocks
// every endpoint, perf does the same, and no-gatus-leak never opens a browser.
// The dev server's /api proxy to :8080 (vite.config.ts) is what the suite was
// built around originally; it is no longer a dependency, which is what kept
// this suite out of CI.
const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // iPhone 13 layout (390x664 CSS px, isMobile, hasTouch, WebKit, iOS UA)
      // rasterized at 1x instead of the device's 3x.
      //
      // The CI runner has no GPU, so WebKit paints in software, and the app's
      // glass panels and dialogs use backdrop-filter: blur(). At 3x (9x the
      // pixels) one frame took 0.3 to 5 s on the runner even with zero
      // animations running. Playwright's "stable" check waits on
      // requestAnimationFrame, so every click and check waited seconds and
      // kid-accounts TC-001 ran out of its 30 s budget at a different step
      // each retry. Measured on the runner, same page: 3x 1.2 to 2.5 s per
      // frame, 1x ~16 ms. reducedMotion: 'reduce' did not help (nothing was
      // animating); removing backdrop-filter did. Nothing in this suite reads
      // devicePixelRatio or compares pixels, so 1x tests the same behaviour.
      // Pinned by tests/infra/e2e-mobile-project.test.ts.
      name: 'mobile',
      use: { ...devices['iPhone 13'], deviceScaleFactor: 1 },
    },
  ],
  // Port 4174, NOT the 4173 that `npm run preview` and playwright.gate.config.ts
  // share: two configs on one port cannot run concurrently, and locally
  // `reuseExistingServer` would silently attach this suite to whatever build the
  // gate left running — the wrong-artifact bug this change exists to fix.
  webServer: {
    command: 'npm run preview:e2e',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
