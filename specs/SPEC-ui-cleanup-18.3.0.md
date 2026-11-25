# Spec: UI and accessibility cleanup for 18.3.0

**Spec ID:** SPEC-ui-cleanup-18.3.0
**Version:** 0.1.0
**Created:** 2026-11-23
**Author:** Claude (Caleb asked, 2026-11-23: "clean up more issues, tackle another bundle". This is the web UI, design and accessibility bundle.)
**Status:** SHIPPED — 18.3.0 (2026-11-24): #703, release #706. The five left open in §3 were decided later: #352 and #488 in 18.4.0 (SPEC-decisions-18.4.0), #477, #403 and #346 in 18.6.0 (SPEC-cleanup-18.6.0, `DECISIONS.md`). Status line read "In review" until 2026-11-25.
**Repo:** `Code/homepad` (web app at the root; no `api/` changes)
**Issues:** #187, #192, #206, #262, #263, #269, #335, #341, #346, #348, #352, #375, #376, #379, #403, #451, #477, #488, #513
**Target version:** 18.3.0

---

## 1. Overview

19 open UI, design and accessibility issues. Most are QA or design advisories. Some were fixed by later work, some need a design or product choice, and seven are small real bugs. This spec sorts them, fixes the real ones with a test each, and closes the rest with evidence.

No new features and no layout changes. Each fix stays inside what its issue asks.

## 2. Already fixed or no longer true (close with evidence)

| Issue | Evidence |
|---|---|
| #187 avatar hover lift misses the 5px ring | The disc is now 44×44 (`src/index.css` `.user-avatar` width/height 44px), the same size as its 44px button, so there is no outer ring left to miss. |
| #206 sparse-category void + Recently Opened icon | `Catalog.tsx` is gone. The App Grid boxes grow to fill the row (SPEC-pane-fill-reflow, SHIPPED). The Recently Opened icon has a plate now (`.recently-opened-icon`: 44px, 12px radius, tile fill and border). |
| #375 `EnvConfigError` div inside `<dl>` | 18.1.0 replaced the env-config viewer (dc105ba). The error is now a `div` beside the lists, never inside a `<dl>` (`src/library/SystemSettings.tsx`, `server-settings-error`). |
| #379 login dark-mode contrast | Fixed by the v27 login restyle (d3a0b2a, PR #381): labels use `--v-txt`, muted lines `--v-muted`, inputs `--v-field`. Measured again in this PR (§6). |
| #192 v12.4.0 design review | All five blockers (#188–#191, #182) and the advisory (#185) are closed. |
| #269 wide-viewport dead space | SPEC-pane-fill-reflow is SHIPPED (v13.2.0, v13.3.0), with the real-browser gate `tests/browser-gate/app-grid-pane-fill.spec.ts`. |
| #348 v15 measured corrections | Kare verified the fixes on PR #350 and said it could close once #351 landed. #351 is closed. |

## 3. Needs a design or product choice (leave open)

| Issue | Why |
|---|---|
| #352 tile icon hue per service vs per category | Kare asked Walt and Caleb to pick (a) keep per-service or (b) per-category. That is a product choice. |
| #403 drop-target placeholder | The spec allows the in-place shift that shipped. A real placeholder needs a dnd-kit `DragOverlay`, which changes how dragging works. Only worth it if the landing spot reads unclear on a real device. |
| #477 keyboard focus on sparkline dots | The dots sit inside the tile link, and a link can't hold focusable children. Every fix moves the strip and changes tile height at some density. Kare must sign off where it lands. |
| #488 uptime display vs tile density | Label the link between the two rows, or accept it. That is product copy. |
| #346 bento-grid exploration | A concept for Caleb to react to, not a spec. |

## 4. Acceptance criteria

| ID | Issue | Criterion | Priority |
|----|-------|-----------|----------|
| AC-001 | #262 | The shared `.status-dot` (⌘K launcher rows, alert history) draws a 1px definition ring on every filled state (UP, DOWN, DEGRADED, UNKNOWN): `rgba(15,23,42,0.55)` in light mode, `rgba(255,255,255,0.28)` in dark. Same ring as the App Grid dot (SPEC-242 D-2). The ring on white is ≥3:1 (WCAG 1.4.11). NOT_MONITORED keeps its own border and gets no ring. | Must |
| AC-002 | #263 | The shared dot's glow follows its state, as SPEC-242 D-3: UP green, DOWN rose, DEGRADED amber. UNKNOWN has the ring only. NOT_MONITORED has nothing. No state but DOWN is rose. | Must |
| AC-003 | #335 | The Inline overlay line in the tile editor says what really happens: some sites show an error in the overlay, and the new-tab link appears only when the page doesn't load. | Should |
| AC-004 | #341 | A lazy overlay or screen whose chunk fails to load shows a small "couldn't load" dialog with **Reload** and **Close**, and the rest of the app keeps working. Close dismisses the overlay as its own close would. The lazy glance strip fails silently (it is decoration). Covers every `lazy()` in the web app. | Should |
| AC-005 | #376 | While server settings load, the "Show uptime display" switch is not inside any `aria-busy="true"` element. Loading is still announced by the sr-only status line, and the skeleton rows stay `aria-hidden`. | Should |
| AC-006 | #451 | A "Retry now" note from one stale period is gone when the panel goes stale again later. A new note shows only after a new retry. | Should |
| AC-007 | #513 | In arrange mode, the ★ and the edit pencil never take each other's taps at any density. Every point in either hit area goes to the control whose centre is nearer. Each control still answers at its own centre, and each keeps a hit area of at least 24×24px (WCAG 2.5.8). Large keeps its 44×44 areas. Painted glyph positions do not move. | Must |

## 5. Out of scope

- Any choice listed in §3.
- Moving the pencil or the ★ (#513 options 1 and 3). AC-007 only trims the invisible hit areas where they overlap.
- A retry that refetches a failed chunk without a reload. `React.lazy` keeps the failed promise, so a reload is the honest fix.

## 6. Test plan

Each AC with code has a test that fails before its fix:

- AC-001, AC-002: `tests/browser-gate/status-dot-shared-262-263.spec.ts` reads the computed `box-shadow` of the launcher row dot for every state, light and dark, and checks the ring's contrast on white.
- AC-003: `src/grid/TileEditModal.test.tsx` exact-copy case.
- AC-004: `src/ui/ChunkErrorBoundary.test.tsx` (dialog, Close, Reload, silent mode) and `tests/browser-gate/lazy-chunk-error-341.spec.ts` (abort the Settings chunk in a real browser; the dialog shows; Close returns to a working dashboard).
- AC-005: `src/library/settings-server-settings.test.tsx` AC-034 loading case.
- AC-006: `src/app/HealthPanel.test.tsx` "Retry now" cases.
- AC-007: `tests/browser-gate/fav-edit-hit-areas-513.spec.ts` hit-tests a grid of points with `elementFromPoint` at Large, Compact and List.

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.

For #379, the contrast is measured in the gate run (dark mode, 390 and 1440) and reported on the issue.
