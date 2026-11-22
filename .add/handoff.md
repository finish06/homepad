# Session Handoff

**Written:** 2026-11-21 (18.0.0 release commit drafted)

## In progress
- **18.0.0 is drafted on `release/18.0.0`**, on top of the sign-in hardening branch. It goes to main after specs 3 (reset link) and 4 (sign-in hardening) merge, web and API; then rebase it onto main.
  - Web on main: #592, #600, #601. API on main: #101, #103, #104. API still open: reset link and sign-in hardening.
  - The CHANGELOG and changelog.json date (2026-11-21) is a placeholder; set it to the merge day.
  - After merge: tag homepad-api `v18.0.0` and homepad `v18.0.0` together. The quickstart `compose.yaml` pins `18.0.0`.
  - Deploy the API first, then web. Prod promotion is Caleb's go, via Joe. Take a database dump first: migration `0021` is one way.

## Next
- Ship 18.0.0: prod deploy, site and README.

## Follow-ups
- Close #562 (superseded by #570); delete the `diag/kid-accounts-e2e-frame-cost` branch.
- og:description text; URL-scheme check on the single-app routes; CSS split.
- Remove stale worktrees.

## Growth (M7)
- 49 visitors / 30d at the 11-12 deadline (target 96, missed, accepted). Joe's Monday pull continues on getHomepad #26; add the M7 row each Monday.
- Launch posts still wait on Caleb (drafts in getHomepad #30). Best timed right after 17.1.0.
- Open list PRs: awesome-dashboard #56, awesome-pwa #549.

## Rules learned this window
L-022…L-026: one clear owner ask plus a workaround, then slow the check; reserve shared files for parallel builds; verify no Docker after agent runs; measure CI frame cost before adding waits; sync "never waits" tests on events, not time.
