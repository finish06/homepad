# Milestone: M3 — Robustness & security

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** NEXT
**Started:** TBD
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Close the remaining robustness and security gaps in the client: the missing error boundary and the missing Content-Security-Policy. Tidy the two smaller behaviour issues alongside them. (The iframe sandbox, the other original gap, shipped in 18.0.0.)

## Success Criteria

- [x] #334: iframe sandbox decided and pinned. 18.0.0 uses a strict sandbox by default, and an app gets `allow-same-origin` only when an admin opts it in (see the 18.0.0 CHANGELOG, "Overlay apps")
- [ ] #341: every lazy overlay sits inside an ErrorBoundary; a failed chunk fetch shows a recoverable error instead of crashing the app — tested by simulating the failure. There is no ErrorBoundary anywhere in `src/` today
- [ ] #335: blocked-embed detection (X-Frame-Options / CSP) — improve it, or document the limitation in the UI copy
- [ ] #451: `retryNote` resets when the health panel re-enters STALE
- [ ] #529: a Content-Security-Policy on staging and prod, from a spec and an audit of inline code and origins. It lives in the homelab ConfigMap, so the rollout goes through Joe

## Appetite

One cycle.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Iframe sandbox | 18.0.0 | DONE | #334 — strict sandbox + per-app opt-in | — |
| Content-Security-Policy | — | SHAPED | #529 — needs a spec | — |
| ErrorBoundary for lazy overlays | — | SHAPED | #341 | — |
| Blocked-embed fallback | — | SHAPED | #335 | — |
| Stale retry note | — | SHAPED | #451 | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

Client work, except #529: the CSP header is set in the homelab ConfigMap (Joe).

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
