# homepad v6 — Admin Settings UI + App-Management APIs — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-06-10
**Methodology:** ADD (getadd.dev), POC maturity dial
**Builds on:** [`specs/v1-launcher.md`](./v1-launcher.md), [`specs/v2-app-icons.md`](./v2-app-icons.md), [`specs/v4-app-categories.md`](./v4-app-categories.md)

---

## Problem — and what already exists

App management in homepad already works, but it's **scattered** and **partly
ad-hoc**:

- **v1 already ships the core mutating endpoints** — admin-gated
  `POST /api/services`, `PATCH /api/services/{id}`, `DELETE /api/services/{id}`
  (see `internal/api/services.go`: each checks `u.Role != "admin"` → 403).
  Adding, removing, and updating an app's URL are therefore **already
  possible at the API layer**.
- **v2 folds the admin controls into an ephemeral "edit mode"** — a client-only
  header toggle (rendered only for admins) where the per-tile add/edit/delete and
  icon-upload affordances live. It is *convenience only*; the server gate is the
  real boundary.
- **v4 (categories)** adds another batch of admin-gated mutations
  (`/api/categories*`, category assignment).

So the gap is **not** "we need add/remove/update-URL endpoints" — those exist.
The gap is that there's **no coherent admin surface**: edit mode is a transient,
per-tile, reload-it-and-it's-gone affordance with no home for catalog-wide
operations, no dedicated settings page, no place that gathers "manage apps,
manage categories, manage who's an admin" in one reviewable spot. And the auth
story, while correct per-endpoint, has never been written down as **one
invariant** ("every mutating endpoint re-checks admin server-side, every time").

This spec **consolidates** what exists, **names the gaps**, and defines the
admin settings UX coherently — it does **not** re-specify the v1 endpoints that
already work.

## v6 Goal

A dedicated, admin-only **Settings surface** that is the single home for
catalog administration, backed by the **already-existing** app-management APIs
(plus a small number of genuinely-new endpoints for the gaps), with the
**server-side admin authorization invariant stated explicitly and tested as a
cross-cutting property** across every mutating endpoint.

## In scope (v6)

- A **dedicated admin Settings page** (route + navigation), admin-only, that
  hosts:
  - **App management** — a list/table of all services with add, edit (all
    fields incl. **URL**), and delete, plus a clean **URL-update UX** (the gap
    edit-mode handles awkwardly today).
  - **Category management** (from v4) surfaced here too (create/rename/reorder/
    delete + assignment), so taxonomy lives next to the apps it organizes.
  - A pointer to **v2 icon management** (upload light/dark PNGs) — reuse the
    existing per-service icon endpoints; Settings links into per-app icon editing
    rather than re-implementing it.
- **Consolidation decision:** define the relationship between v2's ephemeral
  **edit mode** and the new **Settings page** (recommendation below) so there's
  one coherent admin mental model, not two overlapping ones.
- **The admin-authorization invariant**, stated once and enforced/tested as a
  cross-cutting rule over *every* mutating endpoint (v1 services CRUD, v2 icons,
  v4 categories, and any v6 additions).
- **Identified, scoped gaps** turned into a small set of new endpoints **only
  where a real need exists** (e.g. bulk delete, a stable services-list read for
  admin). No speculative endpoints.
- Back-compat: every existing endpoint and the seeded 39-app catalog keep
  working unchanged; Settings is **additive UI** over existing APIs.

## Out of scope (deferred)

- **Re-specifying or changing v1's `POST`/`PATCH`/`DELETE /api/services`** —
  they exist, they're admin-gated, they're correct. v6 *consumes* them. (URL
  update is just `PATCH … {url}` — already supported; the gap is UX, not API.)
- **Re-implementing v2 icon upload** — Settings links to it; v2 owns it.
- **A full RBAC system / granular permissions** — homepad has exactly two roles
  (`admin`, `user`) from v1. v6 does **not** invent permission tiers.
- **User administration beyond promoting/demoting admins** — managing other
  users (invite, disable, password reset) is a larger auth feature; v6 includes
  **admin role assignment only if Caleb wants it** (NEEDS JOE Q2) and otherwise
  leaves user lifecycle to v1's bootstrap + OIDC.
- **Audit log of admin actions** — a good idea, but its own feature; flagged,
  not built.
- **Server-rendered settings / new infra** — Settings is another React route in
  the existing SPA; no new service, no new env var.

## Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. New moving parts are
**mostly frontend** (a Settings route + management views), plus a **small,
shared admin middleware** refactor on the backend (extract the repeated
`u.Role != "admin"` check into one place so the invariant is enforced uniformly)
and at most a couple of new admin endpoints for genuine gaps. No PVC, no new
infra, no new env vars.

