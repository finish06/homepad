# Session Handoff — homepad

**Written:** 2026-10-11T14:12:28Z
**By:** interactive session (Claude Opus 5)
**Mechanism adopted:** 2026-10-11 retro — Caleb directed that handoffs AND learning
checkpoints both start. This is the first handoff this project has ever had.

## Where things stand

- `gitea/main` = `e380643` (#508). **No open homepad PRs.**
- Latest release v16.6.0; #496..#508 ride the next release (unreleased on main).
- `ci-shared` `v3` → `34dec17` (moved 2026-10-11T04:50:55Z, annotated, rollback
  command in the tag message). Verified live in a real consumer run. tictactoe's canary
  pin **reverted** — all three workflows back on `@v3`.

## In flight, not mine

| Item | Owner | State |
|---|---|---|
| QA task lease (`friend.qa.task.<pr>`) | Stitch via Joe | dispatched `stitch-qa-lease-20260929` |
| `calebdunn.tech` staging RBAC failure | Joe | reported — CI SA in `homepad-staging` cannot apply Traefik `Middleware` into `calebdunn-staging`; **fails after partial apply**, so that namespace is half-converged |
| ci-shared PRs #32, #13 | Stitch | open, untouched |

## Open, needs a human

1. **Per-user tile drag for non-admins** (v29 §3.3) — `PUT /api/layout` already supports
   it per-user (no `requireAdmin`), so "Arrange apps" currently over-promises for that
   role: a non-admin gets the ★ and nothing else. Needs its own spec; it is a
   product-shape question, not an oversight.
2. **#477** sparkline keyboard focus — needs Kare on placement.
3. **#488** — settings copy/design.
4. **#492** — left open deliberately; premise corrected and retitled, awaiting the lease.

## Traps a new session should know

- `.add/learnings.md` and `.add/learnings.json` now hold **L-001..L-010**. **Read them
  before working** — several are about this repo's CI and QA mechanics specifically
  (L-001 QA dispatch, L-002 approval/merge rights, L-004 Gitea log reading, L-007 the
  pipefail trap).
- The scratchpad `gitea-askpass.sh` helper **vanishes between sessions** and its absence
  fails a push with a misleading "could not read Username". Recreate it before pushing.
- A Gitea job log contains script **text** as well as output. Grepping for an `echo`
  string matches on runs where it never executed (L-004).

## Update 2026-10-11 — triage + first roadmap

- **Backlog triage:** 71 open issues → **26 closed with evidence**, 45 remain. Every
  closure carries the specific proof (code line, real-browser measurement re-run on
  `57733eb`, or merged fix + QA verification). Two near-misses worth knowing: #403 was
  NOT closed — the advisory claimed the spec permits the build's behaviour, but spec
  §8.4 reads as a requirement; #443 was closed as a duplicate of #441 while noting its
  finding is still true.
- **Roadmap created** (first ever): `docs/prd.md` §6 + `docs/milestones/M1..M6`.
  `planning.current_milestone` = M1 (16.7.0 release + quick wins).
- **#503 is mine** (M1): temp files in the pipefail-fix deploy steps aren't removed
  when `curl` fails under `set -e`.
- **Staging is unreachable from the LAN** for verification: every `*.10.17.2.213.nip.io`
  host returns Traefik's `404 page not found` from this Mac, though deploys succeed.
  Vantage point, not an outage — but it means #414 needs in-cluster checking (M2).

## Update 2026-10-12 — cycle-1 in flight (Caleb away)

- **16.7.0 merged and tagged** (`v16.7.0` → `9b4a7c5`). **Not promoted** — Caleb's call on return; he may go straight to 16.7.1.
- **#514 (#503) merged**, self-tested on the real runner. Its staging-release was the first run of the new `staging-release.yml`.
- **#515 (spec text) open**, docs-only, needs Joe to land.
- **Item C committed (`232af5a` on `fix/quick-wins-cycle1`), PR held** for #514's staging-release to finish.
- **Remaining:** E (#428 segmented control), then F (16.7.1).
- **Decisions waiting for Caleb:** #367 (`gatus_key` optional vs spec), promotion of 16.7.0/16.7.1, #449 OQ-1 (no way back to "unset").
- **Shell trap that cost time:** in zsh, `set -- $VAR` does not word-split — use `read -r a b <<< "$VAR"`. It produced a check that printed all zeros because no log was fetched.
