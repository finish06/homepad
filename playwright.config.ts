import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
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

// #739 — how many e2e workers to run: half the CPUs this process may use, the
// same share as Playwright's default, at least 1.
//
// Playwright's default counts os.cpus(), which in a container is every core on
// the host, not the container's CPU limit. A 2-CPU job on an 8-core host got 4
// workers, so 4 browsers shared 2 CPUs and the WebKit tests ran out of time.
//
// availableParallelism() follows the cgroup limit only from libuv 1.49 (late
// Node 22). package.json allows Node 20, so this also reads the cgroup v2
// limits itself and takes the smallest.
//
// Why half, not all: half is Playwright's own share, and it is what was
// measured. In the CI image with a 2-CPU limit this gives 1 worker; the full
// suite then passed 8 of 8 runs in 2.1 to 2.2 min, while the old default of 4
// workers took 2.6 to 2.9 min and failed. With a 4-CPU limit it gives 2
// workers, and the suite passed in 1.2 min. A full suite at 2 workers on 2
// CPUs was not measured.

// cgroupCpus reads a cgroup v2 cpu.max line ("200000 100000" = 2 CPUs, or
// "max 100000" = no limit). It returns the CPU count, or null for no limit or
// a line it cannot read.
export function cgroupCpus(cpuMax: string | null): number | null {
  if (!cpuMax) return null;
  const [quota, period] = cpuMax.trim().split(/\s+/);
  const q = Number(quota);
  const p = Number(period);
  if (quota === 'max' || !Number.isFinite(q) || !Number.isFinite(p) || q <= 0 || p <= 0) return null;
  return q / p;
}

// workersFor takes every cpu.max line that applies to this process (its own
// cgroup and each parent) and uses the tightest limit.
export function workersFor(parallelism: number, cpuMax: (string | null)[]): number {
  const limits = cpuMax.map(cgroupCpus).filter((n): n is number => n !== null);
  const cpus = Math.min(parallelism, ...limits);
  return Math.max(1, Math.floor(cpus / 2));
}

// cgroupDirs lists this process's cgroup v2 directory and its parents, from a
// /proc/self/cgroup line like "0::/kubepods/pod1/abc". With a private cgroup
// namespace the path is "/" and this is just the root.
export function cgroupDirs(procSelfCgroup: string | null): string[] {
  const line = (procSelfCgroup ?? '').split('\n').find((l) => l.startsWith('0::'));
  const parts = (line ? line.slice(3).trim() : '/').split('/').filter(Boolean);
  const dirs = ['/sys/fs/cgroup'];
  for (let i = 1; i <= parts.length; i++) dirs.push(`/sys/fs/cgroup/${parts.slice(0, i).join('/')}`);
  return dirs;
}

function read(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null; // not Linux, cgroup v1, or no limit file at this level
  }
}

function e2eWorkers(): number {
  const dirs = cgroupDirs(read('/proc/self/cgroup'));
  return workersFor(availableParallelism(), dirs.map((d) => read(`${d}/cpu.max`)));
}

// These worker helpers live here, not under tests/, because the web image's
// Docker build typechecks this file and .dockerignore leaves tests/ out of
// that build. `--workers` on the command line still wins over `workers` below.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  retries: process.env.CI ? 2 : 0,
  workers: e2eWorkers(),
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
      //
      // #739: 1x was not enough under full-suite load, so tests/e2e/fixtures.ts
      // also turns backdrop-filter off in WebKit. The reasons and numbers are
      // in that file.
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
