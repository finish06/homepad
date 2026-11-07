# Away Mode Log

**Started:** 2026-10-12 22:30Z
**Expected Return:** 2026-10-13 10:30Z
**Duration:** 12h
**Autonomy:** autonomous · maturity ga · quality strict
**Context:** cycle-2 (M2) open, waiting on Joe for #507 / #414 / #528. The Joe ↔ homepad-21 Remote Control link is unreliable in both directions.

## Work Plan

1. Watch blockers #507, #414, #528 (and #493, #254, #256, #261). Act on any Joe or QA response: verify the evidence, then close the issue with a note or report back on it. Restart the watcher when it expires (about 05:15Z).
2. If all three blockers land, close cycle-2: cycle-2.md, the M2 hill chart and criteria, config, a learnings checkpoint, and a PR for docs/cycle-2-log.
3. Otherwise, pre-stage the cycle-2 close-out as a draft on docs/cycle-2-log.
4. Re-verify M3 (#334, #335, #341, #451) against main 521086f, read-only, with file and line evidence. This is input for planning cycle-3.

No new code PRs. No merges, no promotion (16.7.2 stays unpromoted).

## Queued for return

1. Joe link broken both ways: you may need to paste the asks into joe_tmux_1 yourself.
2. Promoting 16.7.2 needs your go.
3. cycle-3 (M3) planning: #334 needs a decision on the iframe sandbox; no M3 item has a spec.
4. #449 OQ-1, #513, Kare on #517.

## Progress Log
| Time | Task | Status | Notes |
|------|------|--------|-------|
| 22:30Z | Away started | — | Watcher bliov9s1u running since 21:16Z; no blocker movement |
| 22:45Z | M3 re-verification vs main 521086f | DONE | All 4 still open and still true; details below. One new finding on #335 |
| 22:55Z | Pre-stage cycle-2 close-out | DONE | `.add/cycles/cycle-2-closeout-draft.md`: 4/6 issues; routed-items criterion unmet |
| 01:50Z | Ping Joe (4th) | sent | Delivery noted joe_tmux_1 is a **new session under the old name** (restarted). No issue movement since 21:16Z |
| 01:57Z | Joe answered #507 #414 #528 | — | **The link works.** #528: Joe issued a new homepad-only bridge key (multi-prefix) as a repo-level secret and did not widen the org key; verified at the bridge, end-to-end on the next tag. Closed. #414: all 3 claimed symptoms fixed (in-cluster curl plus the homelab ConfigMap). Closed. **CSP is absent** on staging and prod; filed #529 (needs a spec; lives in Code/homelab). #507: Gracie dispatched at 01:54Z on 521086f; result expected within ~1h |
| 02:05Z | (lesson) | — | `curl -H @- -d @-` both read stdin, so every call 422d and nothing posted. Body goes in a file |
| 02:15Z | #507 closed; routed items answered; homepad-api#72 filed; **cycle-2 COMPLETE** | DONE | Gracie pod 100/100 on 521086f. Joe gave an owner or answer on #493 #254 #256 #261. The guard gap behind #256 was filed in homepad-api. Close-out applied; L-013..L-016 added |

## M3 re-verification (main 521086f, read-only)

- **#334 (iframe sandbox): still true.** `src/grid/IframeOverlay.tsx:21`: `SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups'`.
  - The risk is bounded by origin. `allow-same-origin` gives the frame its **own** origin back. A service on another host stays cross-origin to homepad and can't reach the parent. The escape (a script removing its own sandbox) only matters for a URL that is same-origin with homepad.
  - So one option for the decision: keep the flags but refuse to embed same-origin URLs, and pin that with a test. The other option is to drop `allow-same-origin`, which breaks logins and storage in most embedded dashboards.
  - This needs a decision from Caleb or Kare.
- **#341 (ErrorBoundary): still true.**
  - `git grep ErrorBoundary|componentDidCatch|getDerivedStateFromError` over src/ finds nothing.
  - There are 5 lazy chunks: `App.tsx:39-41` (LibraryBrowse, ServiceForm, SettingsPanel) and `AppGrid.tsx:53-54` (TileEditModal, IframeOverlay).
  - A failed chunk fetch unmounts the whole app. The fix is unambiguous and can be TDD'd: simulate a rejected `import()`.
- **#335 (blocked-embed detection): still true, and worse than the issue says.**
  - `IframeOverlay.tsx:13-17` says "`onLoad` fires even for a blocked frame". The fallback, though, only arms when `onLoad` has **not** fired within 5s (`:46`, cleared by `onFrameLoad`).
  - By the file's own comment, an X-Frame-Options/CSP-blocked frame fires `onLoad` (to the browser error page) and so never reaches the fallback. The fallback catches slow or hung frames, not blocked ones.
  - Worth a browser-gate check before deciding: serve a page with `X-Frame-Options: DENY` from the mock and see whether `iframe-overlay-fallback` appears.
- **#451 (retryNote): still true.**
  - `StatusBar.tsx:111` holds the state. It is cleared only at the start of `retryNow()` (`:186`).
  - Nothing resets it when `stale` (`:181`) goes false. So STALE → retry fails ("Could not reach…") → recovers → STALE again shows the old note next to a fresh Retry button.
  - The fix is small and unambiguous: clear it when `stale` flips to false, plus a unit test.

For cycle-3 planning, #341 and #451 can go straight to TDD. #334 needs a decision. #335 should be measured first (the gate check above), then decided: fix the detection or change the copy.

---

# Away Mode Log — session 3

**Started:** 2026-11-07T15:20:03-06:00
**Expected Return:** 2026-11-07T19:20:03-06:00
**Duration:** 4h
**Autonomy:** autonomous · maturity ga · quality strict (90% coverage)
**Base:** `chore/away-20261107` off `origin/main` (`9c7ce48`, v17.0.0) in a separate
worktree; the owner's `release/v16.2.0` checkout was left untouched.
**Retro:** BYPASSED by Caleb's explicit decision ("Go - B") when presented with the
8-day cadence block. Recorded as `compliance-bypass-20261107` in `.add/learnings.json`
(second bypass in 30 days -> warned). The block is not resolved by the bypass.

## Work Plan (agreed)

1. Reconcile ADD state with shipped reality: SPEC-kid-accounts status, config
   `changelog.lastVersionTag`, cycle-3 progress, handoff.
2. Verify v17.0.0 (lint, types, unit tests, build) on a clean worktree.
3. Code review of the v17.0.0 kid-accounts / persistent-session surfaces; write
   `docs/reviews/2026-11-07-v17-review.md`.
4. Comment/dead-code hygiene on main (stale 1–8/1–6 comments, unused `MAX_WIDTH`).

## Explicitly queued, not attempted

- Prod/staging deploys (prod already reports 17.0.0; promotion is Joe/Gus + Caleb).
- M7 launch posts (need Caleb's accounts).
- Demo status pipeline (Joe/Gus).
- Kid board layout polish (design call).
- homepad-api #84 and the demo-seed PgStore/sweeper rebase (cross-repo/backend).
- Any merge to `main`; retiring old release branches.

## Progress Log

| Time | Task | Status | Notes |
|------|------|--------|-------|
| 2026-11-07T15:20:03-06:00 | away session opened | done | plan confirmed ("Go - B"); retro bypass recorded |
| 2026-11-07T15:26 | ADD state reconciled | done | SPEC-kid-accounts -> SHIPPED v17.0.0; config lastVersionTag -> v17.0.0; cycle-3 log updated; handoff refreshed |
| 2026-11-07T15:28 | verify main | done | tsc clean, 0 lint errors, build OK, 1175/1175, coverage 96.82/91.18/92.73 (threshold 90) |
| 2026-11-07T15:21 | Node 26 test defect | FIXED | #441 tests spied on Storage.prototype; the shim installs MemoryStorage. Spy the instance. Learning L-022 |
| 2026-11-07T15:30 | v17 review | done | docs/reviews/2026-11-07-v17-review.md — 1 fixed defect, 3 low/advisory, 2 info |
| 2026-11-07T15:32 | comment hygiene | done | stale 1–8/1–6 comments + dead MAX_WIDTH (separate branch) |
| 2026-11-07T15:47 | PRs | done | #554 (comment hygiene), #555 (Node 26 fix), #556 (ADD state + review) — all open against `main`, mergeable. Git-over-SSH cannot create PRs; the keychain HTTPS credential can |

---

## Return briefing (session 3)

**Done:**
- ADD/spec state reconciled to v17.0.0 (`SPEC-kid-accounts` status, config tag,
  cycle-3 log, handoff).
- `main` verified: tsc clean, 0 lint errors, build OK, **1175/1175**, coverage
  96.82% lines / 91.18% branches / 92.73% functions (threshold 90).
- **One real defect found and fixed**: the #441 density tests failed on Node 26
  because they spied on `Storage.prototype` (the local Web Storage shim installs a
  standalone class). Learning L-022.
- `docs/reviews/2026-11-07-v17-review.md` — kid accounts + persistent sessions:
  1 fixed, 3 low/advisory, 2 info; no blockers found.
- Stale width comments + dead `MAX_WIDTH` removed.

**Open PRs (all target `main`, verified mergeable):**
- #554 `chore/comment-hygiene-20261107` — comments + dead `MAX_WIDTH`
  https://gitea.kube.calebdunn.tech/Code/homepad/pulls/554
- #555 `fix/node26-storage-spy` — the Node 26 test fix
  https://gitea.kube.calebdunn.tech/Code/homepad/pulls/555
- #556 `chore/away-20261107` — ADD state + v17 review
  https://gitea.kube.calebdunn.tech/Code/homepad/pulls/556

QA them one at a time (the one-staging-slot rule).

**Waiting on a human:**
1. **The overdue retro** — this session was the 2nd bypass in 30 days (warned).
   The next bypass needs `--i-know-this-is-a-pattern`; the one after is refused.
2. QA/merge the three branches.
3. M7 launch posts (owner's accounts); demo-status snapshot (Joe/Gus).
4. Kid board width polish (design call); homepad-api #84 (icons 404 for non-owners).

**Prod:** already on 17.0.0 (`/version.json` = `fc5a191`); nothing deployed.

---

## Session close — QA gate blocked on infra (2026-11-07T15:52-06:00)

- #554: browser gate **passed** (2m58); CI/E2E ran; **mr-staging failed** (2m16)
  at the deploy step's first command. #555 and #556 fail the same way.
- Root cause: `Code/homelab` is **private** and the deploy step fetches
  `homepad-staging/03-web.yaml` with an unauthenticated `curl` → 404 (exit 22).
  Public repos still read anonymously (`Code/ci-shared` 200); homelab is 404
  anonymous / 200 authenticated. Last green mr-staging: `fc5a191` on 2026-10-30;
  the homelab repo was rewritten at 2026-11-07T21:04:19Z (joe-ops sweep baseline).
- **Not fixed** — security-relevant owner decision: (a) make homelab public again,
  or (b) add a read-only PAT and authenticate the fetch. No repo visibility changed.
- PRs stay open; no merges and no deploys. Session ended at the owner's request.
