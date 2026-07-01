# SPEC: Category Pane Width Layout — Horizontal Screen Utilization

**Issue:** TBD (to be filed)
**Status:** Design-approved (Kare, 2026-07-01) — awaiting Walt product go to ship to Stitch
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

**Status: APPROVED — Kare, 2026-07-01.** Filled below. All values are grounded in the
homelab design system (`Code/design-system/DESIGN-SYSTEM.md`) and the current Homepad
tokens in `src/index.css`. Where a number is derived rather than measured off a live
render, it is flagged as a **build note** for Stitch to confirm — none block the design go.

> **Terminology note (read first).** The spec calls each category a "glass pane." In the
> shipped Homepad a category is **not** a glass card — it is a `.cat-head` header (with a
> hairline bottom divider) above a tile grid, on the shared `.app-surface`. This feature
> does **not** introduce a new glass card wrapper (that would be a separate visual
> redesign and out of scope). "Pane" here means **the category column** = its header +
> its tile grid. Separation between side-by-side panes is carried by the row gutter (D2)
> and each pane's own header divider (D5), not by a new card chrome. The tile glass/shadow
> language in `.tile` is unchanged.
>
> **Tile constant (build note).** The per-pane tile-count formula in this spec needs a
> fixed tile cell size. Derived from `src/index.css` (`.tile-icon` 46px plate, `.tile`
> padding 15px, grid `gap-4` = 16px) and the current desktop grid, the design tile target
> is **`TILE_MIN = 168px`** content width with **`TILE_GAP = 16px`** (the existing
> `gap-4`, on the 8pt grid). So `tiles_per_row = floor((pane_px + 16) / (168 + 16))`.
> Stitch: confirm 168px against a live tile render; if the real comfortable tile is wider,
> bump `TILE_MIN` and the D8 floor together (keep floor = `TILE_MIN + 8`).

### Items requiring Kare's design — DECISIONS

**D1 — Viewport padding at scale. DECISION: responsive horizontal padding that steps up
by breakpoint and caps at 64px. No new content max-width.**

Replace `max-w-6xl mx-auto px-4` with `mx-auto` (centering only, no width cap) + a
responsive `px` that grows to a **64px ceiling** and then holds. The cap on the *padding*
(not the content) is what stops ultrawide edge-glue without reintroducing a content cap —
at 2560px, 64px each side leaves a 2432px content band that fills the screen and still
breathes.

| Viewport | Padding each side | Tailwind | On 8pt grid |
|---------:|------------------:|----------|:-----------:|
| < 640 (mobile) | 16px | `px-4` | ✅ |
| 640 (sm) | 24px | `sm:px-6` | ✅ |
| 1024 (lg) | 32px | `lg:px-8` | ✅ |
| 1440 (xl) | 48px | `xl:px-12` | ✅ |
| 1920 (2xl) | 64px | `2xl:px-16` | ✅ |
| 2560+ | 64px (held — no further growth) | `2xl:px-16` | ✅ |

Vertical page padding (`py-6` = 24px) is unchanged.

**D2 — Row gutter between side-by-side panes. DECISION: 32px (`gap-8`), matching the
inter-row vertical rhythm exactly.**

The current vertical gap between categories is `sm:space-y-8` = **32px**. To keep the grid
feeling square (equal horizontal and vertical rhythm), the row gutter is the same token:
each row is `display:flex; align-items:flex-start; gap: 2rem` (**32px**, `gap-8`). The
vertical gap **between** rows stays 32px (`sm:space-y-8`, unchanged). One rhythm, both
axes. The resize handle (D3) lives centered inside this 32px gutter.

**D3 — Resize handle in edit mode. DECISION: a centered vertical grip pill in the gutter,
44px invisible hit area, snaps to 25% increments with ghost guides.**

