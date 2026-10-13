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

- 2026-10-11 (L-004): Gitea Actions API — the `id` in `actions/tasks` is NOT the run id
  (`/actions/runs/{that_id}` 404s); the run id is the last segment of the object's own
  `url`. Job logs only at `actions/jobs/{job_id}/logs`. A job log contains the script
  TEXT as well as its output, so grepping for an `echo` string matches twice on success
  and once where it never executed — anchor on the timestamp prefix.
- 2026-10-11 (L-007): `deploy-cmd` runs under `bash --noprofile --norc -e -o pipefail`,
  which is INVISIBLE in ci-shared (the composite declares plain `shell: bash`; Gitea
  expands it). So `curl … | sed '/^---$/q' | kubectl apply -f -` fails nondeterministically:
  curl exits 23 on the closed pipe and pipefail promotes it, AFTER the apply succeeded.
  Reproduced 25/25; download-then-extract 0/40.
- 2026-10-11 (L-002): `ci-docs-approver` can approve but NOT merge (405, review-only
  scope), so a docs PR can sit green AND approved indefinitely.

- 2026-10-12 (L-011): Playwright launches Chromium with `--hide-scrollbars`, so a width
  gate measures as if scrollbars take no space. #518: the #428 group was 303px in the gate
  (macOS and the CI image) but 273px in QA's browser, where page + modal scrollbars take
  15px each. Width gates opt out (`ignoreDefaultArgs: ['--hide-scrollbars']`) and add a
  classic-scrollbar case; reproduce QA's numbers before fixing.

- 2026-10-13 (L-015): A safety guard in one helper doesn't protect a package that bypasses
  it. homepad-api #67 guards `internal/testsupport` against truncating a non-test database, but
  `internal/storage` tests open the database through an unguarded `requireDatabaseURL` and
  `TRUNCATE users … CASCADE`; that's how the `stg-Test*` users got into staging (homepad-api#72).
  Guard the single choke point every path goes through.
- 2026-10-13 (L-016): `curl -H @- -d @-` both read stdin, so every Gitea call 422s and
  nothing is posted. The header takes stdin; the body goes in a file.

## Architecture Decisions
- 2026-09-15: ADD adopts the existing `specs/` directory and house spec format rather
  than introducing a parallel ADD-format spec tree, because `specs/README.md` is already
  the authoritative index and reformatting would create two sources of truth.

- 2026-10-11 (L-003): The recurring "merge race" is a misdiagnosis. ~5s approve→merge is
  89% of all merges (25/28, median 5s) — it is an atomic bot action, not a race. The real
  defect is duplicate QA dispatch with no claim: 10/28 PRs worked by both ada and gracie,
  7/28 with findings landing post-merge. Fix is a lease on `friend.qa.task.<pr>`, not a
  merge delay. Caleb's decision 2026-09-29.
- 2026-10-11 (v29): The personal/admin boundary moved from "who can open arrange mode" to
  "what the mode contains" — `arranging = editMode` (any user, the ★) vs
  `editing = isAdmin && editMode` (shared-catalog affordances). Required because favoriting
  is per-user server-side; gating it on the admin flag would have removed it from every
  non-admin.

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

- 2026-10-11 (L-005): Two surfaces stating one fact — checking one proves nothing about
  the other, INCLUDING in tests. `code-splitting.test.ts` greps `src/` and stayed green at
  2 passed while `manualChunks` folded every overlay into the entry chunk and the initial
  download grew 98.8 → 108.2 kB.
- 2026-10-11 (L-006): Thresholds picked by feel were wrong in BOTH directions in one file
  — JS budget 16% too loose, CSS budget 1.7x too tight (set by analogy to the JS ratio
  rather than measured). Build the historical series first.
- 2026-10-11 (L-008): Measuring activity cannot conclude abandonment. Three workflows were
  called dead on last-run date and approved for retirement; two were serving LIVE public
  sites on Caleb's own domains, triggered on `paths:` that simply had not changed. Read the
  trigger. And an approval is for the thing DESCRIBED — when the description is false the
  approval does not transfer.
- 2026-10-11 (L-009): A comment asserting "all callers do X" is a tree-wide claim that ages
  silently. 0016's "CreateUser always supplies it" was false of `seed_demo.go`, which would
  have killed the demo container on every cold start.
- 2026-10-11 (L-010): A QA brief must assert the SHA, never the version — only a release PR
  bumps `package.json`, so "version matches" green-lights any build.

- 2026-10-13 (L-014): A Remote Control send that says "delivered" proves nothing. Four sends
  to joe_tmux_1 never reached Joe, and two of his never reached me; the fourth send's result
  noted the name pointed at a **new session**, and Joe answered every issue within minutes.
  Put the full ask on the Gitea issue first, make the message a pointer, resend everything
  when a send reports a new session under an old name, and treat silence past ~1h as a
  delivery failure.

## Agent Checkpoints
- 2026-09-15 (post-verify, adoption): Gates 1-2 pass, 804/804 unit tests pass,
  browser gate 49/50. Evidence score 11/12 → GA.

- 2026-10-11 (/add:retro, FIRST retro): 26 days, 36 commits, 28 PRs merged, 5 releases
  (16.3.0 → 16.6.0), 42 specs. Learning checkpoints and handoffs both produced NOTHING for
  the whole window — one `learnings.json` entry existed and it was a compliance-bypass
  record. Delivery discipline was strong (strict gates, negative controls on every new
  guard, no self-merges); the knowledge loop was unused. Caleb's decision: start BOTH
  mechanisms. Scores: collaboration 4.1-6.0 band (human), ADD effectiveness 4.3,
  swarm 7.0.

- 2026-10-12 (L-012, cycle-1 complete): 2 days, 6 items in serial order, 7 PRs, 16 issues
  closed with evidence, one QA block (#518) fixed in-PR, 16.7.1 in production. Sizing was
  the weak spot (#428, #367 weren't quick wins). The cycle log and handoff were written
  once at close-out instead of after each merge — do it per merge next cycle.

- 2026-10-13 (L-013, cycle-2 complete): the agent items (A, A2, B, C, E) merged in a day,
  6 PRs, all single-reviewer; 16.7.2 released, not promoted; 8 issues closed with evidence.
  The close then waited ~8h on cluster and pod evidence behind a route that silently dropped
  messages. Gitea auto-closed #455 and #507 from squash titles; use "Refs #N" in PR titles
  when the closing evidence is a separate run.

## Profile Update Candidates
