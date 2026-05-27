# homepad v1 — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-05-26
**Methodology:** ADD (getadd.dev), POC maturity dial

---

## Problem

Homelab dashboards today force a tradeoff: minimal-but-thin (Dashlet, Heimdall) or feature-rich-but-cluttered (Homepage, Dashy). Caleb wants a dashboard that is **as pretty and fast as Dashlet**, **live like Homepage**, **multi-user from day one**, and **forward-compatible with K8s-native auto-discovery** — but ships v1 small and right.

## v1 Goal

A prettier launcher: tile-based service catalog with **live uptime status** per service (sourced from an existing Gatus instance), **multi-user local accounts**, and **per-user favorites/layout** over a **shared service catalog**. Mobile and desktop both polished.

## In scope (v1)

- Local accounts (email + password, bcrypt-hashed); login / logout / register
- Roles: `admin` (catalog edit) and `user` (view + personalize)
- Shared service catalog: `{name, description, url, icon, gatus_key?}`
- Live status badges per tile, pulled from Gatus, max 60s stale
- Per-user favorites + manual sort order
- Admin CRUD on the catalog via the UI
- Responsive UI: phone (≥ 390px) and desktop (≥ 1024px)
- Postgres-backed persistence
- Deploy: K8s single replica, behind Pangolin (external) + LAN-direct (via nip.io)

## Out of scope (deferred)

- Auto-discovery (K8s Ingress / Docker labels) — **v2 priority**
- OIDC SSO + account linking — v2
- Service-native widgets (Sonarr, Jellyfin, Plex queue, Gitea PRs) — v3+
- Cmd-K search palette — v2
- Notifications / alerting (Gatus already handles)
- Multi-tenancy across orgs

## Stack

