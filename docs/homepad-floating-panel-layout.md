# homepad dashboard — floating-panel layout (4-column field)

Build-ready design, 2026-07-01 (Kare). Caleb reviewed and **CONFIRMED** the direction:
(1) category ordering = **usage priority, but stable** (re-rank occasionally, never live on
the open-count tick), and (2) per-category **glass panels** (tiles never resize). This doc
finalizes that into a spec Walt can wrap and Stitch can build. It supersedes the "center
sparse rows" recommendation from the 2026-06-30 pass (task
homepad-layout-ux-20260630-205712).

**Rev 2026-07-01b (mobile):** documents the mobile sizing exception after the v14 phone-overflow
bug (fixed 190px tiles + 48px left margin overflowed a ~390px viewport). Tiles are fixed 190px on
**desktop only**; below 1024 (esp. ≤430px) they go **fluid** (`minmax(0, 190px)`), the left anchor
drops to ~16px, and there is a hard **no-horizontal-page-scroll** rule. Desktop spec unchanged.
Aligns with Stitch's code fix (task `homepad-v14-mobile-overflow`). See A.2, A.4, B.2.

**Rev 2026-07-01c (v14.1 — 4-column ceiling):** Caleb + Walt lowered the field's **max column
count from 6 to 4**. 6 read sparse on wide monitors; 4 is the glance sweet spot. The ladder is now
**4 / 3 / 2** at ≥1024 / ≥768 / <768 (the ≥1300→6 tier is gone; ≥1024 already capped at 4).
Column-span is still `clamp(appCount, 1, fieldCols)`, now capped at 4, so a category with <4 apps
still hugs its content with no phantom columns. Tile size (fixed 190px desktop / fluid mobile) and
the mobile rules are **unchanged** — this only lowers the ceiling. See A.1, A.2, A.4.

**Mock:** `.kare-panels.png` (desktop 1440 field + Recently Opened rail, and iPad 768 stack).
**Grounded on live staging tokens:** tile 190×134, gap 16, radius 18, plate 44px, tile shadow
`0 1px 2px rgba(16,24,40,.04), 0 8px 20px -10px rgba(16,24,40,.12)` — measured off the real
authenticated dashboard, not invented.

---

## The idea (Caleb)
Keep the **left edge**. Screens are read in an **F** — top-left → right, drop down, →
right. Anchor everything to one left edge in priority order; don't center. Then let each
**category be a floating glass panel** that spans 1–4 of a 4-column field. A 3-app category
is a 3-column panel, so two of them sit **side by side** instead of one row per category
leaving a void on the right.

---

## A. The floating-panel field

### A.1 Field (measurable)
- The dashboard body is a conceptual **4-column field** (v14.1; was 6). One column = one **190px** tile slot
  (desktop cap — see A.2/A.4 for the mobile fluid rule); **column-gap and panel-gap = 16px**.
  Field content max-width ≈ **1300–1392px**, centered, with **≥24px** side gutters. On a 1440
  viewport this lands the field's **left edge at x=48** (24 centering margin + 24 gutter) —
  verified in the mock.
- **Every panel row starts at that same left edge.** All panels
  `justify-content:flex-start`. Left-anchored, never centered. The anchor is **x=48 on desktop**;
  on mobile it **reduces to ~16px** so 48px doesn't eat a phone's width (see A.4).

### A.2 Panel = one category
- **Glass surface (tokens):**
  - background `rgba(255,255,255,.72)` + `backdrop-filter: blur(10px)`
  - border `1px solid rgba(15,23,42,.06)`
  - radius **22px** (one step above the 18px tile, so the panel reads as the container)
  - shadow `0 1px 2px rgba(16,24,40,.04), 0 12px 28px -14px rgba(16,24,40,.18)`
  - padding **16px**
  - Dark mode: background `rgba(23,23,23,.72)`, border `rgba(255,255,255,.08)` — same recipe,
    inverted ink; re-run the contrast check on the header text before shipping dark.
- **Header** (category name + count) sits top-left inside the panel, reinforcing the per-panel
  left edge. Name 14/800, count 12/600 in `text-muted` (neutral-500 min — see contrast rule).
