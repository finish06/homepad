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
});
