# Observations — homepad

> Raw operational notes for retro fuel. Synthesised at `/add:retro`; entries older than
> 30 days without a `[synthesized]` tag are archived.
>
> Started 2026-10-11 at the first retro — this file did not exist for the project's first
> 26 days of ADD operation, which is part of why that retro had to reconstruct its tables
> from the conversation and the API rather than from a log.

## 2026-10-11

- `[retro]` First retro run, 26 days after ADD adoption. Blocked `/add:away` on the
  day-based cadence threshold; a **checkpoint-count** trigger would have fired in week one.
  The day threshold measured elapsed time, not whether the knowledge loop was running.
- `[process]` The SDLC watchdog has no category for test/CI-only changes. Five PRs this
  window (#500, #501, #502, #504, #508) shipped without specs and were never explicitly
  ruled on either way.
- `[swarm]` Agent-to-agent verification repeatedly caught real errors in both directions
  (see retro-2026-10-11.md "What Went Well"). The mechanism that failed was not trust but
  **task claiming** — 10/28 PRs double-worked with no lease.
