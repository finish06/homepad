# homepad

Self-hosted launcher/homepage for a homelab: one page listing every service in a
shared catalog with live Gatus-backed status badges, per-user favorites and tile
order. One repo holds both halves: the React + Vite web app at the root, and the
Go API in `api/` (module `github.com/finish06/homepad/api`). The API moved in
from `homepad-api` (now archived) in 85e1a67, with its history.

## Methodology

This project follows **Agent Driven Development (ADD)** — specs drive agents,
humans architect and decide, trust-but-verify ensures quality.

- **PRD:** docs/prd.md
- **Specs:** specs/ (50 specs — `specs/README.md` is the authoritative index)
- **Plans:** docs/plans/
- **Config:** .add/config.json

Document hierarchy: PRD → Spec → Plan → User Test Cases → Automated Tests → Implementation

> **Adoption note.** homepad predates ADD and has its own established spec
> practice: house format with `AC-NNN` IDs, `Status:` lines, Walt (product) /
> Kare (design) sign-off sections, `DECISIONS.md` as a decision record, and
> `test-plan-v1.md` as the AC-to-test methodology reference. ADD adopts
> `specs/` as-is. Do not reformat existing specs.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.6 (strict) |
| Framework | React | 18.3 |
| Bundler | Vite | 5 |
| Styling | Tailwind CSS 3.4 + `src/index.css` v15 tokens | — |
| Drag & drop | dnd-kit | 6.3 |
| Unit tests | Vitest + Testing Library + jest-axe | 2.1 |
| Browser tests | Playwright | 1.60 |
| Backend | Go / PostgreSQL (`api/`) | 1.25 / pgx v5 |

**Node:** `>=20 <23` (`.nvmrc` pins 22). Node 16 will not build this repo.

## Commands

### Development
```
npm run dev                      # Vite dev server on :5173, /api proxied to :8080
npx vitest run --coverage        # Unit tests + coverage
npm run test:gate                # Playwright browser gate (mocked API, serves dist/)
npm run test:e2e                 # Playwright e2e (mocked API, serves dist/ on :4174)
npm run lint                     # ESLint
npm run typecheck                # tsc --noEmit
npm run build                    # typecheck + vite build
```

**`npm run build` must run before `npx vitest run`** on a clean checkout —
`tests/infra/pwa-icons.test.ts` and `tests/infra/bundle-budget.test.ts` read from
`dist/`. Both fail rather than skip when it is missing, deliberately: a byte
budget or a security guard that opts out when its subject is absent passes
vacuously (#498).

### API (run from `api/`)
```
go build ./...                   # build
go vet ./...                     # lint
go test ./... -count=1 -p 1      # full suite; needs Postgres (see below)
make db-up                       # local Postgres on :5432 (database homepad_test)
make test-db                     # full suite on a throwaway Postgres, then removes it
```

The integration tests read `DATABASE_URL`. Without it they skip, so a bare
`go test` prints `ok` without testing much. The database name must end in
`_test` (for example `homepad_test`); `internal/dbguard` refuses any other name
and the production host, and has no override.

### Run the API and the web together
```
cd api && make db-up
DATABASE_URL='postgres://homepad:homepad@localhost:5432/homepad_test?sslmode=disable' \
  COOKIE_SECURE=false make run   # API on :8080 (shell env only; it reads no .env)
npm run dev                      # in another shell, from the root: web on :5173
```

Open http://localhost:5173. Vite proxies `/api` to `:8080`, so the browser sees
one origin. `docker compose -f compose.build.yaml up --build` runs the whole
stack from source instead, with the API built from `api/`.

### Releases

One tag `vX.Y.Z` on this repo releases both images: `homepad` (web) and
`homepad-api` (API). The image names did not change.

### ADD Workflow
```
/add:spec {feature}                  # Create feature specification
/add:plan specs/{feature}.md         # Create implementation plan
/add:tdd-cycle specs/{feature}.md    # Execute TDD cycle
/add:verify                          # Run quality gates
/add:deploy                          # Commit and deploy
```

## Architecture

### Key Directories
```
api/            Go API: cmd/, internal/, migrations/ (its own go.mod, Dockerfile, Makefile)
api/migrations/ Numbered SQL migrations, run on API boot
src/app/        App shell, header, StatusBar (health panel), user menu
src/grid/       AppGrid, tile density, tile edit, drag reorder
src/launcher/   ⌘K command launcher
src/library/    Settings panel, service form, catalog browse
src/alerts/     Toasts, alert history
src/theme/      Theme mode + accent
src/lib/        layout, icons, ranker, safeUrl, categoryColor
tests/infra/    Source-contract suites (readFileSync greps over configs/CSS)
tests/browser-gate/  Real-browser interaction gate, mocked API
tests/e2e/      End-to-end against the built app (mocked API, vite preview :4174)
qa-kit/         CDP smoke tooling
```

### Environments

- **Local:** Vite on :5173, API proxied to :8080
- **Staging** and **Production:** k3s. Prod sits behind Pangolin ingress. Both
  URLs are in `docs/environments.local.md` — gitignored (`*.local.md`), because the GitHub
  mirror of this repo is public. Tagging `vX.Y.Z` triggers `prod-release.yml`,
  which builds and validates but deliberately does **not** deploy; promotion is
  manual and digest-pinned from `Code/homelab`.

## Quality Gates

- **Mode:** strict
- **Coverage threshold:** 90% (src)
- **Type checking:** blocking
- **E2E required:** yes

All gates defined in `.add/config.json`. Run `/add:verify` to check.

## Source Control

- **Git host:** `Code/homepad` on Gitea, GitHub mirror (`finish06/homepad`)
- **Branching:** Feature branches off `main` (protected)
- **Commits:** Conventional commits
- **CI/CD:** Gitea Actions (`.gitea/workflows/`), one set of workflows for web and API

## Collaboration

- **Autonomy level:** autonomous
- **Review gates:** PR review required; commits on feature branches are free
- **Deploy approval:** required for production
