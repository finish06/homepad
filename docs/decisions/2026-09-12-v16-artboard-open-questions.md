# Decision Record — v16 UI artboard open questions

**Decided by:** Caleb, 2026-09-12
**Source review:** `docs/reviews/2026-09-11-v16-ui-artboards.md` (Walt, PR #419)
**Artboards:** `docs/design/v16-ui/` (PR #418)
**Status:** all ten open questions resolved. Specs amended in this commit.

Walt's review raised ten open questions and held every artboard proposal pending
product decisions. This record resolves all ten. Three (OQ-7, OQ-8, and the "Not
now" dismiss sub-question of OQ-4) were decided by default rather than by explicit
instruction — they are marked **DEFAULT** and are the cheapest reversible option.

---

## Resolutions

| # | Question | Decision | Type |
|---|---|---|---|
| OQ-1 | Tile width at Compact density | **236px at every density.** The 190px invariant is retired and replaced by a new uniform 236px width. | Caleb |
| OQ-2 | Status dot position | **Right rail, fixed.** Overrides D-1 (top-left) in SPEC-242. | Caleb |
| OQ-3 | 12-column group grid | **Replaces** the current 1–8 `grid_width` model. Supersedes SPEC-category-pane-width-layout. | Caleb |
| OQ-4 | "Connect a status source" CTA target | **Links to documentation.** No in-app navigation. | Caleb |
| OQ-4b | "Not now" dismiss persistence | **Per device, until reload.** Session-scoped, no storage. | DEFAULT |
| OQ-5 | "Retry now" mechanic | **New backend endpoint** that prods the Gatus poller. Not a client-side refetch. | Caleb |
| OQ-6 | Response time in the API | **Not present today.** Verified in code — see below. A new field is required. | Fact |
| OQ-7 | Response time display rule | **Most recent check.** | DEFAULT |
| OQ-7b | Display when latency unknown | **State word alone**, no placeholder number. | DEFAULT |
| OQ-8 | "Slow" label scope | **Tile status line only.** Accessibility labels, tooltips and toasts keep "DEGRADED". | DEFAULT |
| OQ-9 | Density switch persistence | **Per user, server-side.** Follows the person across devices. | Caleb |
| OQ-10 | NOT MONITORED panel trigger | **Only when the monitored count is zero.** | Caleb |

---

## OQ-6 — finding of fact, not a decision

`GET /api/services` does **not** return per-service response time. Verified against
`src/api.ts`:

- `UptimeCheck` is `{ success: boolean; timestamp: string }` — no duration field.
- `Service` carries `uptimeChecks`, `uptimeWindows`, `gatus_key`, and `status`. None
  of these carries latency.

Consequences:

- Every latency display in the Tile artboard ("Online · 41 ms", "Slow · 2.4 s") and
  every latency pill in the HealthPanel ATTENTION state requires a **new API field**
  before it can be built. This is backend work, not a frontend change.
- "Offline · 6 min" **is** derivable from existing data — the time since the newest
  `uptimeChecks` entry with `success: true`. No backend change needed for that one.
- The DEGRADED "slow" threshold is Gatus's own, and homepad does not currently expose
  it. Displaying "Slow" requires either surfacing that threshold or defining a homepad
  threshold. Recorded as follow-on work below.

---

## Scope this creates

These decisions are expansive. Recorded plainly so the cost is visible before dispatch.

**Backend work newly required:**

1. A response-time field on the services payload (OQ-6). Blocks the entire compact
   tile status line and the ATTENTION latency pills.
2. A status-refresh endpoint that prods the Gatus poller (OQ-5). Blocks the STALE
   state's "Retry now".
3. A per-user density preference field (OQ-9). Blocks the density switch.
4. A migration remapping stored `grid_width` values to 12-column spans (OQ-3).

**Spec amendments required (all in this commit):**

- SPEC-242 — dot moves to the right rail; D-1 is overridden.
- SPEC-pane-fill-reflow — R2 becomes 236px; the box-grow and content-max formulas
  that derive from 190+16 all change.
- SPEC-ultrawide-fluid-frame — the `frameContentPx()` mirror changes to 236.
- SPEC-category-pane-width-layout — superseded by the 12-column grid; hold becomes
  a retirement.
- SPEC-app-grid — the valid-widths table is replaced by 12-column spans.
- SPEC-v24 — NOT MONITORED and STALE states cleared, with the CTA and retry targets.

**Still unspecced after this record:**

- A new spec is needed for the compact tile status line, and it cannot be written
  until the response-time field is designed.
- A new spec is needed for density switching.
- `PANE_MIN = 176px` in SPEC-category-pane-width-layout sits below the new 236px
  tile width. That floor is now incoherent and needs a value.

---

## Reversing a DEFAULT

The four DEFAULT rows were chosen for the smallest blast radius, not from a stated
preference. Each is cheap to change before build:

- **OQ-7 (most recent check)** — a rolling average is steadier but hides a service
  that just began degrading. Swap if tiles read as jumpy in practice.
- **OQ-7b (state word alone)** — a dash placeholder keeps the line width stable and
  stops tiles shifting when data lands. Swap if reflow is visible.
- **OQ-8 (tile line only)** — widening "Slow" to toasts and tooltips is more
  consistent for users but amends cap5-status-change-toasts and changes assistive
  output.
- **OQ-4b (session dismiss)** — a persisted dismiss needs a storage decision and a
  way to undo it. Session scope avoids trapping a user who dismisses by accident.
