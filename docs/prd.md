# homepad — Product Requirements Document

**Version:** 0.3.0
**Created:** 2026-09-15
**Updated:** 2026-11-22 (vision brought up to 18.0.0)
**Author:** Caleb Dunn
**Status:** Adopted (retroactive — written at ADD adoption, v16.2.0 already in production; §1–5 and §7–9 updated for 18.0.0)

> This PRD was generated during `/add:init` adoption of an existing, shipped
> project. It documents what homepad *is*, now at 18.0.0, rather than proposing
> something new. The authoritative feature-level source of truth remains
> `specs/` (50 specs, indexed in `specs/README.md`).

## 1. Problem Statement

A homelab grows faster than anyone can remember where things live. Links end
up in different bookmarks on different devices. When something breaks, you
find out by trying to use it.

A homelab is also shared. A partner, a roommate or the kids use the same
apps. Each of them needs a simple way in, and only the apps that are meant
for them.

homepad is one page for the whole household. It lists the household's apps,
shows whether each one is up, and lets each person keep their own favorites,
order and look. Admins manage the apps and the people in the browser. Kids get
a dashboard with only the apps an admin picks. Status comes from Gatus on the
server; the browser never talks to Gatus.

## 2. Target Users

Homepad serves one household per install. There are three roles:

- **Admin** — the person who runs the homelab, or anyone they make an admin.
  Adds and edits apps, sections and widgets, invites adults, makes kid
  accounts, changes roles, removes people, makes reset links, and backs up the
  dashboard. Admin actions sit apart from personal ones.
- **Member** — an adult in the household. Joins by invite link or single
  sign-on. Opens apps and keeps their own favorites, tile order, folded
  sections, theme and settings. Never sees admin controls or gets a 403.
  (The API still calls this role `user`; see §9.)
- **Kid** — a child, usually on a shared iPad. Has a name and a color, no email
  and no password. An admin signs the device in. A kid sees only the apps on
  their list, as large tiles, and can pick favorites and change the theme.
  Nothing else.

On a fresh install, the first account becomes the admin.

## 3. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Status freshness | Never staler than ~60s | v13 poller, `POLL_MS = 60_000`; "Updated X ago" indicator |
| Kid list change shows up | Within ~30s | Kid shell polls every 20s (`KID_POLL_MS`, SPEC-household-basics AC-033) |
| Gatus leak | Zero | `tests/e2e/no-gatus-leak.spec.ts`; `grep -ri gatus dist/` empty |
| Hidden apps reach a kid | Zero | homepad-api `routes_test.go`: every route has a kid class, and kid-filtered routes never return an app off the list |
| Unit coverage (src) | ≥90% | `npx vitest run --coverage` |
| Touch targets | ≥44×44px | v19 a11y pass; `tests/browser-gate/a11y-touch-v19.spec.ts` |
| Contrast | ≥4.5:1 body, ≥3:1 UI | v19 contrast sweep, measured in the browser gate |

## 4. Scope

### In Scope

- One app list (catalog) per household, edited by every admin
- Live status badges (UP / DEGRADED / DOWN / UNKNOWN / NOT_MONITORED)
- Per-person favorites, tile order, folded sections and appearance
- Accounts: admins, members and kids; invite links; changing roles and
  removing adults, always keeping one admin; an account cap
  (`HOMEPAD_MAX_ACCOUNTS`)
- Kid dashboards with a per-kid app list, hidden on the server
- Sign-in: email and password, and single sign-on (OIDC, PocketID tested),
  with sessions that survive restarts
- Passwords: admin-made one-time reset links, changing your own password, and
  a server command for the only admin
- Backup and restore of the whole dashboard as one file, and import from a
  Homepage config
- Tiles that open in a new tab, the same tab, or an overlay; the overlay is
  locked down unless an admin lets a trusted app keep its sign-in
- Command launcher (⌘K), theme mode, accent selection
- 12-column group grid with span-based sizing (SPEC-app-grid §10.4)
- Tile density (Large / Compact / List), uptime sparklines, alert history
- Admin settings surfaced in-app, with env-provided values badged as such
- Status widgets (SPEC-status-widgets, amended 2026-11-07): one short line of
  numbers per tile, fetched by the server, plus a clock and weather strip and
  web search in ⌘K

### Out of Scope

- Direct browser access to Gatus or any monitoring backend
- Per-service metrics dashboards (homepad links out; it is a launcher, not a
  monitoring UI). Charts, lists, history and detail pages stay out; the one
  line of numbers per tile above is the whole of it.
- Multi-tenant or multi-household isolation
- Blocking websites. Homepad hides apps from a kid; it does not filter the
  web. The docs point to Screen Time and Guided Access.
