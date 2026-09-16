<!-- ADD:MANAGED:START version=0.11.0 maturity=ga generated=2026-09-15 -->

# homepad

Self-hosted launcher/homepage for a homelab: one page listing every service in a shared
catalog with live Gatus-backed status badges, per-user favorites and tile order. React +
Vite frontend; Go backend in `homepad-api`.

## Engagement Protocol

- Read `docs/prd.md` and the relevant file in `specs/` before changing anything.
- `specs/README.md` is the authoritative spec index and carries per-spec status.
- Human approves production deploys and merges to `main`.

## Spec-First Invariants

- No code without a spec. Features live in `specs/` in the existing house format
  (`AC-NNN` IDs, `Status:` line, product/design sign-off sections) — do not reformat.
- Acceptance criteria are exhaustive at GA; every AC needs a test.
- `DECISIONS.md` records delegated product calls. `test-plan-v1.md` is the AC-to-test
  methodology reference.

## TDD Discipline

- RED → GREEN → REFACTOR → VERIFY, strictly, at GA.
- Never delete a failing test to reach green.
- `npm run build` before `npx vitest run` on a clean checkout (`tests/infra/pwa-icons.test.ts`
  reads `dist/`).
- Unit: Vitest. Interaction: `npm run test:gate` (Playwright, mocked API, serves `dist/`).
  End-to-end: `npm run test:e2e` (needs a live API).

## Maturity & Autonomy Ceiling

Project maturity: **ga**.

- All 5 quality gates blocking.
- Coverage threshold 90% on `src`.
- Type checking blocking; E2E required.
- Up to 5 parallel agents via worktrees.

Production deploys and merges to the default branch always require human approval.

## Currently Active Spec

- [`specs/SPEC-health-bar-visibility-toggle.md`](./specs/SPEC-health-bar-visibility-toggle.md)

## Pointers

- PRD: `docs/prd.md`
- Specs: `specs/` (index: `specs/README.md`)
- Plans: `docs/plans/`
- Config: `.add/config.json`
- Learnings: `.add/learnings.md`
- Node: `>=20 <23`, `.nvmrc` pins 22

<!-- ADD:MANAGED:END -->
