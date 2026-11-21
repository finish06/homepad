# Session Handoff

**Written:** 2026-11-20 (17.1.0 release PR opened)

## In progress
- **17.1.0 is in its release PR** (`release/17.1.0`). Everything is merged on main: web #560, #565, #566, #568, #574, #586; API #91, #93, #94, #97, #98, #99.
  - After merge: Caleb and Joe tag homepad-api `v17.1.0` on `2ef3d95` (or newer main) and homepad `v17.1.0`. The quickstart `compose.yaml` pins `17.1.0`, so tag both together.
  - Deploy the API first, then web. Prod promotion is Caleb's go, via Joe.
  - `HOMEPAD_SECRET_KEY` was unset on staging and prod at the 11-13 handoff; widget keys can't be saved until it's set. Creating it needs Caleb's go, via Joe.
- **18.0.0 specs are approved** on PR #579 (household management: strict iframe sandbox with opt-in, OIDC verified email, admin reset link).

## Next
- The 18.0.0 build, from the approved specs and plan on #579.

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