- **Frontend:** React + Vite, TypeScript, Tailwind. Mobile-first responsive.
- **Backend:** Go (fits low-latency Gatus polling + future K8s client work).
- **DB:** Postgres (per Caleb's standing "Postgres is the default" rule).
- **Auth:** Server-side sessions in HttpOnly cookies (v1 simple). Bcrypt for passwords.
- **Deploy:** K8s, single replica, ConfigMap + Secret, Pangolin Ingress.

## Repository layout (polyrepo)

- `Code/homepad` — **frontend** (React + Vite + TS + Tailwind). User-facing app. Holds the canonical spec at `specs/v1-launcher.md`.
- `Code/homepad-api` — **backend** (Go). Postgres client, Gatus poller, session auth, REST API. Its `README.md` links back to the spec in `Code/homepad`.
- `Code/homepad-deploy` *(TBD — see open questions)* — K8s manifests (Deployment, Service, Ingress, Secret/ConfigMap, Postgres connection wiring).

**Same-domain deployment (recommended).** The Pangolin Ingress for the homepad hostname proxies `/api/*` to the `homepad-api` Service and everything else to the `homepad` (web) Service. This keeps session cookies same-site without CORS gymnastics:

```
homepad.calebdunn.tech/        → homepad (web) Service     (port 80, static SPA)
homepad.calebdunn.tech/api/*   → homepad-api Service       (port 8080, Go)
```

Locally during dev, the Vite dev server proxies `/api/*` to `http://localhost:8080` so the dev loop matches prod.

## Visual direction (v1)

"Prettier than Dashlet" without copying it. Stitch's pick (Caleb gave latitude — refinable in frontend phase):

- **Aesthetic:** clean, modern, monochrome surface + one accent color. Solid surfaces with real contrast — **no glassmorphism** (that's the thing we're moving away from). Reference moods: Linear, Vercel dashboard, Things.
- **Themes:** light + dark, system-aware default. Per-user theme override stored on the account.
- **Tile:** rounded card, subtle elevation on hover, service icon (selfh.st) ~48px, name (semibold) + 1-line description (muted). Status indicator is a small colored ring or dot top-right of the icon — present but not loud.
- **Layout:** responsive grid — 2 cols at 390px, 3 at 768px, 4 at 1024px, 5–6 at 1440px+. Generous gutters. Favorites pinned to the top section.
- **Typography:** system sans stack (Inter → SF Pro → Segoe UI fallback). One weight scale, no display fonts.
- **Motion:** functional only — hover lift, tile reorder spring, page transitions out. No decorative animation.

## External dependencies

- **Gatus** at `http://gatus.10.17.2.213.nip.io` (LAN / cluster-internal only).
  - No native API auth — security is network-level (LAN reachability only).
  - Endpoints homepad backend uses:
    - `GET /api/v1/endpoints/statuses` — full snapshot (polled).
    - `GET /api/v1/endpoints/{group}_{name}/uptimes/24h` — for "uptime over 24h" display on tile hover (optional v1 nice-to-have, can defer).
    - `GET /health` — backend startup check.
  - Mapping: each catalog entry has an optional `gatus_key` shaped `"{group}_{name}"` (URL-safe form Gatus uses).
- **Icons:** [`selfh.st/icons`](https://selfh.st/icons/) via jsDelivr CDN. CC-BY-4.0 → app footer credits "Icons by selfh.st".
  - URL pattern: `https://cdn.jsdelivr.net/gh/selfhst/icons/{format}/{ref-name}.{ext}` (`svg` / `png` / `webp`).
  - Ref name: project name lowercased, non-alphanumeric → `-`.
  - Variants: `-light` / `-dark` suffix when admin wants theme-matched.
  - Backend caches the icons `index.json` from the repo on startup → frontend admin UI autocompletes icon picker from this list.

## Network & security topology

**Hard rule:** Gatus is **never exposed externally**. Only the homepad backend may reach Gatus, and only over cluster-internal networking (ClusterIP service or local LAN IP, never via Pangolin / public DNS).

Data path for status:

```
browser ──HTTPS via Pangolin──▶ homepad backend (Go, in K8s)
                                       │
                                       ▼ (cluster-internal only)
                                    Gatus
```

Implications baked into the design:

- The frontend never makes direct calls to Gatus. All status data is served by the homepad backend via `GET /api/services` (which embeds badge state) or `GET /api/status` (raw cache).
- The backend polls Gatus on an interval (≤ 30s) and caches the snapshot in memory; the frontend hits the cache, never proxies live through to Gatus.
- The Gatus base URL lives in a K8s Secret/ConfigMap mounted into the backend pod — it never appears in frontend bundles, env, or browser network traces.
- If Caleb later adds OIDC, even authenticated external users still can't reach Gatus directly; the boundary holds.

## Acceptance criteria (testable)

| # | Criterion | How verified |
|---|---|---|
| A1 | User can register, log in, log out with email + password | Integration test: `POST /api/register` → `POST /api/login` → cookie set → `GET /api/me` 200; `POST /api/logout` → `GET /api/me` 401 |
| A2 | Authenticated user sees the shared catalog with name/icon/description/URL per tile | E2E: seed catalog, log in, assert N tiles render with correct fields |
| A3 | Each tile shows a live status badge: UP (green), DOWN (red), DEGRADED (yellow), UNKNOWN (gray) | E2E with mocked Gatus: assert badge color per state |
| A4 | Status staleness < 60s relative to latest Gatus probe | Backend test: poll loop ≤ 30s; status response includes `as_of` timestamp |
| A5 | Per-user favorites + manual sort order persist across sessions | Integration: mark favorite, log out, log in, favorite & order persist |
| A6 | Admin can create / edit / delete catalog entries via the UI; non-admin gets 403 | Integration test for both roles |
| A7 | Layout is usable on 390×844 (iPhone 13) and 1440×900 (desktop) without horizontal scroll or overlap | Playwright visual + functional test at both viewports |
| A8 | Cold LAN load: TTI < 1.5s desktop, FCP < 800ms | Lighthouse run in CI |
| A9 | If Gatus is unreachable, app still loads; all tiles show UNKNOWN; no 5xx from `/api/services` | Backend test with Gatus URL pointed to a black hole |
| A10 | All persistent state in Postgres; backend honors `DATABASE_URL` env var | Smoke test: fresh Postgres, run migrations, app boots |
| A11 | Gatus is never reachable from a browser session — no JS bundle, network trace, CORS pre-flight, or public route exposes the Gatus URL | Inspect built bundle (no Gatus URL); confirm no Ingress / Pangolin route exists for Gatus; backend serves all status data |

## Key user flows

1. **Bootstrap:** First registered user → auto-promoted to `admin`. Subsequent users default to `user`. Admin can toggle a `HOMEPAD_REGISTRATION` setting between `open` / `invite_only` after onboarding.
2. **Daily use:** Open `homepad.calebdunn.tech` (or LAN URL) → see catalog → glance at status badges → click tile to launch service.
3. **Personalization:** Star icon toggles favorite. Drag-handle on tile (desktop) or long-press (mobile) reorders.
4. **Admin edits:** Settings → Catalog → add/edit/delete entries. Optional `gatus_key` binds a tile to a Gatus endpoint.

## Edge cases

- Gatus down/slow → tiles render `UNKNOWN`, no infinite spinner.
- Service has no `gatus_key` → "unmonitored" indicator (no green/red).
- Last remaining admin tries to delete self → blocked with a clear error.
- Duplicate service names → allowed; uniqueness enforced on a stable `slug`.
- Long names / descriptions → truncate with tooltip.
- Mobile reorder → long-press-drag (no hover dependency).

## Success metrics

- v1 ships behind Pangolin + LAN.
- Caleb uses it as his actual homepage ≥ 1 week without reverting.
- p95 `/api/services` < 100ms (cached).
- Lighthouse Performance ≥ 90 desktop, ≥ 80 mobile.

## Resolved decisions (sign-off log)

| # | Decision | Resolution |
|---|---|---|
| Q1 | Gatus URL + auth | ✅ `http://gatus.10.17.2.213.nip.io`, no auth, internal-only (per Joe/homie 2026-05-26) |
| Q2 | Admin bootstrap | ✅ First-registered = admin + `HOMEPAD_REGISTRATION` env (`open` / `invite_only`) |
| Q3 | Password reset in v1 | ✅ Out — OIDC arriving in v2; admin can manual-reset until then |
| Q4 | Visual direction | ✅ Stitch's call — see "Visual direction" section above (Linear/Vercel/Things lineage, no glassmorphism) |
| Q5 | Icons | ✅ selfh.st icons via jsDelivr CDN, CC-BY attribution in footer |
| Q6 | Network/security topology | ✅ Browser → homepad backend → Gatus, never browser → Gatus directly (hard rule) |

## Out-of-band TODO

- Caleb to create `Code/homepad` empty Gitea repo so Stitch can push `specs/v1-launcher.md` and (later) code.
- (Optional, defense-in-depth) Caleb / Joe to consider turning on Gatus basic-auth even on LAN — not v1-blocking.

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A10 → RED→GREEN→REFACTOR→VERIFY.
