# SPEC: Category Pane Width Layout — Horizontal Screen Utilization

**Issue:** TBD (to be filed)
**Status:** Draft — awaiting Kare design sign-off
**Author:** Walt (product)
**Co-author:** Kare (design — see Design section, required before implementation)
**Scope:** `src/Catalog.tsx`, `src/App.tsx`, `src/api.ts`, `homepad-api` (DB migration + API), `src/index.css`
**Effort estimate:** M–L (data model + render logic + edit-mode drag UX)

---

## Problem statement

On screens wider than 1152 px, Homepad wastes nearly all horizontal space. Every category
glass pane stacks vertically at full width, capped by `max-w-6xl` (1152 px). A user on a
1920 px desktop has 768 px of grey margin. A user on a 2560 px ultrawide has 1408 px of
grey margin. The only way to see more content without scrolling is to have a narrower window.

This is backwards. Wider screens should **reduce scroll**, not sit idle.

Two compounding issues:

1. **The `max-w-6xl` container cap** constrains all content to 1152 px regardless of screen
   width. No amount of responsive tile-count tuning helps while this cap stands.

2. **No per-category width control.** All categories consume 100% of the container width,
   forcing them to stack vertically even when multiple categories could share a row and the
   user would rather browse them side by side.

---

## Solution: category pane width percentages + screen-filling layout

Each category can be assigned a **width percentage** (how much of the full screen width
its glass pane occupies). Categories with widths that add up to ≤ 100% in a **row group**
display side by side. Categories in different row groups stack vertically as before.

On a 1920 px screen, Friends 50% + Development 50% renders as two glass panes, each
960 px wide, sitting side by side — with no empty space and no scroll needed to see both.
On a 640 px mobile screen, the same two categories collapse to full-width stacking (row
assignment ignored below the mobile breakpoint).

This is a **screen-level redesign**: the container constraint is removed so the layout
fills the viewport, and the category grid adapts to the actual pane width rather than a
global fixed breakpoint.

---

## Screen redesign — what changes at the top level

### Container: remove `max-w-6xl`

`App.tsx` Home component currently wraps everything in `max-w-6xl mx-auto px-4`. This cap
is removed. The page content fills the viewport width (minus a consistent horizontal
padding — Kare to specify the exact value in the Design section, expected `px-4` to
`px-8` scaling with screen width).

### Layout model: rows of category panes

The Catalog replaces its single vertical stack with a **row-based model**:

```
Screen (full viewport width)
├── Row 0: [Friends — 50%] [Development — 50%]
├── Row 1: [Media — 100%]
└── Row 2: [Work — 33%] [Home — 33%] [Tools — 34%]
```

- A **row** is a set of categories that share the same `layoutRow` value.
- Categories within a row are ordered by `layoutColOrder`.
- A lone category in a row **always stretches to 100%** of screen width regardless of its
  stored `layoutWidthPct`. (No wasted space from an accidental partial row.)
- Widths within a row must sum to exactly 100%. The system enforces this — if a resize
  would push the sum over 100%, the adjacent category is auto-shrunk to compensate.
- The Favorites bucket and Uncategorized bucket remain full-width at the top and bottom
  respectively (no width control needed for these).

### Tile count: dynamic per pane

Currently, all sections use the global grid `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6`.
This is replaced with a **per-pane calculation** at runtime:

```
tiles_per_row = floor((pane_pixel_width + tile_gap) / (tile_size + tile_gap))
```

Tile size and tile gap are fixed constants (unchanged per product intent — no icon size
changes). The pane pixel width = `(viewport_width - total_padding) × (layoutWidthPct / 100)`.
This means a 50% pane on a 1920 px screen fits more tiles than on a 1024 px screen — and
that is correct behavior.

Minimum: 1 tile per row (no category pane can be so narrow it clips tiles).

---

## Data model additions

### Frontend — `Category` type (`api.ts:49`)

```typescript
export type Category = {
  id: string;
  name: string;
  sortIndex: number;
  // NEW:
  layoutRow: number;       // row group (0-indexed); categories in same row are side-by-side
  layoutColOrder: number;  // order within the row (0-indexed)
  layoutWidthPct: number;  // 10–100 (integer); percentage of screen width
};
```

