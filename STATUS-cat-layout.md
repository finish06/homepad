# STATUS — SPEC-category-pane-width-layout

Branch: `spec/category-pane-width-layout` (both **Code/homepad** and **Code/homepad-api**).
Task: `homepad-cat-layout-s001` → continued by `s002`. RED-first TDD throughout
(each AC's failing test committed alone before its impl — auditable in `git log`).
PR **#215** (open, base `main`).

## ⛔ s002 — STOP-AND-FLAG: the spec is superseded by shipped v14. Board decision needed before the DOM wiring.

**Read this before touching `Catalog.tsx`.** s002 rebased the branch onto current
`main` (was 80 commits behind, `mergeable=false`, CI red) and got a **green,
mergeable baseline** (details under "s002 run"). But the rebase surfaced a
**fundamental design collision** that blocks the remaining DOM wiring:

- This spec's stated goal is *"category pane width layout — horizontal screen
  utilization."* It was board-approved **before v14 existed.**
- **v14 (PR #207, v12.6.0) shipped a solution to that exact goal** *after* the
  approval: `.tile-field` is `display:flex; flex-wrap:wrap`, so category panels
  already **pack side-by-side left→right and wrap**, each hugging its content
  (`--panel-cols` fixed-190px tiles, Kare's A-006 "tiles never stretch"). v14 also
  shipped the **Arrange Auto/Custom** toggle + `category-ranker` usage ordering.
- The feature's **default** layout (AC9: every category `layoutRow=sortIndex`,
  own row @ 100%) renders via `layoutRows()` as a **vertical stack of full-width
  panels** — i.e. wiring it in **regresses v14's packed layout for every existing
  user** until they manually merge categories. It also **replaces** the shipped
  auto-pack + Auto/Custom ordering, and the AC6/7/8 2D resize/merge/new-row drag
  reworks the dnd that the **#35 browser gate** guards.

**Builder's vote (Stitch): NO-GO on wiring the DOM as-spec'd** — it ships a
regression of tested, board-approved v14 and duplicates a shipped solution. This
is the same "spec approved against an older main, overtaken by shipped work"
pattern as the settings-admin no-op and fleet-feed #8.

**Decision needed from the board (Walt product / Joe):**
1. **Close as superseded by v14** — v14 already delivers horizontal utilization;
   keep the tested logic/backend on the shelf or drop. (Cheapest; likely correct.)
2. **Rescope additive** — keep v14 auto-pack as the default (no regression) and
   layer the feature as an *opt-in* gesture: dragging two categories together
   locks them into an explicit sized row (`layoutRows` applies only to rows a user
   has explicitly merged; un-merged categories keep auto-packing). Coherent product
   story, but a real redesign of the spec — needs Joe/Kare sign-off on the approach
   before build. The pure logic + backend already support it.
3. **Proceed as-spec'd** — accept that explicit rows *replace* v14 auto-pack and
   the Auto/Custom ordering. Requires Walt to knowingly sign off on regressing v14.

Until one of these is chosen, the "REMAINING" steps below are **HELD** — building
them now creates a revert-trap PR. The green rebase (below) stands on its own and
keeps #215 mergeable regardless of the decision.

## s002 run — green rebase + reconciliation (pushed)

- **Rebased** `spec/category-pane-width-layout` (homepad web) onto `origin/main`
  (80 commits: v14 floating panels, #201 large-monitor grid, #213 mobile overflow).
  `homepad-api` was already up to date with main (backend slice intact, 2 commits
  ahead). PR #215 now **mergeable=true** (was false).
- **AC5 reconciled to shipped reality.** AC5/D1 drafted an *uncapped* full-width
  container, but #201 shipped `CONTENT_WIDTH = mx-auto max-w-[1536px] px-4`, locked
  by `large-monitor-layout.test.tsx`. Reverting that inside this branch = revert-trap;
  the feature's value fits within 1536px. `cat-layout-container.test.ts` now asserts
  the wide shared `CONTENT_WIDTH` container (not uncapped full-width). The dropped
  AC5 impl commit is gone; `catLayout.ts` still exports `paddingEachSide/usablePx`
  (pure, unused by the container now — harmless, drives `panePx`).
- **Category typing made surgical.** New main test files build `Category` literals
  without the layout fields → `layoutRow/layoutColOrder/layoutWidthPct` are now
  **optional** on the `Category` type (`categories()` still backfills defaults;
  consumers normalize). `CategoryLayout` (save wire shape) stays required. This
  fixed a tsc build break across 7 shipped test files with a 1-file change.
- **Green:** 629 vitest + `tsc --noEmit && vite build` pass. Commit `d266513`
  (force-pushed — rebase rewrote history).

## DONE & pushed (tested) — from s001, still valid

### Frontend (Code/homepad)
- **`src/catLayout.ts`** — pure layout core (no DOM), 20 unit tests in
  `src/catLayout.test.ts`, all green. Covers the *logic* of:
  - AC1 `groupIntoRows` (group by `layoutRow`, sort by `layoutColOrder`)
  - AC3 `effectiveWidthPct` (lone pane → 100%)
  - AC2 `panePx` + `tilesPerRow` (spec formula, min 1 tile, `TILE_MIN=168`,`TILE_GAP=16`)
  - AC4 `rowCollapses` (hard `<640` mobile stack **and** D8 per-row `PANE_MIN=176` floor)
  - AC9 defaults render as stacked full-width single-pane rows
  - `layoutRows(cats, vw)` — composite view model the component will consume
  - AC6 `snapWidthPct` (25/50/75 snap within 3%, hard floor 25 / cap 75)
  - AC8 `resolveMergeSplit` (50/50) + `mergeCategories` (auto 50/50, orders by side)
  - AC7 `moveToNewRow` (new row at 100%, contiguous renumber)
- **`src/App.tsx`** — AC5: removed `max-w-6xl`, now `w-full px-4 sm:px-6 lg:px-8
  xl:px-12 2xl:px-16` (D1). Guard test `src/cat-layout-container.test.ts`.
- **`src/api.ts`** — `Category` type gains `layoutRow/layoutColOrder/layoutWidthPct`;
  `categories()` backfills defaults (row=sortIndex, col=0, width=100 → AC9);
  new `saveCategoryLayout(CategoryLayout[])` → `PUT /api/categories/layout` (AC10 client).
  Tests in `src/cat-layout-api.test.ts`. Existing `api.test.ts` categories case updated
  for the new defaults; Category literals in Catalog/ServiceForm/v7 test helpers updated.

### Backend (Code/homepad-api) — full AC10 server + AC7 persistence + AC9 migration
- **`migrations/0008_category_layout.{up,down}.sql`** — adds `layout_row`,
  `layout_col_order`, `layout_width_pct`. **Backfill guarded in a `DO` block** so it
  runs ONLY when the column is first added (Migrate re-runs every boot via idempotency,
  not a version table — an unguarded backfill would reset layout on every restart and
  break AC7). Fresh/empty DB → 0 rows touched → identical pre-feature stack (AC9).
- **`internal/storage`** — `Category` gains Layout* fields; `CategoryLayout` type;
  `ListCategories`/`CreateCategory`/`RenameCategory` select/return the new columns
  (new category lands on its own row: `layout_row = sort_index`); **`SetCategoryLayout`**
  = atomic batch (one tx; unknown/foreign id → `ErrNotFound` + full rollback → AC10).
- **`internal/api`** — `categoryView` serializes the layout fields; **`handleSetCategoryLayout`**
  (`PUT /api/categories/layout`, 200 ok / 404 unknown-id rollback); route registered +
  added to the not-implemented allow-list.
- Tests: `internal/storage/categories_test.go` (batch + atomic rollback) and
  `internal/api/category_layout_test.go` (PUT persist + atomic 404). **Green under the
  canonical `make test` / `go test ./... -p 1`** (shared test DB requires `-p 1`; a bare
  parallel `go test ./...` deadlocks/FK-fails across packages — that is a harness artifact,
  not a code bug).

## REMAINING (Catalog DOM wiring + edit-mode UX) — ⛔ HELD pending the board decision above

The pure logic + data model + backend are done; what's left is rendering it and the
admin drag UX. **Do not build these until the v14 collision above is resolved** — as
written they replace/regress shipped v14. If option 2 (additive rescope) is chosen,
steps 1–5 change materially (they must fall back to v14 auto-pack for un-merged rows),
so treat the line/step detail below as *pre-v14 notes to be re-planned*, not a ready
spec. ⚠️ Line numbers are **stale** post-rebase: the category render is now
`Catalog.tsx` ~876–907 (a `DndContext` + `verticalListSortingStrategy` `SortableContext`
mapping `displayCats` → `SortableSection`), tiles come from `panelColsFor()` /
`useFieldCols()`, panels are `.category-panel` in a `flex-wrap` `.tile-field`.

1. **View-mode render (makes AC1–AC5 real in the UI).** In `Catalog.tsx` (~line 619–647 → now ~876–907),
   group `cats` via `layoutRows(cats, viewportWidth)` and render each `RowView` as a
   flex row (`display:flex; align-items:flex-start; gap:2rem`); each pane
   `flex:0 0 <pct>` (collapsed row → stacked full-width). Add a viewport-width hook
   (`useState`+`resize`). Replace the fixed grid class in `renderGrid` (line ~472) with a
   per-pane dynamic `gridTemplateColumns: repeat(<tiles>, minmax(0,1fr))` using
   `tilesPerRow(panePx)`. **Care:** the category reorder currently uses a *vertical*
   `SortableContext`; a 2D layout needs the dnd sensors reworked (see #3).
2. **D6 width pill** in `.cat-head` (edit mode only), tabular-nums, indigo while resizing;
   lone pane shows `100%`.
3. **AC6 resize handle (D3)** in the 32px gutter — 6px pill / 44px hit area, snap via
   `snapWidthPct`, ghost guides, floating `A% · B%` label, touch 200ms press-hold; on
   drop `saveCategoryLayout`.
4. **AC7/AC8 row drag (D4)** — merge zones (left/right pane halves → `mergeCategories`,
   auto 50/50) + new-row zones (inter-row gutters → `moveToNewRow`, 100%); vertical vs
   horizontal indigo indicator + "Merge into row"/"New row" cursor pill; persist via
   `saveCategoryLayout`.
5. **D7 edit-mode info line** under a collapsed row; **D8 amber "Narrow — 1 tile"**
   advisory next to the width pill when a pane ≤1 tile at 1440px.
6. **`src/index.css`** — new `warning` tokens `#B45309` on `#FEF3C7` (D8); width-pill +
   handle + drop-indicator styles; `.cat-head` label ellipsis in narrow panes (D8).
7. **Browser-real CDP self-QA** (jsdom can't verify stacking/pointer) at 1024/1440/1920
   + a phone width before hand-off to Gracie.
8. **PATCH /api/categories/:id layout fields** — deferred (frontend uses the batch PUT for
   all layout writes; dispatch lists it but no AC depends on it). Add optional-pointer
   decode if a single-field path is later needed.

## AC status snapshot
| AC | State |
|----|-------|
| AC1 | logic ✅ (tested) · DOM render ⛔ HELD (v14 collision) |
| AC2 | logic ✅ (tested) · DOM render ⛔ HELD (v14 collision) |
| AC3 | logic ✅ (tested) · DOM render ⛔ HELD (v14 collision) |
| AC4 | logic ✅ (tested) · DOM render ⛔ HELD (v14 collision) |
| AC5 | ✅ reconciled to shipped `CONTENT_WIDTH` (max-w-[1536px]) + tested |
| AC6 | snap logic ✅ (tested) · handle DOM ⛔ HELD (v14 collision) |
| AC7 | data logic ✅ + **server persistence ✅ (tested)** · drag DOM ⛔ HELD |
| AC8 | merge logic ✅ (tested) · drag DOM ⛔ HELD (v14 collision) |
| AC9 | ✅ client defaults + guarded migration, both tested |
| AC10 | ✅ **fully done** (storage atomic + PUT endpoint, tested vs real DB) |
