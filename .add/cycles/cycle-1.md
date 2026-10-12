# Cycle 1 — Release 16.7.0, then clear M1's quick wins and spec decisions

**Milestone:** M1 — 16.7.0 release + quick wins
**Maturity:** ga
**Status:** IN_PROGRESS
**Started:** 2026-10-12
**Completed:** TBD
**Duration Budget:** ~1 cycle (M1's whole appetite). Throughput is bounded by the **strictly serialized staging slot**, not by coding time — one PR in QA at a time.
**Planned:** 2026-10-11, with Caleb. He is **away** for the cycle: work runs autonomously; production promotion waits for him.

## Decisions taken in planning

| Question | Decision |
|---|---|
| Sequencing | **Release first.** 16.7.0 is cut from `main` as it stands (the 10 merged, QA'd commits — #506 is user-visible). Quick wins ship afterwards as **16.7.1**. |
| #428 | Real UI work, not a quick win (mis-sized in the roadmap). **Its own item this cycle**, TDD + browser gate. |
| #368 | **Code wins** — spec §7 updated to the conditional `gatus_key` PATCH. |
| #295 | **AC-029 + a test** for the uptime toggle's error-revert (implemented, but untested and un-numbered). |
| #449 | **Short dedicated spec** for `statusDegradedMs`. |
| #172, #200 | Turned out **not to be decisions** on checking the code — a missing test and stale spec text. Folded into quick wins. |

All five recorded on their issues.

## Work Items

| # | Item | From | To | Owner | Effort | Validation |
|---|---|---|---|---|---|---|
| A | **Release 16.7.0** — `package.json`, `CHANGELOG.md`, `src/changelog.json`; tag `v16.7.0` after merge | PLANNED | DONE (tagged, built) | Agent | ~1h + QA | Alignment gate green; `prod-release` builds and validates the tag; **not promoted** |
| D | **#503** — remove the deploy temp files on failure too (`trap`), both workflows | SHAPED | DONE | Agent | ~1h | Its own `mr-staging` run exercises the change; a forced-failure reproduction leaves no temp files |
| B | **Spec text** (docs-only PR): #427, #199, #318, #200, #368 (§7), #449 (new spec) | SHAPED | DONE | Agent | ~3h | Each fix checked against the code it describes; `specs/README.md` index updated for the new spec |
| C | **Code quick wins**: #366, #367, #377, #441, #235, #172, #295 (AC-029 + test) | SHAPED | DONE | Agent | ~1d | Typecheck, lint, unit, coverage ≥ thresholds; **#441 test written first and seen failing**; every new test negative-controlled |
| E | **#428** — click-action `<select>` → three-segment control per Kare §8.1.1–8.1.5 | SHAPED | DONE | Agent | ~1d | TDD; §8.1.2 copy exact; keyboard + touch per §8.1.5; real-browser gate; existing tile-edit gates stay green |
| F | **Release 16.7.1** — after B–E merge; tag `v16.7.1` | PLANNED | DONE (tagged, built) | Agent | ~1h + QA | As A; not promoted |

## Dependencies & Serialization

```
A (16.7.0) ──► D (#503) ──► B (spec text) ──► C (code quick wins) ──► E (#428) ──► F (16.7.1)
```

Strictly serial, for three reasons:

1. **A must merge before anything else lands**, so that 16.7.0 is exactly the 10 commits already QA'd — no unreviewed change rides in.
2. **The staging slot is serialized strictly** (standing order). Parallel PRs would only queue for it, or overwrite each other's staging build mid-review (#493).
3. **D goes second because it edits the deploy path** every later PR's `mr-staging` runs through — landing it early means B, C, E and F each exercise it, which is free extra validation.

## Parallel Strategy

GA would allow 3–5 agents. This cycle runs **single-threaded, one orchestrator, no sub-agents**: the bottleneck is the serialized staging slot, so parallel agents would add coordination cost without adding throughput — and multi-agent dispatch was not requested.

### File Reservations

One agent, so reservations exist to keep the **PRs** from colliding, not agents:

| PR | Owns |
|---|---|
| A, F | `package.json`, `CHANGELOG.md`, `src/changelog.json` |
| D | `.gitea/workflows/mr-staging.yml`, `.gitea/workflows/staging-release.yml` |
| B | `specs/**` only — **no `src/`**, so it stays a docs-only PR |
| C | `src/library/ServiceForm.tsx`, `src/api.ts`, `src/index.css` (#377 selector only), `src/grid/tileDensity.ts`, `src/services.test.tsx`, `tests/infra/tile-name-suffix-195.test.ts`, `src/library/SettingsPanel.test.tsx`, `specs/cap6-uptime-display-toggle.md` (AC-029 row ships **with** its test) |
| E | `src/grid/TileEditModal.tsx`, its tests, `tests/browser-gate/` (new spec) |

The one deliberate overlap: C touches `specs/cap6…` for AC-029, and B does not, so the AC lands in the same PR as the test that pins it.

### Merge Sequence

A → D → B → C → E → F, each merging only on QA-pool approval, the next opened only after the previous one's staging-release succeeds.

## Validation Criteria

### Per-Item Validation
- **A / F:** `tests/infra/changelog-version-alignment.test.ts` green; tag == CHANGELOG top == `package.json`; `prod-release` builds and validates; image digest recorded for promotion.
- **D:** the PR's own `mr-staging` run is green and shows the cleanup path; a local reproduction with a forced `curl` failure under `bash -e -o pipefail` leaves no temp files (the 25/40-iteration harness from #502 is reused).
- **B:** every corrected statement re-checked against the code it describes; no `src/` change; the new #449 spec is in `specs/README.md`.
- **C:** each quick win closes its issue with evidence; #441's strict-mode test fails before the fix; AC-029's test fails if the revert is removed.
- **E:** §8 copy and styling match exactly; keyboard and touch behaviour per §8.1.5 verified in a real browser; no regression in `tile-edit-*` gates.

### Cycle Success Criteria
- [ ] 16.7.0 and 16.7.1 tagged and built by `prod-release`, digests recorded, **both awaiting Caleb for promotion**
- [ ] All 16 issues in scope closed with evidence: #503 #427 #199 #318 #200 #368 #449 #366 #367 #377 #441 #235 #172 #295 #428 (+ #443 already closed as #441's duplicate)
- [ ] Every PR merged through the QA pool; no self-merge; no PR merged with a failing check
- [ ] `main` green on every gate at cycle end; coverage ≥ thresholds (functions ≥ 90)
- [ ] Handoff and cycle log current after every merge

## Agent Autonomy & Checkpoints

Caleb is **away**. Elevated autonomy within these lines:

**Autonomous:** branches, commits, pushes, PRs; running every gate; dispatching QA **through Joe** (the pool only takes NATS dispatches — L-001); tagging `v16.7.0` / `v16.7.1` after their release PRs merge (tagging builds and validates; it does **not** deploy).

**Not autonomous:** merging (the QA pool merges on approval — standing order); **production promotion** of either release (queued for Caleb's return, then Joe → Gus); anything irreversible; any change outside this plan's file reservations.

**Checkpoints:** after each merge — update this file's log and `.add/handoff.md` (both mechanisms adopted at the 2026-10-11 retro), and record a learning if one occurred. Brief status pulses in the conversation.

**If blocked:** log it, move to the next item that doesn't depend on it. A item that fails QA twice is pulled from the cycle, not forced.

## Monitoring & Rollback (GA)

- **Staging:** every PR's `mr-staging` and each merge's `staging-release` must succeed, and the log must show `successfully rolled out` — a green status alone is not evidence (L-007: a deploy step can fail after partially applying, and pass with nothing applied).
- **Verification vantage point:** staging **can't be reached from the LAN** for checks (every `*.10.17.2.213.nip.io` host returns Traefik's 404 from here). Destination checks of `/version.json` therefore go through the in-cluster QA pool or Joe, asserting the **SHA**, never the version (L-010).
- **Production:** not touched this cycle. On promotion, `/version.json` at prod with the expected SHA, Gatus green, the Umami alert quiet.
- **Rollback:** staging — revert the PR. Production (on promotion) — re-pin the previous digest in `Code/homelab`; for 16.7.0 that is v16.6.0's `sha256:56a64ebc…`.

## Notes

- **Accepted deviation — review depth.** ADD's GA guidance is two reviewers; this project merges on **one** QA-pool approval, and Caleb chose one reviewer per PR (the QA lease, 2026-09-29) knowing it trades away the second opinion. Recorded here so it is a decision, not drift.
- **Duplicate QA dispatch is not fixed yet** (M2). A second reviewer's findings may land **after** a merge, as an issue comment invisible to the reviews API. Read comments, not just reviews, before treating any PR as settled (L-003).
- **#428 was mis-sized in the roadmap** as a quick win; corrected here.
- Promotion on return can go straight to 16.7.1, which contains 16.7.0 — Caleb's call.

## Progress Log

| Time | Item | Status | Notes |
|---|---|---|---|
| 2026-10-11 | planning | done | Plan agreed; five decisions recorded on their issues |
| 2026-10-12 03:11Z | **A** 16.7.0 | **done** | #512 merged by ada → `9b4a7c5`. staging-release log: `image updated` → `successfully rolled out`. Tagged `v16.7.0` (lightweight, matching v16.6.0). prod-release builds + validates and does NOT deploy (re-read, not remembered); it fires `joe.deploy.homepad.tag.16.7.0` — Joe told explicitly that is not a promotion. **Promotion held for Caleb.** |
| 2026-10-12 03:18Z | **D** #503 | **merged** | #514 merged by gracie → `9b148b2`. Self-test: its own mr-staging (run 5955) executed the new trap, used the `WORK` dir, rolled out, no exit 23. **Scope widened on evidence:** the advisory's "no data exposure" was untrue of `/tmp/kc` (staging kubeconfig), which leaked on every failure path incl. rollout timeout — fixed together. Trap is `rc=$?; set +e; …; exit $rc`: both simpler forms were measured turning a successful deploy red. First harness was blind to temp files; the negative control exposed it. staging-release on merge (run 5960, first run of the new staging-release.yml) in progress. |
| 2026-10-12 | **B** spec text | PR #515 open | All checks green. **Deviation from plan:** opened alongside D, not after it — docs-only PRs skip the staging deploy, and the serialization was only ever about the slot. Needs Joe to land (ci-docs-approver can approve, not merge). |
| 2026-10-12 | **C** code quick wins | committed `232af5a`, PR held | Held for D's staging-release. #441 found to double-fire only on QUEUED updates (a lone change is computed eagerly) — a single-change test passes on the bug. #172 triage note was wrong: AC-003 holds. **#367 pulled out** — contradicts a documented choice in api.ts; spec-vs-code, logged on the issue for Caleb. |
| 2026-10-12 | new issue | **#513** filed → M4 | Found while correcting v21 for #318: ★/pencil 44px hit areas overlap at compact (456px²) and list (860px²) — the pencil wins. Admin-only, arrange-only. Not fixed this cycle. |
