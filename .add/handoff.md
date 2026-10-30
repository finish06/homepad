# Session Handoff

**Written:** 2026-10-30 (after retro-2026-10-30; before /add:away 24h)

## In progress
- **Kid accounts (SPEC-kid-accounts, plan `docs/plans/kid-accounts-plan.md`).**
  - Phases 1–3 are merged in homepad-api: #81 (persistent sessions) and #83 (kid role, filtering, admin API), on staging at 5850ef9.
  - Phase 4 (the frontend) is on branch `feat/kid-accounts-web` (head 355a97a, worktree `../homepad-kids-web`), with all gates green. PR to be opened; it carries the M7 10-26 row folded in from #545.
- **Release 17.0.0** comes after Phase 4 merges: a `release:` PR (package.json, CHANGELOG.md, src/changelog.json). The prod promotion needs Caleb's go, via Joe and Gus.

## Follow-ups
- homepad-api #84: uploaded icons 404 for everyone except the catalog owner.
- The `demo-seed` branch still calls the removed `session.NewManager()`; it needs PgStore plus the sweeper before any rebase.
- Kid board layout polish (tiles fill the width); needs a design decision.
- Close homepad-api #35 and #36 (already fixed).

## Growth (M7, goal 96 visitors / 30d by 2026-11-12)
- At 35. Launch posts haven't gone out (they need Caleb's accounts). Drafts are in `getHomepad/docs/launch-kit.md`.

## Rules learned this window
L-017…L-021: schedule time-gated checks; reach Joe on two channels and escalate; staging is http-only; build work goes to Opus agents at high effort; schedule owner-dependent growth steps first.