**Defaults for existing categories:** on migration, all existing categories get
`layoutRow` = their current sort index (so they each get their own row, preserving the
existing full-width stacked appearance), `layoutColOrder = 0`, `layoutWidthPct = 100`.
No visible change to users after migration — the layout looks identical until an admin
reconfigures it.

### API additions (`homepad-api`)

- `PATCH /categories/:id` — already exists; must accept and persist the three new fields.
- `PUT /categories/layout` — new bulk endpoint; accepts an array of
  `{ id, layoutRow, layoutColOrder, layoutWidthPct }` objects for atomic multi-category
  layout saves (needed when a drag operation moves multiple categories simultaneously).
- DB migration: add `layout_row INTEGER NOT NULL DEFAULT 0`,
  `layout_col_order INTEGER NOT NULL DEFAULT 0`,
  `layout_width_pct INTEGER NOT NULL DEFAULT 100` to the categories table; backfill
  `layout_row` from `sort_index`.

---

## Component behavior

### View mode

- Categories are grouped by `layoutRow`, sorted by `layoutColOrder` within each group.
- Each row renders as a flex container (`display: flex; align-items: flex-start`).
- Each category pane gets `flex: 0 0 calc(layoutWidthPct% - gap_adjustment)`.
- Pane height is self-determined (however many tile rows the category needs). Categories
  in the same row are **not** height-equalized — each pane is as tall as its content.
  This avoids artificial empty space at the bottom of shorter panes.
- The gap between side-by-side panes is the same as the current category section gap
  (`space-y-8` translates to a horizontal equivalent — Kare to define exact token).
- Below 640 px (`sm` breakpoint): `layoutWidthPct` and `layoutRow` are ignored; all
  categories render full-width in `layoutRow` + `layoutColOrder` order (i.e., the
  reading order of the 2D grid collapses to a natural linear sequence).

### Edit mode (admin only)

Edit mode gains two new interactions:

**1. Resize handle between side-by-side categories.**
A drag handle appears in the gutter between horizontally-adjacent categories. Dragging
it left/right redistributes `layoutWidthPct` between the two panes. The combined total
stays fixed at 100% (or the row total). Minimum per-pane: 25%. Snap points: every 25%
(1 tile width on a 4-tile screen). — *Exact handle appearance, snap behavior, and
touch interaction: Kare's Design section.*

**2. Drag categories into rows or between rows.**
In edit mode, categories become draggable. Drop zones communicate two distinct outcomes:
- Drop **next to** a category → merge into the same row (side-by-side).
- Drop **above or below** a category → new row is created at that position.

— *How these drop zones are visually distinguished, and the full drag interaction
model: Kare's Design section. This is the hardest UX problem in this spec.*

**Width is auto-distributed on row merge.** When admin drags category A (currently 100%)
next to category B (currently 100%), both are set to 50% automatically. The system picks
the even split; admin can then drag the resize handle to adjust.

**Edit mode is still admin-only and client-ephemeral** (localStorage) — no change to
that behavior. Layout saves happen via API immediately on drag completion (not on
"save" button).

---

## Acceptance criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | On a viewport ≥ 1024 px, categories with the same `layoutRow` value display side by side, with no horizontal gap between pane right-edge and next pane left-edge that is not the designated gutter. | Visual inspection at 1024 px, 1440 px, 1920 px. |
| AC2 | Tiles within a category pane fill its width without clipping. No tile is partially visible at the right edge of a pane. | Resize viewport from 1920 → 1024; no tile clips at any intermediate size. |
| AC3 | A category alone in a row always occupies 100% of screen width regardless of its stored `layoutWidthPct`. | Set one category to 50%; move all others to different rows; verify it fills the full width. |
| AC4 | On a viewport < 640 px, all categories stack full-width in reading order, regardless of `layoutRow` and `layoutWidthPct` settings. | Resize below 640 px; confirm single-column layout. |
| AC5 | No `max-w-6xl` content cap is applied. On a 1920 px viewport the tiles extend to the viewport edge (minus page padding). | DevTools computed width of the main content container equals viewport width minus padding. |
| AC6 | In edit mode, a resize handle appears between horizontally-adjacent categories. Dragging it adjusts each pane's width proportionally, snapping at defined intervals, with each pane maintaining ≥ 25% width. | Admin enters edit mode on a row with two 50% categories; drag handle to verify snapping and floor. |
| AC7 | In edit mode, dragging a category pane into a different row position correctly updates `layoutRow` and `layoutColOrder`, persists to server, and survives a page reload. | Drag category from row 0 into row 1; reload; confirm layout unchanged. |
| AC8 | In edit mode, dragging two full-width categories into the same row auto-sets each to 50%. The resize handle then adjusts from that starting point. | Drag category B next to category A; verify both show at 50%; resize handle present. |
| AC9 | On migration / first load with no layout fields set, the app renders identically to pre-feature (all categories full-width, vertically stacked). | Deploy to fresh staging environment; verify no visual regression. |
| AC10 | `PUT /categories/layout` accepts a batch array of layout updates and applies them atomically (all succeed or all fail). | Use API directly; verify no partial updates on DB error. |