- Sending email (invites and reset links are shared by hand)
- Scheduled backups inside Homepad (use `pg_dump`)

## 5. Architecture

### Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Language (frontend) | TypeScript | 5.6 | strict |
| Language (backend) | Go | 1.25.0 | `api/` in this repo |
| Frontend Framework | React | 18.3 | Vite 5 bundler |
| Styling | Tailwind CSS | 3.4 | plus `src/index.css` v15 design tokens |
| Drag & drop | dnd-kit | 6.3 | v28 tile reorder |
| Database | PostgreSQL | via `jackc/pgx` v5.10.0 | migrations in `api/migrations/` |
| Auth | bcrypt passwords, Postgres sessions, OIDC | — | OIDC optional, hidden when off |
| Monitoring source | Gatus | — | server-side only |

### How it works

- **Two images.** `web` (nginx serving the built app) and `homepad-api` (Go),
  with Postgres, built from one repo (`api/` holds the API). One tag releases
  both. Deploy them as a pair, API first. The quickstart
  `compose.yaml` pins both to the same version.
- **Migrations.** Numbered SQL files in `api/migrations/` run when the
  API starts, in one transaction. Since 18.0.0 each one is recorded in a
  `schema_migrations` table and runs once. `0021` (the household catalog) is
  one-way: going back means restoring a database backup.
- **Sessions.** Kept in Postgres since 17.0.0. Only a hash of each token is
  stored. Adults stay signed in for 30 days and kids for 180, both renewed as
  they're used. A restart or deploy signs nobody out.
- **Roles.** `admin`, `user` (shown as "member") and `kid`. Every API route has
  a class: public, catalog-free, kid-filtered, kid-forbidden, admin-only or
  catalog-write.
  The server, not the screen, keeps kids to their apps.
- **Sign-up.** `HOMEPAD_REGISTRATION` defaults to `invite_only` (since
  17.1.0). The first account on a fresh install signs up and is the admin.
  After that, adults join by invite link. `open` still works if set.
- **Single sign-on.** OIDC with PKCE. An account is linked or made only when
  the provider says the email is verified (`email_verified`, 17.1.0). Under
  `invite_only`, a new identity gets an account only through `OIDC_ADMIN_GROUP`
  or `OIDC_MEMBER_GROUP` (18.0.0). A failed sign-in lands on the sign-in
  screen with a plain message.
- **Sign-in limits.** Per client: 10 sign-in tries a minute. Per email: after
  10 wrong passwords in 15 minutes, password sign-in waits 15 minutes. Limits
  live in memory. `HOMEPAD_TRUSTED_PROXIES` tells the API which proxies to
  trust for the client address; without it, everyone shares one limit.
- **Overlay sandbox.** An app in the overlay runs without `allow-same-origin`
  unless an admin turns on "Let this app keep its sign-in" for it. An app on
  Homepad's own address never gets it. Both nginx configs send
  `X-Frame-Options: DENY` and `frame-ancestors 'none'`, so nothing can frame
  Homepad.
- **Widgets.** The API fetches every number. App keys are stored encrypted
  with `HOMEPAD_SECRET_KEY`, and never sent to the browser. One guarded
  client makes every fetch: no redirects, no link-local or metadata
  addresses, size and time caps.
- **Backups.** One JSON file (`schemaVersion` 2 since 18.0.0), with no ids,
  password hashes or sessions. Its JSON Schemas live in
  `api/docs/schema/`.

### Infrastructure

| Component | Choice | Notes |
|-----------|--------|-------|
| Git Host | Gitea (self-hosted) | `Code/homepad`; public GitHub mirror at `finish06/homepad` |
| Hosting | Self-hosted Kubernetes | The public quickstart runs on Docker Compose |
| CI/CD | Gitea Actions | `.gitea/workflows/` — ci, browser-gate, mr-staging, staging-release, prod-release; plus one GitHub workflow for GHCR |
| Containers | Docker + compose | `Dockerfile`, `compose.yaml`, nginx serving `dist/`; public images on `ghcr.io/finish06` |
| IaC | none | — |

### Environment Strategy

| Environment | Purpose | URL | Deploy Trigger |
|-------------|---------|-----|----------------|
| Local | Development & unit tests | http://localhost:5173 (API proxied to :8080) | Manual |
| Staging | Pre-prod verification | Internal, one shared slot; not in public docs | PR (`mr-staging.yml`); merge to main (`staging-release.yml`) |
| Production | Live users | Not in the repo (`docs/environments.local.md`, gitignored) | A `vX.Y.Z` tag runs `prod-release.yml`, which builds and checks but does not deploy; promotion is manual and digest-pinned |

**Environment Tier:** 3

## 6. Milestones & Roadmap

