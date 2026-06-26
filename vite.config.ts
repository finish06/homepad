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
  gitSha = envSha;
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
  plugins: [react()],
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
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
