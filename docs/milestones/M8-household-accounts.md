# Milestone: M8 — Household accounts (17.0.0 → 18.0.0)

**Target Maturity:** GA (maintain)
**Status:** COMPLETE
**Horizon:** DONE
**Started:** 2026-10-23 (SPEC-kid-accounts approved, #541)
**Completed:** 2026-11-22 (18.0.0 in production)
**Created:** 2026-11-22, after the fact. This work came from Caleb's priorities and was never on the roadmap table. The file records what shipped, so the roadmap matches the CHANGELOG.

## Goal

Make Homepad work for a whole household: kids get their own simple dashboard, adults join by invite, everyone shares one app list, admins can manage the adults, and sign-in is harder to abuse.

## Success Criteria

- [x] 17.0.0: kid accounts, and sign-ins that survive an API restart. In production 2026-10-31
- [x] 17.1.0: household accounts (invite-only by default), backup and import, status widgets. In production 2026-11-20
- [x] 18.0.0: one app list for the household, managing adults, admin reset links, a sign-in speed limit, and the strict iframe sandbox with per-app opt-in (#334). In production 2026-11-22, with a pg_dump taken first
- [x] The CHANGELOG, README (with screenshots, #616) and gethomepad.dev (getHomepad #41) describe 18.0.0

## Features

| Feature | Spec | Shipped in |
|---------|------|------------|
| Kid accounts | `specs/SPEC-kid-accounts.md` | 17.0.0 |
| Household basics (invites, registration modes) | `specs/SPEC-household-basics.md` | 17.1.0 |
| Backup and import | `specs/SPEC-backup-import.md` | 17.1.0 |
| Status widgets | `specs/SPEC-status-widgets.md` | 17.1.0 |
| One catalog for the household | `specs/SPEC-household-catalog-owner.md` | 18.0.0 |
| Managing adults | `specs/SPEC-household-manage-adults.md` | 18.0.0 |
| Admin reset link | `specs/SPEC-password-reset-link.md` | 18.0.0 |
| Sign-in hardening | `specs/SPEC-signin-hardening.md` | 18.0.0 |
| Iframe sandbox opt-in | `specs/SPEC-iframe-sandbox-optin.md` | 18.0.0 |

## Left over

What QA found during the 18.0.0 release, and the doc drift from 17.x, moved to [M9](M9-18-0-1-follow-ups.md).

## Retrospective Notes

- Staging-release rolls the API automatically on merge to main, so the pre-migration pg_dump must be asked for before the merge, not after.
- The work ran outside the roadmap for six weeks. The roadmap is refreshed after each major release from now on.
