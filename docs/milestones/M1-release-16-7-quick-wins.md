# Milestone: M1 — 16.7.0 release + quick wins

**Target Maturity:** GA (maintain)
**Status:** IN_PROGRESS
**Horizon:** NOW
**Started:** 2026-10-11 (cycle-1 planned)
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Ship the ten commits sitting unreleased on `main` since v16.6.0 as **16.7.0** — #506 (the favorite ★ is a control only in arrange mode) is user-visible — together with the quick-win backlog: stale text, dead code and small correctness fixes that have each been verified still true, plus the spec-cleanup decisions folded in from the triage.

## Success Criteria

- [ ] 16.7.0 tagged with `package.json`, `CHANGELOG.md` and `src/changelog.json` aligned (enforced by `tests/infra/changelog-version-alignment.test.ts`)
- [ ] Promoted to production via Joe → Gus, and `/version.json` **at production** reports 16.7.0 with the expected SHA — not the rollout status
- [ ] Quick wins closed: #366, #427, #199, #318, #367, #377, #441, #235, #503, #172, #200
- [ ] #428 click-action segmented control built to Kare §8, with a real-browser gate
- [x] Spec-cleanup decisions recorded on each issue (2026-10-11): #368 code wins · #295 AC-029 + test · #449 short spec — and #172 / #200 turned out not to be decisions (missing test; stale spec text)
- [ ] All gates green: typecheck, lint, unit, browser gate, e2e, coverage at or above threshold

## Appetite

One cycle. Small and mechanical by design. If a quick win turns out not to be quick, move it out rather than stretch the milestone.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Cut 16.7.0 | — | PLANNED | 10 commits on `main`; release PR + promotion | — |
| Stale comments / spec text | — | SHAPED | #366 #427 #199 #318 — verified present on `main` | — |
| `gatus_key` typed optional | — | SHAPED | #367 — `api.ts:75` still `gatus_key?: string` | — |
| Dead CSS selector | — | SHAPED | #377 — `index.css:2115` | — |
| Side effects inside a state updater | — | SHAPED | #441 — `tileDensity.ts`: `saveDensity` + `setDensityPref` inside `setDensity(cur => …)`; #443 was its duplicate | — |
| Line-clamp test gap | — | SHAPED | #235 — test omits `display: -webkit-box` | — |
| Click-action segmented control | specs/SPEC-tile-click-action-20260710.md §8 | SHAPED | #428 — **real UI work, mis-sized as a quick win in the roadmap**; its own cycle-1 item | — |
| Deploy temp-file cleanup | — | SHAPED | #503 — mine: under `set -e` a failed `curl` exits before `rm -f` | — |
| Spec-cleanup decisions | — | PLANNED | **Decided 2026-10-11:** #368 code wins (spec §7 updated) · #295 AC-029 + test · #449 short spec · #172 and #200 were not decisions (a missing test; stale spec text) | — |

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
| cycle-1 | 16.7.0 release; #503; spec text; code quick wins; #428; 16.7.1 release | PLANNED | `.add/cycles/cycle-1.md` — serial A→D→B→C→E→F through the staging slot |

## Retrospective Notes

Filled in when the milestone completes.
