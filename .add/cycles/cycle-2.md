# Cycle 2 — QA pipeline: make the browser gate run in the QA pod, cover the admin modals, route the infra

**Milestone:** M2 — QA pipeline reliability
**Maturity:** ga
**Status:** IN_PROGRESS
**Started:** 2026-10-12
**Completed:** TBD
**Duration Budget:** ~1 cycle (half of M2's two-cycle appetite). As in cycle-1, the **strictly serialized staging slot** bounds throughput, not coding time.
**Planned:** 2026-10-12, with Caleb. He is **away**: the cycle runs autonomously, and nothing touches production.

## Evidence the plan rests on (gathered 2026-10-12, at `29cded3`)

| Finding | Evidence | Consequence |
|---|---|---|
| **#452 is the root cause of #455 and #507, and it is wider than filed** | **6** gate specs import `@playwright/test` directly, bypassing `tests/browser-gate/fixtures.ts`: a11y-touch-v19, fav-star-arrange-gate-v29, tile-density, header-search-centered, health-bar-toggle, uptime-pref-visible-476. The fixture routes the browser over CDP to the pod's Chromium sidecar, because the QA pod deliberately lacks the system libraries for a bundled browser. "Executable doesn't exist" (#455) and "missing libglib-2.0" (#507) are what that bypass produces | One homepad fix plus a guard closes three issues |
| **Duplicate QA appears to have stopped** | 11 merged PRs (#506–#519) by reviews ∪ comments: 10 had exactly one pool member. #517 had two, **sequentially** (gracie blocked `9052c04`, ada re-QA'd `89573b8` after a re-dispatch). Not duplicate dispatch. L-003 measured 36% before | These 11 count toward M2's 20-PR criterion. Homelab #271 (the lease PR) is still unmerged since 09-29, so *what* stopped it must be confirmed with Joe |
| **#414 is fixed in production** | Prod response headers include `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy`, `permissions-policy`; `/version.json` is `no-store`. This came from homelab `b3b3c55` (deploy-owned nginx ConfigMaps) | Staging needs an **in-cluster** check (unreachable from the LAN), then close |
| **#423 is still true** | No gate spec references AdminSettings, ServiceForm or the custom-app form | Real work this cycle |
| **#487 can be measured, not argued** | `header-search-centered.spec.ts` measures 1024 / 1440 / 2560, not 1400 | Measure at 1400; either the 8px is real (fix or pin) or it is unsourced (close with the measurement) |

## Decisions taken in planning

| Question | Decision |
|---|---|
| Scope | **Homepad-side work, plus routing the infra items to Joe** (Caleb). |
| Availability | **Away**: run autonomously. |
| Release | **Cut 16.7.2 at cycle end**: tagged and built, **not promoted**. |

## Work Items

| # | Item | From | To | Owner | Effort | Validation |
|---|---|---|---|---|---|---|
| A | **#452 (closes #455, #507)**: move all 6 specs onto `./fixtures`, plus an infra guard that every `tests/browser-gate/*.spec.ts` imports its `test` from `./fixtures` | SHAPED | DONE | Agent | ~3h | Guard fails on each of the 6 before the fix (negative control). Gate is green on macOS **and** in `playwright:v1.60.0-noble`. **QA runs the gate in the pod** and reports no launch failures. The #518 file's `test.use({launchOptions})` must survive the fixture swap |
| B | **#423**: real-browser gates for **AdminSettings** and the **custom-app form** (mocked API, admin role) | SHAPED | DONE | Agent | ~1d | Each opens, validates, saves (asserting the request body) and closes in a real browser at iPad 768 and phone 375. Each gate fails when the behaviour it pins is removed |
| C | **#487**: measure LauncherTrigger centring at **1400px**; add 1400 to `header-search-centered.spec.ts` | SHAPED | DONE | Agent | ~1h | The drift is measured and recorded on #487. If it exceeds the spec's tolerance, that's a real defect: file it, keep the case red-then-green. If not, close with the number |
| D | **#414**: close-out | SHAPED | DONE | Agent + Joe | ~15m | Prod headers (above) plus an in-cluster `curl -I` of staging from Joe or the QA pool. Closed only on both |
| E | **Release 16.7.2**: after A–C merge; tag `v16.7.2` | PLANNED | DONE (tagged, built) | Agent | ~1h + QA | Alignment test green. prod-release builds and validates. The digest recorded is the **staging-release `-beta` build of the tagged commit** (L-012 / homelab `50527cb`). **Not promoted** |

### Routed to Joe this cycle (tracked, not owned)

| Item | Ask |
|---|---|
| Lease status | What stopped duplicate dispatch, given homelab #271 is unmerged? Merge it, close it, or document where the lease actually lives |
| #493 staging-slot reservation | Owner and plan. homepad changes nothing until a design exists |
| #254 CDP sidecar HTTP cache leaks across QA tasks | Confirm whether still true. If the sidecar gives each task a fresh context, close it |
| #256 / #261 (July staging DB and creds) | Confirm obsolete or fixed |
| #414 staging | One in-cluster `curl -I` of `homepad-web.homepad-staging.svc` |
| NATS notify 403 (from cycle-1) | homepad's `NATS_PUBLISH_TOKEN` is scoped to `friend.qa.task.*` and can't publish `joe.deploy.homepad.tag.*` |

## Dependencies & Serialization

```
#520 (cycle-1 close-out) ─► A (#452) ─► B (#423) ─► C (#487) ─► E (16.7.2)
                                                   D (#414) — issue-only; closes when Joe's staging check lands
```

- **A goes first.** B's new gates must be written against the fixture A makes mandatory, and A's guard would otherwise fail B.
- **#520 must merge before A's PR opens**, because it moves the active milestone and config this plan relies on.
- Strictly serial through the staging slot, as in cycle-1.

## Parallel Strategy

Single orchestrator, no sub-agents: the staging slot is the bottleneck, and every item touches `tests/browser-gate/`.

### File Reservations

| PR | Owns |
|---|---|
| A | `tests/browser-gate/{a11y-touch-v19,fav-star-arrange-gate-v29,tile-density,header-search-centered,health-bar-toggle,uptime-pref-visible-476}.spec.ts`, new `tests/infra/browser-gate-fixture-import.test.ts` |
| B | new `tests/browser-gate/admin-settings-*.spec.ts`, `tests/browser-gate/custom-app-form-*.spec.ts`; `tests/browser-gate/mockApi.ts` only if an admin endpoint is missing |
| C | `tests/browser-gate/header-search-centered.spec.ts` (after A has landed in it) |
| E | `package.json`, `package-lock.json`, `CHANGELOG.md`, `src/changelog.json` |

### Merge Sequence

A → B → C → E. Each merges only on QA-pool approval, and the next opens only after the previous one's staging-release log shows `successfully rolled out`.

## Validation Criteria

### Cycle Success Criteria
- [ ] #452, #455, #507, #423, #487 and #414 closed with evidence (#455 and #507 on a QA-pod run, not a local one)
- [ ] Every gate spec goes through `./fixtures`, **enforced by a test**, not by a comment
- [ ] Every new guard negative-controlled; gate green on macOS and in the CI image
- [ ] 16.7.2 tagged and built, digest (the `-beta` staging build) recorded, **not promoted**
- [ ] Each routed item has an answer or a named owner from Joe, recorded on its issue
- [ ] **Cycle log and handoff updated after every merge** (missed in cycle-1, L-012)

## Agent Autonomy & Checkpoints

**Autonomous:** branches, commits, pushes, PRs; every gate; QA dispatch through Joe; tagging `v16.7.2` after its release PR merges.

**Not autonomous:** merging (the QA pool merges); production; anything in ci-shared, homelab or the QA pods (those go to Joe); changes outside the reservations above.

**Checkpoints:** after **each** merge, update this log and `.add/handoff.md`. Address replies to `homepad-21` (cycle-1: an inexact reply-to name went unanswered).

**If blocked:** log it and move to the next independent item. An item that fails QA twice is pulled.

## Monitoring & Rollback (GA)

- **Staging:** `mr-staging` and `staging-release` each confirmed by the `successfully rolled out` log line (L-007).
- **Production:** untouched. 16.7.2 is tagged only; a promotion would need Caleb's go.
- **Rollback:** revert the PR. These are tests and test infrastructure. No `src/` behaviour change is planned, and any change to `src/` is out of scope.

## Notes

- **One reviewer per PR** is Caleb's accepted deviation from GA's two (cycle-1 Notes). It still stands.
- **Hidden scrollbars (L-011):** any new width-sensitive gate in B opts out of `--hide-scrollbars`.
- **A release with no user-visible change.** 16.7.2's changelog entry should say plainly that it is test and QA-infrastructure work, so a reader doesn't hunt for a feature.

## Progress Log

| Time | Item | Status | Notes |
|---|---|---|---|
| 2026-10-12 | planning | done | Plan agreed with Caleb: scope, away, release 16.7.2 |
| 2026-10-12 | plan (#521) | merged | gracie approved at `8688159`. Docs-only, so no staging slot used |
| 2026-10-12 | A — #452 (#522) | in QA | `5a48b15`. Pod-sim (no browser, Chrome 148 CDP sidecar): main fails 35/35 with #455's exact error; the branch passes 35/35, full gate 85/85. Asked QA for a real pod run to close #455/#507 |
| 2026-10-12 | B — #423 | built, held | `3ab5b64` on `feat/admin-modal-gates-423`, stacked on A. 14 tests, 7 negative controls, 99/99 on mac, CI image and pod-sim. PR opens after A merges and rolls out |
| 2026-10-12 | (lesson) | — | A negative control whose mutation breaks typecheck leaves the **previous** `dist/` in place, and the gate silently tests that. The harness now `rm -rf dist` and fails loudly on a build error |
| 2026-10-12 | C — #487 | built, held | `2437659` on `feat/centre-1400-487`, stacked on B. At 1400px: 0.0px from the row centre; 7.5px from the **window** centre with a classic scrollbar. That's the "8px", and it isn't a defect. Measurement posted on #487. A 24px-shift negative control fails every width |

