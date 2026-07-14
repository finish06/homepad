# Homepad v24 — Health-Panel Meter: Status-Banded Tick Strip

**Spec ID:** SPEC-v24-health-meter-banding
**Created:** 2026-07-14
**Author:** Walt (product lead)
**Status:** Draft — Kare §8 authored + design GO; awaiting Walt product go + Caleb's DEGRADED decision
**Repos:** `Code/homepad` (frontend only — render-order change in the health panel)
**Estimate:** ~1–2 hours Stitch
**Target version:** v15.x (ships as part of v15 build, or as the first v15 patch)
**Depends on:** SPEC-v15-product-scope.md §3.2 (the health panel and meter exist before this spec applies)

---

## 1. Problem

The v15 health panel introduces a tick-strip meter (§4.4 of the design spec): one colored tick per
service, rendered left-to-right. Ticks are purely decorative (`aria-hidden`); the chips carry the
accessible counts. In the unspecified default order, ticks follow the user's personal layout
sequence — green, gray, red, green, red, gray, etc. — interleaving all three status groups.

Caleb's request: *"the health meter should explore keeping all green together, all idle together
and all offline together. That would mean GREEN / GRAY / RED."*

Interleaved order tells you individual positions but not the **distribution**. A user glancing at a
live dashboard should immediately read "mostly green, a sliver of gray, nothing red" — the visual
weight of each color band carries the message at a glance. Interleaved rendering buries that.

---

## 2. What this spec changes

**One thing:** the order in which ticks are rendered inside the `.ticks` strip.

| Before | After |
|---|---|
| Ticks in user's personal layout order (service position in the grid) | Ticks grouped into three contiguous color bands: all GREEN (UP), then all GRAY (idle/not-monitored), then all RED (offline/down) |

Nothing else changes:
- The health panel's LED, headline, and sub-line are unchanged.
- The count chips (online / not-monitored / offline) are unchanged.
- The legend and "updated Xs ago" label are unchanged.
- The tile grid and layout order are unchanged.
- The chips' quick-peek popover behavior is unchanged.
- The meter remains `aria-hidden` (decorative) — the chips carry the numbers.

---

## 3. Banding model

### 3.1 Band order (left → right)

```
[ ████████████████ GREEN ][ ████ GRAY ][ ██ RED ]
         UP             NOT_MONITORED   DOWN / DEGRADED
```

Healthy-first: a mostly-operational fleet reads as a long green bar. Problems appear at the right
edge, where the eye can quickly measure severity by band width.

### 3.2 Status → band mapping

| Wire status | Band | Color |
|---|---|---|
| `UP` | GREEN | `up` (emerald) |
| `NOT_MONITORED` | GRAY | `idle` (neutral) |
| `UNKNOWN` | GRAY | `idle` (neutral) |
| `DOWN` | RED | `down` (red) |
| `DEGRADED` | RED | `down` (red) — **see §3.3 open question** |

`UNKNOWN` joins GRAY (not RED) because it is a monitoring-infrastructure signal — the service
hasn't been confirmed down, only unobservable. This matches the StatusBar's existing exclusion
rationale (StatusBar.tsx header comment) and keeps the RED band a firm signal of known failure.

### 3.3 Open question: DEGRADED in its own AMBER band?

The v15 design has an amber LED for "degraded only, no down" — DEGRADED is visually distinct from
DOWN at the LED and chip level. A 4-band meter (GREEN → GRAY → AMBER → RED) would extend that
distinction into the tick strip. A 3-band meter (GREEN → GRAY → RED, with DEGRADED in RED)
matches Caleb's literal "GREEN / GRAY / RED" request and is simpler.

**Recommendation: fold DEGRADED into RED (3 bands).** Caleb said three bands explicitly. The LED
and chip already carry the amber severity signal; the meter is tertiary texture (`aria-hidden`),
not the primary diagnostic. Adding a fourth amber band increases visual complexity for marginal
gain. A DEGRADED service IS unhealthy — red in the meter is honest.

**Caleb should confirm** before Stitch builds. If the answer is "give DEGRADED its own amber
band," the spec becomes a 4-band order: GREEN → GRAY → AMBER → RED, and Kare must update §8.
This decision gates the build.

### 3.4 Within-band tick order

Within each band, ticks are sorted by the **service's position in the user's personal layout**
(the same order the tiles appear in the grid). This means:
- A service that was tile #3 (layout index 2) appears before a service that was tile #7 (layout
  index 6), regardless of both being in the same band.
- The user's deliberate arrangement is preserved within bands; only the status-grouping is imposed
  at the band level.
