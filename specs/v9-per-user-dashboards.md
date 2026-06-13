# homepad v9 — Per-User Dashboards + Admin-Curated App Library — Spec

**Version:** 1.0  **Date:** 2026-06-13  **Status:** Draft, awaiting Caleb sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Audience:** Full-stack developer implementing across `homepad` (web) + `homepad-api` (Go)
**App:** homepad (custom service dashboard) — React + Vite + **Tailwind CSS**, Go backend, single Postgres. Light + Dark themes.
**Methodology:** ADD (getadd.dev) — POC→Production dial. RED→GREEN→REFACTOR per AC.
**Builds on:** [`v1-launcher.md`](./v1-launcher.md), [`v2-app-icons.md`](./v2-app-icons.md), [`v4-app-categories.md`](./v4-app-categories.md), [`v5-collapsible-categories.md`](./v5-collapsible-categories.md), [`v6-admin-settings.md`](./v6-admin-settings.md), [`v7-ux-redesign.md`](./v7-ux-redesign.md), [`v8-command-launcher.md`](./v8-command-launcher.md)

---

## 1. Summary

This is the **biggest architecture change in homepad's history.** Through v8 the
catalog has been a **single shared, global** thing: one row in `services` is one
tile *everyone* sees, admins curate it, and per-user state was only a thin layer
on top (favorites, layout, theme, collapse). v9 inverts that model.

After v9 there are **two tiers**:

1. **Admin / System tier** — the admin role stays meaningful (it is **not**
   vestigial). Admins own (a) the OIDC + self-registration config (existing env
   `OIDC_ENABLED`, `HOMEPAD_REGISTRATION`, surfaced in an admin settings area)
   and (b) a **shared, admin-curated *App Library*** — a catalog of the apps that
   *exist* in this homelab (name, url, default icon, optional description /
   suggested category). Library entries are **offers, not assignments**: nobody
   gets an app until they choose to add it. Admins have full CRUD on the library;
   non-admins can only **browse** it and **add from** it.

2. **Per-user tier** — every person owns their own **dashboard**: the apps they
   have added (either **add-from-library** or a **custom** app they create), their
   own folders/categories, their own icons, their own arrangement. A user fully
   controls their own apps/folders/icons **with no admin gate at all.**

```
        ┌──────────────────────────── ADMIN / SYSTEM (shared) ───────────────────────────┐
        │  OIDC + registration config   │   App Library (offers)                          │
        │  (env, surfaced read-only)     │   Jellyfin · Gitea · Grafana · … (admin CRUD)   │
        └──────────────────────────────────────────┬─────────────────────────────────────┘
                                                    │ browse + "Add to my dashboard" (COPY)
        ┌───────────────────────────────────────────▼────────────────────────────────────┐
        │  ALICE's dashboard         │  BOB's dashboard          │  CALEB's dashboard      │
        │  (own apps/folders/icons)  │  (own apps/folders/icons) │  (own apps/folders…)    │
        │  isolated — A can't see B   │  isolated — B can't see C │  isolated               │
        └─────────────────────────────────────────────────────────────────────────────────┘
```

### The model that's already confirmed (Caleb — **do not reopen**)

These are **decided product calls**, restated here as the foundation (see §10 for
the calls *Stitch* made under delegated authority, and §13 for what still needs
Caleb):

- **C1 — Adding a library app is a COPY / INSTANCE, not a live reference.** The
  user gets **their own `services` row**; they can rename / re-icon / re-folder /
  delete it freely. Later admin edits to the library entry **do NOT propagate** to
  copies already added. An optional `source_library_id` is kept **for provenance
  only** (it changes no behavior).
- **C2 — Nothing is prepopulated.** A fresh user starts with an **empty
  dashboard** and the **full library** to pick from. No default tiles.
- **C3 — Migration of the existing global catalog (the seeded 39 services):** they
  **seed the Library** *and* are **copied onto the first admin user's dashboard**
  (`finish.06@gmail.com`) so that dashboard survives the cutover. (Spec'd
  concretely in §5.)

### Design principles
- **Each person owns their world.** A user's apps/folders/icons/arrangement are
  theirs; no admin can see or touch them, and no admin action mutates them.
- **The library offers; it never assigns.** Curating the library changes what's
  *available to add*, never what's *on anyone's dashboard*.
- **Hard isolation.** User A can **never** read or write user B's services,
  categories, icons, or arrangement. This is a security invariant (§4, A14), not a
  UI nicety.
