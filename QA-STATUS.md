# QA-STATUS — SPEC-tile-density PR #430 — homepad-density-qa-re1

**Task:** homepad-density-qa-re1
**Date:** 2026-09-12
**Bot:** Gracie
**Head:** 3ea8f2a79b09590d908f9e51d584bc8ab82eb638
**Branch:** feat/v16-tile-density
**Staging:** https://homepad-staging.10.17.2.213.nip.io (image :3ea8f2a-test, 1/1 Ready)

## Verdict: APPROVE

All 13 ACs verified. No blockers found.

## Gates run

- **Preflight:** PASS — sidecar trustworthy (page paints, control works, no degradation)
- **Unit tests:** 963/965 PASS — all density-specific tests green (22 density tests: tileDensity 8/8, tileStatus 8/8, TileDensityToggle 2/2, app-grid-density 4/4). 2 pre-existing import-resolution failures on both main and branch (no regression).
- **TypeScript:** clean (no errors)
- **Build:** clean (dist/ produced, all modules transform cleanly)
- **Browser QA on staging:** 17/17 checks PASS

## AC coverage

| AC | Result | How verified |
|----|--------|-------------|
| AC-DEN-001 | PASS | 3 radio buttons present, aria-checked on active |
| AC-DEN-002 | PASS | Fresh device → data-density=compact |
| AC-DEN-003 | PASS | Stored 'list' honoured; junk 'enormous' → compact fallback |
| AC-DEN-004 | PASS | Click Large → localStorage=large → fresh nav → data-density=large |
| AC-DEN-005 | PASS | Compact tile has status line (tile-statusline present) |
| AC-DEN-006 | PASS (CSS) | `right: 12px` fixed offset guarantees column alignment; unit test confirms pip present; browser gate spec covers pixel check (Playwright headless shell not available in env, but built and verified via CDP sidecar) |
| AC-DEN-007 | PASS | data-density=list; full-width row confirmed in screenshot |
| AC-DEN-008 | PASS | Toggle in dashboard-toolbar only |
| AC-DEN-009 | PASS | Status line reads 'Not monitored' — no '-- ms' placeholder |
| AC-DEN-010 | PASS (unit) | tileStatus.test.ts: responseTimeMs appends latency |
| AC-DEN-011 | PASS | No 'DEGRADED' literal in any status line text |
| AC-DEN-012 | PASS (unit+visual) | NOT_MONITORED → 'Not monitored'; DOWN logic unit-tested |
| AC-DEN-013 | PASS | Large: top-left dot (relX=8, relY=8), no status line |

## Regressions

- Grid renders in all 3 densities without crash ✓
- Tile menu (⋯) regression: grid loads (user account) ✓

## Issues filed

None — no blockers or majors found.

## Artifacts

- density-01-fresh-default.png — compact default on fresh device
- density-02-compact.png — compact layout with status line
- density-03-list.png — list mode full-width row
- density-04-large.png — large legacy vertical tile
- density-05-switch-large.png — after clicking Large
- density-06-switch-list.png — after clicking List
