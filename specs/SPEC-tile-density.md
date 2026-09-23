# SPEC — Tile Density (Large / Compact / List)

**Spec ID:** SPEC-tile-density
**Date:** 2026-09-12
**Author:** Stitch (build spec) — derived from Walt's v16 artboard review
(`docs/reviews/2026-09-11-v16-ui-artboards.md`), Caleb's decisions
(`docs/decisions/2026-09-12-v16-artboard-open-questions.md`), and Joe's dispatch.
**Status:** SHIPPED — v16.1.0 (`ebc2f3e`). OQ-9 revisited in v16.2.0 (`a495ce0`): density is per-user from `/api/me`, localStorage demoted to a cache.
**Repo:** `Code/homepad` (frontend only — no backend change)
**Parent specs:** `SPEC-app-grid.md`, `SPEC-242-per-tile-status-dot.md`,
`SPEC-pane-fill-reflow.md`

---

## 1. Problem

Today every App Grid tile is the same shape: a 190×120px vertical card with the icon
on top and a two-line-reserved name below, name only. The v16 Tile artboard
(`docs/design/v16-ui/Tile.dc.html`) proposes letting the user pick a **density**:

- **Large** — the legacy vertical, name-only tile (today's tile).
- **Compact** — a horizontal tile (icon left, name over a live status line, status dot
  on a fixed right rail), 236px wide. **The new default.**
- **List** — one full-width column: icon, name, status line, dot.

The status line ("Online · 41 ms", "Slow · 1.9 s", "Offline · 6 min", "Not monitored")
is the point of Compact: it is the only place a user learns a service is slow or down
before they click it.

---

## 2. Decisions this spec builds to (resolved — do not relitigate)

From the decision record unless noted:

- **OQ-1 tile width → 236px** for the Compact tile (the 190px invariant is retired).
  The Large tile keeps 190px as-built — see `SPEC-pane-fill-reflow.md` §9.4 for why the
  whole-grid box-model rewrite is out of this scope.
- **OQ-2 dot position → fixed right rail** in Compact/List (`SPEC-242` D-1a). Large keeps
  the legacy top-left dot.
- **OQ-6/7 response time → not in the API today.** The status line degrades gracefully
  (see §6). Latency shows only when `Service.responseTimeMs` is present; no placeholder.
- **OQ-8 "Slow" label → tile status line only.** The pip's `aria-label`/`title` keep
  "DEGRADED".

### OQ-9 persistence — RE-ALIGNED with the decision record (2026-09-13)

The decision record resolved OQ-9 as **"per user, server-side."** Joe's dispatch
**overrode that to per-device `localStorage`** for the first build (16.1.0), and
this spec shipped that. **As of 2026-09-13 the divergence is closed:** homepad-api
carries `densityPref` on `GET`/`PATCH /api/me` (migration `0012_density_pref`), and
`useTileDensity(serverPref)` resolves **server → device cache → default**, writing
choices through to `PATCH /api/me`. localStorage is now only the per-device cache
that stops the first paint flashing the default before `/api/me` answers. An
older backend without the field (PATCH → 400) degrades to per-device — it never
reverts a choice. The text below is kept as the record of the interim build.

**Why per-device localStorage:** a dashboard's density is a property of the *screen it is
on* (a 4K monitor and a phone want different densities for the same account), not of the
account. localStorage needs **no API field and no migration**, so it does not block the
feature on backend work — matching the dispatch's "no homepad-api change" scope. The
switch lives in the dashboard header only.

**If Caleb prefers the server-side model** from the decision record, it is a clean
follow-on: add a `densityPref` column + `PATCH /api/me` field and swap `loadDensity`/
`saveDensity` (in `src/grid/tileDensity.ts`) for the server value with localStorage as
the cache. No component above that module changes. This spec records localStorage as the
shipped choice pending that call.

---

## 3. What the user sees (prose)

**The switch.** A segmented control (Large · Compact · List) sits in a new dashboard
header row — a "Your dashboard" label on the left, the switch on the right — between the
health StatusBar and the grid, matching the artboard. It is a radio group: the active
density is filled and carries `aria-checked` (never colour alone), and arrow keys move
the selection.

**Large.** Unchanged from today: the vertical name-only tile, icon centred on top, the
status pip at the top-left corner (`SPEC-242` D-1), 190px auto-fill track.

**Compact (default).** Each tile is 236px wide and 68px tall: the icon plate on the
left, the name left-aligned on one line (ellipsis on overflow), a mono status line under
the name, and the status dot on the fixed right rail, vertically centred. Down a column
the dots line up — "a column of tiles scans as a column of dots." DOWN and DEGRADED keep
their left accent bar and tint from `SPEC-242`.

**List.** One full-width column of 44px rows: icon, name (grows), status line and dot on
the right. The favorite ★ moves just left of the dot so the dot (the colour-blind-safe
status shape) stays visible in the short row.

**The status line** reads, by state: `Online` (UP), `Slow` (DEGRADED — see OQ-8),
`Offline` (DOWN), `Not monitored` (NOT_MONITORED), `Unknown` (UNKNOWN). A latency is
appended for UP/DEGRADED **only when present** ("Online · 41 ms"); DOWN appends a derived
outage duration ("Offline · 6 min") when it can be computed from the check history.

---

## 4. Acceptance criteria

- **AC-DEN-001** — Exactly three densities exist — Large, Compact, List — offered as a
  radio group in the dashboard header, the active one marked `aria-checked`.
- **AC-DEN-002** — A device with nothing stored defaults to **Compact**.
- **AC-DEN-003** — A stored preference is honoured on load; a junk stored value falls back
  to the default.
- **AC-DEN-004** — Choosing a density persists it **per user** (`PATCH /api/me`) and
  caches it on the device, so it survives a reload on that device and follows the
  account to another one. *(Was per-device only in 16.1.0; re-aligned 2026-09-13.)*
- **AC-DEN-005** — The Compact tile is horizontal: name left on one line, a status line
  below it, the status dot on the fixed right rail.
- **AC-DEN-006** — The status dot holds the right rail down a column (identical x, ±2px),
  vertically centred.
- **AC-DEN-007** — List density is one full-width column; rows stack.
- **AC-DEN-008** — The density switch lives in the dashboard header **only** (not Settings).
- **AC-DEN-009** — The status line degrades gracefully: the state word always renders; a
  latency is appended only when `Service.responseTimeMs` is present; **no fabricated value
  and no placeholder** (never "-- ms").
- **AC-DEN-010** — When the API later returns `responseTimeMs`, the latency appears on the
  line with no other frontend change.
- **AC-DEN-011** — DEGRADED reads "Slow" on the status line; the pip's `aria-label`/`title`
  still say "DEGRADED" (OQ-8).
- **AC-DEN-012** — NOT_MONITORED reads "Not monitored"; DOWN reads "Offline" plus a derived
  "· N min" outage duration when the check history allows it.
- **AC-DEN-013** — Large is unchanged: the legacy vertical name-only tile with the top-left
  dot and no status line.

---

## 5. Persistence model

- Source of truth (2026-09-13): the account's `densityPref` from `GET /api/me`,
  written via `PATCH /api/me { densityPref }` (`homepad-api` migration `0012`).
- Cache: `localStorage['homepad:tile-density']`, one of `large | compact | list` —
  per device, mirrors the last resolved value so the first paint does not flash.
- Default: `compact` (no server field, empty / unknown cache, or storage
  unavailable → default).
- Resolution order: server preference (when present and valid) → device cache →
  default. The server value is adopted whenever it changes (it arrives async).
- Failure mode: a failed PATCH (older backend, network) keeps the choice on the
  device; nothing is rolled back.
- Module: `src/grid/tileDensity.ts` (`loadDensity`, `saveDensity`,
  `useTileDensity(serverPref?)`); `src/api.ts` (`setDensityPref`, `User.densityPref`).

---

## 6. The status-line degradation rule (the contract with the backend field)

`GET /api/services` does **not** return per-service response time today
(`Service.responseTimeMs` is optional and currently absent — OQ-6, verified in
`src/api.ts`). The line is built to tolerate that:

1. The **state word** always renders from `service.status` — never blocked on latency.
2. A **latency** is appended (UP/DEGRADED) only when `responseTimeMs` is a finite number.
   Format: `< 1000ms → "N ms"`, `≥ 1000ms → "X.X s"`.
3. **No placeholder.** An UP service with no latency reads `"Online"` — not `"Online · --
   ms"`.
4. The **outage duration** for DOWN is derived from `uptimeChecks` (minutes since the
   newest successful check) — no backend field needed.
5. **Forward-compat:** the field name the backend must emit is **`responseTimeMs`**. When
   it does, the latency appears with no other frontend change (AC-DEN-010). This is the one
   coordination point with the future homepad-api work (OQ-6).

The pure logic lives in `src/grid/tileStatus.ts` (`tileStatusLine`, `formatLatency`), clock
injected, fully unit-tested.

---

## 7. Out of scope (recorded so the boundary is visible)

- **Any homepad-api change** — including the `responseTimeMs` field itself (OQ-6) and the
  server-side density preference (the OQ-9 decision-record model).
- **The whole-grid 236px box-model rewrite** (`boxWidthPx`/`contentMaxPx`/`frameContentPx`
  206→252, and unifying Large to 236px). See `SPEC-pane-fill-reflow.md` §9.4 — gated behind
  §9.2's populated-install column review and entangled with the 12-column grid (OQ-3).
- The 12-column group grid (OQ-3), the "Connect a status source" CTA (OQ-4), "Retry now"
  (OQ-5), and the health-panel NOT MONITORED / STALE states (SPEC-v24 §12).

---

## 8. Test coverage

- **Unit** (`src/grid/tileDensity.test.ts`, `tileStatus.test.ts`,
  `TileDensityToggle.test.tsx`, `app-grid-density.test.tsx`): the density state + per-device
  persistence, the switch radio group, the AppGrid density wiring, and every status-line
  case including the missing-`responseTimeMs` degradation (AC-DEN-009/010).
- **Browser gate** (`tests/browser-gate/tile-density.spec.ts`): the fresh-device default,
  the compact dot on the right rail holding position down a column, the List single-column
  reshape, the Large legacy top-left dot, and the no-response-time line — all measured in a
  real Chromium (jsdom cannot prove layout/paint; the #35 gate discipline).
- **Self-QA** (CDP sidecar, this PR): all three densities driven in a real browser; compact
  dots at relX≈215/236 with 0px column spread; the switch persists across reload.

---

## 9. Revision history

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-12 | 1.0 | Stitch | Initial spec — density switch + compact status line built to Caleb's OQ decisions; OQ-9 shipped as per-device localStorage per Joe's dispatch (diverges from the decision record's server-side model — recorded in §2). |
