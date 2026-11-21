# Plan: 18.0.0 — a household you can manage

**Specs:**
1. [`SPEC-household-catalog-owner`](../../specs/SPEC-household-catalog-owner.md) — the catalog belongs to the household (the breaking change)
2. [`SPEC-household-manage-adults`](../../specs/SPEC-household-manage-adults.md) — remove an adult, change a role
3. [`SPEC-password-reset-link`](../../specs/SPEC-password-reset-link.md) — admin reset link, change your own password
4. [`SPEC-signin-hardening`](../../specs/SPEC-signin-hardening.md) — rate limits, verified SSO emails, invite-only for SSO
5. [`SPEC-iframe-sandbox-optin`](../../specs/SPEC-iframe-sandbox-optin.md) — stricter overlay sandbox, per-app opt-in (#334)

**Status:** Approved — Caleb, 2026-11-20: all five specs approved, every §0 question decided
**Created:** 2026-11-19
**Target:** 18.0.0 (major: migration 0021 is one way)
**Checked against:** `homepad-api` `gitea/main` `79e3b03`, `homepad` `gitea/main` `6eb8a35`

---

## 0. Before any build starts

- **Caleb answered every §0 question (2026-11-20).** All went to the default except catalog-owner Q5: backup files move to `schemaVersion` 2.
- **The 17.1.0 web halves land on `homepad` main:** household basics (#565), backup (#566), widgets (#568). Specs 2, 3 and 4 change screens those PRs add (Accounts adult rows, the invite dialog, the `#invite=` handling, the backup field list).
- **Decided: #89 ships in 17.1.0** (SPEC-signin-hardening Q1, Caleb, 2026-11-19: "a"). The `email_verified` refusal, merged in #91, goes out in 17.1.0 as a security fix, and the 17.1.0 release notes carry the PocketID steps.
- **Landing ahead of 18.0.0:** three sign-in bug fixes, in a separate homepad-api bug-fix PR (number TBD): login timing that shows whether an email exists, the OIDC callback cookie ignoring `COOKIE_SECURE`, and passwords over 72 bytes causing a 500. Spec 4 keeps their ACs (AC-009, AC-016, AC-018) as regression guards, and spec 3 AC-017 points at AC-018.
- **UX artifacts** for specs 2, 3, 4 and 5: approved by Caleb 2026-11-20, every recommendation (`specs/ux/household-manage-adults-ux.md`, `password-reset-link-ux.md`, `signin-hardening-ux.md`, `iframe-sandbox-optin-ux.md`). Spec 1 has no UI.

## 1. Build order

```
            ┌──> 2. manage adults ──┐
1. catalog ─┤                       ├──> 4. sign-in hardening
   owner    └──> 3. reset link   ───┘    5. iframe sandbox (independent of 2–4)
```

1. **Spec 1 first, alone.** Every later spec assumes there is no catalog owner. It also adds the `schema_migrations` runner, which 3 and 5 rely on for their migrations to run once. Rehearse the upgrade on a copy of a real database before merging (§3).
2. **Specs 2 and 3 in parallel**, after 1 merges. File ownership below.
3. **Specs 4 and 5 after 2 and 3.** 4 moves 3's public routes onto the new limiter, so 3 must be in. 5 touches none of the same files and could run alongside 2 and 3. It is scheduled last to keep the review load even, and can move up if a slot is free.

## 2. File-ownership map for the parallel pair (2 and 3)

### homepad-api

| File | Owner | Rule for the other |
|---|---|---|
| `internal/api/adults.go` (new: role change, remove) | 2 | — |
| `internal/storage/adults.go` (new) | 2 | — |
| `internal/api/password.go` (new: reset link, accept, change password) | 3 | — |
| `internal/storage/password_resets.go` (new) | 3 | — |
| `migrations/0022_password_resets.*` | 3 | 2 has no migration |
| `cmd/homepad-api/main.go` (CLI subcommand, sweep) | 3 | 2 doesn't touch it |
| `internal/session/{session,pgstore,memory}.go` + `contract_test.go` | **2 adds `DestroyAllForUser(ctx, userID, except string)`** | 3 rebases onto it and passes its own session as `except`. If 3 is ready first, 3 adds it with the same signature and 2 rebases. |
| `internal/api/server.go` | shared, append-only | 2 adds its two routes after the "admin Accounts API" block; 3 adds its routes after the invites block. No edits to other lines. |
| `internal/api/routes_test.go` (class table) | shared, append-only | Same placement as `server.go`. |
| `internal/api/auth.go` | 3 (`hasPassword` on `userView`, 72-byte rule) | 2 doesn't touch it. |
| `internal/api/admin_accounts.go` | 3 (one field: `hasPassword` on `accountView`, AC-021) | 2 leaves it as is; its new code goes in the new files. |

### homepad

| File | Owner | Rule for the other |
|---|---|---|
| `src/accounts/AdultRowMenu.tsx` (new) | 2 | 3 adds one menu item after 2 merges (a one-line change plus its dialog). |
| `src/accounts/AccountsSection.tsx` | 2 | 3 doesn't touch it. |
| `src/accounts/ResetLinkDialog.tsx` (new) | 3 | — |
| `src/app/App.tsx` (`#reset=` fragment, reset screen) | 3 | 2 changes one line: `onUnauthorized` on `ServicesProvider` for every role, so an adult who gets a 401 sees the sign-in screen (manage-adults AC-016, UX A-5). Whichever merges second rebases. |
| `src/app/ResetPasswordScreen.tsx` (new) | 3 | — |
| `src/library/SettingsPanel.tsx` (Change password) | 3 | — |
| `src/api.ts` | shared, append-only | 2 adds an "Adults" block, 3 a "Passwords" block, at the end of the file. |
| `docs/accounts.md` (new) | 2 creates it | 3 adds the "Forgotten passwords" section after 2 merges. |

Merge order inside the pair: whichever is green first. The other rebases. The only real conflict point is the session method, settled above.

### Later specs

| Spec | Main files | Conflicts with |
|---|---|---|
| 4 | `internal/api/ratelimit.go`, `auth.go` (login), `oidc.go` (callback and start-route redirects, incl. `too_many`), `cmd/homepad-api/main.go` (env), `internal/api/env_config.go`; web `src/app/App.tsx` (fragment read), `src/app/AuthForm.tsx`, `src/accounts/AddAdultDialog.tsx` (PocketID line, AC-021), `src/library/SettingsPanel.tsx` (env labels), `src/api.ts` (`retryAfter`), README, `.env.example`, `docs/single-sign-on.md`. Entry-chunk rule: AC-020. | 3's routes in `server.go` (wrapper swap only); after 2 and 3 merge, so no file overlap in flight |
| 5 | `migrations/0023_*`, `internal/api/services.go`, `internal/storage/storage.go` (service columns), `internal/transfer/*`, `docs/schema/homepad-backup-v1.json`; web `src/grid/IframeOverlay.tsx`, `TileEditModal.tsx`, `src/lib/sandbox.ts`, both nginx configs | none of 2–4 |

## 3. Estimates

| Spec | Estimate | Notes |
|---|---|---|
| 1. Catalog owner | ~3 days | Most of it is mechanical (41 SQL sites lose an owner filter), plus the runner and an upgrade rehearsal. |
| 2. Manage adults | ~2 days | Two routes under the account lock, row menu, three confirms. |
| 3. Reset link | ~2.5 days | Copies the invite pattern; adds a CLI subcommand and the Change password form. |
| 4. Sign-in hardening | ~2.5 days | The limiter and proxy parsing are most of it; docs are half a day. |
| 5. Iframe sandbox | ~1.5 days | Small API change, one switch, header change. |
| UX artifacts (2–5) | ~1.5 days | Four small surfaces. |
| **Total** | **~13 days solo** | About 9–10 working days with 2 and 3 in parallel and 5 alongside them. |

These are task time. The kid-accounts plan ran about 50% over its spec estimate; expect the same here.

## 4. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Migration 0021 is one way | A bad migration can't be rolled back by deploying 17.x | Rehearse on a copy of the production database; release notes say to `pg_dump` first; AC-006/AC-010 in spec 1 compare before/after counts and schemas. |
| The runner change (spec 1 Q3) | If `schema_migrations` records a file that failed half way, it never re-runs | Each run is one transaction with the records, as today; a failed boot records nothing. Test with a deliberately failing migration. |
| invite-only gates SSO (spec 4) | Households that onboard everyone through PocketID stop getting new accounts | `OIDC_MEMBER_GROUP`; release notes name it; existing accounts unaffected. |
| Shared rate limit behind the bundled nginx | One noisy client slows everyone's sign-in | Docs explain `HOMEPAD_TRUSTED_PROXIES`; per-email lock still protects each account. |
| Per-email lock as a weapon | Someone can keep a known email locked out of password sign-in | 15-minute lock; SSO and existing sessions unaffected; spec 4 Q3 B removes it if Caleb prefers. |
| `frame-ancestors 'none'` (spec 5 Q4) | Quickstart users who embed Homepad in another dashboard lose that | Release note; Q4 C adds a setting. |
| The 17.1.0 web PRs slip | 2, 3 and 4 have nothing to build on | Spec 1 and spec 5's API half can start regardless. |
| Two API replicas | In-memory limits are per replica | Documented in spec 4; the household installs this targets run one. |

## 5. Release notes: what must be said

The CHANGELOG entry for 18.0.0 must carry each of these. Plain copy, in this order:

1. **Why it's 18.0.0.** "The app list now belongs to the household. Every admin edits the same list. The upgrade changes the database in a way that can't be undone. Take a backup of the database first. To go back to 17.x, restore that backup."
2. **Hidden copies moved.** "Some old, hidden copies of apps are moved to a table called `catalog_archive`. Nobody could see them." Plus the `psql` line from spec 1 §10.
3. **Managing adults.** "Admins can now remove an adult, or make someone an admin or a member, in Administration → Accounts. Homepad always keeps at least one admin."
4. **Passwords.** "An admin can make a one-time reset link for an adult. It works for 24 hours. You can change your own password in My settings. If you are the only admin and forget your password, run `docker compose exec api /homepad-api reset-link you@example.com` on the server."
5. **Single sign-on needs a verified email.** This ships in 17.1.0 (spec 4 Q1, decided), so the PocketID steps belong in the 17.1.0 notes, not the 18.0.0 ones.
6. **Single sign-on under invite-only.** "With invite-only sign-up, single sign-on only creates accounts for people in your admin group, or in the new `OIDC_MEMBER_GROUP`. Others need an invite."
7. **Sign-in speed limit.** "Sign-in now has a speed limit. If a proxy sits in front of Homepad, set `HOMEPAD_TRUSTED_PROXIES` to its address."
8. **Overlay apps.** Existing overlay apps stay opted in (spec 5 Q1, decided): "Apps that open in the overlay are now more locked down by default. Apps you already set to open in the overlay keep working as before. For new ones that ask you to sign in every time, turn on 'Let this app keep its sign-in' in the app's settings. Only do this for apps you trust." And the Q4 line: "Homepad can no longer be shown inside another page or dashboard."
9. **Upgrading.** "Deploy the API and web images as a pair, API first. Nobody is signed out by this upgrade." (True for all five specs: none ends sessions on deploy.)

## 6. Verification

- Each spec's ACs and TCs, per the GA gates in `.add/config.json` (strict, 90% on `src`).
- Spec 1: an upgrade rehearsal on a production copy, before merge, recorded in the PR.
- Spec 4: TC-004/TC-005 against a real PocketID (v2.19.3 or newer) in staging, and once against a pre-v2.2.0 PocketID if one is still in use.
- Staging is plain HTTP; with spec 4 Q5 = A, staging must keep `COOKIE_SECURE=false` for SSO to work there.
- QA briefs assert the build's SHA, not its version string.
