# SPEC-app-grid — Amendment A1: Fixed-Width Tile Layout Model

**Amendment ID:** A1  
**Amends:** `specs/SPEC-app-grid.md` (v0.1.0, 2026-07-01)  
**Date:** 2026-07-02  
**Authors:** Walt (product lead) · Kare (design lead — design decisions D-1 through D-4 below are Kare's)  
**Status:** ✅ **FINALIZED & CO-SIGNED (2026-07-02).** Kare's D-1 through D-4 are resolved; Joe's
product co-sign (below) clears the product gate for A1 (Walt does **not** separately co-sign — Joe's
sign-off here is the product go). **Cleared for Stitch to build.**  
**Repo:** `Code/homepad`, branch: `spec/app-grid`

---

## What and why (the regression this corrects)

The original intake (`docs/app-grid/SPEC-INTAKE.md`) specified the page as a `repeat(6, 1fr)` CSS grid with each box spanning `--w` of those fluid columns, and tools inside using `repeat(var(--w), 1fr)`. SPEC-app-grid §8 faithfully transcribed this.

**The problem:** under the 1fr model, a tool tile's rendered width = (box's fluid page width) ÷ --w. A tile inside a width-1 box and a tile inside a width-4 box are **different widths** — they scale with the box's fraction of the page. Caleb's correction (2026-07-02):

> "I would expect each app-grid-tool to be the same width across boxes. If app-grid-tool = 100px: box A width 1 = 100px + box sides; box B width 3 = three 100px tools side by side with equal spacing. The `<a>` app-grid-tool is ALWAYS the same width."

This is a layout-model change, not a visual tweak. The entire page grid concept changes. The precedent already exists in-repo: the v14 floating-panel layout (index.css:1886–1963) uses exactly this model — fixed 190px tiles, content-sized panels, flex-wrap page packing. The App Grid spec inadvertently regressed that property by adopting the 1fr approach from the intake.

---

## The new layout model

### Page level

Boxes are **content-sized** and pack **left-to-right with flex-wrap**, not spanning a fixed column grid.

```
page: display: flex; flex-wrap: wrap; gap: 16px    /* GAP = 16px (Kare D-1) */
```

There is no `repeat(6, 1fr)` page grid. The "6 columns" concept of the original intake was a description of the intended packing behavior (two width-3 boxes fill a standard row), not a constraint. Under fixed tiles it is emergent from the tile width, --w value, and page container width — not prescribed.

### Per-box

A box's rendered width is determined entirely by its `--w` value and the fixed tile size:

```
box width = var(--w) × TILE_PX + (var(--w) - 1) × GAP + 2 × PADDING
```

Set as a CSS custom property on each box element:

```css
.app-grid-box {
  width: calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px);   /* TILE_PX=190 GAP=16 PADDING=16 */
  max-width: 100%;                                                /* Kare D-3 backstop */
  box-sizing: border-box;
}
```

**Kare's tokens (D-1):** `TILE_PX = 190px`, `GAP = 16px`, `PADDING = 16px` — byte-identical to v14
`.category-panel` (index.css:1905). See SPEC-app-grid.md §6.0 / §6.7 for the full grounding.

### Tools inside the box

```css
.app-grid-tools {
  display: grid;
  grid-template-columns: repeat(auto-fill, 190px);   /* Kare: auto-fill, not var(--w) — see note */
  gap: 16px;
  justify-content: start;
}
```

`TILE_PX = 190px` is **fixed** — the same value for every box regardless of --w. This is the
invariant Caleb requires.

**Kare's one deviation from the CSS above:** the track is `repeat(auto-fill, 190px)`, **not**
`repeat(var(--w), 190px)`. On a box whose width is already exactly `--w` fixed tiles, `auto-fill`
packs **exactly `--w`** 190px columns — so Caleb's invariant holds and empty `--w` slots are still
reserved — while *also* wrapping the fixed tiles (never resizing them) when the box is
`max-width:100%`-clamped below its natural width on a narrow viewport. This single declaration
delivers AC-002-A1, AC-004–008, **and** D-3 (box-wider-than-viewport) with no JS. Full reasoning in
SPEC-app-grid.md §6.7.

### Precedent

This is precisely how v14 floating panels work. The reference implementation in index.css:
- `.tile-field` (line 1892): `flex-wrap: wrap` page packing  
- `.category-panel` (line 1905): `width: calc(var(--panel-cols, 1) * 190px + …)`  
- `.panel-tiles` (line 1929): `grid-template-columns: repeat(var(--panel-cols, 1), 190px)`  

