import { defineConfig, devices } from '@playwright/test';

// Dedicated config for the #35 real-browser GATE (separate from the broader
// tests/e2e suite, which expects a live API). This one runs ONLY the
// tile/menu/dnd interaction specs under tests/browser-gate against the BUILT app
// served by `vite preview`, with /api/* mocked per-test (see mockApi.ts) — no
// backend, no DB. Kept as its own config + npm script so CI can wire it as a
// single, separately-requireable status check.
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/browser-gate',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      // Desktop viewport reproduces the #35 mouse scenario; hasTouch:true lets
      // the same context exercise .tap() for the touch-mode regressions. Both
      // input modes share the real layout/paint/hit-test pipeline that jsdom lacks.
      name: 'chromium-gate',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, hasTouch: true },
    },
  ],
  // Serve the built artifact (dist/) — CI runs `npm run build` first. This tests
  // what actually ships, not the dev server.
  webServer: {
    command: 'npm run preview',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