- **Reuse the surface.** No new visual language — reuse v7 tokens, the v8 launcher
  (now searching the user's *own* apps), and the v6 Settings shell. v9 is a
  data-model and ownership change first; the UI deltas are additive.

---

## 2. Architecture delta (read first)

This spec spans **both repos** and will **slice** (§14). The shape of the change:

**Backend (`homepad-api`)**
- A **new shared table `library_apps`** (admin-scoped offers).
- `services` and `categories` become **per-user (`user_id`-scoped)**. Every read
  filters to the logged-in user; every write scopes to / is authorized against the
  logged-in user. `service_icons` become per-user **transitively** — they already
  FK `services(id)` and cascade, so once `services` is per-user, icons are too (no
  `user_id` column needed on `service_icons` — see D1).
- The **admin gate is *removed*** from services / categories / icons mutations
  (they are now personal data), and **replaced by an ownership check** (the row
  must belong to the caller, else **404** — D2). The v6 `requireAdmin` invariant
  now governs **only the library** and **system settings**.
- **New endpoints**: library CRUD (admin), browse library (any user),
  add-from-library → copy onto my dashboard (any user). See §6.

**Frontend (`homepad`)**
- The catalog (`Catalog.tsx`) now renders **my** apps; a new **browse-library /
  add-from-library** surface; the v6 Settings page gains a **Library management**
  section (admin) and a **read-only System settings** panel (OIDC / registration).
- The **v8 launcher** keeps working unchanged — because it filters the already-
  loaded `/api/services`, which is now *my* apps, it automatically becomes "search
  **my** dashboard" (D8). (Whether it can also *add from library* inline is OQ3.)

**Non-goals for v9 (deferred):** sharing a dashboard between users; org/team
dashboards; per-app ACLs beyond the two tiers; library categories/folders as a
first-class model (OQ1); live "push update to copies" propagation (explicitly
rejected by the copy model, C1 / OQ6); migrating the launcher into an add-from-
library tool (OQ3).

---

## 3. Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. New moving parts: **one new
table** (`library_apps`), **`user_id` columns** on `services` + `categories` (with
a **one-time data migration**, the only non-trivial migration in homepad's
history), **new library/browse/add endpoints**, an **ownership-check refactor** of
the existing services/categories/icons handlers, and the additive UI. No PVC, no
new infra, no new env vars (the two it *surfaces* — `OIDC_ENABLED`,
`HOMEPAD_REGISTRATION` — already exist).

---

## 4. The ownership & isolation invariant (state it once, test it everywhere)

v6 named the **admin** invariant (every shared-catalog mutation re-checks
`role == "admin"` server-side). v9 keeps that invariant **but narrows its
domain** and adds a **second** one:

> **INVARIANT 1 (admin gate — narrowed):** Every mutation of **shared system
> state** — the App Library (`POST/PATCH/PUT/DELETE /api/library*`) and any future
> system setting — re-derives the caller from the session and returns **401** if
> not logged in, **403** if `role != "admin"`, on every request. (This is the v6
> `requireAdmin` wrapper, now applied **only** to library + system routes.)

> **INVARIANT 2 (per-user ownership):** Every read of a user's dashboard data
> (`/api/services`, `/api/categories`, icons, layout, favorites, collapse) returns
> **only rows owned by the caller**, and every write (create / update / delete /
> reorder / icon upload / add-from-library) **acts only on the caller's own rows**.
> A request that names a `service`/`category` row owned by **another user** is
> treated as if it does not exist → **404** (D2 — 404 not 403, so existence of
> another user's rows never leaks). No admin override exists for this data: an
> admin editing *their* dashboard uses the exact same per-user paths as anyone
> else.

Cross-user isolation (Invariant 2) is a **hard security requirement** and gets an
explicit, adversarial cross-cutting test (A14): user B's token must get 404 (or an
empty/unchanged result) on every attempt to read or mutate user A's service,
category, icon, layout entry, or favorite.

**Carve-out:** the library is the *only* shared catalog object left. Browsing it
(`GET /api/library`) and adding from it (`POST /api/library/{id}/add`) are
**session-gated for any authenticated user** (not admin-gated) — adding to your
*own* dashboard is a per-user write (Invariant 2), even though the *source* is
shared.

---

## 5. Data model

### 5.1 New table — `library_apps` (shared, admin-curated offers)

```sql
CREATE TABLE IF NOT EXISTS library_apps (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               TEXT        NOT NULL,
    url                TEXT        NOT NULL,
    icon               TEXT        NOT NULL DEFAULT '',   -- default icon text/slug (v2 fallback chain)
    description        TEXT        NOT NULL DEFAULT '',
    suggested_category TEXT        NOT NULL DEFAULT '',    -- free text hint, NOT a category FK (OQ1)
    sort_index         INTEGER     NOT NULL,               -- admin-ordered browse order (OQ1)
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- A library entry is an **offer**: pure catalog metadata. It has **no `user_id`**
  (it's shared) and it is **never** rendered on anyone's dashboard by existence
  alone — only a per-user `services` copy is.
- `suggested_category` is **free text**, deliberately not a FK — the library is a
  **flat list with a hint**, not its own category model (D5 / OQ1). At add-time the
  hint can pre-fill the user's folder choice (OQ2) but binds nothing.
- `name` is **not** globally unique — two near-duplicate offers are an admin
  curation problem, not a DB constraint. (The admin UI can warn; the schema
  doesn't enforce.)

### 5.2 `services` becomes per-user

```sql
-- add ownership + provenance
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE services
    ADD COLUMN IF NOT EXISTS source_library_id UUID
        REFERENCES library_apps(id) ON DELETE SET NULL;   -- provenance ONLY (C1)
```

- `user_id` — the owner. Becomes **`NOT NULL`** after backfill (§5.4).
  `ON DELETE CASCADE`: deleting a user drops their whole dashboard (apps cascade →
  icons cascade, favorites/layout/collapse already cascade).
- `source_library_id` — **provenance only** (C1). `ON DELETE SET NULL`: deleting a
  library entry **does nothing** to the copies except null this breadcrumb (OQ5).
  A custom (non-library) app has it `NULL`.
- **Slug uniqueness moves from global to per-user.** The v1 `slug TEXT NOT NULL
  UNIQUE` global constraint becomes **`UNIQUE (user_id, slug)`** — two different
  users can each have a `jellyfin` slug; one user can't have it twice (D3).

```sql
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_slug_key;       -- drop global unique
CREATE UNIQUE INDEX IF NOT EXISTS services_user_slug_key ON services (user_id, slug);
CREATE INDEX IF NOT EXISTS services_by_user_idx ON services (user_id);
```

### 5.3 `categories` becomes per-user

```sql
ALTER TABLE categories
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;   -- drop global unique
CREATE UNIQUE INDEX IF NOT EXISTS categories_user_name_key ON categories (user_id, name);
CREATE INDEX IF NOT EXISTS categories_by_user_idx ON categories (user_id, sort_index);
```

- Each user has their **own** categories, their **own** `sort_index` ordering, and
  category **names unique per user** (D3). `services.category_id` keeps its v4 FK
  (`ON DELETE SET NULL` → Uncategorized); a user can only assign a service to a
  category **they** own (enforced in the handler, A7).
- `user_collapsed_categories` (v5) and `user_layout` (v1) are already per-user and
  FK `categories`/`services` with cascade — **no change** needed; they keep working
  as the now-per-user rows churn.

### 5.4 `service_icons` — per-user transitively (no schema change)

`service_icons` is keyed `(service_id, variant)` and `ON DELETE CASCADE`s from
`services`. Once `services` is per-user, **an icon belongs to whoever owns its
service** — so per-user scoping is inherited for free (D1). The icon **handlers**
gain the ownership check (the service must be the caller's, else 404); the
**table** is untouched. (This is the Simplicity-First / Surgical-Changes call —
no `user_id` duplicated onto a child table.)

### 5.5 The one-time data migration (C3 — concrete)

This is the part with teeth: the existing **shared** catalog must become the first
admin's **personal** dashboard, and must **seed the library**, in one migration,
**idempotently and safely** whether the catalog is empty (fresh/test DB) or has
the production 39.

Migration `0006_per_user_dashboards.up.sql`, **in order**:

```sql
-- 1) create library_apps (DDL from §5.1)

