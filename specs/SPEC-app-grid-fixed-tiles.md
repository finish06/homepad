# SPEC-app-grid — Amendment A1: Fixed-Width Tile Layout Model

**Amendment ID:** A1  
**Amends:** `specs/SPEC-app-grid.md` (v0.1.0, 2026-07-01)  
**Date:** 2026-07-02  
**Authors:** Walt (product lead) · Kare (design lead — design decisions D-1 through D-4 below are Kare's)  
**Status:** Pending Kare design decisions; Stitch MUST NOT build until D-1 through D-4 are resolved and both Walt + Kare co-sign  
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
page: display: flex; flex-wrap: wrap; gap: [GAP]
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
  width: calc(var(--w) * TILE_PX + (var(--w) - 1) * [GAP] + 2 * [PADDING]);
}
```

where `TILE_PX`, `GAP`, and `PADDING` are design tokens Kare specifies (see design decisions D-1).

### Tools inside the box

```css
.app-grid-tools {
  display: grid;
  grid-template-columns: repeat(var(--w), TILE_PX);
  gap: [GAP];
}
```

`TILE_PX` is **fixed** — the same value for every box regardless of --w. This is the invariant Caleb requires.

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

**AC-003-A2** — Given TILE_PX and the default gap/padding values, two width-3 boxes placed consecutively appear side by side on a 1280px+ viewport (because their combined width fits). This is a consequence of the model, not a layout rule — the underlying rule is AC-003-A1.

### Replaces AC-013: width selector button count

**AC-013-A1** — Each box shows a width selector with buttons labeled 1 through N, where N is the maximum `--w` value supported (1–8 per this amendment; final value confirmed by Caleb). The button matching the current `--w` is visually distinguished.

### Replaces AC-022: mobile behavior

**AC-022-A1** — [PENDING Kare design decision D-4.] Mobile behavior must be specified by Kare and resolved before this AC is finalized. Three candidate approaches are described in D-4 below; Kare's recommendation will replace this placeholder.

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

### D-2 — Label overflow treatment `CRITICAL`

What happens when a tool's name is too long to fit on one line at TILE_PX?

**Options:**
- (a) Single-line truncation with ellipsis (`text-overflow: ellipsis; overflow: hidden; white-space: nowrap`)
- (b) Two-line clamp (`-webkit-line-clamp: 2`) — wraps to second line, truncates after
- (c) Natural wrap (no clamp) — tile height varies by label length

**Note:** option (c) means tiles in the same row inside a box have unequal heights. Option (b) is common for app launchers (iOS home screen, etc.). Kare's call.

### D-3 — Box wider than viewport `EDGE CASE`

What is the visual treatment when a box's `--w` renders wider than the viewport (e.g., --w 8 at 190px on a 1280px monitor)?

**Options:**
- (a) Box clips to viewport width; tile overflow wraps inside the box (tile grid wraps at viewport edge — same behavior as AC-004 style overflow)
- (b) Box triggers horizontal scroll (bad; likely not desired)
- (c) Width selector caps selectable --w to a viewport-safe maximum (JS-computed on render)
- (d) Box respects the page container width and tiles auto-fill: `repeat(auto-fill, TILE_PX)` instead of `repeat(var(--w), TILE_PX)` — but this defeats the explicit --w intent

**Walt recommendation:** option (c) or (a). Option (b) is unacceptable. Kare's final call.

### D-4 — Mobile behavior (viewport ≤ 640px) `CRITICAL`

How does the fixed-tile layout behave on mobile?

**Options:**
- (a) **Tile width shrinks on mobile only** — `repeat(var(--w), minmax(0, TILE_PX))` caps at TILE_PX but allows tiles to shrink below it. This is what v14 did (index.css:1961) and avoids horizontal overflow at the cost of violating the fixed-width invariant on small screens. AC-001-A1 applies to desktop only in this case.
- (b) **Cap --w at 2 on mobile** — override `--w: min(var(--w), 2)` globally below the breakpoint. Tiles stay at TILE_PX; a box is always at most 2 tiles wide. Matches the original spec's AC-022 intent.
- (c) **Single-column stacking on mobile** — every box becomes 1 tile wide; tiles stack vertically. Simple but very tall pages on mobile.
- (d) **Box scrolls horizontally on mobile** — tiles never resize; wide boxes overflow with a horizontal scroll inside the box. Not recommended; poor UX.

**Note on breakpoint:** v14 used 767px (not 640px as the original spec said). Kare should confirm the breakpoint px value.

---

## Updated implementation notes (replaces SPEC-app-grid §8)

These replace the implementation notes in SPEC-app-grid §8 in their entirety.

**CSS approach:**

```css
/* Page container — replaces "repeat(6, 1fr)" */
.app-grid {
  display: flex;
  flex-wrap: wrap;
  gap: [GAP];           /* Kare specifies; v14 used 16px */
}

/* Per-box — content-sized, NOT grid-column: span var(--w) */
.app-grid-box {
  width: calc(var(--w) * TILE_PX + (var(--w) - 1) * [GAP] + 2 * [PADDING]);
  box-sizing: border-box;
  padding: [PADDING];   /* Kare specifies; v14 used 16px */
  /* visual tokens: background, border, border-radius, shadow — Kare's §6 */
}

/* Tools grid inside each box */
.app-grid-tools {
  display: grid;
  grid-template-columns: repeat(var(--w), TILE_PX);
  gap: [GAP];
}

/* Individual tool tile */
.app-grid-tool {
  width: TILE_PX;       /* fixed, never 1fr */
  /* icon, label, hover/active — Kare's §6 */
}
```

Replace `[GAP]`, `[PADDING]`, and `TILE_PX` with the values Kare specifies in §6 of SPEC-app-grid.md.

**`--w` CSS variable:** set inline per box from `category.grid_width`. Same wiring as `--panel-cols` in Catalog.tsx today.

**Reference implementation:** index.css lines 1886–1963 (v14 panel CSS). The App Grid classes are structurally identical; update class names and variable names, then apply Kare's visual tokens.

**Do not use `1fr` for tool tiles.** This is the regression being corrected. The tile column track must be a fixed px value.

**Width selector:** still admin-only (SPEC-app-grid AC-014). Button range updates from 1–6 to 1–N per the --w range confirmation above.

---

## Co-sign gate (this amendment)

Amends the co-sign gate in SPEC-app-grid §9. Both signatures are still required before Stitch builds:

- [ ] **Walt (product):** layout model and ACs are correct; --w range confirmed with Caleb
- [ ] **Kare (design):** D-1 through D-4 resolved; §6 of SPEC-app-grid.md updated with all design decisions

_Walt pre-sign: layout model, ACs, and implementation notes are correct per Caleb's 2026-07-02 direction. --w range (1–8) and the flex-wrap page model are confirmed. Blocked on Kare's D-1 through D-4._
