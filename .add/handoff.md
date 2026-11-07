# Session Handoff

**Written:** 2026-11-07 (end of `/add:away 4h`; session branch `chore/away-20261107` off `9c7ce48`)

## In progress
- PRs are open against `main` (all verified mergeable); QA one at a time per the
  one-staging-slot rule:
  - **#554** `chore/comment-hygiene-20261107` — stale width comments + dead `MAX_WIDTH`
  - **#555** `fix/node26-storage-spy` — the #441 tests on Node 26
  - **#556** `chore/away-20261107` — ADD/spec state reconciled + the v17 review doc

## Completed this session
- Retro cadence: **bypassed** by explicit owner decision ("Go - B"), recorded as
  `compliance-bypass-20261107` (2nd in 30 days -> warned). The retro is still owed.
- `SPEC-kid-accounts.md`: APPROVED -> SHIPPED v17.0.0 (`fc5a191`, PR #546; api #81/#83).
- `.add/config.json` `changelog.lastVersionTag` v16.2.0 -> v17.0.0; cycle-3 log now
  carries the 17.0.0 release + prod state (prod `/version.json` = 17.0.0).
- Verified `main`: tsc clean, 0 lint errors, build OK, **1175/1175 tests**,
  coverage 96.82% lines / 91.18% branches / 92.73% functions (threshold 90).
- Fixed the Node 26 failure: the #441 tests spied on `Storage.prototype` but the
  Web Storage shim installs a standalone `MemoryStorage` (learning L-022).
- `docs/reviews/2026-11-07-v17-review.md` — kid accounts + persistent sessions.

## Decisions made
- No merges, no deploys, no issue closures. Prod was already on 17.0.0.
- The half-built-kid edge (create succeeds, app-list write fails) is documented,
  not "fixed": the two API calls cannot be one transaction from the client.

## Blockers
- M7 launch posts need the owner's accounts; demo-status snapshot is with Joe/Gus.
- Note for next session: Gitea's git-over-SSH transport cannot create PRs (push
  options are repo-only, verified on 1.27.3). The stored osxkeychain HTTPS
  credential reaches the repo API and is sufficient for PR creation (it reads
  `/api/v1/repos/...` 200 and creates PRs, even though `/api/v1/user` answers 403 —
  the token lacks `read:user`; don't read that as a dead credential).

## Next steps
1. **Run the overdue retro** — the next compliance bypass needs
   `--i-know-this-is-a-pattern`, and the one after is refused.
2. Open and QA the three branches above, one at a time.
3. Launch posts (owner), demo-status pipeline (Joe/Gus), kid board layout (design),
   homepad-api #84 (icons 404 for non-owners).
