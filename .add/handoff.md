# Session Handoff

**Written:** 2026-11-13 (after retro-2026-11-13)

## In progress
- **17.1.0 (household, backup/import, status widgets).** API halves merged: homepad-api #91, #93, #94, #97.
  - Web PRs open and mergeable, in this merge order: #565 household → #566 backup → #568 widgets. They conflict with each other; rebase the next after each merge.
  - **Blocked on #560**: mr-staging and staging-release can't fetch `Code/homelab` since the repos went private. Needs Caleb to turn on org Cross-Repository Access for `Code/homelab` (web UI only), then #560 switches to `gitea.token`; or Caleb OKs a read-only token as an Actions secret instead.
  - `HOMEPAD_SECRET_KEY` is unset on staging and prod; widgets need it. Creating it needs Caleb's go, via Joe.
  - Release notes must call out the new invite-only sign-up default.

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
