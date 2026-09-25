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
| +2 | #470 pre-auth regression | done | Joe caught it: userPref undefined INDEFINITELY pre-auth, so the boot-cache ref froze the login screen's theme. His fix would have poisoned itself (layout effect writes the cache back); snapshot the cache, keep the OS live. 2 new tests. |
| +2 | cap3 | done | Built against AppGrid, not the deleted Catalog.tsx. 17 tests. Two deviations recorded in spec §8. PR opened. |
| +1 | #477 | LOGGED, not built | Only specced-unbuilt AC. Every route changes tile composition at 3 densities = design direction. Costed all three on the issue with measured geometry (compact 12.0px / list 17.5px / large 17.0px inside the tile; Large derives 34.3px of height from the strip, so absolute positioning is out). Recommending (a) with Kare on placement. |
| +1 | #437 | MERGED (#491) | Arrow keys moved selection but not focus; control advanced once then stuck. Shipped because aria state was always right and every test watched onChange. 5 tests assert activeElement. ada approved. |
| +1 | portfolio interrupt | done | Caleb's instruction via Joe: disabled docker-publish push trigger on Code/calebdunn.tech (dc03c6f5c). Step 1 (GitHub API disable) impossible — no GitHub PAT in keychain. Handed back. Caleb has since said a different Claude owns the portfolio. |
| +2 | #493 tracking issue | done | Consolidated the ten staging-slot advisories (#435 #440 #442 #448 #450 #453 #454 #473 #474 + homepad-api #65) into one. Closed the nine as "consolidated, not resolved" with the evidence preserved and links back. Root cause recorded: ci-shared@v3 dispatch-qa.sh hands the bot head_sha and never asks it to check staging serves it. |
| +2 | COUNT CORRECTION | — | I told Caleb "40 open issues". Wrong — that was the API `limit` truncating, read as a total. Paginated properly: **79 open** now, 88 before the consolidation. Same failure shape as everything else this week: a capped result read as a complete one. |
| +3 | #494 request() header merge | MERGED | ada approved, including my caveat that the two tests pass on the UNFIXED code (broken path has no caller, unreachable from the public API). |
| +3 | #495 stale comment + triage | MERGED | #378 comment corrected; #297/#319/#404/#272 closed with verified evidence. |
| +4 | full 75-item triage | done | Mechanical pass flagged 20 as referencing missing code; only 3 genuinely deleted — the rest had MOVED. Did not close on the flag. Closed 6 total with evidence (#184 #276 #250 #416 #422 #437). 75 -> 69 open. Buckets: 26 design, 20 CI/QA, 14 code advisory, 10 spec drift. |
| +4 | #488 resolved to a design call | done | gracie and I were each right about a different element. The windows line correctly never changes at compact (Caleb's #476 call); the sparkline DOES. But uptimeChecksFor() returns empty for gatusKey=="" — so for UNMONITORED services the toggle changes nothing at any density, her repro is exact, and my #490 tests miss it because their fixtures supply uptimeChecks. Recorded that limit. Remaining gap is copy — left for Kare/Caleb. |
| +4 | #492 | read, not actioned | gracie filed that PR #491 merged before QA finished. Checked: merged_by=ada at 03:00:49, her own approval 03:00:44 — the SWEEP merged it, not me. But her token is finish06 like mine, so the audit trail cannot distinguish the gate, the author, and me. Sharper version of the merge-race finding. |
| +5 | #405 guard (PR #496) | open | Overflow no longer reproduces and NO commit references #405 — fixed incidentally by 16.5.1's min-w-0 flex-1. Negative control: reverting that shape overflows by 6px at 320px (not the 22px reported; other work had reduced it). 8-case guard on document scrollWidth, since any element could cause a sideways scroll. |
