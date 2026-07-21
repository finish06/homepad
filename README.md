<p align="center">
  <img src="./docs/banner.svg" alt="homepad — self-hosted launcher for your homelab" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white" alt="Go 1.25">
  <img src="https://img.shields.io/badge/React%20%2B%20Vite-18%20%C2%B7%205-61DAFB?logo=react&logoColor=white" alt="React + Vite">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-3-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/version-15.5.0-blue" alt="v15.5.0">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

# homepad

**homepad** is a self-hosted launcher / homepage for a homelab: one page that
lists every service in a shared catalog, shows a **live status badge** for each
(UP / DEGRADED / DOWN / UNKNOWN), and lets each user keep their own favorites and
tile order. Status data is pulled server-side from [Gatus](https://github.com/TwiN/gatus) —
the browser never talks to Gatus directly.

This repo is the **web frontend** (React + Vite + TypeScript + Tailwind). It
pairs with the Go backend at [`homepad-api`](https://github.com/finish06/homepad-api).

> **Spec:** [`specs/v1-launcher.md`](./specs/v1-launcher.md) — canonical for both repos.
> **Test plan:** [`specs/test-plan-v1.md`](./specs/test-plan-v1.md)

## Features

- **Two ways to log in** — local email + password (bcrypt sessions), *and*
  "Log in with PocketID" (homelab OIDC) when the backend has it enabled. The
  OIDC button is additive and fails closed (hidden) if OIDC is off.
- **Shared service catalog** — every authenticated user sees the same tiles
  (name, icon, description, launch URL), rendered in the order the API returns.
- **Live status badges** — each tile shows UP (green) / DEGRADED (amber) /
  DOWN (red) / UNKNOWN (gray), driven by the backend's Gatus poller (status is
  never staler than ~60s).
- **Per-user favorites** — star a service; favorites persist across sessions
  (optimistic toggle with rollback on failure).
- **Personal ordering** — reorder your tiles with move up / down; the order is
  saved per user and survives logout (optimistic + rollback).
- **Admin catalog CRUD** — admins create / edit / delete catalog entries;
  non-admins get a 403.
- **Gatus is server-side only** — no Gatus URL ever ships in the JS bundle or
  reaches the browser (verified: `grep -ri gatus dist/` is empty).
- **Admin/personal scope clarity** (v11) — the UserMenu shows a distinct ADMIN
  section label (shield icon, amber) with per-item scope tags ("personal" /
  "global"), the Settings modal is titled "Admin Panel" with a global-scope
  subtitle, and non-admins see a note explaining their dashboard is their
  settings.
- **UserMenu dropdown z-index** (v11) — the sticky header is at `z-20`,
  clearing the tile drag-grips' `z-10` so the dropdown is always accessible;
  a real-browser Playwright gate guards against regression.

Acceptance criteria **A1–A11** from the spec are all implemented; A7/A8 (live
responsive + Lighthouse budgets) and full browser e2e are verified on the
deployed stack. See [CHANGELOG.md](./CHANGELOG.md) for the full version history.

## Architecture

```mermaid
flowchart LR
  user(["🧑 Browser"])

  subgraph cluster["k3s · stitch namespace"]
    web["web<br/>nginx · serves the SPA"]
    api["homepad-api<br/>Go HTTP API"]
    poller["status poller"]
    pg[("Postgres<br/>users · catalog · favorites · layout")]
  end

  gatus["Gatus<br/>uptime probes"]
  pocketid["PocketID<br/>OIDC provider"]

  user -->|HTTPS| web
  web -->|"/api/*"| api
  api --> pg
  api --- poller
  poller -.->|poll status, server-side only| gatus
  user <-.->|OIDC: code + PKCE| pocketid
  api <-.->|discovery · token · JWKS| pocketid
```

The browser only ever talks to `web` (the SPA) and, same-domain, to `/api/*`.
Gatus is reachable **only** from the backend poller — never from a browser
session (spec AC A11).

## Authentication

Both login paths land on the **same** `homepad_session` cookie, so the rest of
the app is identical regardless of how you signed in.

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser
  participant A as homepad-api
  participant P as PocketID (OIDC)
  participant DB as Postgres

  rect rgb(15,23,42)
  note over B,DB: Local — email / password
  B->>A: POST /api/login (email, password)
  A->>DB: look up user, verify bcrypt hash
  A-->>B: Set-Cookie homepad_session → 200
  end

  rect rgb(2,6,23)
  note over B,P: PocketID — Authorization Code + PKCE
  B->>A: GET /api/auth/oidc/login
  A-->>B: 302 → PocketID authorize<br/>(state, nonce, PKCE S256 challenge)
  B->>P: authorize + consent
  P-->>B: 302 → /api/auth/oidc/callback?code&state
  B->>A: GET /api/auth/oidc/callback?code&state
  A->>P: exchange code + PKCE verifier → tokens
  P-->>A: id_token (+ JWKS for verify)
  A->>A: verify RS256 sig · iss / aud / exp / nonce
  A->>DB: link-by-email or provision user<br/>(admin iff in OIDC_ADMIN_GROUP)
  A-->>B: Set-Cookie homepad_session → 302 /
  end
```

`GET /api/auth/config` returns `{"oidcEnabled":bool}` so the web app knows
whether to render the PocketID button. When OIDC is disabled the two `/oidc/*`
endpoints are unregistered (404) and homepad is local-only.

## Screenshots

> Real captures from the live **v11** deploy.

<p align="center">
  <img src="./docs/screenshots/catalog.png" alt="homepad service catalog — apps grouped by category with live icons" width="100%">
  <br><em>The catalog — your apps grouped by category, each with its own icon.</em>
</p>

| Admin &amp; personal scope (v11) | Sign in |
| --- | --- |
| ![User menu showing the admin section with PERSONAL and GLOBAL scope tags](./docs/screenshots/usermenu.png) | ![Sign-in screen](./docs/screenshots/login.png) |

<p align="center"><em>v11 makes scope explicit at the point of use: an <strong>Admin</strong> section in the menu, with <strong>personal</strong> vs <strong>global</strong> tags on each action so you always know who a change affects.</em></p>

<p align="center">
  <img src="./docs/screenshots/mobile.png" alt="homepad on mobile (390×844)" width="280">
  <br><em>Responsive at 390×844 (iPhone 13).</em>
</p>

## Layout

```
src/                React app (App, Catalog, api client) + Vitest specs
tests/e2e/          Playwright specs, one per acceptance criterion
specs/              Source-of-truth spec + test plan (lives in this repo)
docs/               README assets (banner, screenshots)
lighthouserc.cjs    Lighthouse CI thresholds (AC A8)
```

## Run locally

```bash
npm install
npm run dev          # vite dev server on :5173, proxies /api → :8080
```

For the full app to do anything useful, also run `Code/homepad-api` locally
(`make run`).

## Self-hosting with Docker Compose

The fastest way to run the whole stack — frontend, Go API, Postgres, and a
Gatus status source — on your own machine. One command, no Kubernetes.

**Prerequisites:** Docker Engine 24+ with the Compose plugin (`docker compose
version`).

```bash
git clone https://github.com/finish06/homepad.git
cd homepad
cp .env.example .env          # then edit POSTGRES_PASSWORD (at minimum)
docker compose up --build -d
```

Then open **http://localhost:8080**. The **first account you register becomes
the admin** — create it, then set `HOMEPAD_REGISTRATION=invite_only` in `.env`
and `docker compose up -d` again to lock down sign-ups.

Check status and logs:

```bash
docker compose ps            # `web` shows healthy once the full chain is up
docker compose logs -f api   # look for "migrations applied"
```

What each service does:

| Service    | Image / build                    | Purpose                                            |
| ---------- | -------------------------------- | -------------------------------------------------- |
| `web`      | built from this repo's Dockerfile | nginx serving the built SPA; proxies `/api` → api |
| `api`      | built from `homepad-api`          | Go backend; runs DB migrations on boot            |
| `postgres` | `postgres:16-alpine`              | all persistent data (accounts, dashboards, icons) |
| `gatus`    | `ghcr.io/twin/gatus`              | uptime source the dashboard status tiles read from |

All configuration lives in `.env` (see `.env.example` for the full list with
defaults). Notes:

- **Persistence.** Everything is stored in Postgres, kept in the named volume
  `homepad_pg`. That's the only stateful volume — the web and api containers are
  disposable. Back up (or `docker compose down -v` to wipe) that volume.
- **The API build source.** The Go backend is a separate repo. Compose builds it
  from `HOMEPAD_API_CONTEXT` (default: the public GitHub repo). To build from a
  local checkout, clone both repos side by side and set
  `HOMEPAD_API_CONTEXT=../homepad-api`.
- **HTTPS.** Over plain-HTTP localhost, `COOKIE_SECURE=false` (the default in
  `.env.example`) is required or the login cookie is dropped. Set it `true` only
  when you serve Homepad behind a TLS-terminating proxy.
- **Status tiles.** `deploy/compose/gatus.yaml` ships two example endpoints so
  the tiles have data immediately — replace them with your own services.

### Enabling OIDC / SSO

Homepad runs entirely on local accounts by default. To add single sign-on, set
in `.env`:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://your-provider.example.com
OIDC_CLIENT_ID=homepad
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URL=http://localhost:8080/api/auth/oidc/callback
OIDC_ADMIN_GROUP=admins        # optional: group whose members become admins
```

Register the callback URL above with your provider, then
`docker compose up -d`. With `OIDC_ENABLED=false` the SSO endpoints stay
unregistered and the login screen shows local sign-in only.

## Test

```bash
npm test                       # Vitest component/unit suite (44 tests)
npm run test:e2e:install       # one-time Playwright browsers
npm run test:e2e               # full E2E suite (desktop + mobile)
npm run build && npm run lhci   # Lighthouse perf budgets (AC A8)
```

## Deploy

K8s manifests are owned by Joe (homie / SRE bot), not in this repo. This repo ships:

- `Dockerfile` (multi-stage Vite build → nginx static serve)
- `nginx.conf` (SPA fallback + caching headers)
- The "Deployment contract" section in [`specs/v1-launcher.md`](./specs/v1-launcher.md)

Same-domain path routing: `homepad.calebdunn.tech/` → this app,
`homepad.calebdunn.tech/api/*` → `homepad-api`.
