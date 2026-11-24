# Developing Homepad

Everything a contributor needs. To just **run** Homepad, see the
[quickstart in the README](../README.md#quickstart).

Homepad is one repo with two halves. The React + Vite web app is at the
root. The Go API is in [`api/`](../api/). The API used to be its own repo,
`homepad-api`. It moved here with its history, and that repo is archived.
Specs live in [`specs/`](../specs/), starting with
[`specs/v1-launcher.md`](../specs/v1-launcher.md); the index is
[`specs/README.md`](../specs/README.md).

## Architecture

```mermaid
flowchart LR
  user(["🧑 Browser"])

  subgraph cluster["Kubernetes"]
    web["web<br/>nginx · serves the SPA"]
    api["api (homepad-api image)<br/>Go HTTP API"]
    poller["status poller"]
    pg[("Postgres<br/>users · sessions · catalog · favorites · layout")]
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
the app is identical regardless of how you signed in. Sessions live in
Postgres (since 17.0.0), and only a hash of each token is stored, so a restart
or deploy signs nobody out. An adult's session lasts 30 days and a kid's 180
days, both renewed as they're used.

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
  A->>DB: store a hash of the new session token
  A-->>B: Set-Cookie homepad_session → 200
  end

  rect rgb(2,6,23)
  note over B,P: PocketID — Authorization Code + PKCE
  B->>A: GET /api/auth/oidc/login
  alt over 20 a minute from this client
    A-->>B: 302 → /#signin-error=too_many
  end
  A-->>B: 302 → PocketID authorize<br/>(state, nonce, PKCE S256 challenge)
  B->>P: authorize + consent
  P-->>B: 302 → /api/auth/oidc/callback?code&state
  B->>A: GET /api/auth/oidc/callback?code&state
  A->>P: exchange code + PKCE verifier → tokens
  P-->>A: id_token (+ JWKS for verify)
  A->>A: verify RS256 sig · iss / aud / exp / nonce
  alt email_verified is not true
    A-->>B: 302 → /#signin-error=email_unverified
  end
  A->>DB: link-by-email, or provision user<br/>(admin iff in OIDC_ADMIN_GROUP; under invite_only,<br/>member only via OIDC_MEMBER_GROUP)
  alt new identity in no allowed group (invite_only)
    A-->>B: 302 → /#signin-error=not_invited
  else at HOMEPAD_MAX_ACCOUNTS
    A-->>B: 302 → /#signin-error=account_limit
  else any other failure
    A-->>B: 302 → /#signin-error=sso_failed
  end
  A-->>B: Set-Cookie homepad_session → 302 /
  end
```

Every single sign-on failure lands on the sign-in screen as
`/#signin-error=<code>`. `App.tsx` reads it once, clears it from the address
bar, and the sign-in card loads the line for it from the lazy
`src/app/ssoMessage.ts`. Login, register and the invite and reset-link routes
answer 429 with `Retry-After` over their limits; the card shows the wait with
`src/lib/waitMessage.ts`.

`GET /api/auth/config` returns
`{"oidcEnabled":bool,"registration":"open"|"invite_only","setupNeeded":bool}`.
The web app uses it to show the PocketID button, the **Create account**
button (only when registration is `open`), and the **Set up Homepad** screen
(only when no adult account exists yet). When OIDC is disabled the two `/oidc/*`
endpoints are unregistered (404) and homepad is local-only.

## Repo layout

```
src/                Web app (React) + Vitest specs
tests/              Web tests: infra/ (source checks), browser-gate/, e2e/
api/                Go API: its own go.mod, Dockerfile and Makefile
api/cmd/            API entry point
api/internal/       API handlers, storage, auth, status poller, widgets
api/migrations/     SQL migrations, run when the API starts
specs/              Specs for both halves, and the test plan
docs/               Docs and README assets (banner, screenshots)
.gitea/workflows/   CI for both halves
lighthouserc.cjs    Lighthouse CI thresholds (AC A8)
```

The web and the API each build their own image: `homepad` and `homepad-api`.
One `vX.Y.Z` tag on this repo releases both.

## Develop

You need Node 22 (`.nvmrc`), Go 1.25 and Docker.

Start Postgres and the API, from `api/`:

```bash
cd api
make db-up           # Postgres on :5432, database homepad_test
DATABASE_URL='postgres://homepad:homepad@localhost:5432/homepad_test?sslmode=disable' \
  COOKIE_SECURE=false make run   # API on :8080
```

The API reads its settings from the shell only. `api/.env.example` lists them
all.

Then start the web app, from the root, in another shell:

```bash
npm install
npm run dev          # vite dev server on :5173, proxies /api → :8080
```

Open http://localhost:5173. Vite sends `/api` to the API, so the browser sees
one site.

## Building the whole stack from source

The fastest way to run the whole stack — frontend, Go API, Postgres, and a
Gatus status source — on your own machine. One command, no Kubernetes.

**Prerequisites:** Docker Engine 24+ with the Compose plugin (`docker compose
version`).

```bash
git clone https://github.com/finish06/homepad.git
cd homepad
cp .env.example .env          # then edit POSTGRES_PASSWORD (at minimum)
docker compose -f compose.build.yaml up --build -d
```

Then open **http://localhost:8080**. On a fresh database it shows **Set up
Homepad**: the first account is the admin. Sign-up is closed after that
(`HOMEPAD_REGISTRATION` defaults to `invite_only`); add more adults with an
invite link from Administration → Accounts.

Check status and logs:

```bash
docker compose ps            # `web` shows healthy once the full chain is up
docker compose logs -f api   # look for "migrations applied"
```

What each service does:

| Service    | Image / build                    | Purpose                                            |
| ---------- | -------------------------------- | -------------------------------------------------- |
| `web`      | built from this repo's Dockerfile | nginx serving the built SPA; proxies `/api` → api |
| `api`      | built from `api/`                 | Go backend; runs DB migrations on boot            |
| `postgres` | `postgres:16-alpine`              | all persistent data (accounts, dashboards, icons) |
| `gatus`    | `ghcr.io/twin/gatus`              | uptime source the dashboard status tiles read from |

All configuration lives in `.env` (see `.env.example` for the full list with
defaults). Notes:

- **Persistence.** Everything is stored in Postgres, kept in the named volume
  `homepad_pg`. That's the only stateful volume — the web and api containers are
  disposable. Back up (or `docker compose down -v` to wipe) that volume.
- **The API build source.** `compose.build.yaml` builds the API from `api/`
  (`HOMEPAD_API_CONTEXT`, default `./api`). The quickstart `compose.yaml`
  pulls the published image instead.
- **HTTPS.** Over plain-HTTP localhost, `COOKIE_SECURE=false` (the default in
  `.env.example`) is required or the login cookie is dropped. Set it `true` only
  when you serve Homepad behind a TLS-terminating proxy.
- **Status tiles.** Gatus is optional. In the quickstart, enable it with
  `COMPOSE_PROFILES=gatus`; `compose.build.yaml` always runs it from
  `deploy/compose/gatus.yaml`. Both ship two example checks: replace them with
  your own services.

## Test

Web, from the root:

```bash
npm test                       # Vitest suite (builds the app itself for the dist checks)
npm run test:all               # every CI gate, web and API, and what couldn't run here
npm run test:e2e:install       # one-time Playwright browsers
npm run test:e2e               # full E2E suite (desktop + mobile)
npm run build && npm run lhci   # Lighthouse perf budgets (AC A8)
```

API, from `api/`:

```bash
go build ./...
go vet ./...
make test-db                   # full suite on a throwaway Postgres
```

`make test-db` starts Postgres, runs `go test ./... -count=1 -p 1` with
`DATABASE_URL` set, then removes the database. To use your own Postgres, set
`DATABASE_URL` and run `go test ./... -count=1 -p 1`. The database name must
end in `_test`. The tests empty every table, so they refuse any other name.
The tests also check the server: a fresh database is marked as a test
database on first use. A database that already has homepad tables but no mark
is refused, and the error gives the one `COMMENT ON DATABASE` line that marks
it. That happens once for a `make db-up` database made before 18.2.0.
Without `DATABASE_URL`, the database tests skip.

CI is the gate that decides a merge. [testing.md](testing.md) lists which checks
CI runs and what QA reviews.

## Deploy

The production Kubernetes manifests live in a separate platform repo, not here.
This repo ships:

- `Dockerfile`: multi-stage Vite build, served by nginx.
- `api/Dockerfile`: the Go API, on a distroless image.
- `nginx.conf`: SPA fallback and caching headers. Routing `/api/*` to
  `homepad-api` is the ingress's job (or, in Docker Compose, the web
  container's: see `compose.yaml`).
- Public images: every merge to `main` publishes
  `ghcr.io/finish06/homepad` and `ghcr.io/finish06/homepad-api` at `:<sha>`
  and `:latest`, and every `vX.Y.Z` tag publishes both at `:X.Y.Z`, `:X.Y`
  and `:X`, for linux/amd64 and linux/arm64
  (`.github/workflows/ghcr-release.yml`; see `docs/cicd.md`).
- The deployment contract: see [`specs/v1-launcher.md`](../specs/v1-launcher.md).