- **Appearance (rest, edit mode only):** a **6px-wide × 48px-tall** rounded pill
  (`radius-full`), vertically centered in the shared height of the two panes, sitting in
  the middle of the 32px gutter. Fill `rgba(15,23,42,0.12)` light / `rgba(255,255,255,0.14)`
  dark. No icon — the pill *is* the affordance. `cursor: col-resize`.
- **Hit target:** the pill is visually 6px, but the interactive zone is an invisible band
  **44px wide × full pane height**, centered on the gutter — clears the 44×44 minimum
  (WCAG 2.5.5) even though the visible grip is thin. This is the design-system
  "transparent hit-area expansion" pattern (§1.3).
- **Hover:** pill widens to **8px**, fill → `#6366f1` (indigo-500), 160ms `ease-out`.
- **Active / dragging:** pill → solid `#4F46E5` (primary). A **1px indigo dashed ghost
  line** spans the full pane height at each valid snap position (25 / 50 / 75%); the line
  nearest the cursor brightens to solid `#4F46E5`, the others sit at `#6366f1` @ 0.4. A
  floating **percentage label** (D6 style, indigo fill) follows the handle showing the
  live split, e.g. `60% · 40%`.
- **Snap:** because both panes must sum to 100% and each has a **25% floor** (spec), the
  only valid two-pane splits are **25/75, 50/50, 75/25** — three positions. The handle is
  magnetic: free 1% drag, but snaps when within 3% of a snap point; it **hard-stops at the
  25% floor** (the pill cannot be dragged past it — the label freezes at `25%`).
- **Touch (admin mobile edit):** honor the existing tile-drag pattern — **200ms
  press-hold to grab** (see `src/Catalog.tsx:167`) so it doesn't fight page scroll. Under
  `@media (pointer:coarse)` the visible pill is **12px** wide (still inside the 32px
  gutter) and the ghost label is shown persistently while dragging (no hover on touch).
- **Reduced motion:** pill width/color changes are instant; no ghost-line fade.

**D4 — Row drop zones in edit mode. DECISION: orientation is the disambiguator — a
VERTICAL indigo bar means "merge as a column," a HORIZONTAL indigo bar means "new row" —
each reinforced by a placeholder opening in the matching axis and an explicit text label.**

This is the core interaction; it is designed to be legible on the *first* drag.

*The single rule the admin learns in one gesture:* **the indicator points the way the
layout will grow.** A tall vertical bar → the row gains a column. A wide horizontal bar →
the stack gains a row. Same indigo, different axis.

**Two zone types and their geometry** (active only while a pane is grabbed):

1. **Merge zone (→ side-by-side).** Each pane in a row exposes a **left half** and a
   **right half** as merge targets (split at the pane's horizontal center; full pane
   height). Hovering the left half inserts the dragged pane as a column immediately to
   that pane's **left**; right half → to its **right**.
   - **Indicator:** a **4px-wide vertical bar**, `radius-full`, `#6366f1`, full pane
     height, that grows **center-out** (140ms `ease-out`) at the insertion seam.
   - **Placeholder:** a **dashed indigo column** (1px dashed `#6366f1` @ 0.6) opens
     inline at the even-split target width; the sibling panes slide to make room
     (160ms `ease-out`) so the admin literally sees the row make space.
2. **New-row zone (→ stacked).** The **inter-row gutters** (the 32px vertical gaps), plus
   a band above the first row and below the last row, are new-row targets. At rest during
   a drag they show a **faint 1px dashed horizontal hairline** across the full content
   width so the admin can see where rows can be inserted. Active hit height is expanded to
   **44px** (invisible) so it is easy to land on both mouse and touch.
   - **Indicator:** a **4px-tall horizontal bar**, `radius-full`, `#6366f1`, spanning the
     **full content width**, that grows **left-to-right** (140ms `ease-out`).
   - **Placeholder:** a **full-width dashed row** opens vertically (panes below slide down,
     160ms `ease-out`).