---

## What already exists vs. what's new

| Capability | Status | Where |
|---|---|---|
| Add an app | **Exists** | v1 `POST /api/services` (admin-gated) |
| Update an app's **URL** (and other fields) | **Exists** | v1 `PATCH /api/services/{id}` (admin-gated) |
| Remove an app | **Exists** | v1 `DELETE /api/services/{id}` (admin-gated) |
| Per-app light/dark icons | **Exists** | v2 `PUT/DELETE /api/services/{id}/icon/{variant}` (admin-gated) |
| Categories CRUD + assignment | **Exists (once v4 lands)** | v4 `/api/categories*`, `PATCH …/services/{id}{categoryId}` |
| Admin controls UI | **Exists, but ephemeral** | v2 client-only **edit mode** (per-tile, resets on reload) |
| **Dedicated Settings page** | **GAP — new in v6** | this spec |
| **Clean URL-update UX** | **GAP — new in v6** (API exists; UX is awkward in inline edit mode) | this spec |
| **Bulk operations** (e.g. multi-delete) | **GAP — new in v6, if wanted** | this spec (NEEDS JOE Q3) |
| **Admin authorization stated as one invariant + cross-cuttingly tested** | **GAP — new in v6** | this spec |
| **Admin role assignment UI** | **GAP — optional** | this spec (NEEDS JOE Q2) |

The theme is: **the APIs for the core asks already exist; v6 builds the home for
them and closes the UX/coherence/assurance gaps.**

---

## The admin-authorization invariant (state it once, test it everywhere)

Today the check is **correct but copy-pasted**: each mutating handler
independently does

```go
u, ok := s.currentUser(r)
if !ok { http.Error(w, "unauthorized", http.StatusUnauthorized); return }
if u.Role != "admin" { http.Error(w, "admin role required", http.StatusForbidden); return }
```

v6 makes this a **named invariant** and removes the duplication:

> **INVARIANT (server-authoritative admin gate):** *Every* state-mutating
> endpoint — every `POST`/`PUT`/`PATCH`/`DELETE` that changes shared catalog
> state (services, icons, categories, and any future admin mutation) —
> re-derives the caller from the session cookie and returns **401** if not
> logged in and **403** if `role != "admin"`, **on every request**, regardless
> of what the UI showed. The UI gate (hiding Settings / edit mode from
> non-admins) is **convenience only**; the server gate is the boundary.

Implementation: extract a single **`requireAdmin` middleware/wrapper** in
`internal/api` that performs the 401/403 derivation and wraps each admin route at
registration in `server.go`, replacing the inline checks. This:

