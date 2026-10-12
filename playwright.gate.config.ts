import { defineConfig, devices } from '@playwright/test';
import { decideGateCdp, GATE_CDP_ENV } from './tests/browser-gate/sidecar';

// #524: decide ONCE, here in the main process, whether the gate attaches to a
// QA pod's CDP sidecar. Workers inherit the decision via the environment
// instead of each racing its own probe (see tests/browser-gate/sidecar.ts).
const GATE_CDP = (process.env[GATE_CDP_ENV] = decideGateCdp(process.env));

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
  // One sidecar can't serve several workers at once: under 3 it stalled actions
  // for 30s and made the old per-worker probe miss (#524). With the sidecar,
  // run serially. Without it (CI, laptops), keep Playwright's default.
  workers: GATE_CDP !== 'off' ? 1 : undefined,
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