- On a data refresh, if a service changes status its tick moves to the new band — but its
  position within the new band remains determined by layout index, so there are no arbitrary jumps.

Alternative considered: alphabetical sort within bands (like the quick-peek popover). Rejected —
a user who has arranged tiles carefully expects that arrangement to be reflected across all views of
the same data. Layout-order is the stable, user-visible identity of the service.

---

## 4. Interaction with existing panel elements

**Chips (count buttons):** count of UP / NOT_MONITORED / DOWN+DEGRADED services. No change.
The chips are the accessible numbers; the meter is visual-only texture. The two are independent.

**Legend:** shows colored swatches + labels + "updated Xs ago." No change needed. The banded meter
actually makes the legend more accurate — each swatch now corresponds to a visually contiguous
region of the meter, making the legend legible where it previously described an interleaved mess.

**LED + headline:** no change. They reflect aggregate state; the meter reflects distribution.

**Freshness / stale state:** no change. When data is stale, the freshness label color changes per
v15 spec AC-V15-016; the meter banding is unaffected.

---

## 5. Edge cases

| Scenario | Expected behavior |
|---|---|
| **All services UP** | Single full-width GREEN band. No gray or red segment visible. |
| **All services NOT_MONITORED** | Single full-width GRAY band. No green or red segment visible. |
| **All services DOWN** | Single full-width RED band. No green or gray segment visible. |
| **Zero DOWN services** | RED band is absent. Strip ends with the GRAY band (or GREEN if also zero gray). No gap or placeholder. |
| **Zero NOT_MONITORED services** | GRAY band absent. GREEN and RED bands are adjacent. No gap. |
| **Zero UP services** | GREEN band absent. Strip starts with GRAY (or RED if also zero gray). |
| **Single service** | One tick, the color of that service's status. |
| **Loading state** | All ticks are neutral placeholders (`--faint` or skeleton) per v15 §4.2. Banding is not applied during load (no real statuses yet). |
| **Empty state** | Meter is hidden per v15 AC-V15-015. No change. |
| **Live refresh changes a service status** | That service's tick moves to the correct band immediately on data update. No transition animation needed (meter is decorative). |

---

## 6. Accessibility

The meter remains `aria-hidden="true"` (purely decorative). The chips above it carry the
accessible count and are interactive (v16 quick-peek popover). Banding does not change this.

Screen readers see: "39 UP · 8 not monitored · 0 DOWN" (the chip labels). They do not read the
tick strip. No ARIA changes required.

---

## 7. Implementation notes (for Stitch)

The change is localized to the meter's tick-rendering logic inside the v15 health panel component
(to be built — not yet in the codebase). The sort is a pre-render computation, not a data-model
change.

Pseudocode:
```ts
const BAND_ORDER: ServiceStatus[] = ['UP', 'NOT_MONITORED', 'UNKNOWN', 'DOWN', 'DEGRADED'];
// Sort services into band order, preserving layout-index order within each band
const bandedServices = [...services].sort((a, b) => {
  const bandA = BAND_ORDER.indexOf(a.status);
  const bandB = BAND_ORDER.indexOf(b.status);
  if (bandA !== bandB) return bandA - bandB;
  return a.layoutIndex - b.layoutIndex; // within band, preserve layout order
});
// Render one tick per bandedServices entry
```

`layoutIndex` = the service's position in `ctx.items` (the already-ordered services array from
`useServicesContext()`). No new API field needed — the array order IS the layout order.

The sort is stable (layout index breaks ties deterministically), pure (no side effects), and cheap
(O(n log n) on ≤200 services; effectively instant).

---

## 8. Design section (Kare)

*Design owner: Kare. Grounded in measured values (WCAG relative-luminance computed from the
homepad status tokens) — not eyeballed. The meter is `aria-hidden` decorative texture, so WCAG
contrast is not a legal gate here, but the whole point of the feature (§1) is that the distribution
**reads at a glance**, so band legibility and separation ARE the design requirement, and I hold them
to a measured bar.*

**Token reference (the existing homepad status palette these ticks inherit):**

| Band | Status | Tick color (light) | Tick color (dark) | Source token |
|---|---|---|---|---|
| GREEN | `UP` | `#10b981` emerald-500 | `#10b981` emerald-500 | `alerts.tsx`, `CommandLauncher.tsx` |
| GRAY | `NOT_MONITORED` + `UNKNOWN` | `#737373` neutral-500 | `#a3a3a3` neutral-400 | `index.css` idle tokens — **mode-aware, see §8.D** |
| RED | `DOWN` + `DEGRADED` | `#ef4444` red-500 | `#ef4444` red-500 | `alerts.tsx`, StatusBar popover |

