# homepad

Self-hosted launcher/homepage for a homelab: one page listing every service in a
shared catalog with live Gatus-backed status badges, per-user favorites and tile
order. This repo is the React + Vite web frontend; the Go backend lives in
`homepad-api`.

## Methodology

This project follows **Agent Driven Development (ADD)** — specs drive agents,
humans architect and decide, trust-but-verify ensures quality.

- **PRD:** docs/prd.md
- **Specs:** specs/ (39 specs — `specs/README.md` is the authoritative index)
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
| Backend | Go / PostgreSQL (`homepad-api`) | 1.25 / pgx v5 |

**Node:** `>=20 <23` (`.nvmrc` pins 22). Node 16 will not build this repo.

## Commands

### Development
```
npm run dev                      # Vite dev server on :5173, /api proxied to :8080
npx vitest run --coverage        # Unit tests + coverage
npm run test:gate                # Playwright browser gate (mocked API, serves dist/)
npm run test:e2e                 # Playwright e2e (needs a live API)
npm run lint                     # ESLint
npm run typecheck                # tsc --noEmit
npm run build                    # typecheck + vite build
```

**`npm run build` must run before `npx vitest run`** on a clean checkout —
`tests/infra/pwa-icons.test.ts` reads from `dist/`.

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
src/app/        App shell, header, StatusBar (health panel), user menu
src/grid/       AppGrid, tile density, tile edit, drag reorder
src/launcher/   ⌘K command launcher
src/library/    Settings panel, service form, catalog browse
src/alerts/     Toasts, alert history
src/theme/      Theme mode + accent
src/lib/        layout, icons, ranker, safeUrl, categoryColor
tests/infra/    Source-contract suites (readFileSync greps over configs/CSS)
tests/browser-gate/  Real-browser interaction gate, mocked API
tests/e2e/      End-to-end, requires a live API
qa-kit/         CDP smoke tooling
```

### Environments

- **Local:** Vite on :5173, API proxied to :8080
- **Staging:** https://homepad-staging.10.17.2.213.nip.io
- **Production:** k3s behind Pangolin ingress; merge to `main` triggers `prod-release.yml`

## Quality Gates

- **Mode:** strict
- **Coverage threshold:** 90% (src)
- **Type checking:** blocking
- **E2E required:** yes

All gates defined in `.add/config.json`. Run `/add:verify` to check.

## Source Control

- **Git host:** Gitea (`gitea.kube.calebdunn.tech/Code/homepad`), GitHub mirror
- **Branching:** Feature branches off `main` (protected)
- **Commits:** Conventional commits
- **CI/CD:** Gitea Actions (`.gitea/workflows/`)

## Collaboration

- **Autonomy level:** autonomous
- **Review gates:** PR review required; commits on feature branches are free
- **Deploy approval:** required for production
