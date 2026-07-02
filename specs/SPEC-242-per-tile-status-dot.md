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

**Status: Pending — dispatched to Kare. This section must be completed and co-signed before Stitch builds.**

Kare: the product requirement is a small status indicator on each `.app-grid-tool` tile showing one of five states (UP / DOWN / DEGRADED / UNKNOWN / NOT_MONITORED) in a way that:

1. Is immediately readable without a legend
2. Aligns to the App Grid's visual language (glass-panel tokens, §6 of SPEC-app-grid)
3. Does not break the fixed 190px tile width or the uniform tile height (2-line-clamp name + icon, per Amendment A1)
4. Meets WCAG AA contrast for the dot color vs. the tile background (light + dark mode)

**Questions for Kare to resolve in this section:**

- **D-1: Dot size and position.** What size (diameter in px)? What offset from which corner of the tile? (Walt product suggestion: top-right corner, consistent with existing Catalog treatment, so the dot never overlaps the tile name or icon — but Kare should confirm against the App Grid tile layout from Amendment A1.)
- **D-2: Color tokens.** Map the 5 states to App Grid design-system tokens:
  - UP: emerald? (current Catalog: `bg-emerald-500` with green glow `box-shadow`)
  - DOWN: red? (`bg-red-500`)
  - DEGRADED: amber? (`bg-amber-400`)
  - UNKNOWN: gray? (`bg-neutral-300 dark:bg-neutral-600`)
  - NOT_MONITORED: Kare's call — the current treatment is a dashed ring (`bg-transparent border-2 border-dashed border-neutral-400`). Does this read well on the App Grid tile's glass background?
- **D-3: Glow treatment.** The current Catalog adds a radial glow shadow on the dot (green for UP, rose for DOWN/DEGRADED). Does this carry over to the App Grid tile, or is the App Grid's glass surface too busy for a dot glow?
- **D-4: Animation.** The v13 live-status feature pulses the dot once when status changes. Does this carry to App Grid tiles? (Product: yes — useful for spotting state changes. Kare: confirm motion spec.)
- **D-5: NOT_MONITORED treatment.** Keep the dashed ring, or does a different treatment (lighter opacity solid dot, an icon, an absence of dot entirely) fit better on the App Grid tile?

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
- [ ] Kare design sign-off (§5 completed + Kare's explicit approval)

Kare: please complete §5 (D-1 through D-5) and add your sign-off below.

**Walt — APPROVED** (product ACs in §6; design deferred to §5)
**Kare — PENDING**
