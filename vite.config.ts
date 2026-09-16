/// <reference types="vitest/config" />
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v15 — version badge. Both values are injected at build time so the footer can
// answer "which build is this?" with no backend call.
//
// #157: the Docker build context has no .git (the build stage only COPYs the
// source tree), so `git rev-parse` always threw and prod footers showed '(dev)'.
// CI knows the commit sha, so the image build threads it in as the GIT_SHA env
// var (Dockerfile ARG/ENV, fed by ci-shared's --build-arg). Read that first;
// fall back to git for a local `vite build`, then to 'dev' so a missing git
// context never fails the build.
const appVersion: string = JSON.parse(readFileSync('./package.json', 'utf8')).version;
let gitSha: string;
const envSha = process.env.GIT_SHA?.trim();
if (envSha && envSha !== 'dev') {
  // ci-shared passes the full 40-char `${{ github.sha }}`; condense it to the
  // 7-char short form (like `git rev-parse --short`) so the footer badge reads
  // cleanly instead of showing a 40-char wall.
  gitSha = envSha.slice(0, 7);
} else {
  try {
    gitSha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    gitSha = 'dev';
  }
}

// Same-domain deploy model — the homepad-api is reachable at /api/* in prod
// (Pangolin Ingress path-routes). Vite dev mirrors this by proxying /api/*
// to the local Go backend on :8080.
export default defineConfig({
  plugins: [
    react(),
    // Release awareness — emit /version.json alongside the bundle. It carries
    // the SAME version/sha pair baked into the JS via `define`, but as a
    // fetchable file nginx serves with no-store, so a long-lived tab can ask
    // "is a newer build deployed than the one I'm running?" (useReleaseCheck).
    {
      name: 'emit-version-json',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(
            { version: appVersion, sha: gitSha, builtAt: new Date().toISOString() },
            null,
            2,
          ),
        });
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  // Component tests run in jsdom with a mocked API (global fetch / mocked
  // ./api module) — no running backend required. Playwright e2e stays separate
  // under tests/e2e and is excluded here.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // src/ holds behavior tests colocated with their modules. tests/infra/
    // quarantines the SOURCE-CONTRACT suites — readFileSync greps over the
    // Dockerfile / index.css / configs (P1.4 in the 2026-08-30 review). They
    // are brittle against textual refactors by design, so they live apart:
    // a stylesheet or build-file change knows exactly which suite it must
    // update, and component test runs stay free of infra archaeology.
    include: ['src/**/*.test.{ts,tsx}', 'tests/infra/**/*.test.{ts,tsx}'],
    css: false,
    // ADD adoption (2026-09-15) — the coverage total previously counted root
    // config files, qa-kit/ scripts and the vendored qa-artifacts bundles
    // (support.js is 2,097 lines, plus copies of React), which dragged the
    // reported number to 61.98% while src/ was actually at 94.85%. Scope
    // coverage to shipped source so the threshold measures what we write.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 90,
        lines: 90,
        // functions sits at 87.57% today — 90 here would block CI on adoption
        // day. Raise to 90 once the untested branches in App.tsx and
        // TileDensityToggle.tsx are covered.
        functions: 85,
        branches: 88,
      },
    },
  },
});
