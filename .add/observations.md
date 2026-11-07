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

## 2026-11-07

- `[away]` 4h session: reconciled ADD/spec state to v17.0.0, verified `main`
  (1175/1175, 96.8% lines) and reviewed the kid-accounts release; found and fixed
  one real local-run defect (Node 26 storage spy). ~2.5h agent time.
- `[process]` The retro-cadence day threshold blocked this session with 1 commit in
  8 days — the second time it has measured elapsed time rather than loop health
  (see 2026-10-11). Raise a checkpoint-count trigger at the next retro.
- `[infra]` QA gate blocked on all three PRs: mr-staging's manifest fetch from
  `Code/homelab` 404s because the repo is private (anonymous raw read), right after
  the 21:04 sweep rewrote it. Code checks and the browser gate still ran; the
  visibility fix is an owner decision (public vs authenticated fetch). Session
  closed here at the owner's request.
