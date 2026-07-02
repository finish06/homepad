# SPEC — #242: Per-Tile Status Dot on App Grid Tool Tiles

**Spec ID:** SPEC-242-per-tile-status-dot
**Date:** 2026-07-02
**Author:** Walt (product lead) · Kare (design lead — §5 Design section is Kare's, co-owned)
**Status:** Draft — dispatching to Kare for §5 (visual spec); locked for Stitch after both co-sign
**Repo:** `Code/homepad` (frontend only — no backend changes)
**Issue:** #242
**Parent spec:** `SPEC-app-grid.md` + `SPEC-app-grid-fixed-tiles.md` (Amendment A1)

---

## 1. Problem

The App Grid design spec (`SPEC-app-grid.md` §6 + Amendment A1) specifies the box/tile visual language but does **not** explicitly call out per-tile status indicators. In the outgoing v14 floating-panel layout (`Catalog.tsx`), every tile carries a small colored dot in its top-right corner showing the live health of that service (UP/DOWN/DEGRADED/not-monitored/unknown). Kare's App Grid audit (#242) flagged that this indicator is absent from the App Grid tile spec.

Caleb: "restore." This spec formalizes the per-tile status dot as a first-class requirement of the App Grid tool tile.

---

## 2. What the user sees today

The existing v14 floating-panel `Catalog.tsx` has a per-tile status dot:
- 9px solid circle, absolute-positioned top-right of the tile
- Color: emerald (UP), red (DOWN), amber (DEGRADED), gray (UNKNOWN), dashed neutral ring (NOT_MONITORED)
- Data: comes from `service.status` returned by `GET /api/services`, polled every ~60s via `ServicesContext`
- A11y: `role="img"` with `aria-label="status: {label}"` and `title`
- Animation: single-shot pulse when status changes between poll cycles (v13 feature)

The App Grid tool tile (`.app-grid-tool`) does **not yet** include this indicator. This spec requires it.

---

## 3. Data source — no new backend work

The `service.status` field is already present on every service returned by `GET /api/services`. The App Grid reads services from `ServicesContext` (the same shared provider that powers the floating-panel Catalog and the header StatusBar). No new endpoint, no new field, no backend change.

The `ServicesContext` polls every ~60 seconds while the tab is visible (v13 `services.tsx`). The status dot consumes `service.status` from that already-loaded array — zero additional fetches.

---

## 4. Status states and product semantics

| `ServiceStatus` value | Meaning | Product signal to user |
|---|---|---|
| `UP` | Gatus reports the service healthy | Normal, all good |
| `DOWN` | Gatus reports the service unhealthy | Action likely needed |
| `DEGRADED` | Gatus reports partial failure | Attention warranted |
| `UNKNOWN` | Monitoring infrastructure issue — Gatus responded but no status resolved | Transient; not actionable |
| `NOT_MONITORED` | No `gatus_key` configured for this service | Admin has not wired monitoring; normal for some tiles |

**Critical semantic distinction:** `NOT_MONITORED` is not a failure — it means the admin chose not to (or hasn't yet) configured Gatus monitoring for this tile. Its visual treatment must be visually distinct from `UNKNOWN` (monitoring infra problem) and `DOWN` (service failure). Historically: `NOT_MONITORED` uses a dashed ring rather than a solid dot, and carries no glow — signaling "absence of monitoring" not "error." Kare should confirm or revise this treatment in §5.

`UNKNOWN` is a monitoring-infra signal (Gatus down or key not resolved), NOT a per-service health reading. The aggregate StatusBar already excludes `UNKNOWN` from its counts for this reason. The per-tile dot still renders it (the tile's gray dot is the right surfacing for infra noise), but it carries NO alarm coloring.

---

## 5. Design section (Kare — authoritative)

**Status: Complete.** This section is authoritative for the per-tile status indicator's
look, feel, and motion. Every value is **grounded in the shipped system** — measured
against `src/index.css` (`.app-grid-tool*` Amendment A1 tokens + the shipped `.status-dot`
glow/pulse rules) and `src/alerts.tsx` (the shared `statusDotClass` colour map) — read
directly from source. The indicator **inherits the shipped status-dot grammar** so App Grid
reads as the same product, with two measured corrections folded in (position + contrast).

**Design-system rules this section enforces:** WCAG-AA non-text contrast (≥3:1 for a
meaningful UI graphic, 1.4.11), colour-is-never-the-sole-differentiator (1.4.1), 8pt spacing
grid, motion with restraint + `prefers-reduced-motion`, dark+light parity, consistency with
the existing token set.

The product requirement is a small status indicator on each `.app-grid-tool` tile showing one
of five states (UP / DOWN / DEGRADED / UNKNOWN / NOT_MONITORED) that: (1) is immediately
readable without a legend, (2) aligns to the App Grid visual language, (3) does not break the
fixed 190px tile width or the uniform 120px tile height (Amendment A1), and (4) meets WCAG-AA
contrast against the tile background in both themes.

> **Grounding note — the tool tile is NOT glass.** In App Grid the *box* is the glass panel
> (SPEC-app-grid §6.1); the *tool tile* (`.app-grid-tool`, index.css:2191) is the shipped
> solid `.tile` gradient — `#fff → #fbfcff` (light) / `#12161e → #0e1117` (dark), the **same
> surface the Catalog dot already sits on**. So the shipped status treatment transfers
> verbatim; the "is the glass too busy for a glow" question (D-3) is moot — the dot never sits
> on glass. Measurements below are against this solid tile surface.

### D-1 — Size and position — 9px, **top-LEFT** at 8px/8px (NOT top-right)

| Property | Value | Grounding |
|---|---|---|
| Diameter | **9px** solid circle | reuse the shipped `.status-dot` token (index.css:109) verbatim — no drift |
| Position | **`top: 8px; left: 8px`**, absolute in `.app-grid-tool-wrap` | 8pt grid; clears the 18px corner radius and the centred 46px icon plate |
| Corner | **top-LEFT** — *not* top-right | **measured collision:** the favorite ★ (`.app-grid-tool-fav`, index.css:2276) already owns top-right at `top:4px; right:4px`, 34×34. A top-right dot would sit under the star. |
| Layout impact | **zero** — absolutely positioned; `pointer-events: none` | min-height stays 120px (AC-007); the dot never intercepts a tap on the `<a>` |
| Consistency | identical offset on every tile regardless of icon/name/sparkline | AC-008 |

**This overrides Walt's top-right product suggestion — deliberately, on a measured collision.**
Top-right is taken by the shipped favorite toggle. Top-left mirrors the star (status pip
top-left ↔ favorite ★ top-right), reads as balanced, and keeps both corner affordances
un-obscured. The dot is informational (`role="img"`), not interactive, so the 44px touch-target
rule does not apply — 9px is correct for an indicator that pairs with a label + shape (D-5).

**DOM (for Stitch):** render the dot as a **sibling** inside `.app-grid-tool-wrap` — a new
`.app-grid-tool-status` element, *not* nested inside the `<a>` (keeps it out of the anchor's
accessible name; the `aria-label` carries the status independently). Same sibling pattern the
favorite ★ already uses.

### D-2 — Colour tokens + a **required definition ring** (contrast fix)

Reuse the shipped state→colour map (`statusDotClass`, alerts.tsx:40) — same tokens as
Catalog/launcher/StatusBar (consistency, principle 8). **But** I measured every fill against
the near-white light tile and three of five fail the 3:1 non-text-contrast floor (1.4.11) —
this is a real miss the shipped Catalog dot also carries:

| State | Fill | Fill vs light tile (#fff) | Verdict |
|---|---|---|---|
| UP | emerald-500 `#10b981` | **2.54:1** | ✗ fails 3:1 |
| DOWN | red-500 `#ef4444` | 3.76:1 | ✓ |
| DEGRADED | amber-400 `#fbbf24` | **1.67:1** | ✗ fails 3:1 |
| UNKNOWN | neutral-400 `#a3a3a3` | **2.52:1** | ✗ fails 3:1 |

**Fix — a mandatory 1px definition ring** so the dot's *boundary* meets 3:1 against the tile
regardless of fill brightness (WCAG 1.4.11 is satisfied at the outer edge). Measured:

- **Light:** `box-shadow: 0 0 0 1px rgba(15,23,42,0.55)` — the ring composites to ≈`#7f7f8a`,
  **≈4.2:1** vs the `#fff`–`#fbfcff` tile. ✓
- **Dark:** `box-shadow: 0 0 0 1px rgba(255,255,255,0.28)` — a light hairline that lifts the pip
  off the near-black tile (dark fills already pass 3:1; the hairline is for parity + separation).

Final per-state token (fill + ring; glow appended in D-3, all in one `box-shadow`):

| State | Fill (light / dark) | aria-label |
|---|---|---|
| UP | `#10b981` / `#10b981` | `status: UP` |
| DOWN | `#ef4444` / `#ef4444` | `status: DOWN` |
| DEGRADED | `#fbbf24` / `#fbbf24` | `status: DEGRADED` |
| UNKNOWN | `#a3a3a3` (neutral-400) / `#737373` (neutral-500) | `status: UNKNOWN` |
| NOT_MONITORED | dashed ring — see D-5 | `status: not monitored` |

> **Advisory (follow-up, not a gate):** the same ring should back-port to the shared
> `.status-dot` so the Catalog dot clears 3:1 too. I'll file that as its own Gitea issue; it's
> out of scope for this spec (App Grid only).

### D-3 — Glow: **keep it, state-coloured, and OFF for UNKNOWN/NOT_MONITORED**

The glow carries over (the tile is solid, not glass — see grounding note) and earns its keep:
it's the at-a-glance "calm green / alarm red" read that makes the state legible without a
legend. Restraint per principle 6: low-alpha, localised to the corner, `transform`/`box-shadow`
only. **The glow colour derives from the state** (a correction over the shipped
`rose-for-all-failures` rule, which mis-tints UNKNOWN):

| State | Glow (appended after the D-2 ring) |
|---|---|
| UP | `0 0 0 3px rgba(16,185,129,0.14), 0 0 8px rgba(16,185,129,0.50)` (green) |
| DOWN | `0 0 0 3px rgba(244,63,94,0.14), 0 0 8px rgba(244,63,94,0.45)` (rose) |
| DEGRADED | `0 0 0 3px rgba(251,191,36,0.16), 0 0 8px rgba(251,191,36,0.50)` (amber) |
| UNKNOWN | **none** — ring only. Infra noise, not a failure (§4). |
| NOT_MONITORED | **none** — absence, not a failure (§4, D-5). |

**Corrects a shipped bug:** `index.css:119` paints the rose *danger* glow on *every* non-UP,
non-NOT_MONITORED dot — which includes **UNKNOWN**, contradicting §4 ("UNKNOWN carries NO alarm
colouring"). On the App Grid dot, UNKNOWN gets the neutral ring and **no glow**. (Same
back-port advisory as D-2 applies to the Catalog dot.)

Full composed `box-shadow` for a light-mode UP dot, as an example:
`0 0 0 1px rgba(15,23,42,0.55), 0 0 0 3px rgba(16,185,129,0.14), 0 0 8px rgba(16,185,129,0.50)`.

### D-4 — Animation: single-shot pulse, ≤0.6s, reduced-motion snaps

Carry the v13 pulse — spotting a state change is exactly its job (AC-011). Reuse the shipped
`.status-dot--pulse` mechanism (index.css:128–139), tuned for restraint:

- **Motion:** a single-shot `transform: scale(1 → 1.7 → 1)`, **0.6s ease-out**, fired once when
  the poller detects this tile's status changed. Class added on change, removed on
  `animationend`. `transform` only (compositor-friendly, no reflow/jank).
- **Magnitude/clip check:** at 1.7× a 9px dot peaks ≈15px centred at (12.5, 12.5) → extends
  ~5–20px, staying inside the tile; the wrap has no `overflow:hidden`, so nothing clips.
  (Shipped 1.9× → 1.7× is a small restraint trim; still an unmistakable one-shot cue.)
- **Scope:** only the tile whose status changed pulses (AC-013); the poller already diffs
  prev→new, so unchanged tiles get no class.
- **`prefers-reduced-motion: reduce`:** **no pulse** — the fill/ring/glow snap to the new state
  instantly (AC-012). Enforced twice: the JS skips adding the class (as shipped) **and** an
  `@media (prefers-reduced-motion: reduce)` guard zeroes the animation (belt-and-suspenders).
- The pulse animates position/scale only — it does **not** animate the glow or ring.

### D-5 — NOT_MONITORED: **keep the dashed ring** (it's the colour-blind-safe shape)

Keep the dashed hollow ring — it's semantically right (absence of monitoring, not a state) and
it's the **only hollow/dashed shape** among the five, so it satisfies AC-017 (shape, not colour,
distinguishes NOT_MONITORED from UP for a colour-blind user). It's also consistent with
Catalog/launcher (principle 8). Two measured refinements:

| Property | Value | Grounding |
|---|---|---|
| Shape | **transparent fill + 1.5px dashed ring**, in the same 9px box | the sole hollow shape → AC-017 |
| Stroke (light) | **neutral-500 `#737373`** (raised from the shipped neutral-400) | neutral-400 `#a3a3a3` is only **2.52:1** vs `#fff` (fails 3:1); `#737373` measures **4.74:1** ✓ |
| Stroke (dark) | **neutral-400 `#a3a3a3`** | **7.4:1** vs the `#0e1117` tile ✓ |
| Glow | **none** | absence, not error (§4) |

No additional D-2 definition ring — the dashed neutral-500/400 ring *is* the boundary and
already clears 3:1. This corrects the #80 legibility fix (which left the light ring at
neutral-400) by raising the light stroke to neutral-500.

### D-6 — Accessibility contract (AC-014–017)

Reuse the shipped pattern on the `.app-grid-tool-status` element:
`role="img"`, `aria-label="status: {UP|DOWN|DEGRADED|UNKNOWN|not monitored}"`, and a matching
`title` (hover tooltip for sighted mouse users). Colour is never the sole differentiator:
NOT_MONITORED is shape-distinct (hollow dashed) from all solids, and every state carries its
label in the accessible name.

### D-7 — Before-ship verification (my standing process)

Tokens above are grounded in the shipped source read directly. Once the PR is up I'll run the
**browser loop** against staging (real viewports 390/768/1024/1440 + `getComputedStyle` + axe-core)
to confirm the composed contrast, the top-left placement clears the favorite ★ at every width,
and the pulse respects reduced-motion — filing any measured miss as a Gitea issue.
_(Note: this pass's live measurement was blocked by a staging-auth flake — seeded creds returned
"invalid email or password"; the design is grounded in `src/index.css` + `src/alerts.tsx` read at
source, not eyeballed.)_

---

## 6. Acceptance criteria

Written from the user's perspective. Stitch may not begin implementation until §5 is complete and both Walt + Kare have co-signed.

**Rendering**

| AC | Criterion |
|---|---|
| AC-001 | Every `.app-grid-tool` tile displays a status indicator whose visual state corresponds to the `status` field of that tile's service data. |
| AC-002 | An UP service shows a green indicator. |
| AC-003 | A DOWN service shows a red indicator. |
| AC-004 | A DEGRADED service shows an amber indicator. |
| AC-005 | An UNKNOWN service shows a gray/neutral indicator (muted — this is infra noise, not a failure). |
| AC-006 | A NOT_MONITORED service shows a visually distinct indicator that reads as "no monitoring configured" — not alarm-colored. Design treatment per §5 D-5. |
| AC-007 | The indicator does not increase tile height beyond what it would be without the indicator (must fit within the existing tile chrome without pushing the 2-line-clamp name or sparkline below it). |
| AC-008 | The indicator is positioned consistently across ALL tiles — same corner, same offset — regardless of tile content (icon, name length, sparkline presence). |

**Data freshness**

| AC | Criterion |
|---|---|
| AC-009 | The status shown on each tile reflects the most recent `GET /api/services` response — the same data that feeds the aggregate StatusBar. No separate fetch. |
| AC-010 | When the ServicesContext polls and a service's status changes (e.g., UP → DOWN), the affected tile's indicator updates to the new state within the next render cycle. No page reload. |

**Animation**

| AC | Criterion |
|---|---|
| AC-011 | When a service's status changes between poll cycles, the tile's indicator plays a brief animation (≤1 s). Design treatment per §5 D-4. |
| AC-012 | `prefers-reduced-motion: reduce` — the status indicator updates immediately (dot color changes) with no animation. |
| AC-013 | Tiles whose status did NOT change during a poll cycle receive no animation. |

**Accessibility**

| AC | Criterion |
|---|---|
| AC-014 | Each status indicator has an accessible label describing the status: `aria-label="status: UP"`, `aria-label="status: DOWN"`, etc. Human-readable for all five states. |
| AC-015 | The indicator has `role="img"` or equivalent so screen readers announce it as a discrete labelled element. |
| AC-016 | The indicator has a `title` attribute with the same label text (hover tooltip for sighted mouse users). |
| AC-017 | Color alone is not the only differentiator between states: shape (solid vs. dashed ring) or other visual treatment differentiates NOT_MONITORED from UP even to a color-blind user. |

**Tests**

| AC | Criterion |
|---|---|
| AC-018 | A Vitest/component test covers all five status states: verifies that the correct indicator class/attribute is rendered for UP, DOWN, DEGRADED, UNKNOWN, and NOT_MONITORED services. |
| AC-019 | The existing test suite (`npm test`) remains fully green after this change. |

---

## 7. Out of scope

- Per-tile status dot on the **StatusBar** (already aggregate; unchanged)
- Click-to-drill-down on the status dot (not requested)
- Sparkline (already specced separately — `specs/uptime-sparkline.md`; sparkline and status dot are independent features that coexist on the same tile)
- Any backend / API changes (data already present; no new endpoints)

---

## 8. Co-sign gate

This is a UI-bearing spec. It is **not approved for Stitch to build** until:

- [x] Walt product sign-off (this doc)
- [x] Kare design sign-off (§5 completed + Kare's explicit approval)

**Walt — APPROVED** (product ACs in §6; design deferred to §5)

**Kare — APPROVED.** §5 complete (D-1…D-7), tokens grounded in the shipped
`src/index.css` (`.app-grid-tool*` A1 + `.status-dot`) and `src/alerts.tsx`
(`statusDotClass`), dark+light parity, motion + reduced-motion specified. Decisions:
**D-1** 9px solid at `top:8px; left:8px` — **top-LEFT, overriding the top-right suggestion
on a measured collision** with the favorite ★ (`.app-grid-tool-fav`, top:4/right:4, 34×34);
zero layout impact, `pointer-events:none`. **D-2** reuse the shipped state→colour map + a
**required 1px definition ring** — emerald 2.54:1 / amber 1.67:1 / neutral 2.52:1 fail 3:1
on the near-white tile; ring `rgba(15,23,42,0.55)` (≈4.2:1) fixes the boundary. **D-3** keep
the glow (the tile is solid `.tile`, not glass — question moot), **state-coloured**, and
**OFF for UNKNOWN** — correcting the shipped rose-glow-on-all-failures bug that mis-alarms
infra noise. **D-4** single-shot `scale(1→1.7→1)` 0.6s on change only; reduced-motion snaps
(no animation), enforced in JS + `@media`. **D-5** keep the dashed hollow ring (the
colour-blind-safe shape, AC-017), light stroke raised to neutral-500 `#737373` (4.74:1) from
the failing neutral-400. Two back-port advisories (ring + UNKNOWN glow → shared `.status-dot`)
filed as follow-ups, not gates. Ship-time browser loop per §D-7.
