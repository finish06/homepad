# homepad v4 — App Categories — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-06-10
**Methodology:** ADD (getadd.dev), POC maturity dial
**Builds on:** [`specs/v1-launcher.md`](./v1-launcher.md), [`specs/v2-app-icons.md`](./v2-app-icons.md)

---

## Problem

The catalog is a **single flat grid**. `Catalog.tsx` renders every service into
one `grid grid-cols-2 … 2xl:grid-cols-6` with no sections — not even a favorites
section. With the seeded 39-app catalog that is a long, undifferentiated wall of
tiles: media apps, infra/kube apps, and external SaaS all jumbled together.
There is no way to say "these belong together" or to scan by area of concern.

The data *almost* knows the grouping already: every service has an optional
`gatus_key` shaped `"{group}_{name}"` (e.g. `media_jellyfin`, `core_gitea`), and
the seeded apps carry Gatus groups (kube / media / external). But that grouping
is (a) only a side effect of monitoring wiring, (b) absent on any service with
no `gatus_key`, and (c) not something an admin can curate (rename, reorder,
split) independently of monitoring. It's a hint, not a model.

## v4 Goal

A first-class **category** model: an admin can create, rename, reorder, and
delete categories, and assign each app to at most one category. The catalog
renders **grouped by category** in the admin-defined order, with **Favorites**
and **Uncategorized** as defined buckets. Categories are a property of the
**shared catalog** (admin-managed), like name/url/icon — not per-user.

## In scope (v4)

- A **category model**: `{id, name, sort_index}`, names unique, admin-ordered.
- An app belongs to **at most one** category (nullable FK on `services`); apps
  with no category render in a defined **Uncategorized** bucket.
- **Admin API**: create / rename / reorder / delete categories; assign (or
  clear) a service's category. All mutations **admin-gated server-side (403
  otherwise)**, identical to v1's catalog CRUD pattern.
- **Grouped catalog rendering**: `GET /api/services` reports each tile's
  category; the web renders one section per category in admin order, plus
  Favorites and Uncategorized.
- A defined **delete-category behavior** (apps fall back to Uncategorized, never
  deleted).
- Additive DB migration + back-compat with the existing `services` rows and the
  seeded 39-app catalog (everything starts Uncategorized; nothing breaks).

## Out of scope (deferred)

- **Per-user categories / personal grouping** — categories are shared catalog
  metadata, admin-managed. A user can already personalize via favorites + manual
  order (v1); per-user custom groups are a separate, later idea.
- **Multiple categories per app / tags** — v4 is **one category per app**
  (simple, matches "sections"). Many-to-many tagging is a real but separate
  feature; don't build the join table speculatively.
- **Nested / hierarchical categories** (sub-categories) — flat list only.
- **Collapsing/expanding category sections** — that interaction + its per-user
  persistence is its **own** spec, [`specs/v5-collapsible-categories.md`](./v5-collapsible-categories.md),
  which builds directly on this model.
- **Auto-categorization by URL/heuristics** — assignment is explicit/admin. (The
  Gatus-group seed question below is the one bounded exception, and it's a
  one-time seed, not ongoing auto-assignment.)
- **Icons/colors per category** — name + order only for v4. (NEEDS JOE if Caleb
  wants a per-category accent/icon; cheap to add later, additive.)

## Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. New moving parts: one new
table (`categories`), one nullable FK column on `services`, a small set of
admin CRUD endpoints, one `category` field added to the existing `GET
/api/services` view, and the grouped rendering in `Catalog.tsx`. No PVC, no new
infra, no new env vars.

---

## Category model

### Shape

A **category** is `{id (UUID), name (TEXT, unique), sort_index (INTEGER)}`.
Ordering is an explicit `sort_index` the admin controls (same approach as v1's
`user_layout.sort_index`), **not** alphabetical, so the admin can put "Media"
above "Infra" regardless of name.

