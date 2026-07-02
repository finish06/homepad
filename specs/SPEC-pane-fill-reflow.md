# Spec: App-Grid Box Horizontal Fill & Tile Reflow (wide viewports) — Phase 1

**Trigger:** Caleb — direct layout feedback on the authed dashboard at wide viewports
(3 screenshots), 2026-07-02. "Still not in love." Wide monitors leave dead space.
**Version:** 1.0 (formalized from design direction by Walt, 2026-07-02)
**Status:** ✅ APPROVED BUILD CONTRACT — Walt (product) ✓ · Kare (design) ✓
**Authors:** Kare (design/UX) + Walt (product)
**Audience:** Stitch (implementer) · Gracie (tech-QA)
**Repo:** `Code/homepad` — **frontend only. No backend changes. No migration.**
**Scope:** Authed dashboard at wide viewports (≥1024px focus; 1280–2560 are the failing
band). Phone/tablet (<640px) and standard desktop (≤1024px) layouts are solid —
**no changes to those breakpoints.**
**Phase:** Phase 1 of 2. Phase 2 (manual admin drag/row/width% model,
`SPEC-category-pane-width-layout.md`) stays HELD — do not build until separately
dispatched.

> ### Re-anchor note (for Stitch — read first)
> The **first draft of this spec (PR #270) described a dead layout model** — the v14
> "floating panel field" (`.tile-field` / `.panel-tiles` / `panelCols`, capped at
> `max-width: 1392px`). That model was **reverted off `main`** (#279). The live dashboard
> is the **App Grid** (`SPEC-app-grid` Amendment A1, restored on `main` at commit `4c7dce2`):
> glass **boxes** = categories, each sized by an admin **WidthSelector** that writes `--w`
> (`grid_width` column, migration 0009, range 1–8), packed left→right by `flex-wrap`, with
> a fixed-190px `auto-fill` tile track inside. **All class names below are the live App Grid
> selectors.** Do not reference `.tile-field` or `.panel-tiles` — those are gone.

---

## 1. The problem

The live App Grid lays each category out as a **content-sized glass box**:

```css
.app-grid       { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }
.app-grid-box   { width: calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px);
                  max-width:100%; }     /* FIXED to --w — the cause of the dead space */
.app-grid-tools { grid-template-columns: repeat(auto-fill, 190px); }  /* shipped, R2 below */
```

`.app-grid` already spans the shared `CONTENT_WIDTH` frame (`mx-auto max-w-[1536px] px-4`,
`src/layout.ts`). But every box is pinned to **exactly** its configured `--w` width and the
row **left-packs and wraps**, so when a row's boxes don't sum to the frame width, the
remainder is dead space.

Measured (Caleb's scenario: Develop 6 · External 1 · Friends 3 · Media 5 · Kube 2):

| Viewport | Dead space at right of packed row | Worst single-row intra-dead space |
|---:|---:|---|
| 1440 | small | External (1 app) → ~1100px empty to its right in its row |
| 1920 | ~384px beyond last box | same ragged right edges |
| 2560 | ~1024px beyond last box | same |

Visual record: `assets/pane-fill-reflow/pane-live-1440.png`, `pane-live-1920.png`,
`pane-live-2560.png`.

---

## 2. Build contract — R1 through R4

These four rules are the complete Phase 1 contract. R1 and R2 are shipped/verified; **R3 and
R4 are the build.**

### R1 — Field fills the content frame (verify-and-hold, not new build)

`.app-grid` already spans the shared `CONTENT_WIDTH` frame after the App Grid restore (#279).
The dead v14 `1392px` cap is gone. **R1 requires no new code** — Stitch must confirm no
re-introduced inner cap and that horizontal padding matches the header frame. If a cap is
found, remove it; otherwise close the verify task.

### R2 — Tiles stay a uniform 190px (shipped, verify)

`.app-grid-tools` is already `grid-template-columns: repeat(auto-fill, 190px)` (Amendment A1,
AC-001-A1). Tiles are **exactly 190px** in every box at every viewport. This is Caleb's
standing invariant — **do not break it.** When a box grows wider under R3, its `auto-fill`
tile track reveals **more columns of 190px tiles** rather than stretching existing tiles. R2
requires no new code.

### R3 — Boxes grow above their `--w` floor, weighted, capped (build)

Today `.app-grid-box` has a **fixed** `width: calc(--w …)`. Phase 1 changes it so `--w` is
the box's **floor / target** and the box grows above it:

- **Floor = `--w`.** A box never renders narrower than its configured `grid_width` (i.e.
  `boxWidthPx(box.width)` from `src/appGrid.ts`). The admin WidthSelector and the
  `grid_width` column are **kept exactly as-is — not replaced, not hidden.** Caleb's
  decision (a): WidthSelector `--w` stays. It is the minimum, not the sole size.
- **Grow weighted by app count.** Boxes `flex-grow` to fill the row's remaining width; the
  grow factor is **proportional to `box.tools.length`** so a box with more apps claims more
  of the available space. A box with 0 apps has grow = 0 (stays at floor). The intent: a box
  that can *use* the width (more 190px columns) earns more of it.
- **Cap at content-max.** Each box is capped at the width it needs to show all its apps in a
  single row: `boxWidthPx(box.tools.length)` = `tools.length × 190 + (tools.length − 1) × 16
  + 32`. A box **never grows into empty glass** past its own content.

> The cap is the non-obvious constraint. The naïve "just `flex:1`" cure removes the outer
> dead space but **relocates it inside the glass**: a 5-app Media box balloons to ~1660px
> with 5 tiles stranded left and ~600px void inside. That reads more broken than the
> original. The content-max cap prevents it (see `pane-fixC-2560.png` rejected vs.
> `pane-fixD-1920.png` recommended).

**Residual space (few apps + very wide monitor):** when every box in a row is already at its
content-max and space still remains, the **packed cluster centers** — bounded gap increase
then centering. This reads as a deliberate layout choice ("this is how much content there is")
not a bug. Real homelab density (30–50 apps) leaves little residual at 2560.

### R4 — Lone box fills 100% (build)

A box that is alone in its row renders at **100% of the frame width**, tiles left-packed.
The `--w` floor still applies as the minimum; alone in the row it grows to 100%.

**Guardrails (unchanged — do not touch):**
- `<640px`: boxes stack full-width, 2-column tile shrink — existing pure-CSS rules (A1 D-4).
- `≤1024px`: box sizing is unchanged from shipped A1.
- WidthSelector control in Edit Dashboard mode: remains visible and functional. Changes to
  `grid_width` persist. Control is not hidden or removed.
- D-3 behavior (`fitsViewport` in `src/appGrid.ts` disabling the selector for values that
  would overflow the viewport): unchanged.

---

## 3. Acceptance Criteria

### Field / frame (R1)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-R1-1 | At 1920px and 2560px viewports, the `.app-grid` element has no inner width cap. There is no dead space between the right edge of the rightmost box (in a full row) and the frame's right padding edge. | Must |
| AC-R1-2 | The left edge of the first box in `.app-grid` aligns with the header wordmark left edge and the StatusBar content left edge at all viewports ≥640px (AC-009 preserved). | Must |

### Tiles (R2)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-R2-1 | Every tool tile in every box renders at exactly 190px wide, at all viewports and all box widths (1–8 configured, or wider from R3 grow). No tile stretches or compresses from 190px. | Must |
| AC-R2-2 | When a box is grown wider by R3, additional 190px tiles flow into the row rather than existing tiles stretching. | Must |

### Box grow (R3)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-R3-1 | At viewports ≥1024px, boxes in the same flex-wrap row grow to fill the row's available frame width. No horizontal dead-space gap between the rightmost box and the right frame edge on any row containing two or more boxes. | Must |
| AC-R3-2 | When two boxes share a row and one has more apps than the other, the more-populated box claims a proportionally larger share of the available growth. | Must |
| AC-R3-3 | No box grows beyond its content-max: the width to display all its apps in one row (`tools.length × 190 + (tools.length − 1) × 16 + 32`). A box with 1 app does not stretch beyond ~222px of content. | Must |
| AC-R3-4 | No box shrinks below its configured `--w` floor. An admin-set width-4 box renders at ≥812px at all times. | Must |
| AC-R3-5 | An empty box (0 apps) stays at its `--w` floor width; it does not grow to consume row space. | Should |

### Lone box (R4)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-R4-1 | A box that is the only box in its visual row renders at 100% of the frame width, tiles left-packed. | Must |
| AC-R4-2 | The `--w` floor still applies as the minimum on a lone box; it grows from there to 100%. | Must |

### Guardrails (preserved)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-G1 | At viewports <640px, boxes stack full-width and tile 2-column shrink behavior is unchanged from the shipped A1 model. | Must |
| AC-G2 | At viewports ≤1024px, box sizing is unchanged from shipped A1. | Must |
| AC-G3 | The WidthSelector control in Edit Dashboard mode is visible, interactive, and persists changes to `grid_width`. It is not hidden, removed, or disabled. | Must |
| AC-G4 | The `fitsViewport` disable behavior (D-3, `src/appGrid.ts`) is unchanged: the WidthSelector grays out values that would overflow the viewport. | Must |

---

## 4. Implementation guide for Stitch

**R1 — verify first, no new code expected.** Check `.app-grid` in `src/index.css` has no
inner `max-width` or `width` cap. If clean, mark done. If a cap exists, remove it.

**R2 — no new code.** `.app-grid-tools { grid-template-columns: repeat(auto-fill, 190px) }`
is shipped. Confirm it's intact on `main`.

**R3 — the box grow logic.** Mechanism: per-box JS-computed CSS variables exposed as inline
styles, `index.css` owns the `flex` and `max-width` declarations. Pattern mirrors the
existing `--w` binding (`AppGrid.tsx:351`):

- In `AppGrid.tsx` `BoxCard` (or the box render site), compute and expose:
  - `--floor`: `boxWidthPx(box.width)` — the configured floor in px (already available from
    `src/appGrid.ts`).
  - `--grow`: `box.tools.length` (or `0` if empty) — the grow weight.
  - `--cap`: `boxWidthPx(box.tools.length)` — content-max in px.
- In `index.css`, change `.app-grid-box` from `width: calc(--w …)` to:
  ```css
  .app-grid-box {
    flex: var(--grow) 1 var(--floor);  /* grow weighted, shrink allowed, floor basis */
    max-width: var(--cap);             /* content-max cap — never balloon past content */
    width: auto;                       /* override the fixed width */
  }
  ```

**R4 — lone box detect.** A `useLayout`-style hook over the `boxes` array, recomputed on
`viewportWidth` and `boxes` changes (both already tracked for D-3). Bin-pack boxes into visual
rows by their `--floor` at the current `.app-grid` content width. A row of one marks that box
`--grow: 1; --cap: 100%` (overriding the content-max so the lone box fills the frame). The
bin-pack does not need to be perfect — it only needs to correctly identify rows of one vs.
rows of multiple, which the floor-sum approach handles reliably.

**No new API, no schema change.** `grid_width` column and migration 0009 are already the floor
source. No backend changes.

---

## 5. Affected files

| File | Change |
|------|--------|
| `src/index.css` | `.app-grid-box`: replace fixed `width: calc(--w …)` with `flex: var(--grow) 1 var(--floor); max-width: var(--cap); width: auto` |
| `src/AppGrid.tsx` | `BoxCard` (or box render site): compute and expose `--floor`, `--grow`, `--cap` as inline CSS vars; add `useLayout` hook for lone-box R4 detect |
| `src/appGrid.ts` | Add `contentMaxPx(n)` helper if not already present (same formula as `boxWidthPx(n)`) |

No API changes. No test fixtures change. No backend changes. No migration.

---

## 6. Out of scope (Phase 1)

- Manual admin drag, row assignment, or width% — `SPEC-category-pane-width-layout.md` is Phase
  2, stays HELD. Do not build.
- Tile size changes (tiles stay 190px — any stretch/scale is a regression).
- Any changes at viewports <640px or ≤1024px.
- Any change to the WidthSelector control UI or its persistence.
- Ultra-wide (5K / 8K) viewports beyond 2560px.

---

## 7. Test cases (for Gracie's QA)

### TC-001: No dead space in a two-box row (R3)

**Setup:** A dashboard with two categories in the same visual row (e.g. Develop 6 apps and
Friends 3 apps, both width-3 configured).
**Viewport:** 1920px.
**Expected:** The two boxes grow to fill the row. No gap between the right edge of the
second box and the right frame edge. Develop box is wider than Friends box (more apps).

### TC-002: Content-max cap — no empty glass (R3)

**Setup:** A dashboard with External (1 app, width-1) in a row with space for growth.
**Viewport:** 2560px.
**Expected:** External box is no wider than ~222px (its 1-tile content-max). No empty glass
extends beyond its single tile. The excess space goes to the gap / center behavior, not into
the External glass.

### TC-003: Floor preserved — admin width honoured (R3)

**Setup:** Admin sets a category to width-6 (`grid_width = 6`, `boxWidthPx(6)` = 1172px).
**Viewport:** 1440px.
**Expected:** That box renders at ≥1172px, even if there is no row dead-space to absorb. The
WidthSelector control reads width-6. Persists on reload.

### TC-004: Lone box fills 100% (R4)

**Setup:** Any category that is the only box in its visual row.
**Viewport:** 1920px.
**Expected:** The box spans the full frame width, tiles left-packed, no gap at either side.

### TC-005: Tile uniformity (R2)

**Setup:** A box that has grown wider under R3 (more space than its `--w` floor).
**Viewport:** any ≥1024px.
**Expected:** All tiles are exactly 190px wide. Inspect tile elements — no tile stretches
beyond 190px. Additional tiles may have appeared (auto-fill), but each is 190px.

### TC-006: Mobile / small-desktop unchanged (guardrails)

**Viewports:** 400px, 640px, 1024px.
**Expected:** Layout at these viewports is visually identical to the pre-Phase-1 staging
baseline. No regressions.

### TC-007: WidthSelector preserved in Edit Dashboard

**Setup:** Admin enters Edit Dashboard mode.
**Expected:** WidthSelector is visible and interactive on each box. Changing width updates the
box display and persists to `grid_width`. `fitsViewport` D-3 disable still grays out
overflow-causing values.

---

## 8. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | ✅ PRODUCT GO — Phase 1 (R1–R4), 2026-07-02 |
| Design / UX | Kare | ✅ design-go for Phase 1 (R1–R4), 2026-07-02 |
| Homepad authority | Joe → Caleb | ✅ decision (a) made — `--w` stays as floor; Phase 2 held |
| Implementation | Stitch | ⏳ cleared to build Phase 1 |

**This spec is the build contract for Stitch.** Phase 2 (manual drag/row model) is held and
will be dispatched separately.

---

## 9. Revision history

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-02 | 0.1 | Kare | Design direction — re-anchored onto live App Grid (#281) |
| 2026-07-02 | 1.0 | Walt | Formalized into product spec with ACs, build contract, test cases; product go given |
