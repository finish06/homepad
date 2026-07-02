# Design Direction: App-Grid Box Horizontal Fill & Tile Reflow (wide viewports)

**Trigger:** Caleb — direct layout feedback on the authed dashboard at wide viewports
(3 screenshots), 2026-07-02. "Still not in love." Wide monitors leave dead space.
**Task:** `homepad-pane-reanchor-20260702-164517` (re-anchor of the original
`homepad-pane-fill-reflow-20260702-140338`).
**Author:** Kare (design/UX) — **design input for Walt to formalize into product spec.**
**Status:** DESIGN DIRECTION — re-anchored onto the LIVE App Grid, and the one open
decision is now **RESOLVED** (Caleb's call (a), below). Ready for Walt to fold into a
build contract for Stitch. **Phase 1 = R1–R4, frontend-only.**
**Scope:** `src/AppGrid.tsx`, `src/appGrid.ts`, `src/index.css` — **frontend only, no
backend, no migration.** Wide viewports (**≥1024px**; 1280–2560 are the failing band).
Phone/tablet (**<640px**) and standard desktop guardrails unchanged.
**Repo:** `Code/homepad`.

> ### ⚠️ Re-anchor note (read first)
> The **first draft of this spec (PR #270) described a dead layout model** — the v14
> "floating panel field" (`.tile-field` / `.panel-tiles` / `panelCols`, capped at
> `max-width: 1392px`). That model was **reverted off `main`**. The live dashboard is
> the **App Grid** (`SPEC-app-grid` Amendment A1, restored on `main` at commit `4c7dce2`,
> #279): glass **boxes** = categories, each sized by an admin **WidthSelector** that
> writes `--w` (the `grid_width` column, migration 0009, range 1–8), packed left→right by
> `flex-wrap`, with a fixed-190px `auto-fill` tile track inside.
>
> This revision re-anchors rules **R1–R4 onto the App Grid classes** and records
> **Caleb's decision (a): the WidthSelector `--w` STAYS.** It is **not replaced and not
> hidden** — it becomes each box's **floor / target**, and boxes **auto-grow above it** to
> fill row dead-space. The auto-fill layer sits *on top of* the existing width control, not
> instead of it. The old §6 "auto vs. manual" decision is therefore **closed** (see §6).

---

## 1. The problem, reproduced and measured

The live App Grid (`index.css` `.app-grid`, restored `main`) lays each category out as a
**content-sized glass box**:

```css
.app-grid       { display:flex; flex-wrap:wrap; gap:16px; align-items:flex-start; }   /* fills the CONTENT_WIDTH frame */
.app-grid-box   { width: calc(var(--w) * 190px + (var(--w) - 1) * 16px + 32px);
                  max-width:100%; }                                                   /* FIXED to --w — this is the cause */
.app-grid-tools { grid-template-columns: repeat(auto-fill, 190px); }                  /* R2 already shipped */
```

The field (`.app-grid`) already spans the shared `CONTENT_WIDTH` frame
(`mx-auto max-w-[1536px] px-4`, `src/layout.ts` — no inner 1392px cap survives the App-Grid
restore). But every box is pinned to **exactly** its configured `--w` width and the row
**left-packs and wraps**, so when a row's boxes don't sum to the frame width, the remainder
is dead glass-less space to the right.

Reproduced (Caleb's scenario: Develop 6 apps · External 1 · Friends 3 · Media 5 · Kube 2) in
a **byte-faithful harness** — the shipped `index.css` tokens + the exact
`.app-grid`/`.app-grid-box`/`.app-grid-tools` DOM (staging has zero categories and the review
account isn't admin, so a live admin seed wasn't possible; the layout is pure CSS so the
harness is faithful). Measured, live DOM:

| Viewport | Field right edge | Dead space **beyond** the packed boxes (→ frame edge) | Worst **intra-row** dead space |
|---:|---:|---:|---|
| 1440 | fills to ~1408 (frame) | small | **External (1 app) leaves ~1100px empty to its right in its row** |
| 1920 | frame caps at 1536 | **~384px** beyond the frame + ragged rows inside | same ragged right edges |
| 2560 | frame caps at 1536 | **~1024px** beyond the frame | same |

So on a 1920/2560 monitor the whole lower-right is dead, and even inside the 1536 frame a
1-app box (External) hugs the left with a wide empty gutter beside it. **This confirms every
point of Caleb's report.** (Before: `assets/pane-fill-reflow/pane-live-1440.png`,
`pane-live-1920.png`, `pane-live-2560.png`.)

---

## 2. What "intelligent" must mean (the design rules, re-anchored on App Grid)

Four rules, each validated in-browser across 1440/1920/2560. Class names are the **live App
Grid** selectors.

**R1 — The field fills the content frame.** `.app-grid` spans the shared `CONTENT_WIDTH`
frame (`mx-auto max-w-[1536px] px-4`) with its left/right edges aligned to the header and
status strip (#196, AC-009). *This is already true on `main` after the App-Grid restore — the
dead v14 `1392px` cap is gone.* **R1 is a verify-and-hold, not new work:** confirm no
re-introduced inner cap on `.app-grid`, and that horizontal padding matches the header frame.
*Result: the content edge is the frame edge at every viewport.*

**R2 — Tiles reflow by box width, but stay a uniform 190px.** `.app-grid-tools` is already
`grid-template-columns: repeat(auto-fill, 190px)` — **shipped** (A1, AC-001-A1). A wider box
therefore shows **more** 190px tiles per row while every tile stays **exactly 190px in every
box** (Caleb's standing invariant). **R2 is shipped; R3 is what makes boxes wider so
`auto-fill` has room to reveal more columns.** *Verified: tile width = 190px at all viewports.*

**R3 — Boxes grow to consume the row, weighted by app count, floored at `--w`, capped at
content-max.** Today `.app-grid-box` is a **fixed** `width: calc(--w …)`. Change it so `--w`
is the box's **floor / target** and the box may **grow above it** to absorb row dead-space:

- **Floor = `--w`.** A box never renders *narrower* than its configured `grid_width`
  (`boxWidthPx(box.width)` in `src/appGrid.ts`). The admin's width choice is honoured as the
  minimum — Caleb's decision (a). It is **not** replaced by the auto-layout.
- **Grow weighted by app count.** Boxes `flex-grow` so a row reaches both frame edges; the
  grow factor is **weighted by `box.tools.length`** so populous boxes widen *first* — they can
  actually *use* the width (more real 190px columns via R2), whereas a 1-app box barely moves.
- **Cap at content-max.** Each box is capped at the width of **its own apps in one row**
  (`tools.length` tiles: `tools.length·190 + (tools.length−1)·16 + 32`) so it **never balloons
  into empty glass** past its content.

> This cap is the non-obvious lesson from the prototype. The naïve "just `flex:1`" cure
> (`assets/pane-fill-reflow/pane-fixC-2560.png`) removes the *outer* dead space but
> **relocates it inside the glass**: a 5-app Media box balloons from its ~1046px content to
> ~1660px with its 5 tiles stranded left and a ~600px void inside the pane. That reads *more*
> broken than the original. The content-max cap prevents it
> (`assets/pane-fill-reflow/pane-fixD-1920.png` — External stays a tidy ~222px box instead of
> a 1-tile box stretched across 340px).

**R4 — A box alone in its row fills 100%,** tiles left-packed (matching
`SPEC-category-pane-width-layout.md` AC3). Its `--w` floor still applies as the minimum; alone
in the row it grows to the full frame width. A single full-width box is honest single-box
breathing room, not the multi-box packing bug.

**Guardrails (unchanged):** `<640px` stacks full-width and 2-col-shrinks via the existing pure-CSS
rules (A1 D-4) — **do not touch.** Standard desktop `≤1024` unchanged. **All new R3/R4 behavior
is scoped `≥1024`.** The D-3 width-selector viewport-fit disable (`fitsViewport`, `src/appGrid.ts`)
and the `max-width:100%` overflow backstop stay exactly as shipped.

---

## 3. Residual space at extreme width (the honest edge)

When every box in a row is already at its content-max and space still remains (few apps + a
very wide monitor, e.g. 17 apps on 2560), something must absorb the slack. Prototyped options:

- ❌ **left-pack** → back to the original right-edge dead space.
- ❌ **`justify-content: space-between`** → blows inter-box gaps to ~300px caverns and
  *starves* boxes of useful growth (`assets/pane-fill-reflow/pane-fixD-2560.png`: Develop never
  reaches its 6-in-a-row width because the space went to gaps).
- ✅ **grow-then-center:** boxes grow (weighted, floored at `--w`, capped at content-max) to
  consume space *usefully first*; any space left after all boxes hit content-max distributes as
  a **bounded** gap increase, and at the extreme, the packed cluster **centers**. A centered,
  well-packed cluster reads as "this is how much content there is, centered on a big screen" — a
  deliberate choice, not a bug. This case shrinks fast with real homelab density (30–50 apps
  fills 2560 with little residual); the sparse-17-app case is a genuine edge.

**Tile-stretch, considered and rejected:** an earlier direction suggested tiles use
`auto-fit` + `minmax(190,1fr)` (tiles *stretch* to fill). Prototyped — tiles ran 190→**305px**,
a lone stretched tile looks off, and it breaks the uniform-190 invariant (R2 / AC-001-A1). We
keep **`auto-fill` + fixed 190 + box-level grow** instead: same "reflow to fill" outcome, tiles
stay uniform.

---

## 4. Before / After (visual set)

| | 1920 | 2560 |
|---|---|---|
| **Before (live App Grid)** | `assets/pane-fill-reflow/pane-live-1920.png` — dead beyond-frame + ragged rows | `assets/pane-fill-reflow/pane-live-2560.png` — ~1024px dead beyond frame |
| Naïve cure (rejected) | — | `assets/pane-fill-reflow/pane-fixC-2560.png` — dead space moves *inside* the glass |
| **Recommended** | `assets/pane-fill-reflow/pane-fixD-1920.png` — boxes share rows, no internal voids, External stays tidy | (see §3 for the residual edge) |

`assets/pane-fill-reflow/pane-harness.html` is the byte-faithful reproduction harness (shipped
tokens + exact App-Grid DOM) used for the measurements.

---

## 5. Implementation note for Stitch (how, not just what)

R1 is already-satisfied (verify no inner cap). R2 is shipped (`auto-fill 190px`). **R3–R4 are
the build**, and they **cannot be expressed by `flex-wrap` alone** — CSS can't detect "alone in
a visual row" or "grow-then-cap-then-distribute." The mechanism keeps `--w` as the floor:

- **Per-box CSS variables, JS-computed.** Keep `--w` as the configured floor. In
  `src/AppGrid.tsx` `BoxCard`, make the box a **flex item** instead of a fixed-width block:
  `flex: <grow> 1 <floor>` where **`<floor>` = `boxWidthPx(box.width)`** (the `--w` content
  width, already computed in `src/appGrid.ts`) and **`<grow>` = a weight derived from
  `box.tools.length`** (0 for an empty box so it stays at floor; higher for populous boxes).
  Add a per-box **`max-width` = content-max** (`box.tools.length` tiles in one row) so grow
  never exceeds the box's own apps. Expose these as inline CSS vars
  (`--floor`, `--grow`, `--cap`) so `index.css` owns the actual `flex`/`max-width` declaration
  and the component only supplies numbers — the same pattern as the existing `--w` binding
  (`AppGrid.tsx:351`).
- **Row awareness (R3 "consume the row" / R4 "alone → 100%")** needs a lightweight JS
  **row-packer**: bin-pack boxes into visual rows by their floor width at the current
  `.app-grid` content width, then within each row distribute grow weighted by app count up to
  each box's content-max; a row of one marks that box 100%. A `useLayout`-style hook over the
  existing `boxes` array (already ordered in `AppGrid.tsx`), recomputed on
  `viewportWidth`/`boxes` change (both already tracked for the D-3 selector disable).
- **Reuse, don't duplicate.** `SPEC-category-pane-width-layout.md` builds a row-grouping
  primitive (`layoutRow` / `layoutColOrder`); if/when that Phase-2 work lands, the auto-packer
  should populate the same row structure so the manual admin width model is a later override
  layer on top of the auto floor, not a parallel system. For Phase 1, a self-contained packer
  over `boxes` is sufficient and ships without any migration.

Everything above is **frontend-only**: no API, no `grid_width` schema change (the column and
migration 0009 already exist and stay as the floor source).

---

## 6. Decision — RESOLVED (the D-question is closed)

The original §6 asked Walt + Joe (→ Caleb) to choose **auto vs. manual** and the **fate of the
WidthSelector `--w`**. **Caleb decided (a): `--w` STAYS.**

1. **Auto layers on top of the width control — floor, not replace.** The WidthSelector and
   `grid_width` are **kept and visible**. `--w` becomes the box's **floor / target**; auto-grow
   fills row dead-space *above* it (R3). The control is **not replaced and not hidden.**
2. **`SPEC-category-pane-width-layout.md` (manual admin drag/row/width% model) is Phase 2 and
   stays HELD** — column control *beyond the floor* is deferred. Phase 1 (this spec, R1–R4)
   ships first and does not require the manual model or its migration.
3. **190px tile invariant holds** (R2 / §3): tiles stay a uniform 190px; boxes grow, tiles
   don't stretch.

There is no open cross-team decision blocking Phase 1. Remaining sign-off is the normal
product formalization (Walt) + design co-sign (below).

---

## 7. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Design / UX | Kare | ✅ re-anchored onto App Grid + design-go for Phase 1 (R1–R4), 2026-07-02 |
| Product | Walt | ⏳ formalize R1–R4 into the build contract + product go |
| Homepad product authority | Joe → Caleb | ✅ decision (a) made — `--w` stays as floor; manual model (Phase 2) held |
| Implementation | Stitch | ⏳ build Phase 1 (frontend-only) once Walt formalizes |