-- 2) add nullable user_id + source_library_id to services, user_id to categories
--    (DDL from §5.2 / §5.3, but defer NOT NULL + the new unique indexes to step 6)

-- 3) seed the Library from the existing shared services (C3).
--    Each existing service becomes one library offer; suggested_category = its v4 category name.
INSERT INTO library_apps (name, url, icon, description, suggested_category, sort_index)
SELECT s.name, s.url, s.icon, s.description, COALESCE(c.name, ''),
       (ROW_NUMBER() OVER (ORDER BY s.name)) - 1
FROM services s
LEFT JOIN categories c ON c.id = s.category_id;

-- 4) pick the first admin = the surviving dashboard owner (finish.06@gmail.com).
--    Defensive: resolve by role+age so it works in any environment.
--    (Production: this is finish.06; test/empty DB: may be NULL -> step 5/6 no-op safely.)
--    SELECT id FROM users WHERE role='admin' ORDER BY created_at, id LIMIT 1;

-- 5) reassign existing shared services + categories to that first admin (C3),
--    so the existing dashboard survives the cutover as that admin's personal one.
UPDATE services   SET user_id = (SELECT id FROM users WHERE role='admin' ORDER BY created_at, id LIMIT 1)
                  WHERE user_id IS NULL;
UPDATE categories SET user_id = (SELECT id FROM users WHERE role='admin' ORDER BY created_at, id LIMIT 1)
                  WHERE user_id IS NULL;

-- 5b) wire provenance (best-effort, non-critical — C1): link each reassigned copy
--     back to the library offer minted from it. Match on (name,url) which is 1:1 by construction.
UPDATE services sv
SET source_library_id = la.id
FROM library_apps la
WHERE sv.source_library_id IS NULL AND sv.name = la.name AND sv.url = la.url;