- guarantees a **new** admin endpoint can't accidentally ship without the gate
  (you wrap it or it isn't admin-routed),
- gives **one** place to test the gate, and
- lets us add a **cross-cutting test** that enumerates every admin route and
  asserts 401-without-session and 403-as-user — so the property is verified for
  the whole set, not per-handler-by-hand.

**Per-user (non-admin) mutations are explicitly carved out** and stay
session-only: favorites, layout, v3 theme, v5 collapse. The invariant is about
**shared catalog** state.

> Note: this is a **refactor that preserves behavior** — the wire results
> (401/403) are identical to today. Per the Surgical-Changes principle it's
> in-scope precisely because v6's job is to make the gate a guarantee, not
> because the current checks are wrong.

---

## Edit mode vs. Settings page — the consolidation call

v2 left this open (its Q1: fold v1 CRUD into edit mode, or keep a separate
Settings surface). v6 is where it's answered.

**Recommendation: keep both, with a clear division of labor.**

- **Edit mode (v2)** stays as the **in-context, per-tile** affordance: while
  looking at the catalog, an admin flips edit mode to tweak *the tile in front of
  them* — rename, fix a URL, swap an icon, reassign a category — without leaving
  the page. It's fast and spatial. It remains client-ephemeral.
- **Settings page (v6)** is the **catalog-wide, management** surface: the full
  app table, add-new, bulk actions, category management, and anything that's
  awkward tile-by-tile (e.g. "find the app whose URL changed and update it"
  without hunting for its tile). It's a real route, linkable, and the home for
  operations that aren't about one visible tile.

Both drive the **same** admin-gated endpoints; neither is a second security
boundary. This gives a coherent model — *edit-what-I-see* vs. *manage-the-whole-
catalog* — instead of two overlapping ad-hoc surfaces.

> **NEEDS JOE (Q1):** confirm "keep both with this division" (Stitch's lean) vs.
> collapse everything into the Settings page and retire edit mode (simpler
> mental model, but loses the in-context speed) vs. keep only edit mode and skip
> a Settings page (rejected — that's the status quo gap v6 exists to fix).

---

## Settings surface — UX

### Navigation & gating

- A **Settings entry** (gear) appears in the catalog header **only for admins**
  (UI gate), routing to `/settings` in the SPA.
- The route is **guarded both client- and server-side**: the client redirects a
  non-admin away from `/settings`; every API the page calls independently
  enforces the admin invariant (so a forged route still does nothing).

### App management view

A **table of all services** (not the tile grid — a dense, scannable admin
view): columns for name, URL, category, status, icon presence (v2
`iconLight`/`iconDark`), and row actions.

- **Add app** — a form (`POST /api/services`): slug, name, description, URL,
  icon text, optional gatus_key, optional category. (Unchanged endpoint.)
- **Edit app** — inline or a row drawer, editing **all** fields incl. **URL**
  via `PATCH /api/services/{id}`. The **URL-update UX gap** is closed here: a
  proper labeled URL field with validation (non-empty, parseable URL) and a
  visible save/cancel, instead of v2's cramped inline-on-tile edit. Optimistic
  with rollback (matching the app's existing pattern).
- **Delete app** — row action with a confirm (irreversible; cascades v2 icons
  via FK, v4 category assignment via `SET NULL`). `DELETE /api/services/{id}`.
- **Icon management** — a row action opens the per-app light/dark upload (v2
  endpoints), or links into the tile's edit-mode icon slots — **reused, not
  reimplemented**.

### Category management view

Surfaces v4's category CRUD here (create / rename / reorder / delete +
drag-assign apps), so taxonomy is managed beside the apps. Pure UI over v4's
existing `/api/categories*` endpoints; no new API.

### Identified gaps → scoped new endpoints (only where needed)

| Gap | Resolution | New endpoint? |
|---|---|---|
| Clean URL-update UX | Settings edit form over existing `PATCH /api/services/{id}` | **No** — UX only |
| Admin needs the full services list incl. non-display fields (slug, gatus_key, both icon flags) without the per-user status/favorite shaping | `GET /api/services` already returns enough for v6's table (it has slug? — **confirm**: v1's `serviceView` includes `slug`, `icon`, `iconLight/Dark`; status/favorite are harmless to show). **Reuse it.** | **No** (reuse) — unless an admin-specific read is wanted (NEEDS JOE Q4) |
| Bulk delete / bulk re-categorize | Optional `POST /api/services/bulk` (admin) taking a list of ids + an action, **only if** Caleb wants multi-select ops | **Maybe** (NEEDS JOE Q3) |
| Promote/demote admins from the UI | Optional `PATCH /api/users/{id}` `{role}` (admin), with the **last-admin guard** (v1 edge case: can't demote/delete the final admin) | **Maybe** (NEEDS JOE Q2) |

Everything else the Settings page needs is **already served** by existing
endpoints. v6 adds new endpoints **only** for bulk ops and admin-assignment, and
**only if** those product calls come back yes.

---

## Acceptance criteria (v6 admin settings — testable)

v1 (A1–A11), v2 (A1–A14), and v4 (A1–A12) still hold unchanged. New:

| # | Criterion | How verified |
|---|---|---|
| A1 | A **Settings** entry appears in the header for an admin and **not** for a non-admin; the `/settings` route renders for admin, redirects a non-admin away | Component test: `me()` admin → entry + route render; user → no entry, route redirects |
| A2 | The Settings app-management view lists **all** services with name, URL, category, status, and icon presence | Component test: seed services → assert table rows + columns |
| A3 | An admin can **add** an app from Settings (`POST /api/services`) and it appears in the table and the catalog | Component + API integration: submit add form → 201 → row present |
| A4 | An admin can **update an app's URL** (and other fields) from Settings via a proper URL field with validation; empty/invalid URL is rejected client-side and the existing `PATCH` enforces server-side | Component test: edit URL, blank → blocked; valid → `PATCH` fired, row updates |
| A5 | An admin can **delete** an app from Settings with a confirm (`DELETE /api/services/{id}`); it leaves the table and catalog; v2 icons + v4 assignment cascade/null as defined | Component + API integration: delete → confirm → row gone; assert icon rows cascaded |
| A6 | **The admin invariant holds for every mutating endpoint**: with no session → **401**; as a `user` → **403**; as `admin` → success — for services CRUD, icon PUT/DELETE, and categories CRUD/assignment | **Cross-cutting API integration test** enumerating every admin route, asserting 401 (no cookie) and 403 (user token) on each |
| A7 | The admin gate is **server-authoritative**: a forged/replayed mutating request from a non-admin (bypassing the hidden UI) is still **403** | API integration: user-role token hits each mutating endpoint directly → 403; no state change |
| A8 | Per-user mutations (favorites, layout, v3 theme, v5 collapse) remain **session-only** and are **not** caught by the admin gate (a normal user can still use them) | API integration: user token → favorites/layout/theme/collapse succeed (not 403) |
| A9 | Category management is reachable from Settings and drives v4's existing `/api/categories*` endpoints (create/rename/reorder/delete/assign) | Component test: category view actions fire the v4 endpoints |
| A10 | Edit mode (v2) and Settings (v6) both mutate via the **same** admin-gated endpoints; neither bypasses the gate | API/integration: both surfaces' writes go through the gated routes (no ungated path exists) |
| A11 | The `requireAdmin` middleware refactor preserves behavior: every previously-gated endpoint returns the **same** 401/403 results as before | Regression: existing v1/v2/v4 admin-gate tests pass unchanged against the wrapped routes |
| A12 | *(If Q2 yes)* an admin can promote/demote another user, but **cannot demote/delete the last remaining admin** (v1 edge case upheld) | API integration: demote last admin → blocked with clear error |
| A13 | *(If Q3 yes)* bulk delete / bulk re-categorize affects exactly the selected ids, admin-gated, and is atomic-or-clearly-partial | API integration: bulk op over a set → only those rows change; non-admin → 403 |

(A12/A13 are conditional on the corresponding NEEDS JOE answers; if those are
"no," the rows are dropped and no endpoint is built.)

---

## Migration / back-compat

- **No new tables required for the core feature.** v6 is primarily a **frontend
  Settings surface** over already-existing endpoints plus a **behavior-preserving
  backend refactor** (`requireAdmin` middleware). The seeded 39-app catalog and
  every existing schema object are untouched.
- **Conditional migrations only if Q2/Q3 land:** admin-assignment uses the
  existing `users.role` column (no migration — `role` already exists and is
  `CHECK`-constrained to `admin|user`); bulk ops need no schema change. So even
  the optional features are **largely migration-free**.
- **API back-compat:** the `requireAdmin` refactor changes **no wire behavior**
  (same 401/403). Any genuinely-new endpoints (bulk, user-role) are **additive
  routes**; nothing existing changes. Older/cached clients are unaffected — they
  simply don't see the Settings page.
- **Rollback:** Settings is a frontend route; removing it reverts to v2 edit-mode
  as the admin surface. The `requireAdmin` wrapper is internal; reverting it
  restores the inline checks with identical behavior. No data to migrate either
  way.

---

## Deployment contract delta (for Joe)

| Concern | v6 delta |
|---|---|
| Persistent storage | **Still none** |
| New env vars | None |
| New endpoints | None required for the core; **conditional** additive admin routes only if Q2 (`PATCH /api/users/{id}`) / Q3 (`POST /api/services/bulk`) are approved — all under existing `/api/*` + the admin invariant; no new Ingress/Pangolin rules |
| DB | **No migration** for the core; none even for the optional features (reuse `users.role`) |
| Replicas | Still 1 |
| Routing | `/settings` is a client-side SPA route — served by the existing static bundle; the SPA fallback already routes unknown paths to `index.html` (confirm nginx `try_files` covers it) |

---

## Open decisions (NEEDS JOE)

| # | Question | Stitch's lean |
|---|---|---|
| Q1 | Keep **both** edit mode (in-context per-tile) and a Settings page (catalog-wide) with the division of labor above, vs. collapse into one surface | **Keep both** — edit-what-I-see vs. manage-the-catalog; same gated endpoints |
| Q2 | Include **admin role assignment** (promote/demote users) in v6, with the last-admin guard? | **Defer unless wanted** — it edges into user administration; the API is cheap (reuse `users.role`) if Caleb says yes |
| Q3 | Include **bulk operations** (multi-select delete / re-categorize)? | **Defer unless wanted** — additive `POST /api/services/bulk`; skip if single-row actions suffice |
| Q4 | Does the admin table need a dedicated `GET /api/admin/services` read, or is the existing `GET /api/services` enough? | **Reuse existing** — it already carries slug/icon flags; add an admin read only if a real field gap appears |

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A11 (and
A12/A13 iff Q2/Q3 approved) → RED→GREEN→REFACTOR→VERIFY. Backend slice lands
first: extract `requireAdmin` and wrap all admin routes in `server.go` (the
cross-cutting A6/A7/A11 tests guard the refactor), then any approved new
endpoints. Frontend Settings route + app/category management views follow,
driving the existing + new gated endpoints. **Depends on v4 for the category
management portion;** the app-management + invariant portions stand alone on
v1/v2.
