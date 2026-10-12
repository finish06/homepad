# Milestone: M1 — 16.7.0 release + quick wins

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE (archived 2026-10-12)
**Started:** 2026-10-11 (cycle-1)
**Completed:** 2026-10-12, in one cycle (its whole appetite)
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Ship the ten commits sitting unreleased on `main` since v16.6.0 as **16.7.0** — #506 (the favorite ★ is a control only in arrange mode) is user-visible — together with the quick-win backlog: stale text, dead code and small correctness fixes that have each been verified still true, plus the spec-cleanup decisions folded in from the triage.

## Success Criteria

- [x] 16.7.0 tagged with `package.json`, `CHANGELOG.md` and `src/changelog.json` aligned (enforced by `tests/infra/changelog-version-alignment.test.ts`). *#512 → `v16.7.0` @ `9b4a7c5`; then #519 → `v16.7.1` @ `29cded3`.*
- [x] Promoted to production via Joe → Gus, and `/version.json` **at production** reports 16.7.0 with the expected SHA — not the rollout status. *Promoted straight to **16.7.1**, which contains 16.7.0 (Caleb's go, 2026-10-12): homelab `eb5f2d3` pins `homepad:29cded3-beta@sha256:62c6688…`. Prod `/version.json` = `{"version":"16.7.1","sha":"29cded3"}`, read at production 2026-10-12.*
- [x] Quick wins closed: #366, #427, #199, #318, #367, #377, #441, #235, #503, #172, #200. *All closed with a pointer to the PR that resolved each (#514, #515, #516). #367 was a decision, not a quick win: Caleb ruled **code wins** on 2026-10-12, and v25 AC-002 is amended in the close-out PR.*
- [x] #428 click-action segmented control built to Kare §8, with a real-browser gate. *#517 (`9aafc19`). QA's #518 (unequal widths under classic scrollbars) was fixed in-PR; the gate now reproduces it.*
- [x] Spec-cleanup decisions recorded on each issue (2026-10-11): #368 code wins · #295 AC-029 + test · #449 short spec — and #172 / #200 turned out not to be decisions (missing test; stale spec text)
- [x] All gates green: typecheck, lint, unit, browser gate, e2e, coverage at or above threshold. *At `29cded3`: 965 unit (96.45 / 90.2 / 91.45), gate 85/85, e2e 12 + 2 existing skips.*

## Appetite

One cycle. Small and mechanical by design. If a quick win turns out not to be quick, move it out rather than stretch the milestone.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Cut 16.7.0 | — | DONE | #512, `v16.7.0`; reached prod inside 16.7.1 | cycle-1 |
| Stale comments / spec text | — | DONE | #366 (#516); #427 #199 #318 (#515) | cycle-1 |
| `gatus_key` typed optional | specs/SPEC-v25-gatus-key-tile-health.md | DONE | #367 — **code wins** (Caleb, 2026-10-12): `?` kept, AC-002 amended | cycle-1 |
| Dead CSS selector | — | DONE | #377 (#516) | cycle-1 |
| Side effects inside a state updater | — | DONE | #441 — `tileDensity.ts`: `saveDensity` + `setDensityPref` inside `setDensity(cur => …)`; #443 was its duplicate. Fixed in #516; StrictMode test seen failing first | cycle-1 |
| Line-clamp test gap | — | DONE | #235 (#516) | cycle-1 |
| Click-action segmented control | specs/SPEC-tile-click-action-20260710.md §8 | DONE | #428 — **real UI work, mis-sized as a quick win in the roadmap**; its own cycle-1 item. Shipped in #517 | cycle-1 |
| Deploy temp-file cleanup | — | DONE | #503 (#514) | cycle-1 |
| Spec-cleanup decisions | — | DONE | **Decided 2026-10-11:** #368 code wins (spec §7 updated) · #295 AC-029 + test · #449 short spec · #172 and #200 were not decisions (a missing test; stale spec text). Landed in #515 / #516 | cycle-1 |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

- Production promotion goes through **Joe → Gus** (standing order) — not autonomous.
- Otherwise self-contained.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A 'quick' fix changes behaviour (#441 alters when density persists) | MED | MED | Each quick win carries a test; #441 gets a strict-mode double-invoke test before the fix |
| Release cut while M2's QA lease is mid-rollout | MED | LOW | Cut the release from `main` as it stands; the lease lives in ci-shared, not in the release |
| Verifying the release on the wrong surface | LOW | HIGH | Assert the SHA at the destination (L-010), never the version label |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| cycle-1 | 16.7.0 release; #503; spec text; code quick wins; #428; 16.7.1 release | COMPLETE | `.add/cycles/cycle-1.md` — A→D→B→C→E→F through the staging slot, in order; 16.7.1 in production |

## Retrospective Notes

- **Done in one cycle, as appetised:** 7 PRs (#512 #514 #515 #516 #517 #519, plus the plan #511), two releases, 16 issues closed with evidence, 16.6.0 → 16.7.1 in production.
- **Sizing was the weak spot.** Two "quick wins" weren't: #428 was real UI work, and #367 was a decision. Both were caught before they slipped the cycle, by re-reading the code rather than the issue title.
- **QA earned its keep.** #518 was real, and the browser gate couldn't see it, because Playwright hides scrollbars. The gate now reproduces it (see `.add/learnings.md`).
- **Two loose ends handed to Joe:** homepad's prod-release NATS notify returns 403 (the key is scoped to `friend.qa.task.*`); and the prod-release log tells you to pin a digest that house practice does not pin.