### 8.A Spatial direction — CONFIRM GREEN → GRAY → RED, left → right

Confirmed as specced. Three grounded reasons, in priority order:

1. **It must match the chips and legend.** The count chips render `online → not-monitored → offline`
   left-to-right, and the legend swatches sit in that same order. The meter is the visual echo of the
   chips; if the meter reversed, the legend swatch order would no longer map onto the meter regions
   and §4's "the legend now describes contiguous regions" win evaporates. Consistency (design
   principle 8) settles this on its own.
2. **Reading order + the healthy baseline.** In an LTR locale the eye anchors at the left. The common
   case for a homelab is a mostly-green fleet, so a left-anchored green bar establishes a calm,
   positive baseline; anomalies accrue toward the right edge where the eye finishes and can *measure*
   the red band's width against the strip end.
3. **The meter is not the alarm.** Problems don't need to be first here — the LED and headline are the
   primary diagnostics and already pull the eye to trouble. The meter is tertiary distribution
   texture; putting RED first would over-weight a decorative element and fight the LED for attention.

Reversal (RED → GRAY → GREEN) is rejected: it would break chip/legend mapping for a marginal
"problems first" gain the LED already delivers.

### 8.B DEGRADED — CONFIRM fold-into-RED (3 bands). This resolves the §3.3 gate. ✅

**Recommendation: 3 bands, DEGRADED in RED.** This is not just deferring to Caleb's literal request —
it is the *consistent* answer, because homepad already folds DEGRADED into red everywhere the signal
is a **count / distribution** rather than a single service's identity:

