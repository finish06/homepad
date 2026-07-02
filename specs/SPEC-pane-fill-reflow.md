# Design Direction: Category-Pane Horizontal Fill & Tile Reflow (wide viewports)

**Trigger:** Caleb — direct layout feedback on the authed dashboard at wide viewports
(3 screenshots), 2026-07-02. "Still not in love."
**Task:** `homepad-pane-fill-reflow-20260702-140338`
**Author:** Kare (design/UX) — **design input for Walt to formalize into product spec**
**Status:** DESIGN DIRECTION — recommended, needs Walt (product) + Joe (delegated homepad
authority) sign-off. **Not yet a build contract.**
**Scope:** `src/Catalog.tsx`, `src/index.css` — **frontend only, no backend.** Wide viewports
(≥1024px focus; 1280–2560 are the failing band). Phone/tablet (<640) and standard desktop
guardrails unchanged (same guardrail as `large-monitor-grid.md`).
**Repo:** `Code/homepad`.

> ⚠️ **Coordination flag (read first — for Joe/Walt).** This overlaps an already-APPROVED,
> already-dispatched spec: `SPEC-category-pane-width-layout.md` (Walt product-go 2026-07-01,
> sent to Stitch). That spec solves the *same* dead-space with a **manual admin model**
> (assign rows + width% + drag handles + a DB migration) and explicitly puts **auto-layout
> "out of scope."** Caleb's new feedback asks for the **opposite**: *intelligent, automatic*
> pane distribution — no per-category configuration. **These two directions conflict at the
> philosophy level (manual vs. automatic).** My recommendation reconciles them (make AUTO the
> default; keep admin width% as an optional override on top of the auto-packer), but it
> **changes the approved spec's scope**, so it is a Walt+Joe call, not mine. **Do not let
> Stitch build the manual-only model while the dashboard owner is asking for automatic.**
> See §6.

---

## 1. The problem, reproduced and measured

The live authed dashboard (v14 §2A "floating panel field", `index.css:1892`) lays each
category out as a **fixed-width glass pane** — width = `panelCols × 190 + gaps + 32`, where
`panelCols = min(appCount, 4)` — inside a `.tile-field` that is `flex-wrap` + left-justified
and **capped at `max-width: 1392px`**. Fixed panes packing left and wrapping is exactly the
dead-space Caleb sees.

I reproduced Caleb's scenario (Develop 6 apps · External 1 · Friends 3 · Media 5 · Kube 2) in
a **byte-faithful harness** (the shipped `index.css` tokens + the exact DOM `Catalog.tsx`
emits — staging currently has zero categories and my review account isn't admin, so a live
seed wasn't possible; the layout is pure CSS so the harness is faithful). Measured, live DOM:

| Viewport | Field right edge | Dead space **beyond** field (→ viewport) | Worst **intra**-field dead row |
|---:|---:|---:|---|
| 1440 | x=1440 (capped) | 0 | **Friends alone in a row → 758px empty to its right** |
| 1920 | x=1440 (capped) | **480px** | same 314 / 758 / 108px ragged right edges |
| 2560 | x=1440 (capped) | **1120px** | same |

So at 1920 the entire lower-right quadrant is dead; at 2560 nearly half the screen. A 1-app
pane ("External") renders a 222px box hugging the left. **This confirms every point of
Caleb's report.** (Before: `pane-live-1920.png`, `pane-live-2560.png`.)

---

## 2. What "intelligent" must mean (the design rules)

Four rules, each validated in-browser across 1440/1920/2560:

**R1 — The field fills the content frame.** Remove `.tile-field { max-width: 1392px;
margin-left: 48px }`; the field spans the shared content frame with responsive horizontal
padding that **caps at 64px** (identical to D1 of the sibling spec — one padding rule for both
features). *Result: the beyond-field dead space (480px@1920, 1120px@2560) → 0.*

**R2 — Tiles reflow by pane width, but stay a uniform 190px.** Change `.panel-tiles` from
`repeat(var(--panel-cols), 190px)` (a hard column cap) to **`repeat(auto-fill, 190px)`**. A
wider pane then shows **more** 190px tiles per row — Caleb's new ask — while the tile stays
**exactly 190px in every pane**, which is Caleb's *standing* invariant from the App-Grid A1
work (AC-001-A1). The per-pane column preference (`fieldCols`) stops being a hard cap and
becomes the pane's **target / flex-basis** (Joe's direction #4; my task's requirement:
"target/min, NOT a hard cap"). *Verified: tile width = 190px at all viewports in the fix.*

**R3 — Panes grow to consume the row, weighted by app count, capped at their own content.**
Panes `flex-grow` so a row reaches both edges (kills the intra-field dead space). Grow is
**weighted by app count** so populous panes widen *first* — they can actually *use* the width
(more real tile columns), whereas a 1-app pane barely moves. And each pane is **capped at its
content-max** (`appCount` tiles in one row) so it **never balloons into empty glass.**

