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

## Update 2026-10-12 — cycle-1 complete, M1 closed

- `gitea/main` = `29cded3` (#519). **Production = 16.7.1 @ `29cded3`** (homelab `eb5f2d3`),
  verified from prod `/version.json`. 16.7.0 reached prod inside 16.7.1.
- **M1 COMPLETE.** Active milestone → **M2 (QA pipeline reliability)**; no cycle planned yet.
- **#367 decided (Caleb): code wins.** `gatus_key?` stays; v25 AC-002 amended.
- **Promotion digest:** pin the staging-release `<sha>-beta` build of the tagged commit
  (homelab 50527cb explains why). prod-release's printed digest is a separate rebuild.
- **With Joe, unconfirmed:** homepad's `NATS_PUBLISH_TOKEN` 403s on
  `joe.deploy.homepad.tag.*` (scoped to `friend.qa.task.*`), so no deploy notifications
  have been sent automatically since at least 16.7.0.
- **Still open for Caleb:** #449 OQ-1 (no way back to "unset"), #513 (★/pencil overlap, M4),
  Kare's view on #517's two trade-offs (320px widths; hint #525252 vs #475069).
- Reply-to name for cross-session messages: give the exact session name (`ListAgents`),
  not "the homepad session".

## Update 2026-10-12 — roadmap: M1 archived

- PRD §6: **M1 moved Now → Done** (Caleb, `/add:roadmap --edit`). Now = M2 only; Next = M3, M4;
  Later = M5, M6. The milestone file is kept; its Horizon reads DONE.
- Docs synced: spec count 39 → 40 (CLAUDE.md, PRD); `specs/README.md` and spec status lines
  record what shipped in 16.7.x (#428 segmented control, v29 in prod, v25 AC-002 amended).
- The "Where things stand" block at the top of this file is from 2026-10-11 — read the
  dated updates below it for current state.

## Update 2026-10-12 — cycle-2 planned (M2)

- Plan: `.add/cycles/cycle-2.md`. Caleb is **away**; it runs autonomously. 16.7.2 gets tagged at the end and is **not promoted**.
- Order: A #452 (6 gate specs bypass `./fixtures`; this is the root cause of #455/#507) → B #423 admin-modal gates
  → C #487 (measure centring at 1400px) → E 16.7.2. D #414 closes on Joe's in-cluster staging check.
- Starts once #520 merges. Update the log **after every merge** this time.

