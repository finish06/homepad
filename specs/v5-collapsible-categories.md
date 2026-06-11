# homepad v5 — Collapsible Categories — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-06-10
**Methodology:** ADD (getadd.dev), POC maturity dial
**Builds on:** [`specs/v1-launcher.md`](./v1-launcher.md), [`specs/v4-app-categories.md`](./v4-app-categories.md)

---

## Problem

v4 gives the catalog category **sections** with headers, rendered top-to-bottom
in admin order. With many categories and 39+ apps, that's a tall page: a user
who lives in "Media" still scrolls past "Infra" and "External" every visit.
There's no way to fold away the sections you don't currently care about.

Two things make this its own spec rather than a v4 detail:

1. **It's an interaction + persistence problem, not a data-model one.** v4
   defines *what* categories are (shared, admin-managed). Collapse state is the
   opposite kind of fact: it's **per-user view state** — my folded sections
   shouldn't change yours — which is the favorites/layout/theme persistence
   model, not the categories model.
2. **It needs the v4 section headers to exist first.** There is nothing to
   collapse until categories render as sections.

## v5 Goal

Each category section on the catalog can be **collapsed** (header only, tiles
hidden) or **expanded** (header + tiles), toggled by clicking the section
header. The collapsed/expanded state **persists per-user** across sessions and
devices. **Default: expanded** (nothing hidden until the user chooses to fold
it).

## In scope (v5)

