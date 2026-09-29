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
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
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