The new App Grid CSS is the same structure with `--w` replacing `--panel-cols` and TILE_PX replacing 190px. The existing CSS is the reference; Stitch should model the new classes directly on it.

---

## Updated `--w` range

The original spec (§3B) sets range 1–6 to match the 6-column page grid. Under the new model the range is not constrained by page columns — it is constrained by "how many tiles fit across the page without horizontal overflow."

**Provisional range: 1–8** (Caleb confirmed up to 8 is acceptable, 2026-07-02).

**Constraint to flag:** the effective max --w without overflow depends on TILE_PX (Kare's call, D-1) and the user's viewport. At 190px tiles with 16px gaps and 16px padding:
- `--w 6`: box = 6×190 + 5×16 + 32 = 1252px — fits 1280px+ viewports
- `--w 7`: box = 7×190 + 6×16 + 32 = 1458px — overflows 1440px, fits 1920px
- `--w 8`: box = 8×190 + 7×16 + 32 = 1664px — overflows 1440px, fits 1920px

**Kare's choice of TILE_PX determines what max --w is usable at 1280px and 1440px.** Walt product recommendation: a box wider than the viewport causes horizontal page scroll, which is bad UX. The DB field should allow 1–8, but the width selector UI should warn or clamp to avoid configurations that overflow common viewport widths. Exact overflow handling is a Kare design call (D-3).

**Backend update:** `grid_width INTEGER NOT NULL DEFAULT 3 CHECK (grid_width BETWEEN 1 AND 8)` — amends §3B of SPEC-app-grid.md.

---

## Revised acceptance criteria

The following ACs **replace** the corresponding ACs in SPEC-app-grid §5. All other ACs in §5 are unchanged and remain in force.

### Replaces AC-001: tile width uniformity (the invariant)

**AC-001-A1** — Every `.app-grid-tool` element in the grid renders at the same fixed pixel width (TILE_PX), regardless of which box it appears in, what `--w` that box has, or how many boxes are on the page. A tile in a width-1 box and a tile in a width-8 box are the same width.

### Replaces AC-002: box content-sizing

**AC-002-A1** — A box with `--w = N` renders at exactly `N × TILE_PX + (N-1) × GAP + 2 × PADDING` wide (content-sized). It does not stretch to fill remaining row space.

### Replaces AC-003: flex-wrap page packing

**AC-003-A1** — Boxes pack left-to-right. A box wraps to the next row when its width would exceed the page container's remaining horizontal space. There is no fixed "6-column" row definition; wrap is driven by pixel widths, not column counts.

**AC-003-A2** (reworded per Joe's product co-sign, 2026-07-02 — TILE_PX=190) — Two consecutive
width-3 boxes are **guaranteed two-up at ≥1440px viewport width**. **Below 1440px (including 1280px)
there is no two-up guarantee**: the boxes fall back to **graceful `auto-fill` wrap** — the second box
wraps whole to the next row rather than clipping or page-scrolling. Concretely: at TILE_PX=190 a
width-3 box is `3×190 + 2×16 + 32 = 634px`; two of them + the 16px page gap = `1284px`, which clears
1440 comfortably but exceeds a 1280px content area once scrollbar/page gutters are counted — hence the
guarantee starts at 1440, not 1280. This is a consequence of the model (AC-003-A1), stated as an
explicit expectation so it is **not read as a false 1280 guarantee**. Joe accepted this tradeoff to
keep TILE_PX at 190 (label legibility + v14 parity) rather than pinning 180px for a narrow-breakpoint
two-up.

### Replaces AC-013: width selector button count

**AC-013-A1** — Each box shows a width selector with buttons labeled 1 through N, where N is the maximum `--w` value supported (1–8 per this amendment; final value confirmed by Caleb). The button matching the current `--w` is visually distinguished.

### Replaces AC-022: mobile behavior

**AC-022-A1** — At viewport width ≤ 640px, each box renders full-width and its tools grid caps at **2
columns** with tiles allowed to shrink below 190px (`repeat(2, minmax(0, 190px))`) so nothing
horizontally scrolls the page. A box configured at width 5 shows at most 2 tiles per row on mobile; a
box with 5 tools shows 2 per row and wraps inside. (Resolves the D-4 placeholder — see D-4 below.)

---

## Dropped / reinterpreted ACs

**AC-004 through AC-008** (tool overflow wrapping inside a box) — these describe the internal grid behavior and are **unchanged**: wrapping still occurs when tools exceed `--w`, tiles wrap to the next row, at the fixed tile width. No revision needed.

---

## Design decisions for Kare (blocks spec and build)

These are **product-authored questions** for Kare to answer. The spec and the Stitch build are blocked until all four are resolved. Kare's responses should be written into §6 of SPEC-app-grid.md (the design section placeholder).

### D-1 — Fixed tile width (TILE_PX) `CRITICAL`

What is the fixed pixel width for `.app-grid-tool`?

**Context:**
- v14 panels used 190px and it's the proven value. Kare explicitly endorsed it (Kare's "tiles never resize" principle, per index.css:1925).
- Real-world service names can be long: "ArchiveTeam Warrior1" (~16 chars), "qBittorrent" (~11 chars). At 190px with typical padding, these may be tight at default font size — depends on icon size, padding, and whether labels are single-line.
- A smaller tile (e.g. 160px) allows more tiles per row at a given viewport width; a larger tile (200px+) reads more comfortably but reduces density.

**Kare's call:** confirm 190px, adjust, or specify a range with min/max.

> **✅ RESOLVED — `TILE_PX = 190px` (fixed, single value).** With `GAP = 16px`, `PADDING = 16px`. This
> is the proven v14 slot (index.css:1905/1925) — App Grid inherits the shipped `.tile` module at 190px
> so the two systems share one tile, zero drift. The tile is the **vertical** `.tile` grammar (icon
> plate over a full-width name), so long names get the whole 190px across two lines (D-2) rather than a
> cramped single-line lane — `ArchiveTeam Warrior1` wraps and keeps its suffix; `qBittorrent` fits on
> one. I did not go smaller (loses name room + breaks v14 parity) or larger (drops density; the 2-line
> clamp already handles the long tail). Box width = `calc(var(--w)*190px + (var(--w)-1)*16px + 32px)`,
> identical to `.category-panel`. Full grounding: SPEC-app-grid.md §6.0, §6.2.

### D-2 — Label overflow treatment `CRITICAL`

What happens when a tool's name is too long to fit on one line at TILE_PX?

**Options:**
- (a) Single-line truncation with ellipsis (`text-overflow: ellipsis; overflow: hidden; white-space: nowrap`)
- (b) Two-line clamp (`-webkit-line-clamp: 2`) — wraps to second line, truncates after
- (c) Natural wrap (no clamp) — tile height varies by label length

**Note:** option (c) means tiles in the same row inside a box have unequal heights. Option (b) is common for app launchers (iOS home screen, etc.). Kare's call.

> **✅ RESOLVED — (b) two-line clamp** (`-webkit-line-clamp:2`), name **line-height 1.25**, name block
> `min-height:38px` (2 lines reserved on **every** tile), giving a **fixed tile `min-height: 120px`**
> (15 pad-top + 46 plate + 8 gap + 38 name + 13 pad-bottom) so a 1-line and a 2-line name render at the
> identical height and **tiles never jump**, **plus** `title={name}` and `aria-label={name}` for the
> full name. Box-model table + rationale: SPEC-app-grid.md §6.2 / §6.2.1.
> The vertical tile gives the name the full ~158px tile width across two lines, so
> `ArchiveTeam Warrior1` and its **distinguishing suffix stay visible**. Rejected (a) single-line: this
> is an **iPad-first** homelab and the `title` tooltip **never fires on touch**, so two siblings that
> truncate to `ArchiveTeam Warri…` become indistinguishable at a glance. Rejected (c) natural wrap:
> ragged tile heights break the grid row (principle 4). Detail: SPEC-app-grid.md §6.2.1.

### D-3 — Box wider than viewport `EDGE CASE`

What is the visual treatment when a box's `--w` renders wider than the viewport (e.g., --w 8 at 190px on a 1280px monitor)?

**Options:**
- (a) Box clips to viewport width; tile overflow wraps inside the box (tile grid wraps at viewport edge — same behavior as AC-004 style overflow)
- (b) Box triggers horizontal scroll (bad; likely not desired)
- (c) Width selector caps selectable --w to a viewport-safe maximum (JS-computed on render)
- (d) Box respects the page container width and tiles auto-fill: `repeat(auto-fill, TILE_PX)` instead of `repeat(var(--w), TILE_PX)` — but this defeats the explicit --w intent

**Walt recommendation:** option (c) or (a). Option (b) is unacceptable. Kare's final call.

> **✅ RESOLVED — (c) + (a), layered.** (b) horizontal scroll is rejected outright.
> 1. **(c) selector cap (admin feedback):** the width selector renders a `--w` that would overflow the
>    current viewport as **disabled** (`aria-disabled`, `title="Wider than this screen"`) so the admin
>    never sets an off-screen box on their own display. §6.3.
> 2. **(a) structural wrap (the real guarantee):** because `--w` is **shared and persisted across
>    viewports** (§3C), a set-time cap can't protect a *different* viewer's smaller screen. So each box
>    is `max-width:100%` and the tools track is `repeat(auto-fill, 190px)` — when the box can't fit its
>    natural `--w × 190` width, the fixed 190px tiles **wrap** (6-up, then row 2), never resize, never
>    page-scroll. This is why the tools track is `auto-fill`, not `repeat(var(--w), …)`.
>
> Rejected (d) as-written (page-width auto-fill ignores `--w`) — but note my `auto-fill` sits on a
> `--w`-*sized* box, so it honors `--w` when it fits and only wraps under physical constraint.
> **Precedence:** fixed `N × 190` is the target; **no horizontal page scroll wins** when they conflict
> (AC-002-A1 = exact width *when it fits the viewport*). Full model: SPEC-app-grid.md §6.7.

### D-4 — Mobile behavior (viewport ≤ 640px) `CRITICAL`

How does the fixed-tile layout behave on mobile?

**Options:**
- (a) **Tile width shrinks on mobile only** — `repeat(var(--w), minmax(0, TILE_PX))` caps at TILE_PX but allows tiles to shrink below it. This is what v14 did (index.css:1961) and avoids horizontal overflow at the cost of violating the fixed-width invariant on small screens. AC-001-A1 applies to desktop only in this case.
- (b) **Cap --w at 2 on mobile** — override `--w: min(var(--w), 2)` globally below the breakpoint. Tiles stay at TILE_PX; a box is always at most 2 tiles wide. Matches the original spec's AC-022 intent.
- (c) **Single-column stacking on mobile** — every box becomes 1 tile wide; tiles stack vertically. Simple but very tall pages on mobile.
- (d) **Box scrolls horizontally on mobile** — tiles never resize; wide boxes overflow with a horizontal scroll inside the box. Not recommended; poor UX.

**Note on breakpoint:** v14 used 767px (not 640px as the original spec said). Kare should confirm the breakpoint px value.

> **✅ RESOLVED — hybrid (a)+(b): cap at 2 columns AND allow shrink-below-190; breakpoint = 640px.**
> ```css
> @media (max-width: 640px) {
>   .app-grid-box   { width: 100%; max-width: 100%; }
>   .app-grid-tools { grid-template-columns: repeat(2, minmax(0, 190px)); }
> }
> ```
> Two fixed 190px tiles (428px) overflow a 390px phone — the exact #212 h-scroll bug — so on phones
> **only**, `minmax(0, 190px)` lets tiles drop below 190 (2 × ~171px at 390px) while capping at 2
> columns (AC-022's intent). This reaffirms v14's documented shrink exception (index.css:1961).
> **AC-001-A1's fixed-width invariant is a > 640px property** — on phones, killing horizontal scroll
> outranks pixel-perfect width (this is A1 D-4 option (a), scoped to ≤640).
>
> **Breakpoint = 640px, NOT v14's 767px.** v14 needed 767 because its non-wrapping fixed grid
> overflowed iPad portrait; our `auto-fill` desktop track **already wraps 190px tiles natively at
> 768px** (a width-6 box packs ~3-up and wraps — comfortable, no special rule). 640 matches AC-022/023
> and the co-signed original §6.7, and it's the *only* breakpoint needed. This **replaces the
> AC-022-A1 placeholder** below.

---

## Updated implementation notes (replaces SPEC-app-grid §8)

These replace the implementation notes in SPEC-app-grid §8 in their entirety.

**CSS approach:**

```css
/* Page container — replaces "repeat(6, 1fr)" */
.app-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;                                          /* GAP = 16px (Kare D-1) */
}

/* Per-box — content-sized, NOT grid-column: span var(--w) */
.app-grid-box {
  width: calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px);   /* TILE_PX=190 GAP=16 PADDING=16 */
  max-width: 100%;                                    /* Kare D-3 backstop — never overflow the frame */
  box-sizing: border-box;
  padding: 16px;                                      /* PADDING = 16px */
  /* visual tokens: glass bg/border/radius 22/shadow — SPEC-app-grid.md §6.1 (shipped .category-panel) */
}

/* Tools grid inside each box — auto-fill (Kare D-3 rationale in §6.7), not repeat(var(--w),…) */
.app-grid-tools {
  display: grid;
  grid-template-columns: repeat(auto-fill, 190px);    /* fixed 190; yields exactly --w when the box fits */
  gap: 16px;
  justify-content: start;
}

/* Individual tool tile — the shipped .tile module (index.css:53–140), vertical: icon plate over name */
.app-grid-tool {
  width: 190px;         /* fixed, never 1fr; TILE_PX */
  /* radius 18, shipped tile gradient/border/shadow, 46×46 icon plate, 2-line clamped name — §6.2 */
}

/* Mobile (Kare D-4) — cap 2 cols, allow shrink-below-190 to kill h-scroll */
@media (max-width: 640px) {
  .app-grid-box   { width: 100%; max-width: 100%; }
  .app-grid-tools { grid-template-columns: repeat(2, minmax(0, 190px)); }
}
```

All token values are Kare's, resolved in D-1 (`TILE_PX=190`, `GAP=16`, `PADDING=16`) and detailed in
§6 of SPEC-app-grid.md. **Note the two Kare deviations from A1's original CSS above:** the tools track
is `auto-fill` (not `repeat(var(--w), …)` — delivers D-3, §6.7) and the tool tile is the shipped
vertical `.tile` (not a bespoke card — §6.2). Both are grounded, not inventions.

**`--w` CSS variable:** set inline per box from `category.grid_width`. Same wiring as `--panel-cols` in Catalog.tsx today.

**Reference implementation:** index.css lines 1886–1963 (v14 panel CSS). The App Grid classes are structurally identical; update class names and variable names, then apply Kare's visual tokens.

**Do not use `1fr` for tool tiles.** This is the regression being corrected. The tile column track must be a fixed px value.

**Width selector:** still admin-only (SPEC-app-grid AC-014). Button range updates from 1–6 to **1–8** (confirmed by Joe's product co-sign, 2026-07-02; DB `CHECK (grid_width BETWEEN 1 AND 8)`).

---

## Co-sign gate (this amendment)

Amends the co-sign gate in SPEC-app-grid §9. Both signatures are still required before Stitch builds:

- [x] **Product (Joe, product co-sign — 2026-07-02):** layout model and ACs correct; **D-1 `TILE_PX =
  190px` approved** (v14 parity + name room for long homepad labels; 180px explicitly rejected — keep
  labels legible, Caleb runs wide); **AC-003-A2 reworded** to "two-up guaranteed at ≥1440px; graceful
  auto-fill wrap below 1440 (incl. 1280)" so it is not a false guarantee; approved deviations kept
  (auto-fill tools track, vertical `.tile`, SPEC §8 old 1fr notes SUPERSEDED); **--w range 1–8** with
  DB `CHECK (grid_width BETWEEN 1 AND 8)` confirmed. This co-sign **clears the A1 product gate** — Walt
  does not separately co-sign or dispatch.
- [x] **Kare (design):** **D-1 through D-4 resolved** (D-1 `TILE_PX=190`/`GAP=16`/`PADDING=16`; D-2 two-line clamp + `title`/`aria-label`; D-3 selector-cap + `max-width:100%` + `auto-fill` wrap; D-4 640px breakpoint + `repeat(2, minmax(0,190px))` shrink). §6 of SPEC-app-grid.md is updated with all four, grounded in the shipped `.tile` + v14 panel model. Two documented deviations from A1's literal CSS (`auto-fill` track; vertical `.tile` grammar) — both grounded, both explained. **Design go.**

_Walt pre-sign: layout model, ACs, and implementation notes are correct per Caleb's 2026-07-02 direction. --w range (1–8) and the flex-wrap page model are confirmed. Blocked on Kare's D-1 through D-4._

_Kare sign (2026-07-02): D-1–D-4 answered above and folded into SPEC-app-grid.md §6.0/§6.2/§6.3/§6.7. One flag for Walt (not a design gate): with `TILE_PX=190`, two width-3 boxes sit side-by-side comfortably at ≥1440px; at ~1280px they may wrap depending on gutters (each is 634px → 1284px + gutters). AC-003-A2 says "1280px+" — true at 1440, borderline at exactly 1280. The `auto-fill` model wraps gracefully rather than breaking, so this is a note, not a blocker; if you want a hard 1280 two-up guarantee, `TILE_PX` would need ~180px (I recommend keeping 190 for v14 parity + name room)._

_**→ Resolved by Joe (product co-sign, 2026-07-02):** keep `TILE_PX = 190` (180 rejected — label
legibility, Caleb runs wide); **AC-003-A2 reworded** to guarantee two-up only at ≥1440px and promise
graceful auto-fill wrap below (incl. 1280). Flag closed; no false guarantee remains in the spec._
