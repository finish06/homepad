# homepad — Spec Index

**Current as of:** 2026-06-26  **Maintainer:** Walt (product lead)

This directory holds the **current, authoritative** product specs and decisions for homepad.
Historical specs for shipped versions are in [`specs/archive/`](./archive/).

---

## Current Specs (authoritative)

| File | What it covers | Status |
|------|---------------|--------|
| [`v15-version-changelog.md`](./v15-version-changelog.md) | Footer version badge (`homepad vN (sha)`) + changelog overlay dialog. Mirrors fleet-feed's Option B+ design adapted to homepad's Tailwind language. | **Ready for implementation** |
| [`v16-status-bar-quick-peek.md`](./v16-status-bar-quick-peek.md) | Status bar chips become clickable — clicking "2 DOWN" opens a popover listing the down services with links to their URLs. Zero backend changes. | **Ready for implementation** |
| [`v13-live-status-refresh.md`](./v13-live-status-refresh.md) | Live status auto-refresh every ~60s + "Updated X ago" header indicator + pulse animation on status change. | **Shipped — prod** |
| [`v1-launcher.md`](./v1-launcher.md) | Canonical foundation — auth, shared catalog, status badges, per-user favorites/layout, Gatus integration, deployment contract. All later versions build on this. | **Shipped — canonical** |
| [`v11-admin-ux-clarity.md`](./v11-admin-ux-clarity.md) | Admin vs. personal scope clarity in UserMenu + SettingsPanel; UserMenu dropdown z-index fix. Most recent fully-documented shipped version. | **Shipped — prod v11.0.0** |
| [`v12-settings-boundary-clarity.md`](./v12-settings-boundary-clarity.md) | My Dashboard vs. Administration section split in UserMenu; per-field env badges in SettingsPanel; test-id cleanup. Resolves the three confusion points v11 left open. | **Shipped — prod (PR #77)** |
| [`not-monitored-state.md`](./not-monitored-state.md) | Distinct `NOT_MONITORED` tile state (outlined dashed ring) vs. `UNKNOWN` (gray dot). Distinguishes unwired tiles from monitoring failures. | **Shipped — prod (PR #48–#50)** |
| [`uptime-sparkline.md`](./uptime-sparkline.md) | Uptime sparkline strip on each tile — ≤20 Gatus historical check dots + rolling uptime %. Reads free data already in the poller. | **Shipped — prod (PR #46–#47)** |
| [`SPEC-mobile-launcher-ux.md`](./SPEC-mobile-launcher-ux.md) | Mobile command-launcher UX — hide keyboard-hint footer on phones (`hidden sm:flex`) and lift the search trigger + avatar to the 44×44px tap-target minimum. | **Shipped — prod (PR #129)** |

## Closed / Superseded Intake Specs

| File | What it covers | Status |
|------|---------------|--------|
| [`SPEC-settings-admin-vs-user.md`](./SPEC-settings-admin-vs-user.md) | Product intake for Caleb's admin-vs-user settings confusion concern (PR #120). All ACs satisfied by v11+v12 before Stitch build began. | **Done — absorbed by v11+v12 (closes #122, #123)** |

## Decision Record

| File | What it covers | Status |
|------|---------------|--------|
| [`DECISIONS.md`](./DECISIONS.md) | Product decisions delegated by Caleb → Joe. Covers v3–v5 open questions + Arrange mode refinements. | **Current — see coverage gap note below** |

## Test Plan

| File | What it covers | Status |
|------|---------------|--------|
| [`test-plan-v1.md`](./test-plan-v1.md) | AC-to-test mapping for v1 criteria (A1–A11). Documents the TDD RED→GREEN harness, fixture design, and "RED for the right reason" contract. | **Current — v1 foundation; tests have expanded but this remains the methodology reference** |

---

## Coverage Gaps — Flagged for Joe/Caleb

### DECISIONS.md stops at v5

`DECISIONS.md` records delegated product calls for v3 (theme-mode Q1–Q3), v4 (categories Q1–Q4), v5 (collapsed-categories Q1–Q4), and a handful of Arrange-mode refinements — all from 2026-06-11/12. The decisions that unlocked v6–v12 are **not recorded here**:

- **v6 (admin settings)** — Q1–Q4 open questions were never formally closed in DECISIONS.md (v6 shipped with Stitch's recommended choices).
- **v7 (UX redesign)** — signed off live; no formal decision record.
- **v8 (command launcher)** — OQ1–OQ3 were Stitch's leans; no formal close recorded.
- **v9 (per-user dashboards)** — OQ1–OQ7 "Stitch's lean" items shipped with those leans; never formally resolved by Caleb in DECISIONS.md.
- **v10 (drag-and-drop)** — all open questions (including dnd-kit library choice) decided by Caleb but not in DECISIONS.md.
- **v11, v12** — product direction confirmed via Joe/Caleb; no new DECISIONS.md entry.

**Recommendation for Joe:** either backfill the missing entries or add a note that DECISIONS.md is intentionally scoped to v3–v5 delegated calls and later decisions live in the PR descriptions.

---

## Archive

`specs/archive/` holds specs for shipped versions v2–v10. These are read-only historical records — do not edit them. The archive is the right place to look for the original acceptance criteria, open questions, and implementation notes for any feature that shipped before v11.

| File | Feature | Shipped as |
|------|---------|-----------|
| [`archive/v2-app-icons.md`](./archive/v2-app-icons.md) | Custom app icons — light/dark variants, PNG upload, edit-mode toggle | v2 |
| [`archive/v3-theme-mode.md`](./archive/v3-theme-mode.md) | System/Light/Dark theme — ThemeProvider, per-user Postgres persistence, anti-flash | v3 |
| [`archive/v4-app-categories.md`](./archive/v4-app-categories.md) | First-class category model — admin CRUD, per-app category assignment, grouped catalog render | v4 |
| [`archive/v5-collapsible-categories.md`](./archive/v5-collapsible-categories.md) | Per-user collapsible category sections — disclosure interaction, `user_collapsed_categories` table | v5 |
| [`archive/v6-admin-settings.md`](./archive/v6-admin-settings.md) | Admin Settings UI — consolidated Settings panel, `requireAdmin` cross-cutting gate, category management surface | v6 |
| [`archive/v7-ux-redesign.md`](./archive/v7-ux-redesign.md) | UX/visual redesign — v7 design tokens, tile refresh, UserMenu avatar dropdown, top-bar declutter | v7 |
| [`archive/v8-command-launcher.md`](./archive/v8-command-launcher.md) | Command-K launcher — fuzzy search overlay, keyboard navigation, ranker, a11y | v8 |
| [`archive/v9-per-user-dashboards.md`](./archive/v9-per-user-dashboards.md) | Per-user dashboards + App Library — biggest architecture change; COPY model, per-user services, admin library CRUD | v9 |
| [`archive/v10-drag-and-drop.md`](./archive/v10-drag-and-drop.md) | Always-on drag-and-drop reordering (dnd-kit) — tile + category drag, keyboard alternative, removes Arrange mode | v10 |
