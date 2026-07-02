# SPEC: Category Pane Width Layout — Horizontal Screen Utilization

**Issue:** #269 (pane fill & reflow), #268 (TBD — original pane-width layout)
**Status:** ⚠️ SCOPE REVISED 2026-07-02 (AUTO-FIRST model; prior approval 2026-07-01 held
pending this change) — awaiting Joe sign-off on §6 auto-vs-manual call
**Author:** Walt (product)
**Co-author:** Kare (design — Design section below, split by phase)
**Scope:** `src/Catalog.tsx`, `src/index.css` (Phase 1 — frontend only, no backend)
         + `src/api.ts`, `homepad-api` (Phase 2 — admin override layer)
**Effort estimate:** Phase 1: S–M (pure CSS + lightweight JS row-packer). Phase 2: M–L (data model + edit-mode drag UX, as originally scoped)

---

> ### ⚠️ SCOPE REVISION — READ BEFORE BUILDING
>
> The 2026-07-01 approval dispatched a **manual admin model** (assign rows + width% + drag
> handles + DB migration) as the primary behavior. Caleb (dashboard owner) reviewed the dashboard
> at wide viewports on 2026-07-02 and asked for the opposite: intelligent **automatic** pane
> distribution, no per-category configuration required. Kare reproduced and measured the dead
> space (#269, PR #270, `SPEC-pane-fill-reflow.md`).
>
> **Product call (Walt, 2026-07-02):** **AUTO-FIRST.** The R1–R4 auto-packer is the primary
> behavior and ships as Phase 1. Admin width% (drag handles, DB migration, row assignment) is
> deprioritized to Phase 2 as an optional override on top of the auto-packer. The original spec's
> manual-only model — which put auto-layout explicitly out of scope — is rescinded as the default.
> The row infra from the original spec is still built, but the auto-packer populates it, not
> admin drag.
>
> **Stitch: HOLD on the admin drag UI and DB migration (Phase 2).** Build Phase 1 first.
> Phase 2 starts only after Phase 1 ships and Caleb signs off.
>
> Kare's full design input: `specs/SPEC-pane-fill-reflow.md` (PR #270).

---

## Problem statement

On screens wider than 1024 px, Homepad category panes pack left and waste horizontal space.
The `.tile-field` is capped at `max-width: 1392px` with a hard left margin, and each category
renders as a **fixed-width glass pane** (`panelCols × 190px + gaps + 32`). Fixed widths + left
justify + a cap = ragged right edges and a hard dead band at wider viewports.

Measured (byte-faithful CSS harness, Develop 6 · External 1 · Friends 3 · Media 5 · Kube 2):

| Viewport | Field right edge | Dead space beyond field | Worst intra-field dead row |
|---:|---:|---:|---|
| 1440 | x=1440 (capped) | 0 | Friends alone → **758px empty to its right** |
| 1920 | x=1440 (capped) | **480px** | 314 / 758 / 108px ragged edges |
| 2560 | x=1440 (capped) | **1120px** | same |

Before-after visuals: `specs/assets/pane-fill-reflow/` (PR #270).

Two compounding problems:

1. **The `.tile-field` max-width cap** — hard 1392px ceiling blocks all content from filling
   the viewport regardless of screen width.

2. **Fixed pane widths** — each pane is a hard column count, not a fill target. A 1-app pane
   ("External") stays 222px while 300px of row space sits beside it.

---

## Solution: two-phase layout

### Phase 1 — Auto-packer (ships first, no backend)

Four rules (R1–R4), browser-validated by Kare across 1440/1920/2560:

**R1 — Field fills the content frame.**
Remove `.tile-field { max-width: 1392px; margin-left: 48px }`. The field spans the full
content frame with responsive horizontal padding capping at 64px (D1). Beyond-field dead
space → 0.

**R2 — Tiles reflow by pane width, stay uniform 190px.**
Change `.panel-tiles` from `repeat(var(--panel-cols), 190px)` to `repeat(auto-fill, 190px)`.
A wider pane shows more tiles per row; tile width stays exactly 190px in every pane. This is
Caleb's standing invariant from App Grid A1 (AC-001-A1) — `auto-fit` with stretch is
explicitly rejected (tiles ran to 305px in prototypes; confirmed wrong).

**R3 — Panes grow to fill the row, weighted by app count, capped at their content-max.**
Panes `flex-grow` weighted by app count so they fill the row together. Each pane is capped at
its own content-max (`appCount` tiles in one row) so it never balloons into empty glass.
Naive `flex:1` is rejected — it moves dead space inside the glass (Media stretched 1046→1660px
with 5 tiles stranded left; confirmed broken in `pane-fixC-2560.png`).

**R4 — A pane alone in its visual row renders at 100% field width.**
Single-pane rows always fill to the right edge. Tiles left-pack. This matches the original
spec's AC3 intent without requiring admin configuration.

**Guardrails:** `<640px` stacks full-width (existing `@media (max-width:767px)` unchanged);
standard desktop `≤1024` unchanged. All new rules scoped `≥1024`.

**Implementation path for Stitch (Phase 1):**
R1 and R2 are pure CSS changes. R3–R4 require a lightweight JS **row-packer** (a `useLayout`
hook over `displayCats`) — CSS `flex-wrap` alone cannot detect "alone in a visual row" or
apply a content-max cap. A bin-pack pass over current categories sets each pane's
`flex-basis`/`max-width` and marks lone panes 100%.

---

### Phase 2 — Admin override layer (hold until Phase 1 ships)

When Phase 1 is live and Caleb confirms, Phase 2 adds optional per-category width control.
The Phase 1 auto-packer becomes the **default**; admin width% is an **override**. When an
admin has set an explicit width% for a category, that overrides the auto-packer's computed
basis for that category. Unset categories continue to auto-pack.

This is the row infrastructure from the original 2026-07-01 spec, re-scoped as an override:

#### Phase 2 data model additions

**Frontend — `Category` type (`api.ts:49`)**

```typescript
export type Category = {
  id: string;
  name: string;
  sortIndex: number;
  // Phase 2 additions:
  layoutRow: number | null;       // null = auto-packer places it
  layoutColOrder: number | null;  // order within the row; null = auto
  layoutWidthPct: number | null;  // 10–100 (integer) admin override; null = auto-packed
};
```

**Defaults on migration:** `layoutRow = null`, `layoutColOrder = null`, `layoutWidthPct = null`
for all existing categories. No visible change — auto-packer runs by default. Admin can then
set explicit values per-category to override.

**API additions (`homepad-api`)**
- `PATCH /categories/:id` — must accept and persist the three new nullable fields.
- `PUT /categories/layout` — bulk endpoint for atomic multi-category layout saves.
- DB migration: add `layout_row INTEGER`, `layout_col_order INTEGER`, `layout_width_pct INTEGER`
  (nullable) to categories table.

#### Phase 2 component behavior

**View mode:** same as Phase 1 auto-packer, but categories with explicit `layoutWidthPct` set
use that value as their `flex-basis` and are excluded from the auto-packer's redistribute pass.
Mixed auto+manual rows are valid: manual-pinned panes hold their width, remaining space
distributes to auto panes in the same row.

**Edit mode (admin only):** Phase 1 has no edit-mode changes. Phase 2 adds:
- Resize handle between side-by-side categories (D3)
- Drag categories into rows or between rows (D4)
- Width indicator pill in the pane header (D6)
- Edit-mode info line when a row collapses at the current viewport (D7)

Details: Kare's design section §D3, D4, D6, D7 below (carried from the original spec, now
Phase 2-scoped).

---

## Acceptance criteria

### Phase 1

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC-P1-1 | On a viewport ≥ 1024px, no content is capped at 1392px. The field extends to the viewport edge minus D1 padding. | DevTools: computed width of `.tile-field` equals viewport width minus D1 padding at 1440, 1920, 2560. |
| AC-P1-2 | Tiles always render at exactly 190px in every pane at every viewport ≥ 1024px. No tile stretches or clips. | DevTools: computed width of `.tile-inner` = 190px; resize viewport 1024→2560. |
| AC-P1-3 | A wider pane shows more tiles per row (not just wider tiles). At 1920px a 6-app category shows more tiles per row than it did pre-feature. | Count visible tile columns at 1920 vs. pre-feature. |
| AC-P1-4 | No pane's rendered width exceeds its content-max (app count × 190px + gaps). No empty glass inside a pane. | Inspect `.category-panel` at 2560 for a 1-app category; width ≈ 222px, not 340px+. |
| AC-P1-5 | A category alone in its visual row renders at 100% field width. Tiles left-pack. | Move all other categories to a single row in auto-packer; lone category fills to right edge. |
| AC-P1-6 | On viewport < 640px, all categories stack full-width in their natural order. No regression. | Resize below 640; confirm single-column layout. |
| AC-P1-7 | On standard desktop (≤ 1024px), layout behavior is visually unchanged from pre-feature. | Side-by-side screenshots at 1024px before and after. |

### Phase 2 (additional, after Phase 1 ships)

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC-P2-1 | Categories with `layoutWidthPct = null` are auto-packed. Categories with an explicit value use that width as flex-basis. | Set one category to 40%; verify it holds at 40% while auto categories fill the rest. |
| AC-P2-2 | In edit mode, a resize handle appears between horizontally-adjacent categories with explicit widths. Dragging adjusts each proportionally, snapping at D3 intervals, each ≥ 25%. | Admin enters edit mode; drag handle on a 50/50 row. |
| AC-P2-3 | Dragging two full-width categories into the same row auto-sets each to 50%. | Drag B next to A; both show 50%. |
| AC-P2-4 | Layout changes persist to the server and survive page reload. | Rearrange; reload; confirm layout unchanged. |
| AC-P2-5 | `PUT /categories/layout` accepts a batch array and applies atomically. | Direct API call; verify no partial updates on DB error. |
| AC-P2-6 | On migration with null layout fields, the auto-packer handles all categories identically to Phase 1 behavior. | Deploy to fresh staging; no visual diff from Phase 1. |

---

## Out of scope

- Per-user layout customization (admin sets layout; all users see the same layout).
- Changing tile icon sizes or tile internal dimensions.
- Category panes narrower than 25% of screen width (Phase 2 floor; Phase 1 auto-packer will not create these).
- Horizontal scrolling within a row.
- Sub-pane nesting.
- Favorites and Uncategorized buckets gaining width control (always full-width).
- `auto-fit` + `minmax` / stretching tile width — tiles must stay uniform 190px (Caleb standing invariant AC-001-A1). Auto-fill only.

---

## Design section — Kare

**Phase 1 items (required for Phase 1 ship):** D1, D2, D5, D8.
**Phase 2 items (required for Phase 2 ship):** D3, D4, D6, D7.

Design section authored by Kare; sourced from original approval (2026-07-01) and the
`SPEC-pane-fill-reflow.md` direction (PR #270, 2026-07-02).

> **Terminology note (read first).** "Pane" means the category column = its header + its tile
> grid. The existing `.cat-head` header + tile grid structure is unchanged; no new glass card
> wrapper is introduced. Tile glass/shadow language in `.tile` is unchanged.
>
> **Tile constant:** `TILE_MIN = 168px` content width, `TILE_GAP = 16px` (existing `gap-4`).
> `tiles_per_row = floor((pane_px + 16) / (168 + 16))`. Stitch: confirm 168px against a live
> tile render — if the real comfortable tile width differs, bump `TILE_MIN` and D8's floor.
>
> **Auto-fill note (Phase 1):** with `repeat(auto-fill, 190px)`, the browser's auto-fill
> column count replaces `tiles_per_row` as the column control for Phase 1. The formula above
> applies for Phase 2's per-pane tile-count calculation when manual widths are involved.

### D1 — Viewport padding (Phase 1)

Replace `.tile-field` left margin + `max-width: 1392px` with responsive horizontal padding
capping at 64px. No new content max-width.

| Viewport | Padding each side | Tailwind | On 8pt grid |
|---------:|------------------:|----------|:-----------:|
| < 640 (mobile) | 16px | `px-4` | ✅ |
| 640 (sm) | 24px | `sm:px-6` | ✅ |
| 1024 (lg) | 32px | `lg:px-8` | ✅ |
| 1440 (xl) | 48px | `xl:px-12` | ✅ |
| 1920 (2xl) | 64px | `2xl:px-16` | ✅ |
| 2560+ | 64px (held) | `2xl:px-16` | ✅ |

Vertical page padding (`py-6` = 24px) unchanged.

### D2 — Row gutter between side-by-side panes (Phase 1)

Inter-pane horizontal gap: **32px (`gap-8`)**, matching the existing inter-row vertical rhythm
(`sm:space-y-8`). One rhythm, both axes. Vertical gap between rows stays 32px unchanged.
Phase 2's resize handle (D3) lives centered in this 32px gutter.

### D3 — Resize handle in edit mode (Phase 2)

- **Appearance (edit mode only):** 6px-wide × 48px-tall rounded pill (`radius-full`),
  vertically centered in the 32px gutter. Fill `rgba(15,23,42,0.12)` light /
  `rgba(255,255,255,0.14)` dark. `cursor: col-resize`.
- **Hit target:** 44px-wide invisible band × full pane height (WCAG 2.5.5).
- **Hover:** pill widens to 8px, fill → `#6366f1` (indigo-500), 160ms `ease-out`.
- **Active / dragging:** pill → solid `#4F46E5`. 1px indigo dashed ghost lines at each valid
  snap position; floating percentage label tracks the handle (e.g. `60% · 40%`).
- **Snap:** valid two-pane splits are 25/75, 50/50, 75/25. Magnetic within 3%; hard-stops at
  25% floor.
- **Touch:** 200ms press-hold to grab; 12px visible pill under `pointer:coarse`.
- **Reduced motion:** instant pill state changes; no ghost-line fade.

### D4 — Row drop zones in edit mode (Phase 2)

Two zone types, axis is the disambiguator:

1. **Merge zone (→ side-by-side):** left/right halves of each pane. Indicator: 4px-wide
   vertical indigo bar growing center-out (140ms). Placeholder: dashed indigo column opens
   inline, sibling panes slide (160ms).
2. **New-row zone (→ stacked):** inter-row gutters + bands above first / below last row.
   Indicator: 4px-tall horizontal bar spanning full content width, grows left-to-right (140ms).
   Placeholder: full-width dashed row, panes below slide down (160ms). Hit area: 44px.

Floating text label tracks cursor: **"Merge into row"** or **"New row"** (12/600, white on
`#4F46E5`, `radius-full`). Always shown while dragging on touch.

Drop animation: placeholder collapses as pane snaps in (180ms `ease-out`); pane scales
1.02→1.0. On merge: both panes animate to even split (200ms). Widths persist immediately via
`PUT /categories/layout`.

Reduced motion: bars appear/disappear instantly; placeholders open at final size; no scale.

### D5 — Row separator in view mode (Phase 1)

No rule, no explicit "row" concept exposed to users. Rows are invisible infrastructure.
Separation is the 32px horizontal gutter (D2) + each pane's `.cat-head` bottom divider.

Panes are `align-items: flex-start` — shorter panes simply end; the next row begins 32px
below the tallest pane in the row. No height equalization. Each row is its own flex block;
row blocks stack with `space-y-8`.

### D6 — Width indicator pill in edit mode (Phase 2)

In `.cat-head`, right-aligned after `.cat-count` pill. **Visible only in edit mode.**
- **Rest:** padding `2px 8px`, 12px/700, `font-variant-numeric: tabular-nums`, `radius-full`.
  Text `#475569` (slate-600) on `rgba(15,23,42,0.06)` light / `#9aa3b8` on
  `rgba(255,255,255,0.08)` dark (6.9:1 contrast, clears AA).
- **While resizing:** solid `#4F46E5` fill, white text (6.29:1), updates live.
- Shows `auto` for auto-packed panes; explicit `50%` for admin-set ones.
- A lone pane (renders 100%) shows `100%`.

### D7 — Mobile collapse in edit mode (Phase 2)

When an admin is in edit mode on a viewport too narrow for a row to go side-by-side, show a
non-blocking info line under that row: *"Row layout collapses at this width — widths apply on
wider screens."* (13/500, `text-secondary` `#737373`, 4.74:1). No view-mode badge.

Collapse is a CSS media-query switch per row — instant, not animated. Satisfies
`prefers-reduced-motion` by construction.

### D8 — Minimum pane state (Phase 1)

- **Floor:** `PANE_MIN = 176px` (= `TILE_MIN 168` + 8px slack). No pane renders narrower.
- **Per-row collapse:** for each visual row in the auto-packer, if the current viewport cannot
  give every pane ≥ 176px at its packed width, that row collapses to single-column stacking.
  Wide rows on the same page can remain side-by-side.
- **1-tile panes:** permitted as a deliberate auto-packer result. A pane clears 176px but
  falls under two tiles (352px) renders as header + one tile column. Clipped tiles never
  happen — if the pane would go below 176px, the row collapses instead.
- **Header in narrow pane:** `.cat-head` label gets `overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap`; accent chip, count pill held `flex:none`.
- **Phase 2 admin warning:** when a manual resize would make a pane ≤ 1 tile at 1440px, show
  amber advisory next to the width pill: ⚠ **"Narrow — 1 tile"** (12/600, `#B45309` amber-700
  on `#FEF3C7` amber-100, ≥4.5:1). Non-blocking. Introduces new token `warning = #B45309 /
  #FEF3C7` to the design system.

---

## Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | **APPROVED Phase 1** — 2026-07-02 (AUTO-FIRST revision; Phase 2 contingent on Phase 1 ship + Caleb sign-off) |
| Design | Kare | ✅ direction recommended 2026-07-02 (Phase 1 D1/D2/D5/D8 from `SPEC-pane-fill-reflow.md` + `SPEC-category-pane-width-layout.md`); Phase 2 D3/D4/D6/D7 carried from 2026-07-01 |
| Homepad authority | Joe → Caleb | ⏳ §6 auto-vs-manual call needed; flagged |
| Implementation | Stitch | **HOLD — do not build Phase 2 (admin drag UI + DB migration) until Phase 1 ships** |
| Tech QA | Gracie | — |