- A **collapse/expand toggle** on each category section header (v4's headers).
- **Per-user persistence** of which sections are collapsed, in Postgres
  (recommended — see "Where the state lives"), surfaced so the catalog renders
  the right open/closed state on first paint.
- A defined **default (expanded)** and defined behavior for the special
  **Favorites** and **Uncategorized** sections.
- Accessible, keyboard-operable disclosure interaction (it's a disclosure
  widget).
- Graceful handling when categories are renamed/deleted/reordered out from under
  a stored collapse state.
- Additive DB migration + back-compat: with no stored state, every section is
  expanded (identical to v4).

## Out of scope (deferred)

- **Collapsing Favorites / Uncategorized** — decision below; lean is "Favorites
  collapsible too, Uncategorized collapsible too," but the *category* sections
  are the core ask.
- **Remembering collapse per-device** instead of per-account — same reasoning as
  v3 theme: personalization is account state. A device-local override is a later
  nicety.
- **"Collapse all / expand all" affordance** — nice, but additive; not v5-core.
  (Cheap to add; flagged as Q-list, not built speculatively.)
- **Animating tile reflow on collapse** beyond a simple height/disclosure
  transition — respect v1's "functional motion only" + `prefers-reduced-motion`.
- **Admin-set default collapse state per category** (e.g. "External ships
  collapsed") — that's a shared-catalog property and a different feature; v5
  default is uniformly expanded. (NEEDS JOE Q3 if Caleb wants admin defaults.)

## Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. New moving parts: one
small per-user table, one read + one write endpoint, and the disclosure
interaction on v4's section headers. No PVC, no new infra, no new env vars.

---

## Where the state lives — tradeoffs

This mirrors the v3 theme decision; same conclusion, same reasoning.

| Option | Pros | Cons |
|---|---|---|
| **Per-user in Postgres** (recommended) | Follows the account across devices — consistent with favorites, layout, and v3 theme (all per-user server-side state); survives cache clears; one source of truth | One small table + two tiny endpoints; a first-paint wants the state available with the catalog (addressed below) |
| **`localStorage` only** | Zero backend; instant | **Per-device, not per-user**; lost on cache clear; diverges from every other personalization in homepad |

### Recommendation: **Per-user in Postgres**, `localStorage` as a first-paint
cache only.

Collapse state is the same *kind* of fact as favorites and theme — personal
view preference tied to the account. It belongs server-side, keyed by `user_id`,
so the catalog folds the same way on every device. As with v3, `localStorage`
may mirror the last-known state purely to render the correct open/closed layout
on first paint without waiting on a round-trip; the server value is
authoritative once loaded.

> **Storing collapsed, not expanded.** We persist the **set of collapsed
> category ids** (the exception), not the expanded ones. Since the default is
> expanded, a brand-new user and a user who has never collapsed anything both
> have an empty set — no rows, no work — and a newly-created category is
> expanded by default automatically (it's simply not in anyone's collapsed set).

---

## Data model

### Schema (additive migration `0005_category_collapse.up.sql`)

```sql
CREATE TABLE IF NOT EXISTS user_collapsed_categories (
    user_id     UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, category_id)
);
```

- A **row means "this user has collapsed this category."** Absence = expanded
  (the default). This is the same presence-as-boolean pattern as v1's
  `favorites` table.
- **Both** FKs cascade on delete: deleting a **user** drops their collapse
  prefs; deleting a **category** (v4) drops everyone's collapse row for it — so
  there is **never an orphan pointing at a category that no longer exists**, and
  no cleanup code. This is exactly why the state keys on `category_id` rather
  than the category *name* (rename is invisible to it; the row tracks identity).

`0005…down.sql` drops the table — clean rollback; with it gone, every section is
expanded (v4 behavior).

> **Depends on v4.** This table FKs `categories`, so migration `0005` **must run
> after `0004`**. If v4 is not yet merged, v5 is blocked on it (there are no
> category sections to collapse). Sequence is enforced by migration numbering.

---

## API surface

Both endpoints are **session-gated only** (collapse state is the user's own
personalization — not admin). Same model as favorites/layout/theme.

| Method | Path | Body | Result |
|---|---|---|---|
| `GET` | `/api/me/collapsed-categories` | — | `{collapsed:["<categoryId>", …]}` — the current user's collapsed set |
| `PUT` | `/api/me/collapsed-categories` | `{"collapsed":["<id>", …]}` | 204; replaces the set with exactly these ids |

- **Whole-set `PUT`** (replace, not per-row toggle) mirrors v1's
  `PUT /api/layout` contract — the client sends the full collapsed set, the
  server reconciles. Simple, idempotent, no drift. Unknown/stale ids in the body
  are **silently dropped** (a category may have been deleted between the client's
  read and write); this is not an error.
- **Alternative considered:** fold the collapsed set into the `GET /api/me`
  payload (like v3's `themePref`) to save a round-trip on boot. Reasonable, but
  the set is unbounded-ish and catalog-shaped, so a dedicated endpoint keeps
  `/api/me` lean. **NEEDS JOE Q1** — Stitch's lean is the dedicated endpoint;
  the client already fetches `/api/services` and `/api/categories` on catalog
  load, so this is one more cheap parallel fetch, not a serial blocker.

No change to `GET /api/services` is required — collapse is purely about whether
a section's already-delivered tiles are *shown*, not about what data ships.

---

## Interaction & rendering

### The disclosure

Each v4 category **section header** becomes a **disclosure control**:

- The whole header row is the click/tap target (with a clear chevron/caret
  affordance that rotates between states). Clicking toggles collapsed↔expanded.
- **Collapsed** = header visible (with the category name and a count, e.g.
  "Media · 8"), tiles hidden. **Expanded** = header + the v1 tile grid.
- Showing a **count** when collapsed is recommended so a folded section still
  tells you how much is inside (and confirms it's not empty).
- **Accessibility:** implement as a proper disclosure — header is a
  `<button aria-expanded={…}>` controlling the section region (`aria-controls`),
  operable by Enter/Space and reachable by keyboard. Respect
  `prefers-reduced-motion` (snap instead of animate when set).
- **Optimistic with rollback:** toggling updates the UI immediately and fires
  the `PUT`; on failure it rolls back — the same pattern as favorites/reorder in
  `Catalog.tsx` and v3's theme control.

### Defaults & special sections

- **Default = expanded.** A fresh user, a never-touched section, and a
  brand-new category are all expanded (no row in the collapsed set).
- **Favorites** and **Uncategorized** are render-time buckets, not `categories`
  rows, so they have no `category_id` to key on. Recommendation: make them
  **collapsible too**, persisted under reserved sentinel keys
  (`"__favorites__"`, `"__uncategorized__"`) in the same set — *or* keep them
  always-expanded for v5 simplicity. **NEEDS JOE Q2**; Stitch's lean is "make
  them collapsible too" (consistent UX), using sentinel keys that the `PUT`
  accepts but that obviously have no FK row — meaning the sentinel keys would
  need a **separate lightweight store** (a small `user_view_flags` text-keyed
  table) rather than the FK'd `user_collapsed_categories`. To avoid scope-creep,
  the **default recommendation for v5 is: real categories collapsible (FK
  table), Favorites + Uncategorized always expanded**, and revisit sentinel-keyed
  buckets only if Caleb wants them folded.

### Rename / reorder / delete interplay (v4)

- **Rename** a category → its collapse state is unaffected (keyed on id, not
  name).
- **Reorder** categories → collapse state is unaffected (it's per-section, order
  doesn't matter).
- **Delete** a category → the FK `ON DELETE CASCADE` removes every user's
  collapse row for it automatically; no orphan, no stale UI.

---

## Acceptance criteria (v5 collapsible — testable)

v1 (A1–A11), v2 (A1–A14), and v4 (A1–A12) still hold unchanged. New:

| # | Criterion | How verified |
|---|---|---|
| A1 | Each category section header is a disclosure control; clicking it collapses the section (tiles hidden) and clicking again expands it | Component test: render grouped catalog, click header → tiles hidden; click again → tiles shown |
| A2 | **Default is expanded** — a user with no stored collapse state sees every section open | Component test: empty collapsed set → no section collapsed; API: fresh user `GET /api/me/collapsed-categories` → `{collapsed:[]}` |
| A3 | Collapse state **persists per-user**: collapse "Media", reload / log in on a fresh client, "Media" is still collapsed | API integration: `PUT {collapsed:[media]}` → new session `GET` returns it; component reflects it on boot |
| A4 | Collapse state is **private to the user** — user B's sections are unaffected by user A collapsing one | API integration: A collapses → B's `GET` still empty |
| A5 | `PUT /api/me/collapsed-categories` replaces the set; unknown/stale ids in the body are silently dropped (no 4xx) | API integration: PUT with a deleted category id → 204; subsequent GET omits it |
| A6 | Both endpoints require a session — unauthenticated → **401** | API integration: no cookie → 401 on GET and PUT |
| A7 | Deleting a category (v4) removes everyone's collapse row for it (FK cascade) — no orphan state | API integration: collapse → DELETE category → no `user_collapsed_categories` rows for that id |
| A8 | Renaming or reordering a category (v4) does **not** change its collapse state (keyed on id) | API integration: collapse → rename + reorder → still collapsed |
| A9 | The disclosure is keyboard + screen-reader operable (`aria-expanded`, Enter/Space) and respects `prefers-reduced-motion` | Component/a11y test: header is a button with `aria-expanded`, toggles on Enter/Space; reduced-motion → no animation |
| A10 | Toggling is optimistic with rollback: a failed `PUT` reverts the section to its prior state with an inline error | Component test: mock `PUT` 500, assert section state rolls back |
| A11 | A newly-created category (v4) renders **expanded** for all users automatically (not in any collapsed set) | API/component: create category → every user sees it expanded |
| A12 | With **no categories** (v4 flat-grid mode), there are no section headers and nothing collapsible — the catalog is exactly v1/v4-flat | Component test: zero categories → no disclosure controls rendered |

---

## Migration / back-compat

- **Additive migration only** (`0005_category_collapse.up.sql` / `.down.sql`):
  create `user_collapsed_categories`. **No change to any existing table** —
  `users`, `services`, `categories` are untouched; the seeded 39-app catalog is
  irrelevant to this feature (collapse is per-user view state, not catalog data).
- **Zero data migration; default is expanded.** No rows = every section open, so
  on rollout the catalog looks exactly like v4 until a user folds something.
- **API back-compat:** two **new** routes only; no existing route changes.
  `GET /api/services`, `/api/categories`, and `/api/me` are unchanged.
- **Ordering dependency:** `0005` requires `0004` (FK to `categories`). It must
  not be applied before v4's migration.
- **Rollback:** `0005…down.sql` drops the table; with it gone, all sections
  render expanded (v4 behavior). Nothing else references it.

---

## Deployment contract delta (for Joe)

| Concern | v5 delta |
|---|---|
| Persistent storage | **Still none** — one small per-user table in the existing Postgres |
| New env vars | None |
| New endpoints | `GET/PUT /api/me/collapsed-categories` — under existing `/api/*` + session model; no new Ingress/Pangolin rules |
| DB | One additive migration (`0005`); **must run after `0004`** |
| Replicas | Still 1 |

---

## Open decisions (NEEDS JOE)

| # | Question | Stitch's lean |
|---|---|---|
| Q1 | Dedicated `GET/PUT /api/me/collapsed-categories` (recommended) vs. folding the collapsed set into `GET /api/me` | **Dedicated endpoint** — keeps `/api/me` lean; one cheap parallel fetch on catalog load |
| Q2 | Are **Favorites** and **Uncategorized** collapsible too (sentinel-keyed, needs a tiny text-keyed flags table) or always-expanded for v5? | **Always-expanded for v5** (simplest correct); add sentinel-keyed buckets later if wanted |
| Q3 | Admin-set **default** collapse per category (e.g. ship "External" collapsed)? | **Out of v5** — uniform expanded default; revisit as a shared-catalog property later |
| Q4 | Persist **collapsed set** (recommended) vs. expanded set? | **Collapsed set** — empty by default, new categories auto-expand, less storage |

---

**Next ADD phase after sign-off:** (after v4 is merged) test-writer → failing
tests for A1–A12 (API integration in `homepad-api`: migration `0005`,
`user_collapsed_categories` store + the two `/api/me/collapsed-categories`
handlers, 401 cases, cascade behavior; component/a11y tests in `homepad`:
disclosure interaction, default-expanded, persistence on boot, optimistic
rollback) → RED→GREEN→REFACTOR→VERIFY. Backend slice lands first so the web
disclosure has a real per-user store to read and write.
