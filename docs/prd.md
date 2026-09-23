# homepad — Product Requirements Document

**Version:** 0.1.0
**Created:** 2026-09-15
**Author:** Caleb Dunn
**Status:** Adopted (retroactive — written at ADD adoption, v16.2.0 already in production)

> This PRD was generated during `/add:init` adoption of an existing, shipped
> project. It documents what homepad *is* at v16.2.0 rather than proposing
> something new. The authoritative feature-level source of truth remains
> `specs/` (39 specs, indexed in `specs/README.md`).

## 1. Problem Statement

A homelab accumulates services faster than anyone can remember where they live.
URLs get bookmarked inconsistently across devices, and when something breaks
there is no single place that says so — you discover a service is down by
trying to use it.

homepad is one page that lists every service in a shared catalog, shows a live
status badge for each, and lets each user keep their own favorites and tile
order. Status is pulled server-side from Gatus; the browser never talks to
Gatus directly, so no monitoring endpoint or credential ever reaches the client
bundle.

## 2. Target Users

- **Homelab owner / admin** — curates the shared catalog, configures monitoring
  keys, manages users. Needs admin actions clearly separated from personal ones.
- **Household / team members** — non-admin users who launch services and keep
  a personal dashboard. Should never see admin affordances or get a 403.

## 3. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Status freshness | Never staler than ~60s | v13 poller, `POLL_MS = 60_000`; "Updated X ago" indicator |
| Gatus leak | Zero | `tests/e2e/no-gatus-leak.spec.ts`; `grep -ri gatus dist/` empty |
| Unit coverage (src) | ≥90% | `npx vitest run --coverage` |
| Touch targets | ≥44×44px | v19 a11y pass; `tests/browser-gate/a11y-touch-v19.spec.ts` |
| Contrast | ≥4.5:1 body, ≥3:1 UI | v19 contrast sweep, measured in the browser gate |

## 4. Scope

### In Scope

- Shared service catalog with admin CRUD
- Live status badges (UP / DEGRADED / DOWN / UNKNOWN / NOT_MONITORED)
- Per-user favorites, tile order, and dashboard layout
- Dual auth — local email+password (bcrypt) and PocketID OIDC (additive, fails closed)
- Command launcher (⌘K), theme mode, accent selection
- 12-column group grid with span-based sizing (SPEC-app-grid §10.4)
- Tile density (Large / Compact / List), uptime sparklines, alert history
- Admin settings surfaced in-app, with env-provided values badged as such

### Out of Scope

- Direct browser access to Gatus or any monitoring backend
- Per-service metrics dashboards (homepad links out; it is a launcher, not a
  monitoring UI)
- Multi-tenant or multi-household isolation

## 5. Architecture

### Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Language (frontend) | TypeScript | 5.6 | strict |
| Language (backend) | Go | 1.25.0 | separate repo, `homepad-api` |
| Frontend Framework | React | 18.3 | Vite 5 bundler |
| Styling | Tailwind CSS | 3.4 | plus `src/index.css` v15 design tokens |
| Drag & drop | dnd-kit | 6.3 | v28 tile reorder |
| Database | PostgreSQL | via `jackc/pgx` v5.10.0 | migrations in `homepad-api/migrations/` |
| Auth | bcrypt sessions + PocketID OIDC | — | OIDC additive, hidden when disabled |
| Monitoring source | Gatus | — | server-side only |

### Infrastructure

| Component | Choice | Notes |
|-----------|--------|-------|
| Git Host | Gitea (self-hosted) | `gitea.kube.calebdunn.tech/Code/homepad`; GitHub mirror at `finish06/homepad` |
| Cloud Provider | Self-hosted | k3s cluster, Pangolin ingress |
| CI/CD | Gitea Actions | `.gitea/workflows/` — ci, browser-gate, mr-staging, staging-release, prod-release; plus one GitHub workflow for GHCR |
| Containers | Docker + compose | `Dockerfile`, `compose.yaml`, nginx serving `dist/` |
| IaC | none | — |

### Environment Strategy

| Environment | Purpose | URL | Deploy Trigger |
|-------------|---------|-----|----------------|
| Local | Development & unit tests | http://localhost:5173 (API proxied to :8080) | Manual |
| Staging | Pre-prod verification | https://homepad-staging.10.17.2.213.nip.io | MR / `staging-release.yml` |
| Production | Live users | TBD — not exposed in the repo | merge to main → `prod-release.yml` |

**Environment Tier:** 3

## 6. Milestones & Roadmap

### Current Maturity: GA

Determined by evidence at adoption — 11 of 12 evidence categories present. The
single gap was an unenforced coverage threshold, closed during this init.

### Maturity Promotion Path

| From | To | Requirements |
|------|-----|-------------|
| beta → ga | Met at adoption: specs, tests, CI/CD, PR workflow, conventional commits, environment separation, release tags, protected branches, TDD evidence, spec-driven evidence, quality gates |

## 7. Key Features

See `specs/README.md` for the authoritative per-feature index and status. The
canonical foundation spec is `specs/v1-launcher.md`; everything else builds on
it.

## 8. Non-Functional Requirements

- **Performance:** Lighthouse budgets enforced via `lighthouserc.cjs`; code
  splitting verified by `tests/infra/code-splitting.test.ts`.
- **Security:** Gatus never reachable from the browser; nginx security headers
  in `nginx-security-headers.conf`; no secrets in the bundle.
- **Accessibility:** ≥44×44px touch targets, ≥4.5:1 text contrast, jest-axe in
  unit tests, real-browser measurement in the v19 gate.

## 9. Open Questions

- ~~Production URL is not recorded anywhere in the repo.~~ **Resolved 2026-09-23:**
  recorded in `docs/environments.local.md`, which is gitignored via `*.local.md`.
  It stays out of git deliberately — the GitHub mirror of this repo is public, so
  the URL is operational information for whoever holds a checkout, not a fact about
  the product. `CLAUDE.md` points at the file without naming the host.
- `layoutWidthPct` and `saveCategoryLayout` survive in `src/api.ts` from the
  superseded `SPEC-category-pane-width-layout.md`; that spec explicitly leaves
  open whether the 12-column work reuses or replaces the field, and
  SPEC-app-grid §10.4 does not answer it. `saveCategoryLayout` currently has
  zero callers.
- ~~Five spec `Status:` lines contradict the code (v13, v21, v22, v28, cap5).~~
  **Resolved 2026-09-23 (PR #479):** all 38 spec headers were reconciled against
  the code and `CHANGELOG.md` — 21 were wrong, not five. `specs/README.md` was
  rebuilt from the verified headers and now carries the rule that a `Status:`
  line is a claim, not evidence.

## 10. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-15 | 0.1.0 | Caleb Dunn | Initial retroactive PRD from /add:init adoption |
