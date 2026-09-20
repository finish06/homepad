# Away Mode Log

**Started:** 2026-09-20
**Duration:** 12h
**Autonomy:** autonomous · maturity ga · quality strict

Merge policy for this session: merge on QA approval (owner's standing rule,
confirmed). Prod is NOT in scope — deploy_approval_required: true.
If #468 proves to be a real product bug: fix it and open a PR.

## Work Plan
1. #468 — A8 anti-flash e2e race. Instrument inside ThemeProvider.
2. File the perf.spec.ts dev-server finding.
3. Point e2e at the built app; report honestly if real thresholds fail.
4. Wire e2e into CI — only if 1 and 3 are green.
5. AC-020a legibility in homepad-api (Joe's note).
6. Triage advisories #450–#455 for staleness.

## Queued for return
- Kare §9 copy for AC-028 (design judgement)
- Joe's fleet-wide drift check (needs owner yes/no)
- Anything touching prod
- Choice of next feature from cap3 / cap4 / SPEC-245 / SPEC-v26

## Progress Log
| Time | Task | Status | Notes |
|------|------|--------|-------|
| start | away log created | done | plan confirmed with owner |
| +1 | #468 A8 | done | REAL product bug, not a test defect. Provider clobbered the boot-script paint before /api/me resolved → dark users flashed dark→light→dark. PR #470. e2e 10/10. |
| +1 | owner item 1 | done | cap6 v2 Walt/Kare sign-offs waived, AC-028 copy accepted, placeholders removed. PR #471. |
| +1 | owner item 2 | done | Joe given the go on the fleet drift check; he has built it (homelab 18770149) — 12 image + 2 resource + 1 declared-not-running drifts found. |
| +1 | owner item 4 | started | ARCHITECTURE DRIFT found in 3 of 4 specs before building. |

## Spec drift assessment (owner item 4)
- cap3, cap4: written 2026-06-23 against `src/Catalog.tsx` / `ServiceTile`, which the
  v16 AppGrid rewrite deleted. Their §2 and §6 guidance is unbuildable as written.
  ACs are behavioural and still valid.
- cap3 AC-003 conflicts in SUBSTANCE, not just paths: it says items open "in a new tab
  — the same behavior as the main tile", but v23 shipped per-service `clickAction`
  (new_tab | same_tab | iframe). Honouring clickAction is the AC's intent; recorded
  rather than assumed silently.
- SPEC-v26: only a moved path (src/SettingsPanel.tsx → src/library/SettingsPanel.tsx).
- SPEC-245: clean, backend-only.

Approach: implement against CURRENT architecture, record each deviation in the spec
with a version bump. Do not silently reinterpret.
