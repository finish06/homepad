# Spec: Large-Monitor Grid & Layout Alignment

**Issues:** Code/homepad #194 (grid inversion) · #196 (width misalignment) · #195 (name truncation — resolved by #194)  
**Version:** 1.0  
**Date:** 2026-06-29  
**Status:** APPROVED — Walt (product) ✓ · Kare (design) ✓  
**Authors:** Walt (product lead) + Kare (UX/design)  
**Audience:** Stitch (implementer) · Gracie (tech-QA)  
**Repo:** `Code/homepad` — frontend only. No backend changes.  
**Scope:** Authed dashboard at wide viewports (≥1024px focus; 2560px is the failing case).  
Phone / tablet (< 640px) and standard desktop (≤1024px) layouts are solid — **no changes to those breakpoints.**

---

## 1. Problems

### 1a. Grid inverts at 2xl (#194, companion #195)

`Catalog.tsx:473` today:
```
grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6
```
The `2xl:grid-cols-6` fires at 1536px+, but the content container (`App.tsx:81`) is capped at
`max-w-6xl` (1152px). On a 2560px monitor the container is still 1152px — it never widens.
Result: 6 columns inside a 1152px container → **~173px per tile**, narrower than the 4-column
1024px iPad (236px per tile). A larger monitor produces smaller tiles. Names truncate (issue #195).

The inversion is the root cause. No separate fix is needed for #195; fixing #194 restores
adequate tile width at all large-monitor sizes.

### 1b. Header, StatusBar, and grid use different width systems (#196)

At 2560px the three horizontal layers have no shared container edge:

| Layer | Outer element | Inner content constraint |
|-------|---------------|--------------------------|
| Header | Full-bleed `<header>` (full viewport width) | `max-w-6xl` inner div |
| StatusBar | Full-bleed `<div>` (full viewport width) | **No inner constraint — content floats center** |
| Grid section | `mx-auto max-w-6xl` `<section>` | Same 1152px cap |

At 1152px viewport all three read as aligned. At 2560px the grid's left edge sits ~700px from the
viewport left, the header wordmark lines up with it, but the StatusBar text centers at 1280px — a
visible gap between layers.

---

## 2. Product decisions

### Grid approach (#194) — Walt's call

Three options were on the table:

**(a)** Grow tiles only — keep 4 columns, bigger tiles, dead space grows.  
**(b)** Widen container + columns grow in step via auto-fill. ← **Selected**  
**(c)** Cap and center with intentional whitespace — preserves current broken state.

**Decision: (b) — widen the content container and let columns accumulate naturally as the container
grows, using `auto-fill`.** Rationale:

- Homepad is a personal launcher. The primary user task is recognizing and tapping a tile quickly —
  tiles need a readable label, not just more whitespace.
- Option (a) produces 4 very wide tiles at 2560px — wasted space without density benefit.
- Option (c) is the current state, which is the bug we're fixing.
- `auto-fill` is architecturally correct: column count rises *because there is room*, not because
  a hard breakpoint fires at an arbitrary viewport width against a fixed-width container.

### StatusBar IA (#196) — Walt's call

Two options:
- Fold the status summary into the header nav bar.  
- Keep it as a strip, fix the alignment. ← **Selected**

**Decision: StatusBar stays as a separate strip below the sticky header.** Rationale:

- The header is navigation: wordmark, search, user menu. Fleet health is a secondary, read-only
  information tier. Merging them mixes concerns and crowds the primary nav on small viewports.
- The StatusBar is already "quiet" — text-xs, neutral colors, 6px vertical padding. It is not
  heavy; it reads as heavy at 2560px only because the full-bleed background stretches to fill
  the gap when content is not aligned. Alignment fixes the perception without restructuring the IA.
- "Quiet inline summary" (above the grid) would lose the strip's role as a secondary visual tier
  and bury fleet health inside the content area.

The "X not monitored" count stays in the StatusBar. No IA change.

---

## 3. Acceptance Criteria

### Grid (#194)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | At any viewport ≥1024px, the tile width on a 2560px monitor must be **equal to or greater than** the tile width on a 1024px display. The current inverted scaling (wider viewport → narrower tile) is eliminated. | Must |
| AC-002 | At 1024px viewport, the grid renders **4 columns** — unchanged from today. | Must |
| AC-003 | At 1280px viewport, the grid renders **5 columns**. | Must |
| AC-004 | At 1440px and above, the grid renders **6 columns**, with each tile ≥210px wide. | Must |
| AC-005 | At 2560px, a standard 1–2 word app name does not truncate on its tile. | Must |
| AC-006 | The `2xl:grid-cols-6` Tailwind class (or any equivalent that jumps to 6 fixed columns inside a sub-1200px container) is removed. Column count must not be driven by a viewport-only breakpoint independent of container width. | Must |
| AC-007 | Mobile (< 640px) and sm (640–1023px) grid layouts are **unchanged**: 2 cols and 3 cols respectively. | Must |

**Implementation note for Stitch:** The grid at `lg+` should use `repeat(auto-fill, minmax(220px, 1fr))`
(or the nearest value that satisfies AC-002 through AC-004 in a 1440px container). The exact CSS
class is Stitch's call; Kare's design system §4 records the grid rule as the reference.

### Container alignment (#196)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-008 | The header wordmark's left edge, the StatusBar content's left edge, and the dashboard grid's left edge are **visually aligned** at all viewports ≥640px. | Must |
| AC-009 | All three layers — `AppHeader.tsx` inner div, StatusBar content, `App.tsx` grid section — use a **single shared content-width class** (the same max-width value as the new grid container). Separate max-width declarations that could diverge over time are not acceptable. | Must |
| AC-010 | The StatusBar's full-bleed background stripe remains full-bleed (it should span the viewport for the visual strip effect). Only the inner content — the segment text — is constrained to the shared content width. | Must |
| AC-011 | The StatusBar remains a **separate strip below the sticky header**, not merged into the header element. Its vertical position, styling, and content are unchanged; only the content container is added. | Must |
| AC-012 | "X not monitored" remains in the StatusBar (not moved to header or inline above grid). | Must |

**Implementation note for Stitch:** Wrap the StatusBar segment text in a `div` with `mx-auto
max-w-[1440px] px-4` (or the shared content class) matching the updated App.tsx section and
AppHeader.tsx inner div. Then change the outer StatusBar div from `text-center` to `text-left`
(or keep `text-center` if the content is short enough to read as centered within the constrained
box — Kare's call). Coordinate with the shared class constant so all three containers stay in sync.

---

## 4. Affected files

| File | Change |
|------|--------|
| `src/App.tsx:81` | Change `max-w-6xl` → shared content-width class (~1440px) on the grid section |
| `src/AppHeader.tsx:67` | Change `max-w-6xl` → same shared content-width class |
| `src/StatusBar.tsx:31` | Wrap inner content in a `mx-auto [shared-class] px-4` div |
| `src/Catalog.tsx:473` | Replace `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6` with `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]` (or equivalent satisfying ACs) |

No API changes. No test fixtures change. No backend changes.

---

## 5. Out of scope

- Phone / iPad / standard desktop (< 1024px) layout — these are solid, ship as-is.
- Ultra-wide (5K / 8K / dual-monitor) viewports beyond 2560px — not a homelab monitor profile.
- Typography scale, tile padding, or icon size changes at large viewports.
- Any refactor of the StatusBar component beyond the inner container wrapper.
- Any Gatus / monitoring behavior change.

---

## 6. Test cases

### TC-001: No inversion at 2560px

**Viewport:** 2560px (browser devtools, or physical 2560px monitor in staging).  
**Steps:**
1. Log in to staging. Navigate to dashboard with ≥6 tiles.
2. Inspect tile width at 2560px.
3. Inspect tile width at 1024px.

**Expected:** tile width at 2560px ≥ tile width at 1024px. Both ≥210px.

---

### TC-002: Column counts at key breakpoints

**Steps:** Resize staging browser through 640px, 1024px, 1280px, 1440px, 2560px.

| Viewport | Expected column count |
|----------|-----------------------|
| 400px | 2 |
| 640px | 3 |
| 1024px | 4 |
| 1280px | 5 |
| 1440px | 6 |
| 2560px | 6 |

**Expected:** column count matches table exactly at each width.

---

### TC-003: Name truncation gone at 2560px

**Viewport:** 2560px.  
**Precondition:** At least one tile whose name is 10–15 characters (e.g. "Proxmox VE" or "Home Assistant").  
**Expected:** Name renders fully, no `…` or clip.  
**Maps to:** Issue #195 (resolved by #194 fix).

---

### TC-004: Content edges aligned at 2560px

**Viewport:** 2560px.  
**Steps:** Screenshot the full dashboard above the fold. Draw a vertical reference line at the left
edge of the grid's first tile column.  
**Expected:** Header wordmark left edge and StatusBar text left edge both align to that reference
line (within ±4px tolerance).

---

### TC-005: Existing breakpoints unchanged

**Steps:** Resize through 400px, 600px, 640px, 768px, 1024px. Compare visually to current staging
screenshots (filed by Gracie in her QA artifacts).  
**Expected:** No visible change to layout at these viewports vs. v12.3.x baseline.

---

## 7. Design system note

Kare has recorded the auto-fill grid rule in `DESIGN-SYSTEM.md §4` as **PENDING validation**.
Walt's product sign-off (this spec) satisfies the "product lead" gate. **Caleb's validation (via
Joe) remains outstanding** before §4 becomes source-of-truth. Stitch may build against this spec's
ACs now; if Joe/Caleb redirect the grid rule, this spec will be updated before ship.

---

## 8. Sign-off

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | ✓ APPROVED 2026-06-29 |
| Design / UX | Kare | ✓ APPROVED 2026-06-29 |
| Design system §4 (Caleb/Joe gate) | Joe → Caleb | ⏳ PENDING |

**This spec is approved for Stitch to build against.** The Caleb/Joe gate on DESIGN-SYSTEM.md §4
is a parallel track and does not block the build — this spec's ACs are the implementation contract.

---

## 9. Revision history

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-29 | 1.0 | Walt + Kare | Initial spec — grounded in live code review of `Catalog.tsx:473`, `App.tsx:81`, `AppHeader.tsx:67`, `StatusBar.tsx`. Product calls: grid option (b), StatusBar stays as strip. |
