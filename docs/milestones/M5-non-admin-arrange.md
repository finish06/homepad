# Milestone: M5 — Non-admin arrange

**Target Maturity:** GA (maintain)
**Status:** NOT_STARTED
**Horizon:** LATER
**Started:** TBD
**Completed:** TBD
**Created:** 2026-10-11 — from the backlog triage that closed 26 of 71 open issues with evidence (see `.add/handoff.md`)

## Goal

Make "Arrange apps" mean the same thing for every user: a non-admin can reorder their own tiles, not only favorite them. Since v29 (#506), a non-admin entering arrange mode gets the ★ and nothing else, so the label over-promises for that role.

## Success Criteria

- [ ] A spec is written and approved (the v29 §3.3 follow-up), with a UX artifact — it's a UI feature, and the SDLC watchdog blocks implementation without one
- [ ] A non-admin's tile drag persists per-user via `PUT /api/layout`, which is already per-user server-side (no `requireAdmin`)
- [ ] The shared-catalog boundary still holds — no category drag, category CRUD or tile-edit pencil for non-admins (v29 AC-006)
- [ ] A real-browser gate covers non-admin drag

## Appetite

One cycle once the spec is approved.

## Features

### Feature Detail

| Feature | Spec | Position | Status | Cycle |
|---------|------|----------|--------|-------|
| Per-user tile drag for non-admins | — (to write) | SHAPED | Backend ready; needs spec + UX | — |

Every issue listed here was **re-checked against `main` at `57733eb` on 2026-10-11** and is still true. Issues that turned out to be fixed, obsolete or duplicates were closed with evidence rather than carried in.

## Dependencies

- `/add:spec` and `/add:ux` first. No implementation without both.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Leaking shared-catalog powers to non-admins | LOW | HIGH | Keep the `arranging` / `editing` split from v29; extend the AC-006 tests |
| Per-user and shared order interact confusingly | MED | MED | The spec decides what a non-admin's order does when an admin later adds a tile |

## Cycles

| Cycle | Features Advanced | Status | Outcome |
|-------|-------------------|--------|---------|
| — | — | — | Not yet started |

## Retrospective Notes

Filled in when the milestone completes.