### Current Maturity: GA

Determined by evidence at adoption — 11 of 12 evidence categories present. The
single gap was an unenforced coverage threshold, closed during this init.

### Maturity Promotion Path

| From | To | Requirements |
|------|-----|-------------|
| beta → ga | Met at adoption: specs, tests, CI/CD, PR workflow, conventional commits, environment separation, release tags, protected branches, TDD evidence, spec-driven evidence, quality gates |

### Roadmap

Created 2026-10-11 from a backlog triage: of 71 open issues, **26 were closed with
evidence** (fixed on `main`, obsolete, or duplicate — each verified against the code
or a real-browser measurement rather than a PR title), leaving 45 that are still true.
Those 45 are organised below. The PRD holds the horizons; each milestone file holds
status and detail.

| Horizon | Milestone | Goal | Status |
|---|---|---|---|
| **Now** | [M9 — 18.0.1: release follow-ups](milestones/M9-18-0-1-follow-ups.md) | Fix what QA found on the 18.0.0 release, and clean up the spec and doc drift from 17.x–18.0 | NOT_STARTED (active) |
| **Now** | [M2 — QA pipeline reliability](milestones/M2-qa-pipeline-reliability.md) | One reviewer per PR, a reserved staging slot, a QA browser env that fails only for real | IN_PROGRESS |
| **Now** | [M7 — Growth: install funnel + launch](milestones/M7-growth-install-funnel.md) | Organic growth plus the launch posts. The 3× by 11-12 target was missed (accepted by Caleb 11-07) | IN_PROGRESS (funnel done; launch waits on Caleb) |
| **Next** | [M3 — Robustness & security](milestones/M3-robustness-security.md) | ErrorBoundary for lazy overlays (#341), a Content-Security-Policy (#529). The iframe sandbox (#334) shipped in 18.0.0 | NOT_STARTED |
| **Next** | [M4 — Accessibility debt](milestones/M4-accessibility-debt.md) | AA everywhere, starting with the dark-mode login (#379) | NOT_STARTED |
| **Later** | [M5 — Non-admin arrange](milestones/M5-non-admin-arrange.md) | Per-user tile drag for non-admins (v29 §3.3) — needs a spec first | NOT_STARTED |
| **Later** | [M6 — Layout & design evolution](milestones/M6-layout-design-evolution.md) | Kare-led layout and visual decisions | NOT_STARTED |
| **Done** | [M8 — Household accounts (17.0.0 → 18.0.0)](milestones/M8-household-accounts.md) | Kid accounts, household accounts, backup and import, status widgets, managing adults, safer sign-in | COMPLETE (2026-11-22 — 18.0.0 in production) |
| **Done** | [M1 — 16.7.0 release + quick wins](milestones/M1-release-16-7-quick-wins.md) | Ship the 10 unreleased commits; clear 10 verified quick wins and 5 spec-cleanup decisions | COMPLETE (2026-10-12 — 16.7.1 in production) |

**Refreshed 2026-11-22.** Between 10-13 and 11-22 the work that shipped (17.0.0,
17.1.0, 18.0.0) came from Caleb's household-accounts priorities, not from this
table. M8 records it after the fact. The refresh re-checked every issue the
milestones name against Gitea, and sorted the 40 issues opened since 10-11 into
M2, M3 and M9.

**Decisions are folded into milestones**, not held in a separate queue (Caleb,
2026-10-11): #368 #172 #295 #449 #200 → M1; #487 → M2; #488 #477 → M4; #403 → M6.

## 7. Key Features

See `specs/README.md` for the authoritative per-feature index and status. The
canonical foundation spec is `specs/v1-launcher.md`; everything else builds on
it.

What 17.0.0 to 18.0.0 added, for a household:

| Feature | Shipped | Spec |
|---|---|---|
| Kid accounts, and sign-ins that survive a restart | 17.0.0 | `SPEC-kid-accounts` |
| Invite-only by default, add an adult by invite link, every admin edits the apps | 17.1.0 | `SPEC-household-basics` |
| Backup, restore and import from Homepage | 17.1.0 | `SPEC-backup-import` |
| Status widgets: numbers on tiles, clock, weather, ⌘K web search (Phase 1) | 17.1.0 | `SPEC-status-widgets` |
| One app list for the household, not the first admin | 18.0.0 | `SPEC-household-catalog-owner` |
| Remove an adult, change a role, always one admin | 18.0.0 | `SPEC-household-manage-adults` |
| Reset links and changing your own password | 18.0.0 | `SPEC-password-reset-link` |
| Sign-in limits, verified emails and groups for single sign-on | 17.1.0 / 18.0.0 | `SPEC-signin-hardening` |
| Stricter overlay, with a per-app opt-in | 18.0.0 | `SPEC-iframe-sandbox-optin` |

User docs: `docs/accounts.md`, `docs/kid-accounts.md`,
`docs/single-sign-on.md`, `docs/backup-import.md`, `docs/widgets.md`.

## 8. Non-Functional Requirements

- **Performance:** Lighthouse budgets enforced via `lighthouserc.cjs`; code
  splitting verified by `tests/infra/code-splitting.test.ts`.
- **Security:** Gatus never reachable from the browser; nginx security headers
  in `nginx-security-headers.conf`, including `X-Frame-Options: DENY` and
  `frame-ancestors 'none'`; no secrets in the bundle. Session tokens, invite
  tokens and reset tokens are stored only as hashes. Widget keys are stored
  encrypted and never leave the server. Kids are filtered on the server, on
  every route that returns apps.
- **Upgrades:** each release says in `CHANGELOG.md` what changes on upgrade.
  A major version means an upgrade with a cost: 17.0.0 signed everyone out
  once, and 18.0.0's migration is one-way.
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
  zero callers. *(Still true 2026-11-22.)*
- ~~Five spec `Status:` lines contradict the code (v13, v21, v22, v28, cap5).~~
  **Resolved 2026-09-23 (PR #479):** all 38 spec headers were reconciled against
  the code and `CHANGELOG.md` — 21 were wrong, not five. `specs/README.md` was
  rebuilt from the verified headers and now carries the rule that a `Status:`
  line is a claim, not evidence. Re-checked for 17.0.0–18.0.0 on 2026-11-22.
- ~~How does an admin add an adult without opening sign-up for everyone?~~
  **Resolved in 17.1.0:** invite links, and sign-up is `invite_only` by default.
- ~~Can an adult be removed without losing the apps?~~ **Resolved in 18.0.0:**
  the app list belongs to the household, so removing anyone, even the first
  admin, keeps it.
- ~~How does someone get back in after forgetting a password, with no email?~~
  **Resolved in 18.0.0:** an admin makes a one-time reset link; the only admin
  runs `reset-link` on the server.
- **The member role's name.** The UI and docs say "member"; the API and
  database still say `user` (`POST /api/admin/invites` takes `user`, #599).
  Rename in the API, or document `user` for integrators?
- **Status widgets Phase 2** (Pi-hole, qBittorrent, Proxmox VE) is specified
  but not scheduled.
- **Kid passwords.** SPEC-kid-accounts §2.2 allowed an optional password for
  an older kid on another device. It was not built: a kid has no email, so no
  sign-in path could use it. It needs its own sign-in design if wanted.

## 10. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-15 | 0.1.0 | Caleb Dunn | Initial retroactive PRD from /add:init adoption |
| 2026-10-11 | 0.2.0 | roadmap | First roadmap: six milestones (M1–M2 Now, M3–M4 Next, M5–M6 Later) built from a backlog triage that closed 26 of 71 issues with evidence |
| 2026-10-12 | 0.2.1 | cycle | M1 COMPLETE after cycle-1: 16.7.0 and 16.7.1 released, 16.7.1 in production, 16 issues closed. Active milestone → M2 |
| 2026-10-12 | 0.2.2 | roadmap | M1 archived: Now → Done (milestone file kept). Now holds M2 only. Spec count corrected 39 → 40 |
| 2026-10-13 | 0.2.3 | roadmap | M7 (growth: install funnel + launch) added to Now, ahead of M3 (Caleb's 30-day goal). Cycle-2 closed; 16.7.2 in production |
| 2026-11-07 | 0.2.4 | Caleb Dunn | §4 amended for SPEC-status-widgets (Q1 a): one line of server-fetched numbers per tile, a clock and weather strip, and ⌘K web search are in scope; charts, lists, history and detail pages stay out |
| 2026-11-22 | 0.2.5 | roadmap | Refresh after 18.0.0: M8 (household accounts, 17.0.0–18.0.0) added as Done; M9 (18.0.1 follow-ups) added to Now as the active milestone; M7 target marked missed; #334 done; #529 into M3; new QA-env issues into M2 |
| 2026-11-22 | 0.3.0 | Caleb Dunn (via Claude) | Vision brought up to 18.0.0: problem statement and users now cover the household (admins, members, kids); scope adds accounts, kid dashboards, reset links, backup and import, and the overlay sandbox (the 2026-11-07 widgets amendment kept); architecture adds Postgres sessions, the migration runner, roles and route classes, verified-email and group rules for SSO, sign-in limits and the sandbox opt-in; §7 lists the 17.0.0–18.0.0 features; §9 closes three questions and adds three. Internal hostnames and the staging address removed (public mirror). §6 unchanged. |
