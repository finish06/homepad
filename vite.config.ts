/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same-domain deploy model — the homepad-api is reachable at /api/* in prod
// (Pangolin Ingress path-routes). Vite dev mirrors this by proxying /api/*
// to the local Go backend on :8080.
export default defineConfig({
  plugins: [react()],
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