-- 6) NOW enforce: NOT NULL on user_id, swap global unique -> per-user unique, add indexes.
--    If services/categories rows exist but NO admin user does, SET NOT NULL fails LOUDLY
--    (correct: a catalog with no possible owner is a misconfiguration, surface it).
ALTER TABLE services   ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN user_id SET NOT NULL;
-- + DROP CONSTRAINT ...slug_key / ...name_key and CREATE the per-user unique indexes (§5.2/§5.3)
```

Notes:
- **Empty catalog (fresh / test DB):** steps 3/5/5b touch **0 rows**; step 6's
  `SET NOT NULL` succeeds vacuously. The system comes up with an empty library and
  every (new) user starting empty — exactly C2.
- **Production (39 services, finish.06 admin present):** the library is seeded with
  39 offers; all 39 services + all existing categories become finish.06's personal
  dashboard with provenance wired; favorites/layout/collapse (already keyed to
  finish.06 from the shared era) keep pointing at the now-personal rows, so that
  dashboard is **byte-identical** post-migration. **Every other user keeps their
  empty dashboard** + the full 39-offer library to pick from (C2).
- The **39-app production seed is provisioned by Joe's deploy**, not by a repo
  migration (per v4 §"Seeding"). This migration operates on whatever rows exist at
  run time — it is the *transform*, not the *seed*. Joe runs it against production
  where the 39 already live.

`0006_per_user_dashboards.down.sql` (best-effort rollback): drop the per-user
unique indexes + `services_by_user_idx`/`categories_by_user_idx`; restore the
global `UNIQUE` on `services.slug` / `categories.name` (**only succeeds if no
cross-user duplicates exist** — note this in the file); drop `source_library_id`
and `user_id`; drop `library_apps`. With those gone the schema is back to v5 (one
shared catalog). **Down is lossy by nature** (per-user apps created after cutover
collapse into one namespace and may collide) — documented as a forward-only
migration in practice, with the down provided for dev resets.

---

## 6. API surface

### 6.1 Per-user dashboard endpoints (existing routes, re-scoped — Invariant 2)

These routes **already exist**; v9 changes their authorization and scoping. The
**admin gate is removed**; reads filter to `user_id = caller`, writes act only on
the caller's rows (404 if the row isn't theirs).

| Method | Path | Change vs. today | Auth |
|---|---|---|---|
| `GET`    | `/api/services` | now `WHERE user_id = caller` (already takes `userID`) | session (own) |
| `POST`   | `/api/services` | **was admin-only → now any user**, creates a row owned by caller; slug unique **per user** | session (own) |
| `PATCH`  | `/api/services/{id}` | **was admin → now owner-only**; 404 if not caller's | session (own) |
| `DELETE` | `/api/services/{id}` | **was admin → now owner-only**; 404 if not caller's | session (own) |
| `PUT`    | `/api/layout` | unchanged (already per-user) | session (own) |
| `POST/DELETE` | `/api/services/{id}/favorite` | unchanged (already per-user); 404 if service not caller's | session (own) |
| `GET`    | `/api/categories` | now `WHERE user_id = caller` | session (own) |
| `POST`   | `/api/categories` | **was admin → now any user**, owned by caller; name unique **per user** | session (own) |
| `PATCH`  | `/api/categories/{id}` | **was admin → owner-only**; 404 if not caller's | session (own) |
| `PUT`    | `/api/categories/order` | **was admin → owner-only**; reorders only caller's categories | session (own) |
| `DELETE` | `/api/categories/{id}` | **was admin → owner-only**; its apps → Uncategorized (FK) | session (own) |
| `PUT/DELETE` | `/api/services/{id}/icon/{variant}` | **was admin → owner-only**; 404 if service not caller's | session (own) |
| `POST/DELETE`| `/api/services/{id}/collapse` (v5) | unchanged (already per-user) | session (own) |

### 6.2 App Library endpoints (NEW)

| Method | Path | Body | Result | Auth |
|---|---|---|---|---|
| `GET`    | `/api/library` | — | `{library:[{id,name,url,icon,description,suggestedCategory,sortIndex,added}]}` in `sort_index` order. `added` = does the caller already have a copy whose `source_library_id == id` (UI hint only). | **session** (any user) |
| `POST`   | `/api/library` | `{name,url,icon?,description?,suggestedCategory?}` | 201 offer (appended `sort_index = max+1`) | **admin** |
| `PATCH`  | `/api/library/{id}` | any subset of the above | 200 updated offer; **404** unknown. **Does not touch any user's copies** (C1). | **admin** |
| `PUT`    | `/api/library/order` | `{order:["<id>",…]}` | 204; rewrites `sort_index` by position (v4 reorder contract) | **admin** |
| `DELETE` | `/api/library/{id}` | — | 204; idempotent. Existing copies are **untouched**; their `source_library_id` → `NULL` (FK). (OQ5) | **admin** |
| `POST`   | `/api/library/{id}/add` | `{categoryId?:string\|null}` (OQ2) | 201 — **copies** the offer into a **new `services` row owned by the caller** and returns it (same `serviceView`). | **session** (any user) |

**Add-from-library (`POST /api/library/{id}/add`) semantics (C1 — the copy):**
- Reads offer `{name, url, icon, description}` and **inserts a new per-user
  `services` row** for the caller: `name/url/icon/description` copied,
  `source_library_id = {id}`, `gatus_key` empty (status wiring is admin/deploy
  infra, not copied), `category_id` = the optional body `categoryId` **if it is one
  of the caller's own categories** (else 400) — default **`NULL` / Uncategorized**
  (D4 / OQ2).
- **Slug generation:** derive a slug from the name, made unique **within the
  caller's** services (e.g. `jellyfin`, then `jellyfin-2`) — never collides across
  users (per-user unique, §5.2).
- **Idempotency:** adding the *same* offer twice creates a **second copy** (the
  user may legitimately want two Jellyfin tiles pointing at different things, and
  the copy is theirs to delete). The `added` flag on `GET /api/library` lets the UI
  show "Added ✓ / Add again" without blocking — it does **not** dedupe server-side
  (D6).
- 404 if the library id is unknown; 401/403 never (any authenticated user may add).

### 6.3 System settings (NEW, read surface)

| Method | Path | Result | Auth |
|---|---|---|---|
| `GET` | `/api/admin/settings` | `{oidcEnabled: bool, registrationAllowed: bool}` — read from env (`OIDC_ENABLED`, `HOMEPAD_REGISTRATION`) | **admin** |

v9 **surfaces** these in the admin settings area **read-only** (D7); making them
DB-editable from the UI is OQ7 (they're env/redeploy concerns today).

### 6.4 `serviceView` delta

`serviceView` (§`internal/api/services.go`) gains one optional field for
provenance; everything else is unchanged:

```jsonc
{ "id":"…", "slug":"…", "name":"Jellyfin", "url":"…", "icon":"jellyfin",
  "status":"UP", "favorite":false, "iconLight":false, "iconDark":false,
  "categoryId":"…", "categoryName":"Media",
  "sourceLibraryId": "…"        // null for custom apps; provenance only (C1) — additive
}
```

`status` still resolves via the Gatus snapshot keyed on `gatus_key`; copies start
with no `gatus_key`, so an added app shows `UNKNOWN` until/unless an admin wires
monitoring at the deploy layer (out of scope — note for Joe).

---

## 7. Frontend — UI surfaces

### 7.1 The dashboard = my apps (Catalog)
- `Catalog.tsx` renders the **caller's own** services/categories exactly as
  v4/v5/v7 do — grouped sections, favorites, collapse, v7 tiles — just sourced from
  the now-per-user `GET /api/services` + `/api/categories`. **No visual change**,
  only the data is "mine."
- **Empty state (C2):** a brand-new user has zero tiles. Show a friendly empty
  state (`data-testid="dashboard-empty"`): a line like *"Your dashboard is
  empty"* + a primary **"Browse the App Library"** button (`data-testid=
  "browse-library-cta"`) → opens §7.2. Reuse v7 tokens; light + dark.

### 7.2 Browse + add-from-library
A surface any user can open (entry point: a **"Add apps"** / library button in the
header or the empty-state CTA — naming OQ4). Suggested as a **modal/drawer**
mirroring the v8 launcher's overlay tokens, or a route `/library` (impl choice,
non-binding):
- `data-testid="library-browse"` container; lists offers from `GET /api/library`
  as rows/cards: icon plate (v7) + name + description + `suggestedCategory` chip.
- Each offer has an **Add** button (`data-testid="library-add-{id}"`); on click →
  `POST /api/library/{id}/add` → optimistic add to my dashboard, button flips to
  **"Added ✓"** with an **"Add again"** affordance (per D6 / `added` flag).
- A search/filter box over the offer list (client-side, like v8) is nice-to-have.
- Empty library (admin hasn't curated any) → a faint *"No apps in the library
  yet"* (`data-testid="library-empty"`); admins additionally see a link to manage
  it (§7.3).
- **Custom app** path is unchanged from v6: "Add a custom app" opens the existing
  add form (`POST /api/services`) — now writing to *my* dashboard, no admin gate.

### 7.3 Admin Settings additions (extends v6 Settings page)
- **Library management** (admin only) — a v6-style table over `/api/library*`:
  add / edit (all fields) / reorder / delete offers, with a confirm on delete that
  states **"existing users keep their copies"** (C1 / OQ5). `data-testid=
  "settings-library"`.
- **System settings** (admin only, **read-only** in v9 — D7): shows OIDC enabled
  Y/N and self-registration allowed Y/N from `GET /api/admin/settings`, each with a
  note that they're set via environment/redeploy. `data-testid="settings-system"`.
- The v6 **app/category management** views now manage the **admin's own**
  dashboard (they're per-user like everyone's) — they are **not** a god-view over
  other users' apps. Make this explicit in copy so an admin isn't surprised their
  "manage apps" only touches their own dashboard (the library is the shared lever).

### 7.4 The v8 launcher (unchanged, now personal)
The Cmd-K launcher (v8) is **untouched** — it already filters the in-memory
`/api/services` list, which is now *my* apps, so it transparently becomes "search
**my** dashboard" (D8). Whether it should *also* offer add-from-library inline is
**OQ3** (Stitch's lean: not in v9).

### 7.5 data-testids (new in v9)
`dashboard-empty`, `browse-library-cta`, `library-browse`, `library-empty`,
`library-row` (with `data-library-id`), `library-add-{id}`, `library-added-{id}`,
`settings-library`, `settings-system`. All v1/v2/v4/v5/v7/v8 testids are
**preserved**.

---

## 8. Light + dark / responsive
- All new surfaces (empty state, browse-library, library/system settings) reuse
  **v7 tokens** (no new palette) and render correctly in **light and dark** — verify
  the browse modal's scrim/panel against the v8 launcher values; verify
  `suggestedCategory` chip and "Added ✓" state contrast in both themes.
- Browse-library is responsive like the v8 modal: full-width-minus-gutters on
  `<640px`, capped on desktop; offer rows are ≥44px tap targets.
- `prefers-reduced-motion` honored on any add/transition animation (v7 rule).

## 9. Accessibility
- Browse-library modal/route: `role="dialog"` + `aria-modal` (modal form) or a
  titled `<main>` (route form); focus moves in on open, `Esc` closes (modal),
  focus restored on close. Offer list is a labeled list; **Add** buttons have an
  accessible name like *"Add Jellyfin to my dashboard"*; the post-add state is
  announced via `aria-live="polite"` (*"Jellyfin added"*).
- Empty-state CTA is a real focusable button with an accessible name.
- Settings Library table: standard table semantics; destructive **Delete** has a
  confirm and an accessible name including the offer name.
- Color is never the only signal: "Added ✓" carries the check glyph + text, not
  just a tint. Contrast meets WCAG AA in both themes (re-verify `--text-faint`
  small text, per v7 §8). jest-axe: no violations on the empty dashboard, the
  browse surface (empty + populated), and the library settings table.

---

## 10. Decisions (made under delegated authority — Joe, 2026-06-13)

These are the **smaller calls** Stitch made; the bigger product calls (C1–C3) are
Caleb's and are not reopened, and genuine product forks are deferred to §13.

| # | Decision | Rationale |
|---|---|---|
| **D1** | **`service_icons` get per-user scoping *transitively* — no `user_id` column.** They already `ON DELETE CASCADE` from `services`; once `services` is per-user, an icon belongs to its service's owner. Handlers add the ownership check; the table is untouched. | Simplicity-First / Surgical — don't duplicate `user_id` onto a child table that already inherits ownership through its FK. |
| **D2** | **Cross-user access → 404, not 403.** A request naming another user's `service`/`category`/icon row is answered as "not found." | 403 would *confirm the row exists*, leaking another user's catalog shape. 404 keeps Invariant 2 information-tight. |
| **D3** | **Uniqueness moves global → per-user:** `UNIQUE(user_id, slug)` on services, `UNIQUE(user_id, name)` on categories. | Two users must be able to both have a `jellyfin` / a "Media" category. Uniqueness only makes sense *within* a dashboard. |
| **D4** | **Add-from-library lands the copy *Uncategorized* by default.** The `categoryId` body param is optional; an absent value → `NULL`. | One-tap add is the fast path; re-foldering is a cheap follow-up the user already controls. (Folder-at-add-time is OQ2 if Caleb wants it.) |
| **D5** | **The library is a *flat list with a `suggested_category` hint*, not its own category model.** | Avoids building a second, parallel category system speculatively (Simplicity-First). The hint is enough to pre-fill a folder; a real library taxonomy is OQ1 if ever needed. |
| **D6** | **Add-from-library is *not* deduped server-side; the same offer can be added twice.** `GET /api/library` returns an `added` hint for the UI to show "Added ✓ / Add again," but never blocks. | The copy is the user's; wanting two tiles of the same app (different targets) is legitimate. Server-side dedupe would impose a policy the copy-model doesn't want. |
| **D7** | **OIDC / self-registration are surfaced *read-only* in admin settings (`GET /api/admin/settings`).** | They're env-driven (`OIDC_ENABLED`, `HOMEPAD_REGISTRATION`) and changing them is a redeploy concern. Showing them closes the "admin can't see config" gap without inventing live config mutation (that's OQ7). |
| **D8** | **The v8 launcher is unchanged; it becomes "search my dashboard" for free** by filtering the now-per-user `/api/services`. | No code change needed — the per-user re-scope of the list does the work. Inline add-from-library is deferred (OQ3). |
| **D9** | **The migration is forward-only in practice; the `.down` is provided for dev resets and documented as lossy** (per-user apps created post-cutover can't losslessly recombine into one global namespace). | Honest about an irreversible architecture change; the down still lets a dev reset a scratch DB. |
| **D10** | **The v6 `requireAdmin` invariant is *narrowed* to library + system routes; services/categories/icons writes drop the admin gate and gain an ownership check.** | After v9 those are personal data, not shared catalog — the admin gate would be wrong (it'd stop a user editing their own dashboard). The cross-cutting v6 admin-gate test is updated to the new route set. |

---

## 11. Acceptance criteria (testable)

v1–v8 ACs still hold **except** where v9 deliberately changes behavior: the
services/categories/icons mutation tests that asserted **403 for a non-admin** are
**updated** — a non-admin now **succeeds on their own** rows (A4/A5) and **404s on
others'** (A14). Each AC is implemented **RED→GREEN** (failing test committed
first, tagged with its AC id).

| # | Criterion | How verified |
|---|---|---|
| **A1** | Migration `0006` is safe on an **empty** catalog: library empty, `services`/`categories` gain `user_id NOT NULL` with 0 rows, per-user unique indexes exist, global unique constraints are gone. | Migration test on empty DB: run `0006` up → schema asserts pass; `services_slug_key` absent, `services_user_slug_key` present. |
| **A2** | Migration `0006` on a **populated** catalog (N services, M categories, ≥1 admin) **seeds `library_apps` with N offers** (name/url/icon/description + `suggested_category` from the v4 category) and reassigns **all** existing services + categories to the **first admin** (`role='admin'` ORDER BY `created_at`). | Migration test: seed N services (some categorized) + an admin → run `0006` → `library_apps` has N rows; every service/category `user_id` = first admin id. |
| **A3** | After `0006`, the first admin's dashboard is **preserved** (same services, same category grouping, same favorites/layout) and **every other user has an empty dashboard** + can see all N library offers. | Integration: as first admin `GET /api/services` = original set; as a second user `GET /api/services` = `[]`, `GET /api/library` = N offers. |
| **A4** | A **non-admin** can create / rename / delete a service and a category **on their own dashboard** (no admin gate) and the changes scope to them. | API integration: user token → `POST/PATCH/DELETE /api/services` + `/api/categories` succeed (not 403); rows carry that user's `user_id`. |
| **A5** | A non-admin can **upload/delete their own service's icon** (v2 endpoints), no admin gate; the icon is scoped to that service (and thus that user). | API integration: user token → `PUT /api/services/{own}/icon/light` 200; `GET /api/services` shows `iconLight=true` for them only. |
| **A6** | `GET /api/services` and `GET /api/categories` return **only the caller's** rows. | API integration: seed user A with 3 services / 2 categories, user B with 1/0 → each list returns only their own counts. |
| **A7** | A user can assign a service only to **their own** category; a `categoryId` naming another user's (or a nonexistent) category → **400**, service unchanged. | API integration: user B `PATCH /api/services/{ownB}` with user A's `categoryId` → 400; with own → 200. |
| **A8** | **Admin** can CRUD the library: `POST` (201, appended), `PATCH` (200), `PUT /order` (204, reorders), `DELETE` (204, idempotent); a **non-admin** gets **403** on each. | API integration: admin token → each verb succeeds; user token → 403 on each. |
| **A9** | **Any authenticated user** can `GET /api/library` (browse) and gets offers in `sort_index` order with the `added` flag reflecting whether they already hold a copy. | API integration: user token → 200 list ordered; after adding offer X, `added=true` for X only. |
| **A10** | `POST /api/library/{id}/add` **copies** the offer into a **new `services` row owned by the caller** (name/url/icon/description copied, `source_library_id={id}`, slug unique within caller), returns the new `serviceView`, and the app now appears in the caller's `GET /api/services`. | API integration: user adds offer → 201; `GET /api/services` includes it with `sourceLibraryId={id}`; second `GET /api/library` shows `added=true`. |
| **A11** | Add-from-library lands **Uncategorized by default** (D4); passing a valid own `categoryId` files it there; passing another user's/nonexistent `categoryId` → **400**. | API integration: add with no body → `categoryId=null`; add with own category → set; add with foreign category → 400. |
| **A12** | **Editing a library entry does NOT propagate to existing copies** (C1); **deleting a library entry leaves copies intact** with `source_library_id` set to `NULL` (C1 / OQ5). | API integration: user copies offer → admin `PATCH`es offer name/url → user's copy unchanged; admin `DELETE`s offer → user's copy still present, `sourceLibraryId=null`. |
| **A13** | Adding the **same offer twice** yields **two** copies (no server-side dedupe — D6); the `added` flag is a non-blocking hint. | API integration: add offer X twice → caller has 2 services with `sourceLibraryId=X`; both deletable independently. |
| **A14** | **Cross-user isolation (Invariant 2):** with user B's token, **every** attempt to read or mutate a user-A row — `PATCH`/`DELETE /api/services/{A}`, icon PUT/DELETE on A's service, `PATCH`/`DELETE /api/categories/{A}`, favorite/layout on A's service — returns **404** (or empty/unchanged) and **changes no A row**. | **Cross-cutting adversarial API test** enumerating every per-user mutating route with a foreign id → assert 404 + A's state intact. |
| **A15** | **System settings:** admin `GET /api/admin/settings` returns `{oidcEnabled, registrationAllowed}` from env; a non-admin gets **403**. | API integration: set env → admin reads values; user token → 403. |
| **A16** | A **fresh user's dashboard is empty** (C2) and the web shows the empty state with a **Browse-library CTA**; clicking it opens the browse surface listing library offers. | Component: `GET /api/services`=[] → `dashboard-empty` + `browse-library-cta` render; click → `library-browse` shows offers; an offer's `library-add-{id}` calls `POST /api/library/{id}/add`. |
| **A17** | The **Library management** view (admin) and the **read-only System settings** panel render in the v6 Settings page for an admin and **not** for a non-admin; the delete-offer confirm states copies are kept. | Component: admin → `settings-library` + `settings-system` present; user → absent; delete confirm copy asserts "existing users keep their copies." |
| **A18** | The **v8 launcher** now searches the **caller's own** apps (no code change) — opening it after the per-user re-scope lists only the caller's services. | Component: seed caller with 2 apps → launcher empty-query default lists exactly those 2; another user's apps never appear. |
| **A19** | Works in **light and dark**, reuses v7 tokens (no new palette), responsive (browse modal full-width on `<640px`), and a11y-clean (jest-axe on empty dashboard, browse surface, library settings). | Component + jest-axe under `.dark` and at both widths; assert token classes, no axe violations. |

> Playwright e2e is **not** part of the CI gate in this container (no browser libs
> — see homepad's e2e note). Backend ACs are Go API-integration tests against the
> test DB; web ACs are vitest component tests. The merge gate stays **build +
> vitest** (web) and **`go test`** (api).

---

## 12. Migration / back-compat

- **One substantive migration (`0006`)** — additive DDL (`library_apps`,
  `user_id`/`source_library_id` columns, per-user indexes) **plus** the one-time
  data transform (§5.5). It is **safe on an empty DB** (vacuous) and **preserves
  the first admin's dashboard** on a populated one.
- **API back-compat is *intentionally broken* in two narrow places** (this is the
  point of v9): services/categories/icons writes **no longer 403 a non-admin** (they
  now 404 on *foreign* rows instead). A client that relied on "only admins can
  write" must adapt — but the only client is homepad's own SPA, updated in the same
  slices. `GET /api/services` only *adds* `sourceLibraryId` (additive). New
  `/api/library*` + `/api/admin/settings` routes are additive.
- **Rollback** is forward-only in practice (D9): `0006.down` restores the v5 schema
  but is **lossy** if per-user apps created post-cutover collide on the
  re-globalized unique constraints; provided for dev resets, not production
  reversal.

## 13. Open questions (need Caleb's sign-off)

- **OQ1 — Library taxonomy.** v9 ships the library as a **flat list** with a
  free-text `suggested_category` hint (D5), not its own folder/category model.
  Confirm flat-list, or greenlight library categories later. *Stitch's lean: flat
  list now; the hint covers 90% of the value.*
- **OQ2 — Folder at add-time.** Add-from-library lands **Uncategorized** by default
  (D4); the API accepts an optional `categoryId`. Should the **UI** prompt for a
  folder at add-time (using `suggested_category` to pre-select), or always drop it
  uncategorized and let the user re-folder? *Stitch's lean: one-tap add →
  uncategorized, with the API param there for a later "add to folder…" affordance.*
- **OQ3 — Launcher add-from-library.** Should the v8 Cmd-K launcher also let you
  **add** a not-yet-installed library app inline (type "Grafana" → "＋ Add from
  library"), or stay strictly "open my apps"? *Stitch's lean: keep it open-only in
  v9; revisit as v9.1 if wanted.*
- **OQ4 — Naming.** What do we call the shared catalog in the UI: **"App Library"**
  (used throughout this spec), "Catalog," "App Store," or "Add apps"? *Stitch's
  lean: **App Library** — "offers, not installs," and "Add from library" reads
  well.*
- **OQ5 — Deleting a library entry vs. existing copies.** Per the copy model (C1),
  deleting an offer does **nothing** to copies (just nulls `source_library_id`).
  Confirm that's the intended behavior (vs. e.g. warning the admin how many copies
  exist). *Stitch's lean: do nothing to copies; optionally show the count in the
  delete confirm as courtesy.*
- **OQ6 — "Push update to copies."** Explicitly **rejected** by the copy model
  (admin edits never propagate, C1). Confirm we never want an opt-in "update all
  copies of this offer" admin action. *Stitch's lean: never — it reintroduces the
  shared-catalog coupling v9 exists to remove.*
- **OQ7 — Editable system settings.** OIDC / self-registration are **read-only** in
  v9 (D7, env-driven). Do you ever want them **DB-editable from the admin UI**
  (live toggle, no redeploy)? *Stitch's lean: keep env-driven/read-only; revisit
  only if redeploy-to-toggle becomes a real pain.*

## 14. Slicing (each its own RED→GREEN PR later)

v9 is large and **must slice** to fit the ~15-min task cap. Proposed order (each a
standalone RED→GREEN→REFACTOR PR, backend before the web that consumes it):

1. **Backend data model + migration `0006`** — `library_apps`, per-user columns,
   uniqueness swap, the one-time transform; storage-layer scoping of
   `ListServices`/`ListCategories` to `user_id`. ACs **A1–A3, A6**.
2. **Per-user scoping of services/categories/icons** — drop admin gate, add the
   ownership check + 404 (D2/D10), update the v6 cross-cutting gate test to the new
   route set. ACs **A4, A5, A7, A14**.
3. **Library CRUD (admin) + browse (any user)** — `/api/library*`, `requireAdmin`
   on writes, session-gated read. ACs **A8, A9**.
4. **Add-from-library (copy)** — `POST /api/library/{id}/add`, copy semantics,
   provenance, no-dedupe. ACs **A10–A13**.
5. **Web: empty dashboard + browse/add UI** — empty state CTA, browse surface, add
   buttons, launcher-now-personal verification. ACs **A16, A18, A19**.
6. **Web + API: admin settings surface** — Library management view, read-only
   System settings (`GET /api/admin/settings`). ACs **A15, A17**.

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A19, sliced
per §14 (backend migration/scoping first so the web has real per-user data + a real
library to render), RED→GREEN→REFACTOR→VERIFY per AC. Confirm OQ1–OQ7 before slice
3 (library shape) and slice 5 (UI naming/flow).