**Precedence (never ambiguous):** exactly **one** zone is active — the one nearest the
pointer. Pointer over a pane body → merge (vertical bar). Pointer in an inter-row gutter or
the top/bottom band → new row (horizontal bar). The pane bodies are large and the gutters
are a distinct 32px strip, so the two never fight for the same pixels.

**Text label (kills first-run ambiguity):** a small floating pill tracks the cursor
reading **"Merge into row"** or **"New row"** (12/600, white text on `#4F46E5`,
`radius-full`, `shadow` per `.user-menu` elevation). On touch it is **always shown** while
dragging (no hover to rely on).

**Drop animation:** the dashed placeholder collapses as the real pane snaps into it
(180ms `ease-out`); the pane scales 1.02 → 1.0 and its shadow settles. On a **merge**,
both panes animate their width to the even split over **200ms** (`ease-out`) so the sibling
visibly yields space. On a **new row**, the pane lands at 100% width. Widths persist
immediately via `PUT /categories/layout` (spec) — no save button.

**Dragged-pane state:** reuse the existing grabbed treatment (opacity ~0.9, lifted shadow,
`scale(1.02)`) already used for tile/section drags, for consistency (design-system
principle #8).

**Touch specifics:** 200ms press-hold to grab; merge halves and new-row bands both meet
the 44px active-size floor under `pointer:coarse`; auto-scroll when the drag nears the
viewport top/bottom edge.

**Reduced motion:** bars appear/disappear instantly, placeholders open without the slide
(they just occupy their final size), pane snaps without scale. The color/position
information is preserved; only the easing is dropped.

**D5 — Row separator in view mode. DECISION: no rule, no explicit "row" concept — rows are
invisible infrastructure. Separation is the 32px gutter + each pane's own header divider.**

Users do not own the layout (admin-only) and should never have to think in "rows." In view
mode the page just reads as a considered multi-column arrangement. There is **no horizontal
rule** between rows. What delineates the columns:

- The **32px row gutter** (D2) between side-by-side panes and the **32px vertical gap**
  between rows — one consistent rhythm, so grouping reads without a drawn line.
- Each pane's **`.cat-head` bottom divider** spans only that pane's own width, so from the
  first pixel of each column the header + its hairline mark "this is a distinct category."

**Different heights (top-aligned):** panes are `align-items: flex-start` (spec) — a shorter
pane simply ends; the next row begins 32px below the **tallest** pane in the current row.
To guarantee rows never interleave, **each row is its own flex block**, and the row blocks
are stacked with `space-y-8` (the parent owns the 32px vertical gap; the flex row owns the
32px horizontal gap). The ragged bottom edge of a mismatched pair is expected and fine —
categories are independent; nothing needs to visually "connect" them. This is preferable to
height-equalizing (which the spec forbids) because empty tile-less space at the bottom of a
short pane would read as a bug, not a design.

**D6 — Width indicator in edit mode. DECISION: a small `%` pill in the pane header, shown
whenever edit mode is on; emphasized (indigo) while that pane is being resized.**

- **Where:** in the `.cat-head`, right-aligned, immediately after the existing `.cat-count`
  pill. Reuse the count-pill shape but on the grid: **padding `2px 8px`** (not the
  design-system-flagged `1px 6px`), **12px / 700**, `font-variant-numeric: tabular-nums`
  (so the width doesn't jitter as the value changes), `radius-full`. Text `#475569`
  (slate-600) on `rgba(15,23,42,0.06)` light / `#9aa3b8` on `rgba(255,255,255,0.08)` dark —
  measured **6.9:1** on the light pill, clears AA body (the design-system count pill's
  lighter `#64748b` sits at ~4.3:1, so this uses the slightly darker header ink to be safe).
  Label reads e.g. **`50%`**.
- **When:** **always visible in edit mode** (so the admin can read the current config at a
  glance without dragging), **hidden in view mode**. While that pane is actively being
  resized, the pill switches to **solid `#4F46E5` fill with white text** (6.29:1) for
  emphasis and updates live; the floating handle label (D3) carries the paired split.
- A lone pane in a row (renders 100% per spec) shows **`100%`** — honest about the stored
  vs. rendered width being reconciled to full.

**D7 — Mobile collapse visual. DECISION: instant at the breakpoint (no layout animation);
no view-mode "hidden columns" badge; an edit-mode-only info line explains the collapse.**

- **Transition:** the collapse is a **CSS media-query switch** at the row-active threshold
  (see D8 — it is per-row, not a single global 640px cut). Crossing it is **instant** — we
  do **not** animate a full layout reflow (it janks, and on real devices you don't
  live-resize across it). This also satisfies `prefers-reduced-motion` by construction.
- **View mode:** **no** persistent "a wider layout exists" badge. Users don't control
  layout; surfacing a collapsed-feature hint would be noise. The single column simply looks
  correct.
- **Edit mode (where it matters):** if an admin is in edit mode on a viewport too narrow
  for a given row to go side-by-side, show a **non-blocking info line** under that row:
  *"Row layout collapses at this width — widths apply on wider screens."* (13/500,
  `text-secondary` `#737373`, 4.74:1). This tells the admin *why* their columns aren't
  showing, scoped to the one context where the question arises.

**D8 — Minimum pane state. DECISION: a 176px per-pane floor; rows whose panes can't all
clear it collapse to single-column at that viewport (per-row responsive); 1-tile panes are
allowed but headers ellipsize; a non-blocking amber advisory warns the admin.**

- **Floor:** a pane never renders narrower than **`PANE_MIN = 176px`** (= `TILE_MIN 168` +
  8px slack, on-grid). This guarantees at least one full tile with no clipping (AC2).
- **Per-row responsive collapse (this replaces a single global 640px cut):** for each row,
  if the current viewport can't give **every** pane in that row ≥176px at its assigned
  percentage, **that row** collapses to single-column stacking at this viewport (its panes
  render full-width in `layoutColOrder`). Wider rows on the same page can stay side-by-side.
  Worked example: at 640px with 24px padding → 592px usable; a 25% pane = 148px < 176 → that
  row collapses; a 50/50 row = 296px each ≥ 176 → stays side-by-side. So the "640px
  collapse" in the spec is the *common* case, but the real trigger is the 176px floor.
- **Is a 1-tile pane acceptable?** Yes, as a deliberate admin choice on a wide-enough
  screen — it renders as header + a single column of tiles. It only appears when the pane
  clears 176px but is under two tile cells (352px); below 176px the row collapses instead,
  so a *clipped* tile never happens.
- **Header in a narrow pane:** the `.cat-head` **label** gets `overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap` with the accent chip, count pill, and width
  pill held `flex:none`. A long category name **ellipsizes** ("Home Automation" →
  "Home Auto…"); it never wraps or pushes the pills off the row.
- **Admin warning (non-blocking):** when a resize or width assignment would make a pane
  render ≤ 1 tile wide at 1440px (the common desktop), show a small inline advisory next to
  the width pill — an amber **⚠ "Narrow — 1 tile"** (12/600, `#B45309` amber-700 on
  `#FEF3C7` amber-100, ≥4.5:1). It **does not block** the save (per spec, narrow panes are
  a permitted config) — it just makes the consequence visible before the admin leaves the
  row. This warning color is a **new token** introduced by this feature; I'm folding
  `warning` = `#B45309` on `#FEF3C7` into the design system in the same breath (it fills
  the gap the system flagged: no amber/warning token existed for Homepad).

---

## Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | DRAFT — pending design |
| Design | Kare | **APPROVED** — 2026-07-01 (Design section D1–D8 filled; see build notes on the tile constant) |
| Implementation | Stitch | — |
| Tech QA | Gracie | — |
