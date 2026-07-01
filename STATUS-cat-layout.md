# STATUS — SPEC-category-pane-width-layout

Branch: `spec/category-pane-width-layout` (both **Code/homepad** and **Code/homepad-api**).
Task: `homepad-cat-layout-s001`. RED-first TDD throughout (each AC's failing test
committed alone before its impl — auditable in `git log`).

## DONE & pushed (tested)

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

## REMAINING (next slice — Catalog DOM wiring + edit-mode UX)

The pure logic + data model + backend are done; what's left is rendering it and the
admin drag UX. This is the large piece and was intentionally **not** rushed into the
1500-line `Catalog.tsx` under the ~15-min task cap (a broken half-edit is worse than a
clean foundation).

1. **View-mode render (makes AC1–AC5 real in the UI).** In `Catalog.tsx` (~line 619–647),
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
| AC1 | logic ✅ (tested) · DOM render remaining |
| AC2 | logic ✅ (tested) · DOM render remaining |
| AC3 | logic ✅ (tested) · DOM render remaining |
| AC4 | logic ✅ (tested) · DOM render remaining |
| AC5 | ✅ container change done + tested |
| AC6 | snap logic ✅ (tested) · handle DOM remaining |
| AC7 | data logic ✅ + **server persistence ✅ (tested)** · drag DOM remaining |
| AC8 | merge logic ✅ (tested) · drag DOM remaining |
| AC9 | ✅ client defaults + guarded migration, both tested |
| AC10 | ✅ **fully done** (storage atomic + PUT endpoint, tested vs real DB) |
