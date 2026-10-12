# Milestone: M2 — QA pipeline reliability

**Target Maturity:** GA (maintain)
**Status:** IN_PROGRESS
**Horizon:** NOW
**Started:** 2026-09-29 (QA lease dispatched to Stitch)
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Make every PR's QA cycle cheap and trustworthy: one reviewer per PR, a staging slot that can't be overwritten mid-review, and a QA browser environment that only fails for reasons the PR actually caused.

## Success Criteria

- [ ] The QA lease is live, and over the next 20 merged PRs **no PR is worked by two pool members** — measured by joining reviews **and** issue comments, because a reviews-only query is blind to the losing reviewer (L-003)
- [ ] Staging-slot reservation (#493): a PR's staging deploy can't be overwritten by another PR while QA is running against it, and briefs assert the SHA
- [ ] QA-pod Playwright environment fixed: #507 (missing `libglib`), #455, #452, #254
- [ ] Real-browser gates added for the admin modals that have none — AdminSettings and the custom-app form (#423; TileEdit already has two)
- [ ] #414 verified **in-cluster** (staging security headers) and closed or fixed — it can't be checked from the LAN, where the ingress returns Traefik 404s for every host
- [ ] #256 and #261 (July staging env) confirmed obsolete or fixed by QA; #487 resolved

## Appetite

Two cycles. Much of this lives in ci-shared and QA infrastructure, so it moves at the pace of Joe and Stitch, not homepad alone.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| QA task lease | ci-shared | IN_PROGRESS | Dispatched to Stitch as `stitch-qa-lease-20260929`; must expire and fail open | — |
| Staging-slot reservation | — | SHAPED | #493 — 'one defect behind 10 QA advisories' | — |
| QA-pod Playwright env | — | SHAPED | #507 #455 #452 #254 | — |
| Admin-modal browser coverage | — | SHAPED | #423 — AdminSettings and the custom-app form | — |
| Staging security headers | — | SHAPED | #414 — needs in-cluster verification | — |
| Old staging-env advisories | — | SHAPED | #256 #261 #487 | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

- **Lease:** Stitch (ci-shared), routed via Joe.
- **Pod environment and staging:** Joe / QA-agent infrastructure.
- Production is unaffected; this is the PR path.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| The lease locks a PR when a bot dies mid-task | MED | HIGH | Lease expires; fails open (in the brief) — a lost second review is better than an unreviewed PR |
| Declaring the lease 'working' from the wrong data | MED | MED | Measure with reviews ∪ comments, never reviews alone (L-003) |
| Cross-repo work stalls between owners | HIGH | MED | Each item names its owner; this milestone tracks, it doesn't assume |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| cycle-2 | #452 (+#455 #507), #423, #487, #414; infra routed to Joe; 16.7.2 | PLANNED | `.add/cycles/cycle-2.md` — A→B→C→E serial; 11/20 PRs already single-reviewer |

## Retrospective Notes

Filled in when the milestone completes.
