# Project Learnings — homepad

> **Tier 3: Project-Specific Knowledge**
>
> Maintained automatically by ADD agents at checkpoints and reviewed during retrospectives.
> Agents read all three knowledge tiers before starting work.

## Technical Discoveries
- 2026-09-15: Coverage reads far lower than reality because `vite.config.ts` had no
  `coverage.exclude` — config files, `qa-kit/` scripts and a vendored 2,097-line
  `qa-artifacts/design/v16-ui/support.js` plus bundled React copies were counted.
  Reported 61.98% vs 94.85% on `src`. Source: /add:verify at adoption.
- 2026-09-15: `npm run build` must precede `npx vitest run` on a clean checkout —
  `tests/infra/pwa-icons.test.ts` reads `dist/`, so 9 tests fail otherwise.
  Source: /add:verify at adoption.
- 2026-09-15: Node 16 cannot build this repo (`engines: >=20 <23`, `.nvmrc` 22).
  Source: /add:verify at adoption.

## Architecture Decisions
- 2026-09-15: ADD adopts the existing `specs/` directory and house spec format rather
  than introducing a parallel ADD-format spec tree, because `specs/README.md` is already
  the authoritative index and reformatting would create two sources of truth.

## What Worked
- The `tests/infra/` quarantine for source-contract suites: brittle `readFileSync` greps
  over configs and CSS live apart from component tests, so a stylesheet change knows
  exactly which suite it must update.
- Real-browser gate with a mocked API serving `dist/` — catches layout/paint/hit-test
  regressions jsdom cannot, without needing a backend.

## What Didn't Work
- 2026-09-15: `tests/browser-gate/app-grid-fav-a11y-v20.spec.ts:65` hardcodes
  `/home/stitch/work/...` as a screenshot path, so it passes only on one machine and
  fails with ENOENT everywhere else. Absolute paths in tests do not survive their author.
- 2026-09-15: Spec `Status:` lines drift from reality — v13, v21, v22, v28 are built but
  not marked so, and cap5 still says "bug-fix required" for an AC-015 that is implemented
  and tested. Status in prose has no mechanism keeping it honest.

## Agent Checkpoints
- 2026-09-15 (post-verify, adoption): Gates 1-2 pass, 804/804 unit tests pass,
  browser gate 49/50. Evidence score 11/12 → GA.

## Profile Update Candidates