---

## Out of scope

- Per-user layout customization (admin sets layout; all users see the same layout).
- Changing tile icon sizes or tile internal dimensions.
- Category panes narrower than 25% of screen width.
- Horizontal scrolling within a row.
- Sub-pane nesting (a category inside another category).
- Favorites and Uncategorized buckets gaining width control (they are always full-width).
- Auto-layout that guesses an optimal arrangement — all layout is admin-configured.

---

## Design section — Kare (REQUIRED before implementation)

**Status: PENDING — spec is NOT approved until this section is filled by Kare.**

This spec has significant UI surface. Kare owns the design for all of the following.
Neither Walt nor Stitch should make UX decisions on these items without Kare's sign-off.

### Items requiring Kare's design

**D1 — Viewport padding at scale.**
What is the horizontal padding strategy as viewport grows from 640 → 1024 → 1920 → 2560 px?
The `max-w-6xl` cap is removed; the design system must specify what prevents content from
feeling glued to the viewport edge on ultrawide screens. Options: fixed padding
(e.g., `px-8`), max padding (up to some cap), or responsive padding tokens. Kare owns this.

**D2 — Row gutter between side-by-side panes.**
The horizontal gap between two category panes in the same row. Should match the rhythm of
the vertical gap between rows. Kare to specify exact design token / pixel value.

**D3 — Resize handle in edit mode.**
What does the drag handle look like? (Pill, dots, gripper icon?) What is its hover state,
active/dragging state, and touch target size? How does it snap — is there a visual snap
indicator (e.g., ghost line at 25/50/75%)? Does it work on touch (mobile edit mode is
admin-accessible)?

**D4 — Row drop zones in edit mode.**
This is the hardest design problem in this spec. When an admin drags a category pane,
two distinct outcomes are possible:
- Drop **into this row** (merge, show as side-by-side)
- Drop **above/below** (new row, stay stacked)

These two affordances must be visually unambiguous. Kare must specify: what the drop
zones look like when idle, on hover, and on active drag. How wide/tall is the "into row"
zone vs. the "new row" zone? What animation or transition happens on drop?

**D5 — Row separator in view mode.**
Are rows visually separated in view mode (a horizontal rule, a gap, nothing)? Is there a
visual concept of "rows" for the user, or is it invisible infrastructure? If rows have no
visual separator, does the vertical gap between a same-row pair (top-aligned, different
heights) feel confusing?

**D6 — Width indicator in edit mode.**
Does the admin see the width percentage labeled on each pane in edit mode? If so, where
(pane header? resize handle tooltip?). When does it appear (always in edit mode? only
while dragging?)?

**D7 — Mobile collapse visual.**
Below 640 px, row layout collapses to single-column. Is this transition animated or
instant? Is there any visual signal that the multi-column layout exists but is collapsed?

**D8 — Minimum pane state.**
At 25% width on a narrow-for-that-breakpoint screen, a pane may only fit 1 tile per row.
Is a 1-tile-wide pane an acceptable state visually? Does it need a minimum pixel width
floor regardless of percentage?

---

## Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | DRAFT — pending design |
| Design | Kare | PENDING |
| Implementation | Stitch | — |
| Tech QA | Gracie | — |