- **Column-span = `clamp(appCount, 1, 4)`** (v14.1; was `…, 6`). Internal tile grid = `span`
  columns of **`minmax(0, 190px)`**, gap 16, and **wraps to a second internal row past 4 apps** (a
  5–8 app category is a 4-col panel, two rows). The `minmax(0, 190px)` is the load-bearing rule: tiles
  **cap at 190px** (never larger) but **may shrink below 190px when the column can't hold it** —
  see the mobile exception in A.4.
- **Panel hugs its content — it does not stretch, and tiles never enlarge past 190px.** This
  kills the current defect where `grid-cols-6` at 1440 stretches tiles to 218px.
- **"Tiles never resize" is a DESKTOP (≥1024) rule, not an absolute.** On desktop a tile is a
  fixed **190px**. Below 1024 — and critically at phone widths (≤430px) — a full-width N-column
  panel must fit **within the viewport**, so tiles **shrink below 190px** rather than force the
  page wider. This is the documented exception, spelled out in A.4. (Fixed 190px tiles + a 48px
  left margin overflow a ~390px phone — the v14 mobile bug. The fluid column above is the fix.)

### A.3 Flow
- Panels lay out left→right in **category (priority) order** (see A.5),
  `justify-content:flex-start`, wrapping to the next line when the next panel won't fit the
  remaining field width.
- **No masonry / `dense` reflow** — source order is preserved so the F-scan reads correctly.
  Accept a ragged right edge / occasional right-side gap; that whitespace lands exactly where
  the F-scan is *not* looking.

### A.4 Responsive
Field columns cap at **4** (v14.1; was 6). Implemented as a stepped ladder in `useFieldCols`:
- **≥1024 → 4 cols** — side-by-side panels (e.g. 3+1, 2+2), the wide-monitor ceiling. Was 6 at
  ≥1300; lowered to 4 because 6 read sparse and 4 is the glance sweet spot. ✓
- **ipad-port 768 → 3 cols** — most categories become full-width and **stack**. ✓ mock
- **phone 390 → 2 cols**; panels full-width, stacked.
- When field cols < a panel's natural span, the panel **shrinks to field width and its tiles
  wrap internally**. Still left-anchored, top-down read order preserved.

**Tile sizing across breakpoints (the fixed-vs-fluid rule):**
- **Desktop (≥1024):** tiles are **fixed 190px**. This is the "never resize" rule from A.2. A
  panel is `N × 190px` and does not stretch or shrink.
- **Below 1024, and especially ≤430px (phone):** tiles are **fluid — `minmax(0, 190px)`**. They
  cap at 190px but **shrink to whatever the column can hold** so a full-width N-column panel fits
  inside the viewport. Concretely, an N-tile row uses
  `grid-template-columns: repeat(N, minmax(0, 190px))` within a panel that is `max-width: 100%`;
  the tiles distribute the available inner width and land at ≤190px each. At phone width a 2-col
  panel therefore renders tiles ~160–171px, not a clamped 190 that would overflow.
- **Why (the v14 bug):** two fixed **190px** tiles + gap 16 + a **48px** left margin = ~444px of
  hard-committed width — wider than a ~390px phone viewport — so v14 pushed content off-screen and
  produced a horizontal page scroll. Fluid columns + the reduced mobile margin (below) fit it.

**Left anchor across breakpoints:**
- **Desktop:** field/panel left edge = **x=48** (unchanged, A.1).
- **Mobile (≤430px, and generally <768):** reduce the left anchor / side gutter to **~16px**.
  48px consumes an eighth of a phone's width; 16px keeps the F-scan's left edge without starving
  content. Panels stay left-anchored to this reduced edge.

