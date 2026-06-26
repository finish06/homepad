/// <reference types="vitest/config" />
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v15 — version badge. Both values are injected at build time so the footer can
// answer "which build is this?" with no backend call. __GIT_SHA__ falls back to
// 'dev' when git history is unavailable (shallow clone, Docker layer without
// .git, CI without history) so the build never fails on a missing git context.
const appVersion: string = JSON.parse(readFileSync('./package.json', 'utf8')).version;
let gitSha: string;
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  gitSha = 'dev';
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