- The **count chips** count `DOWN + DEGRADED` together (spec §4; the "offline" chip).
- The **v16 quick-peek popover** renders DEGRADED with a **red** dot, not amber (AC-011 / A16-9,
  `StatusBar.tsx` `PeekStatus = 'DOWN_DEGRADED'`; changelog: *"Degraded services now show a red dot
  in the quick-peek popover, matching down"*).

The meter is the third member of that same family (chips + popover + meter = the three
distribution/aggregate views). Amber is reserved for two places, and both are **per-identity**
signals, not distributions: the aggregate **LED** ("degraded-only" amber state) and the **individual
tile status dot**. A DEGRADED service *is* unhealthy; red in the distribution meter is honest, and it
keeps the meter reading identically to the chips sitting right above it. A 4th amber band would make
the meter contradict its own chips — a consistency defect, not a feature.

**Contingency — IF Caleb overrides to 4 bands (GREEN → GRAY → AMBER → RED):** the design is specified
and ready, so this decision does not have to bounce back to me. The AMBER band is **mode-aware**, same
pattern as the existing admin-amber token in `index.css`:

| Amber tick (light) | Amber tick (dark) | Measured |
|---|---|---|
| `#d97706` amber-600 | `#fbbf24` amber-400 | amber-400 on white is only 1.67:1 (pale, illegible) → light mode MUST step down to amber-600 (`index.css` already uses `#d97706` for light amber). amber-400 vs dark-panel = 10.3:1 ✓. |

Amber-400 (Y=0.579) sits a clear luminance step above red-500 (Y=0.229) and above the grays, so the
AMBER|RED and GRAY|AMBER boundaries hold. But I do **not** recommend this path — it buys per-band
DEGRADED visibility the LED already provides, at the cost of chip/meter divergence.

### 8.C Band boundary — 1px track-gap seam at the two band transitions (NOT a colored divider, NOT per-tick)

**This is the finding, and it is measured.** Emerald-500 and the idle neutral are **luminance twins**:
`Y = 0.364` (green) vs `0.366` (neutral-400) — a **1.01:1** luminance contrast. The GREEN|GRAY
boundary therefore carries on **hue alone**, with a zero luminance step. At a 2px tick width, and for
the ~8% of users with red-green CVD, a hue-only edge between emerald and neutral is a genuine "where
does green end?" ambiguity — exactly the glance-read the feature exists to deliver.

**Decision:**
- **If the `.ticks` strip already renders a uniform inter-tick gap** (track showing through between
  every tick — common for tick strips): do **nothing extra**. That existing gap already lands a
  luminance seam of the panel background at the boundary; the hue change plus the gap is unambiguous.
  Keep the gap uniform — do not widen it at boundaries (that would distort the proportional read).
- **If ticks are butted with no gap** (solid color regions): insert a **1px gap that reveals the
  strip's track/background** at the GREEN|GRAY and GRAY|RED transitions **only**. This is a *gap*, not
  a drawn line — it inserts the panel's own luminance (near-black in dark, white in light) as a seam
  precisely where meaning changes, so the boundary is unmissable in **both** modes and under CVD.

**Why a gap, not a colored divider, and only at boundaries:** a drawn divider adds a fourth ink color
and reads as a mark; a track-gap is negative space. Total non-data ink is ≤2px across the whole strip
(two boundaries), so the proportional-area read that §1/TC-001 depend on stays honest to within a
fraction of one tick. Pure color-change alone is rejected **only** at GREEN|GRAY on the measured 1.01:1
finding; GRAY|RED and (contingency) the amber edges have real hue+luminance separation and would
survive pure color-change, but applying the seam uniformly at all boundaries is simpler and consistent.

### 8.D Dark / light distinguishability at 2px — YES, but the gray band MUST be mode-aware

At 2px each tick has almost no area, so a tick that merely "passes contrast" as a big block can still
vanish as a hairline. Measured tick-vs-panel separation:

| Tick | on light `#fff` | on dark panel `~#161b26` |
|---|---|---|
| green `#10b981` | 2.54 | 6.79 |
| red `#ef4444` | 3.76 | 4.58 |
| gray **neutral-400** `#a3a3a3` | **2.52 (faint on white)** | 6.83 |
| gray **neutral-500** `#737373` | **4.74** | 3.63 |

Green and red are fine in both modes. **The gray is the trap:** a single fixed gray fails one mode —
neutral-400 is faint on white (2.52), neutral-500 is the weaker choice on the dark panel (3.63, still
acceptable). **Requirement (MUST):** the idle/gray band is a **mode-aware token** — `#737373`
neutral-500 in light, `#a3a3a3` neutral-400 in dark — so it reads on its own surface in each mode.
This mirrors how homepad already flips its idle neutrals by mode; the meter must inherit that, not
hard-code one gray. With the mode-aware gray + the §8.C boundary seam, all three bands separate from
their panel and from each other in both modes. (Note the measured caveat that drove §8.C: green and
the idle neutral never separate by *luminance* — separation is hue + the boundary seam, never
luminance alone.)

### 8.E Single-tick (and all-one-band) edge case — acceptable, with a faint track recommended

A lone `2px × 26px` tick floating in an otherwise-empty strip risks reading as a **stray 1-2px line /
render artifact** rather than "a meter showing one healthy service." Same concern for a very small
fleet (2-3 ticks). Because the meter is `aria-hidden` and the LED + chips carry the real, accessible
signal, this is **not a blocker** — but it is worth designing:

- **Recommendation (advisory):** render the `.ticks` strip on a **faint always-present track** (a
  `26px`-tall rail at `--faint`/hairline). The track gives the meter a bounded frame, so even a
  1-tick or all-one-band strip reads as *"a full meter, one entry"* instead of a floating sliver, and
  the "band fills the whole strip" edge cases (§5 all-UP / all-DOWN) read as a deliberate full bar
  against the rail rather than an unbounded block. This also gives the §8.C track-gap seam something
  to reveal.
- **Do not** special-case n=1 by widening the tick — that would make one service's tick a different
  width from every other service's, breaking the one-tick-per-service invariant (AC-V24-002 spirit)
  and the proportional read.

### 8.F Summary of design decisions (for Stitch)

| # | Decision |
|---|---|
| A | GREEN → GRAY → RED, left → right. **Confirmed.** |
| B | **3 bands** — DEGRADED folds into RED. Gate resolved (pending Caleb's confirm). 4-band amber contingency fully specced above if he overrides. |
| C | Boundary = **1px track-gap seam** at GREEN\|GRAY and GRAY\|RED (or the existing uniform inter-tick gap if one exists). Not a colored divider. Driven by the measured 1.01:1 green/gray luminance twin. |
| D | Distinguishable in both modes **iff** the gray band is a **mode-aware token** (neutral-500 light / neutral-400 dark). MUST. |
| E | 1-tick strip acceptable (meter is decorative); render on a **faint track** so small/single-band strips read as intentional. Advisory. |

---

## 9. Acceptance criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-V24-001 | The health panel meter renders ticks in three contiguous color bands: all `UP` (green) ticks first, then all `NOT_MONITORED` + `UNKNOWN` (gray) ticks, then all `DOWN` + `DEGRADED` (red) ticks. Ticks never interleave across bands. | Must |
| AC-V24-002 | Within each band, ticks appear in the same relative order as the services appear in the user's tile grid (layout order). A service at grid position N appears before a service at grid position N+k within the same band. | Must |
| AC-V24-003 | When a band has zero services, it is absent from the strip. The strip has no gap, empty space, or placeholder where the absent band would have been. The remaining bands expand to fill the available width. | Must |
| AC-V24-004 | A fleet that is all-UP renders as a single unbroken green strip. A fleet that is all-DOWN renders as a single unbroken red strip. | Must |
| AC-V24-005 | On a live-data refresh, a service whose status changes moves its tick to the correct band immediately. The meter reflects the new data without a page reload. | Must |
| AC-V24-006 | The meter remains `aria-hidden="true"`. Screen readers read the chip counts (e.g. "39 UP · 8 not monitored"), not the individual ticks. | Must |
| AC-V24-007 | The count chips, legend, LED, headline, and sub-line are unchanged from the v15 spec. The banding is isolated to the meter tick order. | Must |
| AC-V24-008 | Loading state: ticks are neutral placeholders, as per v15 §4.2. Band-order sort is not applied until real status data is available. | Must |
| AC-V24-009 | Empty state: meter is hidden, as per v15 AC-V15-015. No change to empty-state behavior. | Must |
| **AC-V24-010** | **[PENDING CALEB'S DECISION on §3.3]** If the decision is 3 bands: `DEGRADED` ticks appear in the RED band. If the decision is 4 bands: a distinct AMBER band appears between GRAY and RED, containing all `DEGRADED` ticks. Kare's §8 must record the design treatment for the chosen option before build begins. | Must — gates build |

---

## 10. User test cases

### TC-001: Distribution reads at a glance

**Precondition:** Fleet has 39 UP, 8 NOT_MONITORED, 0 DOWN.

**Steps:**
1. Open homepad dashboard. Observe the health panel meter.

**Expected:** The strip is visually ~83% green (39 of 47 ticks), then ~17% gray (8 ticks). No
red. The distribution is immediately readable without counting ticks.

**Maps to:** AC-V24-001, AC-V24-004

---

### TC-002: Status change moves tick to correct band

**Precondition:** Fleet has 39 UP, 8 NOT_MONITORED, 0 DOWN. One UP service goes DOWN between
refresh intervals.

**Steps:**
1. Wait for the next live-refresh cycle (homepad auto-polls status).
2. Observe the meter.

**Expected:** The green band shrinks by one tick; a red band appears (1 tick) at the right end.
The gray band (8 ticks) remains between green and red. No reload required.

**Maps to:** AC-V24-001, AC-V24-005

---

### TC-003: Zero-band gap check

**Precondition:** Fleet has 39 UP, 0 NOT_MONITORED, 1 DOWN.

**Steps:**
1. Open homepad dashboard. Observe the meter.

**Expected:** The strip is green (39 ticks) immediately followed by red (1 tick) — no gray
segment, no gap between the green and red regions.

**Maps to:** AC-V24-003

---

### TC-004: Layout order preserved within band

**Precondition:** Services A, B, C, D in layout positions 1, 2, 3, 4. A and C are UP; B and D
are NOT_MONITORED.

**Steps:**
1. Open homepad dashboard. Observe the meter.

**Expected:** Green band = tick-A then tick-C (layout order 1, 3). Gray band = tick-B then tick-D
(layout order 2, 4). Caleb's layout intent is preserved within each band.

**Maps to:** AC-V24-002

---

## 11. Out of scope

- Alphabetical sort within bands (layout-order preserved per §3.4).
- Animated transitions when a tick moves bands on status change (decorative element; instant update).
- Per-band width labels or tooltips on the meter (chips carry the numbers; meter is texture).
- Any change to the tile grid order (tiles remain in layout order, only the meter sorts by status).
- Any change to the chip quick-peek popover sort (remains alphabetical by name, unchanged).

---

## 12. Co-sign (records the gate — NOT cleared for build until both signed)

- [ ] **Walt** — product go. *(pending Kare §8 and Caleb's DEGRADED decision)*
- [x] **Kare** — design go. *(§8 authored 2026-07-14. Design GO on the banding model with three
  MUST requirements baked into §8: (D) the gray band is a mode-aware token — neutral-500 light /
  neutral-400 dark; (C) a 1px track-gap seam at band boundaries, driven by the measured 1.01:1
  green/gray luminance twin; (B) 3 bands, DEGRADED in RED, consistent with the chips + v16 popover.
  4-band amber contingency is fully specced in §8.B should Caleb override. Advisory (E): render the
  strip on a faint track.)*