**Hard rule — no horizontal PAGE scroll at any width.** The field and every panel must stay
within **100vw** (account for the 16/48px gutters, i.e. effective content width `100vw − 2×gutter`;
`overflow-x` on the page body/field is **not** an escape hatch — it's a defect). If a panel's
natural width exceeds the viewport, its tiles shrink (fluid rule above) or its internal grid wraps
— the **page never scrolls sideways**. The only element permitted to scroll horizontally is the
**Recently Opened rail, and it scrolls _internally_** (its own overflow container), never the page
(see B.2).

### A.5 Category ordering — **usage priority, STABLE re-rank** (Caleb-confirmed)
Order categories by **usage priority (most-used first)** so the F-scan hits the important
things first — but the order must be **stable**, never a live reshuffle on every open-count tick
(that's disorienting). The rule:

- **Ranking key.** Each category's score = the sum of its member apps' opens over a **trailing
  30-day window** (reuse the same per-browser `localStorage` signal that backs Recently Opened —
  this is a per-browser convenience layer, no backend needed).
- **Re-rank trigger = dashboard mount (session start), NOT during a live session.** The order is
  captured on load and **held for the whole session** — opening an app updates the *counts* but
  does **not** reshuffle the visible order until the next load. No live motion on the tick.
- **Debounce: at most one re-rank per 24h per browser.** Store `lastRankAt`; if the last re-rank
  was <24h ago, reuse the committed order. Stops churn from repeated reloads in one day.
- **Hysteresis (anti-jitter).** A category only swaps position with its neighbor when its score
  beats the neighbor's by a margin — **≥15% or ≥3 opens**, whichever is larger. Near-ties hold
  their existing order instead of flip-flopping.
- **Manual placement wins.** If the user has hand-arranged categories in edit/Arrange mode, that
  pinned order **overrides** usage ranking. Usage ordering only applies to categories the user
  hasn't manually placed. (homepad has Arrange mode — respect it.)
- **First run / cold cache** (no usage data yet): fall back to the catalog's existing/default
  category order until enough signal accrues.

> This is per-browser state and a product decision — **it feeds Walt's spec** (storage key,
> window, thresholds are his to ratify). The *behavior* (stable, mount-triggered, debounced,
> hysteresis, manual-override) is the design requirement.

### A.6 Edge cases
- **1-app category** = a 1-col (190px) panel; packs with neighbors.
- **Zero-app category** renders its **empty state inside the panel** — never a 0-col panel.
- **`+ Add apps`** stays as a trailing affordance after the last panel.
- **Uncategorized catalog** (no categories) → a single full-width panel, or the flat tile grid,
  left-anchored the same way.

---

## B. Recently Opened rail (the gap Caleb flagged)

Caleb's note: the existing Recently Opened strip's **icon presentation does not match the new
tile/panel system**. The **sizing is right** (smaller, less data, more precise) — the **shape**
is wrong: it renders as a little **square** (40px icon stacked over a label in a ~64px column),
a different silhouette from the landscape tiles. Fix: keep it compact, but re-shape it to read
as the *same design language* — a **compact recency rail of horizontal chips**, each chip a
miniature of the tile (colored plate + name), just laid out horizontally with less data.

### B.1 Placement
- The rail sits **above the panel field**, **left-anchored to the same x=48 edge** (verified
  in the mock — rail left = field left). It's the first thing on the F-scan: recency is the
  fastest path back to what you were just doing.
- **24px** gap between the rail and the first panel row.
- Order: **rail → panel field → `+ Add apps`.**
- **Hidden** in edit mode, on the empty-dashboard state, and when the resolved recent list is
  empty (unchanged from Walt's cap3 spec — this is a presentation change, not a behavior change).

### B.2 The chip (measured, build-ready)
A horizontal echo of the tile — plate on the left, name on the right — **not a square**:

| Property | Value | Why |
|---|---|---|
| Shape | horizontal rounded rectangle (pill-ish) | matches the tile's landscape silhouette, not a square |
| Height | **44px** | doubles as the touch target — the whole chip is the tap area (≥44 ✓) |
| Width | **hugs content**, `max` name ~150px then truncate | "less data, more precise" |
| Radius | **12px** (`radius-md`) | one step below the 18px tile — same ramp, compact scale |
| Padding | `6px 14px 6px 6px` | tight left for the plate, breathing room right of the name |
| Surface | `rgba(255,255,255,.72)` + `blur(10px)`, border `1px rgba(15,23,42,.06)` | **same glass recipe as the panel**, so it's obviously the same material |
| Shadow | `0 1px 2px rgba(16,24,40,.04), 0 6px 16px -10px rgba(16,24,40,.16)` | **one notch lighter** than the panel's `0 12px 28px` — reads as subordinate to the catalog |
| Plate (icon) | **28×28**, radius **8px** (`radius-sm`) | the 44px tile plate scaled down; same colored-plate token |
| Gap plate→name | **8px** | 8pt grid |
| Name | **14px / 600**, ink, single line, ellipsis | one step below the tile's 15/700; primary-legible |
| Metadata | **name only — drop the tile's `sub`/source line** | this is Caleb's "less data" |

- **Rail label:** "Recently opened", **12/700, uppercase, `.7px` tracking**, color **neutral-500
  `#737373` (4.74:1 on white ✓)** — never neutral-400 (2.52:1, fails; our standing system rule).
- **Chips:** flex row, **gap 12px**, left-anchored, single line; the rail is its **own
  horizontal-scroll container** (`overflow-x:auto` on the rail, chips `flex-shrink:0`) so on
  narrow viewports the **chips scroll _inside_ the rail — never the page**. The rail's box stays
  within 100vw; only its contents scroll (unchanged intent from cap3 AC-011, restated as the
  page-level hard rule in A.4). This is the *only* element allowed to scroll sideways.
- **`Clear`** control: trailing, right side of the rail header, 12/600 neutral-500.

### B.3 Why this reads as the same system, one register quieter
- **Same material** (identical glass fill/blur/border as the panel) and **same colored plate**
  token as the tile — instant family resemblance.
- **Same internal grammar** as the tile (plate + name), just rotated to horizontal and stripped
  to one line — so it's legibly a *tile, compacted*, not a new component.
- **Deliberately lighter** (shadow one notch down, height 44 vs 134, no sub-line) so it never
  competes with the catalog for hierarchy (principle #4): recency is a shortcut, the panels are
  the catalog.
- **44px height** turns the compactness into a passing touch target rather than a liability
  (principle #3) — an improvement on the current ~square whose tap area was incidental.

---

## Proposed design-system principle (new — for the doc)
**Left-anchor to the F-scan.** Anchor blocks of scannable items (tiles, list rows, cards, the
recency rail) to a single left edge and order them along the F-scan (top-left → right, down, →
right). **Do not center scannable grids/lists** — centering floats the left edge and forces the
eye to re-acquire it on every row. Centering is for a single focal element (empty-state, modal,
hero), not for collections. *(Supersedes "center sparse rows" from 2026-06-30.)*

Corollary (from B): **a compact variant of a component keeps the parent's material and grammar,
drops data and one elevation step — never changes its silhouette into a different shape.**

---

## Verification (from the refreshed mock, measured)
- Rail left edge **x=48** == field left edge **x=48** — same anchor. ✓
- Recency chip renders **120.8×44px**, radius **12px**, plate **28×28**, name **14/600**,
  label neutral-500 **#737373 (4.74:1)** — all as specced; touch target ✓, contrast ✓.
- Field left edge x=48; **every panel row starts at x=48** — left-anchored. ✓
- Row 1: two 3-col panels side by side. Row 2: 4-col panel + wrap. Row 3: 2-col + 2-col. ✓
  (Original mock showed a 6-col full-field row; under the v14.1 4-col ceiling a 5–8 app category
  is a 4-col panel that wraps to a second internal row instead.)
- All tiles render **190px** (single value) — no enlargement vs the current 218px stretch. ✓
- iPad 768: rail chips scroll; the two 3-col panels stack full-width, same left edge. ✓
- **Phone ≤430 (mobile rule, to re-verify against Stitch's fix):** a full-width panel + tiles must
  fit within 100vw with **no horizontal page scroll**; tiles render **≤190px (fluid)**, left anchor
  **~16px**, and only the Recently Opened rail scrolls (internally). I'll re-shoot phone widths and
  measure `document.documentElement.scrollWidth === clientWidth` (no page overflow) once the
  `homepad-v14-mobile-overflow` fix lands.

---
*Design go from me on both A and B. This is spec input for Walt (wrap the ordering/storage
call into product), then a build for Stitch. When the shipped result diverges, this doc gets
updated in the same breath so it never drifts.* — Kare
