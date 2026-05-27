# homepad

Web frontend (React + Vite + TS + Tailwind) for **homepad** — the homelab launcher with live uptime badges. Pairs with the Go backend at [`Code/homepad-api`](https://gitea.kube.calebdunn.tech/Code/homepad-api).

> **Spec:** [`specs/v1-launcher.md`](./specs/v1-launcher.md) — canonical for both repos.
> **Test plan:** [`specs/test-plan-v1.md`](./specs/test-plan-v1.md)

## Status

🚧 Scaffold only — no UI yet. The Playwright suite is **RED** by design (ADD methodology): every test describes an acceptance criterion and fails until the GREEN phase drives it to passing.

## Layout

```
src/                React app
tests/e2e/          Playwright specs, one per AC
specs/              Source-of-truth spec + test plan (lives in this repo)
lighthouserc.cjs    Lighthouse CI thresholds (AC A8)
```

## Run locally

```bash
npm install
npm run dev          # vite dev server on :5173, proxies /api → :8080
```

For the full app to do anything useful, also run `Code/homepad-api` locally (`make run`).

## Test

```bash
npm run test:e2e:install   # one-time Playwright browsers
npm run test:e2e           # full E2E suite (desktop + mobile)
npm run build && npm run lhci   # Lighthouse perf budgets (AC A8)
```

## Deploy

K8s manifests are owned by Joe (homie / SRE bot), not in this repo. This repo ships:

- `Dockerfile` (multi-stage Vite build → nginx static serve)
- `nginx.conf` (SPA fallback + caching headers)
- The "Deployment contract" section in [`specs/v1-launcher.md`](./specs/v1-launcher.md)

Same-domain path routing: `homepad.calebdunn.tech/` → this app, `homepad.calebdunn.tech/api/*` → `homepad-api`.