> This cap is the non-obvious lesson from the prototype. The naive "just `flex:1`" cure
> (`pane-fixC-2560.png`) removes the *outer* dead space but **relocates it inside the glass**:
> Media balloons from its 1046px content to 1660px with its 5 tiles stranded left and a ~600px
> void inside the pane. That reads *more* broken than the original. The content-max cap
> prevents it (`pane-fixD-1920.png` — External stays a tidy 222px box instead of a 1-tile pane
> stretched across 340px).

**R4 — A pane alone in its row fills 100%** (matching `SPEC-category-pane-width-layout.md`
AC3), tiles left-packed. A single full-width pane is honest single-pane breathing room, not
the multi-pane bug.

**Guardrails (unchanged):** `<640px` stacks full-width (existing `@media (max-width:767px)`
rules); standard desktop `≤1024` unchanged. **All new rules are scoped `≥1024`.**

---

## 3. Residual space at extreme width (the honest edge)

When every pane in a row is already at its content-max and space still remains (few apps + a
very wide monitor, e.g. 17 apps on 2560), something must absorb the slack. Prototyped options:

- ❌ **left-pack** → back to the original right-edge dead space.
- ❌ **`justify-content: space-between`** → blows inter-pane gaps to ~300px caverns and
  *starves* panes of useful growth (`pane-fixD-2560.png`: Develop never reaches its 6-in-a-row
  width because the space went to gaps).
- ✅ **grow-then-center:** panes grow (weighted, capped) to consume space *usefully first*;
  any space left after all panes hit content-max distributes as a **bounded** gap increase,
  and at the extreme, the packed cluster **centers**. A centered, well-packed cluster reads as
  "this is how much content there is, centered on a big screen" — a deliberate choice, not a
  bug. This case shrinks fast with real homelab density (30–50 apps fills 2560 with little
  residual); the sparse-17-app case is a genuine edge.

**Design call I'd make differently from the starting direction:** Joe suggested tiles use
`auto-fit` + `minmax(min,1fr)` (tiles *stretch* to fill). I prototyped it — tiles ran
190→**305px** and a lone stretched tile looks off, and it breaks the uniform-190 invariant
Caleb asked for earlier. I recommend **`auto-fill` + fixed 190 + pane-level grow** instead:
same "reflow to fill" outcome, but tiles stay uniform. Flagging this as a deliberate refinement.

---

## 4. Before / After (visual set attached to the tracking issue)

| | 1920 | 2560 |
|---|---|---|
| **Before (live)** | `pane-live-1920.png` — dead lower-right quadrant | `pane-live-2560.png` — ~½ screen dead |
| Naive cure (rejected) | — | `pane-fixC-2560.png` — dead space moves *inside* the glass |
| **Recommended** | `pane-fixD-1920.png` — panes share rows, no internal voids, External stays tidy | (see §3 for the residual edge) |

---

## 5. Implementation note for Stitch (how, not just what)

R1 and R2 are pure CSS (field cap removal + `auto-fill`). **R3–R4 cannot be expressed by CSS
`flex-wrap` alone** — it can't detect "alone in a visual row" or "cap-then-distribute." Two
paths:

- **(A)** a lightweight JS **row-packer**: bin-pack panes into rows by content width at the
  current field width, set each pane's flex-basis/max, mark lone panes 100%. ~a `useLayout`
  hook over the existing `displayCats`.
- **(B) — preferred:** reuse the **row infrastructure already being built** for
  `SPEC-category-pane-width-layout.md` (`layoutRow` / `layoutColOrder` grouping + the flex-row
  render), but populate it from the **auto-packer** instead of (or before) admin width%. This
  makes Caleb's "automatic" the default and turns the admin width% into an *override*, reusing
  the in-flight work rather than duplicating it.

Path B is the reconciliation and the reason §6 is a Walt+Joe decision.

---

## 6. Decision needed (Walt + Joe)

1. **Auto vs. manual as the default.** Caleb (dashboard owner) asked for automatic. I
   recommend auto-by-default (the R1–R4 packer), admin width% as optional override.
2. **Fate of `SPEC-category-pane-width-layout.md` as dispatched.** If we adopt auto-default,
   that spec's manual model becomes the *override layer*, not the primary — Stitch should
   build the auto-packer first. Someone needs to tell Stitch before the manual-only model ships.
3. Confirm the 190px tile invariant holds (R2/§3) vs. Joe's stretch suggestion.

---

## 7. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Design / UX | Kare | ✅ direction recommended 2026-07-02 |
| Product | Walt | ⏳ needs formalization + go |
| Homepad product authority | Joe → Caleb | ⏳ needs the §6 auto-vs-manual call |
| Implementation | Stitch | — (do not build until §6 resolved) |
