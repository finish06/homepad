# Milestone: M3 — Robustness & security

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** NEXT
**Started:** TBD
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Close the two verified robustness and security gaps in the client — the iframe sandbox and the missing error boundary — and tidy the two smaller behaviour issues alongside them.

## Success Criteria

- [ ] #334: decide on the iframe sandbox — drop `allow-same-origin`, or keep it with a documented threat model — and pin it with a test. Today `IframeOverlay.tsx:21` combines `allow-scripts` with `allow-same-origin`
- [ ] #341: every lazy overlay sits inside an ErrorBoundary; a failed chunk fetch shows a recoverable error instead of crashing the app — tested by simulating the failure. There is no ErrorBoundary anywhere in `src/` today
- [ ] #335: blocked-embed detection (X-Frame-Options / CSP) — improve it, or document the limitation in the UI copy
- [ ] #451: `retryNote` resets when the health panel re-enters STALE

## Appetite

One cycle.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Iframe sandbox | — | SHAPED | #334 — security advisory | — |
| ErrorBoundary for lazy overlays | — | SHAPED | #341 | — |
| Blocked-embed fallback | — | SHAPED | #335 | — |
| Stale retry note | — | SHAPED | #451 | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

None — self-contained client work.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dropping `allow-same-origin` breaks embedded apps that need cookies or storage | MED | HIGH | Inventory which tiles use the iframe click action before changing the sandbox; decide per threat model, not by default |
| An ErrorBoundary hides real failures | LOW | MED | Show the error and a retry, and log it; never swallow silently |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
