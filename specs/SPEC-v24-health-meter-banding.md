# Homepad v24 — Health-Panel Meter: Status-Banded Tick Strip

**Spec ID:** SPEC-v24-health-meter-banding
**Created:** 2026-07-14
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare §8 design section
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

*This section is reserved for Kare's design input. Walt has dispatched Kare on task
`kare-v24-meter-banding-design`. The spec is cleared for Kare's review but NOT cleared for build
until both co-signs are recorded below.*

Required design inputs:
- Confirm GREEN → GRAY → RED left-to-right is the correct spatial read (or reverse: RED → GRAY →
  GREEN right-to-left, with problems at the left edge).
- Position on DEGRADED: confirm fold-into-RED (3 bands) or advocate for AMBER (4 bands). This is
  the gate-holding open question.
- Any visual separator between bands? A 1px gap or subtle divider between the GREEN and GRAY
  regions, and between GRAY and RED? Or pure color change? Pure color change is simpler; a
  hairline gap makes the boundary clearer when the two colors are similar (e.g., gray vs. red in
  low-contrast modes).
- Dark/light mode: confirm the three band colors read distinctly in both modes at the 2px minimum
  tick width.

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
- [ ] **Kare** — design go. *(§8 reserved above; dispatched 2026-07-14)*