A **service** gains a **nullable** `category_id` FK. `NULL` means
**Uncategorized** — an app is never *required* to have a category, and
Uncategorized is a render-time bucket, not a real row (so there's no "delete the
Uncategorized category" footgun).

> **One category per app.** A nullable FK (not a join table) is the
> Simplicity-First choice for "sections." If many-to-many tagging is ever
> wanted, that's a deliberate later migration, not something to pre-build.

### Schema (additive migration `0004_categories.up.sql`)

```sql
CREATE TABLE IF NOT EXISTS categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT    NOT NULL UNIQUE,
    sort_index  INTEGER NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS services_by_category_idx
  ON services (category_id);
```

- **`ON DELETE SET NULL`** is the heart of delete-behavior: dropping a category
  **un-assigns** its apps (they fall to Uncategorized) — it never deletes a
  service. No cascade-to-services, ever.
- `name UNIQUE` prevents two "Media" categories; the API returns a clean 409 on
  collision (same shape as v1's slug-taken).
- The index keeps the grouped list query cheap as the catalog grows.

`0004_categories.down.sql` drops the column (and index) then the table — clean
rollback; with `category_id` gone the catalog reverts to v1's flat render.

---

## API surface

All **mutating** endpoints are **admin-only (403 otherwise)** — the exact
`u.Role != "admin"` → `http.StatusForbidden` check already used by
`handleCreateService` / `handleUpdateService` / `handleDeleteService` in
`internal/api/services.go`. The **read** is session-gated like the rest of the
catalog.

| Method | Path | Body | Result | Auth |
|---|---|---|---|---|
| `GET`    | `/api/categories` | — | `{categories:[{id,name,sortIndex}]}` in `sort_index` order | session |
| `POST`   | `/api/categories` | `{"name":"Media"}` | 201 `{id,name,sortIndex}` (appended last); **409** on duplicate name | **admin** |
| `PATCH`  | `/api/categories/{id}` | `{"name":"Infra"}` | 200 updated; **409** dup name; **404** unknown id | **admin** |
| `PUT`    | `/api/categories/order` | `{"order":["<id>","<id>",…]}` | 204; reassigns `sort_index` by array position | **admin** |
| `DELETE` | `/api/categories/{id}` | — | 204; apps in it become Uncategorized (FK `SET NULL`); idempotent | **admin** |
| `PATCH`  | `/api/services/{id}` | `{"categoryId":"<id>"\|null}` | 200 updated service (extends v1's existing PATCH) | **admin** |

Notes:

- **Reorder** uses the same whole-array `PUT …/order` contract as v1's
  `PUT /api/layout` (send the full ordered id list, server rewrites
  `sort_index`) — consistent, and avoids fragile per-row index math.
- **Assigning** a category reuses v1's existing `PATCH /api/services/{id}`
  rather than a new endpoint: it gains an optional `categoryId` field
  (`*string`, three-state like v1's `gatus_key` patch — absent = unchanged,
  `null` = clear to Uncategorized, id = set). A `categoryId` naming a
  non-existent category → **400**.
- **Create** appends the new category at the end (`sort_index = max+1`) so
  creation never disturbs existing order; the admin reorders explicitly.

### `GET /api/services` view delta

The existing `serviceView` (`internal/api/services.go`) gains the tile's
category so the client can group without a second round-trip and an N+1 of
lookups:

```jsonc
{
  "id": "…", "name": "Jellyfin", "url": "…", "icon": "jellyfin",
  "status": "UP", "favorite": false, "iconLight": false, "iconDark": false,
  "categoryId": "…",          // null when Uncategorized
  "categoryName": "Media"     // null when Uncategorized — denormalized for render convenience
}
```

`categoryId`/`categoryName` are **additive**; older clients ignore them and keep
rendering the flat grid. (The grouped render is a frontend change; the API just
exposes the grouping.)

---

## Catalog rendering (grouped)

The catalog renders **sections, top to bottom**:

1. **Favorites** — first, always (if the user has any). Favorites is a
   cross-cutting personal view, so a favorited app appears here **and** in its
   category section (no double-counting confusion: Favorites is a pinned
   shortcut row, categories are the taxonomy). *(If Caleb prefers favorites to
   be exclusive — pulled out of their category — that's NEEDS JOE Q3; Stitch's
   lean is "show in both," matching how most launchers treat a favorites/pinned
   row.)*
2. **Each category**, in admin `sort_index` order, as its own section with a
   **section header (the category name)** and the v1 responsive tile grid
   beneath it.
3. **Uncategorized** — last, a section for every app with `category_id IS NULL`.
   Rendered with the same grid; its header is "Uncategorized" (or "Other" — copy
   call, NEEDS JOE Q3). If **every** app is categorized, this section is omitted;
   if **no** categories exist at all (fresh install / pre-seed), the catalog
   renders exactly as v1 today — one grid, no headers — so v4 is invisible until
   an admin makes a category.
4. **Within a section**, tiles keep the v1 per-user manual order
   (`user_layout.sort_index`) and v1/v2 tile behavior (status badge, favorite
   star, v2 icons) unchanged. Manual reorder stays **within** a section (a tile
   doesn't jump categories by dragging — category is admin metadata, set in edit
   mode/settings).

Section headers are where **v5** will attach the collapse/expand control; v4
ships them as static headers.

---

## Seeding categories from the Gatus group — **NEEDS JOE**

The task notes the seeded apps already carry a Gatus group (kube / media /
external), encoded in `gatus_key` as `"{group}_{name}"`. Two honest facts shape
this decision:

1. **The 39-app seed catalog is not in either app repo.** `homepad-api` seeds
   only a couple of fixtures for tests; the real 39-app catalog is provisioned
   by **Joe's deploy** (out of Stitch's scope). So any "seed categories from
   groups" step is a change to **Joe's seed data**, not something Stitch can
   unilaterally bake into a migration here.
2. **A Gatus group is not the same concept as a product category.** The group
   is a monitoring grouping; it's absent on any unmonitored app (no
   `gatus_key`), and "kube/external" is infra-speak, not necessarily how Caleb
   wants the catalog labeled for daily use.

**Options:**

| Option | What it means | Stitch's read |
|---|---|---|
| **A. Start fresh (recommended default)** | Ship v4 with **zero** categories; every app is Uncategorized until an admin creates categories and assigns apps. Catalog looks exactly like v1 until curated. | Safest, lowest-magic, no coupling of monitoring to taxonomy. The 39 apps render unchanged on day one. |
| **B. One-time seed from Gatus group** | A data step (in **Joe's seed**, not a homepad-api migration) creates categories `Kube`/`Media`/`External` from the distinct `gatus_key` prefixes and assigns each seeded app accordingly; unmonitored apps stay Uncategorized. | Nice head start, but it's Joe's seed to own, and it bakes the monitoring grouping into the product taxonomy. Reasonable as a **convenience**, not a coupling. |
| **C. Derive live from `gatus_key` prefix** | No category model at all; group purely by parsing the prefix at render time. | **Rejected** — can't rename/reorder/curate, breaks on unmonitored apps, conflates two concepts. This is the very problem v4 exists to fix. |

> **NEEDS JOE (Q1 — real product call):** Start fresh (A) vs. one-time
> Gatus-group seed (B)? Stitch recommends **A** for the homepad-api side (ship
> the model empty, no coupling), and if Caleb wants the head start, **B** is a
> *separate one-time data step Joe runs against the seed* using the model v4
> provides — kept out of the additive migration so the schema stays
> concept-clean. Either way C is off the table.

---

## Acceptance criteria (v4 categories — testable)

v1's A1–A11 and v2's A1–A14 still hold unchanged. New:

| # | Criterion | How verified |
|---|---|---|
| A1 | An admin can create a category; it appears in `GET /api/categories`; a duplicate name → **409** | API integration: POST "Media" 201 → GET shows it; POST "Media" again → 409 |
| A2 | A non-admin gets **403** on create / rename / reorder / delete category and on assigning a service's category | API integration: user-role token → 403 on each mutating verb |
| A3 | An admin can rename a category (`PATCH`); rename to an existing name → **409**; unknown id → **404** | API integration: PATCH name → 200; collide → 409; bogus id → 404 |
| A4 | An admin can reorder categories via `PUT /api/categories/order`; `GET` reflects the new order | API integration: reorder ids → GET returns new `sortIndex` order |
| A5 | An admin can assign a service to a category and clear it back to Uncategorized via `PATCH /api/services/{id}` (`categoryId: id` / `null`) | API integration: assign → `GET /api/services` shows `categoryId/categoryName`; set null → both null |
| A6 | Assigning a `categoryId` that names no category → **400**; the service is unchanged | API integration: PATCH bogus categoryId → 400; service category unchanged |
| A7 | Deleting a category sets its apps to Uncategorized (FK `SET NULL`) — **no service is deleted** | API integration: assign 3 apps → DELETE category → those apps `categoryId=null`, still exist; DELETE again → 204 (idempotent) |
| A8 | `GET /api/services` returns `categoryId`/`categoryName` per tile (null when Uncategorized) and is otherwise unchanged | API integration: assert fields present; uncategorized app → both null |
| A9 | The catalog renders one section per category in admin order, with Favorites first and Uncategorized last | Component test: seed categories + assignments, assert section order + headers |
| A10 | With **no categories defined**, the catalog renders exactly as v1 (single flat grid, no headers) | Component test: zero categories → no section headers, one grid |
| A11 | Within a section, v1 per-user manual order and v1/v2 tile behavior (status, favorite, icons) are unchanged | Component test: reorder within a section persists; status/favorite/icon still render |
| A12 | The `categories` table + `services.category_id` are additive; the seeded 39 apps all start Uncategorized; up+down migration is clean | Smoke: migrate `0004` → all seeded apps `category_id IS NULL`; run `0004…down` → catalog reverts to flat |

---

## Migration / back-compat

- **Additive migration only** (`0004_categories.up.sql` / `.down.sql`): create
  `categories`, add nullable `services.category_id` (FK `ON DELETE SET NULL`),
  add the lookup index. **No existing column changes.**
- **Zero data migration; everything starts Uncategorized.** All 39 seeded apps
  read back `category_id IS NULL` and render in the Uncategorized bucket — and
  because the render rule says "no categories defined → flat v1 grid," a fresh
  rollout with no admin action **looks identical to today**. Categories appear
  only once an admin creates them.
- **API back-compat:** `GET /api/services` only *adds* `categoryId`/
  `categoryName`; `PATCH /api/services/{id}` only *adds* an optional
  `categoryId`; the new `/api/categories*` routes don't touch any existing
  route. Older/cached clients ignore the additions and keep working.
- **Rollback:** `0004…down.sql` drops `category_id` then `categories`; with the
  column gone the catalog reverts cleanly to v1's flat grid. (If option **B**'s
  seed was applied, the categories vanish with the table — the apps were never
  modified destructively, so nothing is lost beyond the grouping.)

---

## Deployment contract delta (for Joe)

| Concern | v4 delta |
|---|---|
| Persistent storage | **Still none** — one table + one column in the existing Postgres |
| New env vars | None |
| New endpoints | `GET/POST/PATCH/DELETE /api/categories*`, `PUT /api/categories/order`, and an extended `PATCH /api/services/{id}` — all under existing `/api/*` + session/admin model; no new Ingress/Pangolin rules |
| DB | One additive migration (`0004`) |
| Replicas | Still 1 |
| Seed | **Decision for Joe (Q1):** leave categories empty (recommended), or run a one-time seed mapping Gatus groups (`kube`/`media`/`external`) → categories against Joe-owned seed data. Not part of the homepad-api migration. |

---

## Open decisions (NEEDS JOE)

| # | Question | Stitch's lean |
|---|---|---|
| Q1 | Seed categories from existing Gatus groups (kube/media/external) vs. start fresh? | **Start fresh** in the model; if a head start is wanted, do it as a **separate one-time data step in Joe's seed**, not in the migration |
| Q2 | Per-category icon/accent color in v4? | **No** — name + order only; additive later if wanted |
| Q3 | Favorites: show favorited apps in **both** Favorites and their category (recommended) vs. pull them out exclusively? Also the Uncategorized header copy ("Uncategorized" vs "Other") | **Show in both**; header copy = Caleb's call |
| Q4 | One category per app (recommended) vs. many-to-many tags | **One per app** for v4; tags are a separate later spec if needed |

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A12
(API integration in `homepad-api`: migration `0004`, `categories` store +
handlers, `category_id` on `services` + the extended `PATCH`, `categoryId/Name`
on the list view; component tests in `homepad`: grouped rendering, section
order, flat-when-empty) → RED→GREEN→REFACTOR→VERIFY. Backend slice lands first
so the web grouped-catalog has real categories + assignments to render.
**v5 (collapsible sections) builds directly on these section headers.**
