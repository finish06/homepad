# Cycle 2 close-out: DRAFT (pre-staged 2026-10-12, away mode)

> Not applied. Fold this into cycle-2.md, M2 and config when the blockers land, then delete this file.
> Bracketed `[…]` slots are filled from the evidence when it arrives.

## Success criteria as of 2026-10-12 22:50Z

| Criterion | State | Evidence |
|---|---|---|
| #452 #455 #507 #423 #487 #414 closed with evidence | **4/6** | #452 (#522), #455 (gracie's pod run), #423 (#523), #487 (#525, ada measured 0.0px on staging). **#507 open**: no pod gate run yet. **#414 open**: no in-cluster curl yet |
| Every gate spec goes through `./fixtures`, enforced by a test | ✅ | `tests/infra/browser-gate-fixture-import.test.ts` (#522) |
| Every new guard negative-controlled; green on macOS and the CI image | ✅ | #522, #523, #525, #526 logs: 99/99 and 100/100; negative controls `rm -rf dist`-safe |
| 16.7.2 tagged, `-beta` digest recorded, not promoted | ✅ | `v16.7.2` → run 6033; `sha256:6f86fe07…8c20` |
| Each routed item answered or owned by Joe, on its issue | ❌ | No answers. The Joe ↔ homepad-21 link failed both ways on 2026-10-12 (Joe's two messages never arrived; mine never reached him) |
| Cycle log and handoff updated after every merge | ✅ | docs/cycle-2-log commit per merge |

## Closing entry for cycle-2.md (when the blockers land)

| [date] | close | COMPLETE | #507 closed on [pod / run evidence]; #414 [closed / fixed] on [curl evidence]; #528 [fixed: key scope]. Routed items: [answers]. 6 PRs, 1 release (16.7.2, not promoted), 6 issues closed (#452 #455 #423 #487 #524 + [#507 #414]) |

## M2 milestone updates

- Criterion "QA-pod Playwright env fixed: #507, #455, #452, #254" → #452 ✅ #455 ✅ #507 [✅] #254 [owner / open]
- Criterion "admin-modal browser coverage (#423)" → ✅ (#523: AdminSettings + custom-app form, iPad 768 and phone 375)
- Criterion "#414 verified in-cluster" → [✅ / fixed in …]
- Criterion "#256/#261 obsolete or fixed; #487 resolved" → #487 ✅ (scrollbar, not a defect); #256/#261 [Joe]
- Lease and #493: unchanged unless Joe answers. These are the bulk of M2's remaining work and need an owner before a cycle-3 on M2 makes sense
- Hill chart: QA-pod Playwright env → downhill; Admin-modal coverage → DONE; Staging headers → [DONE / downhill]; Old advisories → partial (#487 done)
- Cycles table: cycle-2 → COMPLETE

## Learnings checkpoint candidates

1. **(retro) Cycle 2 complete.** All 6 agent-owned items merged in one day, 1 release, and every PR single-reviewer (the duplicate-QA pattern did not recur). What blocked the close was not code: it was evidence that only lives in the cluster or a QA pod, held by one route (Joe) that silently dropped messages both ways.
2. **(process) A Remote Control route that reports nothing back is not a channel.**
   - `SendMessage` to a Remote Control session returns success while delivering nothing. On 2026-10-12, three messages each way failed silently.
   - When an ask matters, anchor it in a durable place the owner already reads (the Gitea issue) and treat the message as a pointer to it.
   - Ask the human to confirm the first exchange on a new route.
3. **(technical) The approval of a PR whose title names an issue is not that issue's evidence.**
   - Gitea auto-closed #455 and #507 from squash titles. Both needed a run nobody had done.
   - Name issues with "Refs #N", not "Closes #N", when the closing evidence is a separate run.
