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
