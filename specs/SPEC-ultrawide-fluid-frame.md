# Spec: Ultra-wide Fluid Content Frame (Phase 1b of pane-fill)

**Trigger:** Caleb — direct request (Claude session, 2026-07-02): "update UI on
homepad… make it modern, efficient, dynamic for mobile phones up to 4k monitors."
The mobile→1536px range is solid; the failing band is **>1536px**, which Phase 1
(`SPEC-pane-fill-reflow`) explicitly left out of scope (§6: "Ultra-wide (5K / 8K)
viewports beyond 2560px"; and its frame was the fixed 1536px island).
**Version:** 1.0
**Status:** BUILT on `feat/ultrawide-fluid-frame` — rides CI + browser-gate + QA; not self-merged.
**Author:** Claude (on Caleb's direct dispatch)
**Repo:** `Code/homepad` — **frontend only. No backend changes. No migration.**
**Scope:** The shared CONTENT_WIDTH frame at viewports **>1536px**. Everything at
≤1536px (mobile, tablet, standard desktop, the whole shipped Phase 1 band) is
**byte-identical** — verified by the unchanged frame math below.

---

## 1. The problem

After pane-fill Phase 1 (#282), boxes fill their rows — but the rows live inside
`CONTENT_WIDTH = mx-auto max-w-[1536px] px-4` (`src/layout.ts`). On big monitors
the whole dashboard is a fixed 1536px island:

| Viewport | Frame | Dead margin (both sides) |
|---:|---:|---:|
| 1920 | 1536px | 384px |
| 2560 | 1536px | 1024px |
| 3840 (4K) | 1536px | **2304px — 60% of the screen** |

Measured on prod 2026-07-02 (Playwriter, authed): at 3840×2160 the grid used
~40% of the width. Visual record: session audit screenshots.

## 2. The change — one token, one mirror, one residual rule

### R5 — CONTENT_WIDTH becomes fluid above 1536px

```
max-w-[1536px]  →  max-w-[max(1536px,92vw)]
```

- **≤ ~1670px viewports:** `92vw < 1536`, so the `max()` returns the 1536px
  floor — the shipped frame, unchanged. The two regimes meet exactly where
  `92vw == 1536px` (vw ≈ 1670): the width is **continuous**, no breakpoint jump.
- **> ~1670px:** the frame is `92vw` — a proportional 4vw margin per side.
  1920 → ~1766px frame · 2560 → ~2355px · 3840 → ~3533px.
- Header, StatusBar, and grid all consume the one token (#196 AC-009), so the
  three layers stay edge-aligned at every width.
- The JS mirror is `frameContentPx(vw)` in `src/appGrid.ts` — the R4 lone-box
  bin-pack input. CSS token and mirror must change together
  (`ultrawide-frame.test.ts` guards the pairing).

### R6 — R3's residual rule gets its implementation (fluid band only)

Phase 1 §R3 already prescribes it: *"when every box in a row is already at its
content-max and space still remains, the packed cluster centers."* With a fluid
frame this case is finally reachable in practice, so `.app-grid` gains
`justify-content: center` **inside `@media (min-width: 1671px)`** — below the
crossover the base rule is untouched (guardrails AC-G1/G2 hold byte-identical).
Rows that can still grow are filled by flex-grow before centering ever shows.

### Unchanged (all Phase 1 invariants)

- Tiles stay **exactly 190px** (R2, Caleb's standing invariant).
- `--w` floors, weighted grow, content-max caps, lone-box 100% (R3/R4).
- WidthSelector + `fitsViewport` D-3 (raw-viewport compare, unaffected).
- **Everything below 1671px** — phone, tablet, desktop: no rule fires.

## 3. Acceptance criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-R5-1 | At 1920/2560/3840, the `.app-grid` frame measures `92vw − 32px` (±2px); populated multi-box rows reach its right edge (Phase 1 AC-R3-1 extended to the fluid band). | Must |
| AC-R5-2 | At every viewport ≤1670px the frame is identical to shipped Phase 1 (`min(vw, 1536) − 32`). | Must |
| AC-R5-3 | Frame width is monotonic in viewport width (no #194-style inversion anywhere in 320–3840). | Must |
| AC-R5-4 | Header wordmark, StatusBar content, and grid left edges stay aligned at 2560/3840 (AC-009 preserved). | Must |
| AC-R6-1 | A row whose boxes are all at content-max centers as a cluster (symmetric gaps) at ≥1671px; boxes do not balloon past content-max to fake the fill. | Must |
| AC-R6-2 | Below 1671px `.app-grid` has no `justify-content` — base layout byte-identical. | Must |

## 4. Verification (done on-branch)

- `src/ultrawide-frame.test.ts` — 9 vitest: token shape, mirror math (unchanged
  band, plateau, fluid band, seam continuity, monotonicity), media-query scoping.
  RED on `main` / GREEN on branch.
- `tests/browser-gate/app-grid-pane-fill.spec.ts` — extended: dead-space gate now
  runs 1920/2560/**3840** and asserts the frame itself is fluid; new
  cluster-centering gate at 3840. **All 21 browser-gate tests green** on the
  built app in real Chromium.
- Visual (Playwriter, built app, dark, seeded 45-app fixture): 390 / 1440
  unchanged; 2560 fills with Kube a lone 11-column row; 3840 lays all five
  boxes in one full-width row. Pre-existing local-env vitest failures on
  macOS are identical on `main` (CI is the arbiter).

## 5. Out of scope

- Tile size / density changes at any viewport (190px invariant).
- Any change below the 1671px crossover.
- Phase 2 admin drag/row/width% (`SPEC-category-pane-width-layout.md`) — still HELD.
- Root-font / typographic upscaling at 4K (possible follow-up, separate decision).
