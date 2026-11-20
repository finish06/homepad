# Spec: Password reset link, and changing your own password

**Spec ID:** SPEC-password-reset-link
**Version:** 0.1.0
**Created:** 2026-11-19
**Author:** Claude (spec step for Caleb's 18.0.0 theme, "a household you can manage")
**Status:** Draft, awaiting sign-off
**Repo:** `Code/homepad-api` (migration, routes, CLI subcommand) + `Code/homepad` (Accounts action, reset screen, My settings, docs)
**Estimate:** ~2.5 days (reset table and routes, change-password route, session ending, CLI recovery, reset screen, Change password form, tests)
**Depends on:** SPEC-household-basics (invite token rules, URL-fragment links, rate-limit bucket; web half #565 must be on `homepad` main), SPEC-household-catalog-owner (ships in the same release). Runs in parallel with SPEC-household-manage-adults (see the plan's file-ownership map).
**Target version:** 18.0.0
**UX:** to do (/add:ux)
**Issues folded in:** SPEC-household-basics §11 ("Password reset and password change, for anyone")

---

## 0. Open questions — decisions for Caleb

Answer "all defaults", or pick per question.

**Decided (Caleb, 2026-11-19):** a reset is an admin-issued, one-time link only, shared the way invites are. No email is sent and no SMTP is configured.

**Q1 — How long a reset link works.** [AC-004]
- **A (default):** 24 hours. A reset link opens an existing account, so it should not sit around as long as an invite (7 days).
- B: 1 hour.
- C: 7 days, like invites.

**Q2 — Sessions when a reset link is used.** [AC-008]
- **A (default):** end every session of that account, then sign them in on the device that used the link. A reset often means the old password leaked.
- B: end nothing; just change the password.

**Q3 — Sessions when you change your own password.** [AC-013]
- **A (default):** end every other session of yours; keep the one you're using.
- B: end nothing.

**Q4 — Accounts that sign in only with single sign-on.** They have no local password (§1a). [AC-010, AC-014]
- **A (default):** refuse. No reset link and no Change password for them. Adding a local password would let them in without the identity provider, past its two-factor and its removals.
- B: allow. The link sets their first local password.

**Q5 — The only admin forgets their password.** No other admin can make a link. [AC-016]
- **A (default):** a CLI subcommand in the API image prints a one-time link to the terminal: `docker compose exec api /homepad-api reset-link <email>`. It needs shell access to the server, which is the same trust as the database.
- B: no CLI. Docs explain how to edit the database.

**Q6 — More than one live link for the same account.** [AC-005]
- **A (default):** making a new link revokes the earlier one.
- B: allow several.

---

## 1. Overview

When an adult forgets their password today, the only fix is editing the database. And no adult can change their own password at all. This spec adds two things:

1. **Reset link.** In Accounts, an admin taps **Make a reset link** on an adult's row, gets a one-time link, and sends it to them however they like. The adult opens it, picks a new password, and is signed in.
2. **Change password.** In My settings, any adult with a password can change it by entering the current one.

The link follows the invite rules from SPEC-household-basics §3.2 exactly.

### 1a. What exists today (checked in the code, `homepad-api` `gitea/main` at `79e3b03`, `homepad` `gitea/main` at `6eb8a35`)

- **No route changes a password.** `server.go` has `POST /api/register`, `POST /api/login` and `POST /api/invites/accept` as the only places a `password_hash` is written (`RegisterUser`, `insertUser` and `AcceptInvite` in `internal/storage/accounts.go` and `invites.go`). `handlePatchMe` (`internal/api/auth.go`) accepts only appearance fields.
- **Password rule:** at least 8 characters (`minPasswordLen`, `decodeCredentials`). Hash: `bcrypt.DefaultCost`. Above 72 bytes, `bcrypt.GenerateFromPassword` (`golang.org/x/crypto` v0.53.0, per `go.mod`) returns an error, and `handleRegister` answers 500 "internal error". The 8-character minimum is checked; the 72-byte maximum isn't.
- **OIDC-only accounts** store the constant `oidcNoPassword = "oidc:no-local-password"` in `password_hash` (`internal/api/oidc.go`). It is not a bcrypt hash, so local login always fails for them. An account that registered with a password and later signed in with OIDC keeps its real hash (OIDC links by email and never overwrites it).
- **Kids have no password.** Migration 0018's `users_kid_credentials_check` requires `password_hash IS NULL` for a kid. `handleUpdateKid` (`internal/api/admin_accounts.go`) refuses a `password` field with 400 "kid accounts do not have passwords; use sign-in-here". SPEC-kid-accounts §2.2 mentions an optional kid password; it was never built.
- **Invite token rules to copy** (`internal/api/invites.go`): 32 CSPRNG bytes, unpadded base64url (`newInviteToken`); only `sha256(token)` stored, with `CHECK (octet_length(token_hash) = 32)` (migration 0019); malformed tokens rejected before a database read (`inviteTokenHash`); one 404 body for every dead token (`deadInvite`); the token only in POST bodies and in the URL fragment; `FOR UPDATE` on accept, marking use in the same transaction (`AcceptInvite`); stale rows swept hourly after 30 days (`DeleteStaleInvites`, `sweepInvites` in `main.go`).
- **Rate limit:** the invite routes share one per-process token bucket, 30 a minute, burst 10 (`DefaultInviteLimit`, `internal/api/ratelimit.go`). Login has none.
- **Sessions:** `startSession` (`internal/api/cookie.go`) creates a session and destroys the one the browser carried. There is no "end all sessions for a user" method on `session.Store` (`internal/session/session.go`).
- **My settings** is `SettingsPanel` in personal mode (`src/library/SettingsPanel.tsx`). It has no account section.

### 1b. Decisions

- Caleb, 2026-11-19: admin-issued one-time link only, no SMTP. Pending: §0 Q1–Q6.

---

## 2. Model

### 2.1 Reset link (admin)

- In **Accounts**, an adult row's menu has **Make a reset link**. The link works once, for 24 hours (Q1). Making a new one revokes the old one (Q6).
- The link shows once, with **Copy**, using the same clipboard fallback as invites (SPEC-household-basics UX §3.3).
- Any admin can make a link for any other adult, admin or member. Not for themselves: they use Change password. Not for kids (no password). Not for single sign-on accounts (Q4).
- Making a link doesn't sign anyone out and doesn't change the password. Nothing happens until the link is used.

### 2.2 Using the link

- The adult opens `/#reset=<token>`. The web app reads the token and removes it from the address bar, as for invites.
- The screen says: "Set a new password for alex@example.com." They type a new password twice and tap **Save password**.
- Homepad sets the password, marks the link used, ends every session of that account (Q2), and signs them in on this device.
- A dead link (unknown, used, revoked, expired, or the account was removed) shows: "This reset link doesn't work anymore. Ask for a new one."

### 2.3 Change password (signed-in adult)

- My settings gets **Change password**: current password, new password, new password again.
- A wrong current password shows "That's not your current password." It never signs them out.
- On success, every other session of theirs ends (Q3). This device stays signed in.
- Single sign-on accounts don't see the section (Q4). Kids never see it.

### 2.4 The lone admin (Q5)

`homepad-api reset-link <email>` runs against the same database, makes a link for that adult (admin or member, never a kid or an OIDC-only account), and prints the path `/#reset=<token>` and its expiry to the terminal. The admin adds their own Homepad address in front. It writes the same audit log line as the admin route, with `cli` as the actor. It doesn't start the server, and it uses `DATABASE_URL` from the container's environment.

---

## 3. Security notes

### 3.1 Tokens (copied from SPEC-household-basics §3.2)

- 32 bytes from `crypto/rand`, base64url. Only `sha256(token)` stored, 32-byte CHECK.
- Returned once, in the create response (or printed once by the CLI). Never logged, never in a list response.
- Carried in the URL fragment (`/#reset=…`), so it never reaches a server log or a `Referer`. The API gets it only in POST bodies.
- Lookup and accept give one identical 404 for every dead token.
- Single use: accept selects the row `FOR UPDATE … WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, and sets the hash and `used_at` in the same transaction.
- A failed accept that is the user's fault (password too short or too long, the two fields differ) leaves the link usable.

### 3.2 Escalation paths

| Path | Closed by |
|---|---|
| A member or kid makes a reset link | Create is `classAdminOnly`. AC-002. |
| An admin takes over another admin's account | Allowed by design: any admin can already remove or demote any other admin (SPEC-household-manage-adults). Logged (AC-015). The target's old sessions end on use (Q2), so they notice. |
| A link for a kid | Target must be an adult; a kid id is 404. AC-003. |
| A link that adds a local password to an SSO account | Refused, 409 `sso_account` (Q4). AC-010. |
| Guessing a link | 256-bit tokens; rate limit is about CPU (accept runs bcrypt). AC-012. |
| A stolen laptop with a signed-in session changes the password | Change password needs the current password. AC-011. |
| The account is removed while a link is live | `user_id … ON DELETE CASCADE` deletes the link; it then 404s. AC-006. |

### 3.3 Rate limits

- `POST /api/password-resets/lookup` and `/accept` use the invite bucket's design. Until SPEC-signin-hardening ships, they share the existing per-process invite bucket. That spec replaces it with per-client limits.
- `POST /api/me/password` counts failed attempts per account: 5 wrong current passwords in 15 minutes gives 429 with `Retry-After` for 15 minutes. That stops a borrowed, signed-in device from being used to guess the password.

### 3.4 Audit lines

- `reset: admin <id> created reset link <id> for user <id> expires=<ts>` (actor `cli` for the CLI)
- `reset: link <id> revoked by a newer link` (Q6)
- `reset: link <id> used, user <id> password set, <n> sessions ended`
- `password: user <id> changed their password, <n> other sessions ended`
- `password: user <id> wrong current password` (throttled to one line a minute per user)

No line holds a token, a hash, an email or a password.

---

## 4. Acceptance Criteria

### Reset link

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | `POST /api/admin/accounts/{id}/reset-link` makes a link for an adult with a local password and answers 201 `{id, expiresAt, token}`. The token is returned only here. | Must |
| AC-002 | Create: no session 401, member 403, kid 403. | Must |
| AC-003 | A kid's id, an unknown id, a malformed id and the caller's own id get 404, 404, 404 and 409 `self`. | Must |
| AC-004 | A link expires 24 hours after it's made (Q1). | Must |
| AC-005 | Making a link revokes that account's earlier live link (Q6). The earlier token then gets 404. | Must |
| AC-006 | `POST /api/password-resets/lookup {token}` returns `{email, name, expiresAt}` for a live link. Unknown, malformed, expired, used, revoked, and "account removed" all get the same 404 status and body. | Must |
| AC-007 | `POST /api/password-resets/accept {token, password}` sets the password and answers 200 with the `/api/me` body and a new session cookie. Unknown fields are 400. | Must |
| AC-008 | On accept, every session of that account ends before the new one starts (Q2). A request with an old cookie gets 401. | Must |
| AC-009 | A second accept with the same token gets 404 and changes nothing. A failed accept on the user's input (under 8 characters, over 72 bytes) leaves the link usable. | Must |
| AC-010 | For an OIDC-only account, create is 409 `{"error":"sso_account"}` (Q4). | Must |
| AC-011 | Token rules: 32 CSPRNG bytes, base64url, only SHA-256 stored, never logged or listed. | Must |
| AC-012 | Lookup and accept are rate-limited (§3.3). Over the limit: 429 with `Retry-After`. | Must |

### Change password

| ID | Criterion | Priority |
|---|---|---|
| AC-013 | `POST /api/me/password {currentPassword, newPassword}` with the right current password sets the new one and answers 204. Every other session of that account ends; the calling one stays (Q3). | Must |
| AC-014 | Wrong current password: 403 `{"error":"wrong_password"}`, nothing changes, the session stays. A kid: 403 (route is `classKidForbidden`). An OIDC-only account: 409 `sso_account` (Q4). New password under 8 characters or over 72 bytes: 400. | Must |
| AC-015 | Every create, revoke, use and change writes one §3.4 log line; none holds a secret or an email. | Must |
| AC-016 | `homepad-api reset-link <email>` prints a `/#reset=` path and its expiry for an adult with a local password, and exits 0. For an unknown email, a kid or an OIDC-only account it prints why and exits 1 (Q5). | Must |

### Shared

| ID | Criterion | Priority |
|---|---|---|
| AC-017 | `POST /api/register` and `POST /api/invites/accept` refuse passwords over 72 bytes with 400 "password must be at most 72 bytes" instead of 500. | Should |
| AC-018 | Accounts shows **Make a reset link** in an adult's row menu, except for the signed-in admin, kids and SSO-only accounts. The link shows once with Copy and the clipboard fallback (UX to do). | Must |
| AC-019 | Opening `/#reset=<token>` shows the reset screen; the token is removed from the address bar once read; a dead link shows the §2.2 message. | Must |
| AC-020 | My settings shows **Change password** for adults with a local password, and not for kids or SSO-only accounts (`GET /api/me` gains `hasPassword`). | Must |

---

## 5. User Test Cases

**TC-001 — Forgotten password (happy path).** *Precondition:* admin Caleb, member Jo signed in on a tablet. Jo forgets the password on the laptop.
1. Caleb → Accounts → Jo → **Make a reset link** → **Copy**. *Expected:* the link shows once.
2. Jo opens the link on the laptop. *Expected:* "Set a new password for jo@example.com." The address bar has no token.
3. Jo enters a new password twice → **Save password**. *Expected:* signed in on the laptop. The tablet shows the sign-in screen on its next poll.

**TC-002 — Dead links.** Re-open TC-001's link; open a link made 25 hours ago (clock moved); open a link revoked by a newer one; open a link for an account removed since. *Expected:* all show "This reset link doesn't work anymore." All four API answers are the identical 404.

**TC-003 — Change my password.** Jo, signed in on laptop and tablet, opens My settings → **Change password**, enters the current and a new one. *Expected:* saved; the laptop stays signed in; the tablet signs out. Then a wrong current password: "That's not your current password." Still signed in.

**TC-004 — Escalation attempts.** As member: create a reset link → 403. As kid: `POST /api/me/password` → 403. As admin: reset link for a kid → 404; for yourself → 409. Accept with `{"token":…,"password":…,"email":"x"}` → 400.

**TC-005 — Single sign-on account.** OIDC on; Pat signs in only with PocketID. *Expected:* Pat's row has no **Make a reset link**; the API answers 409 `sso_account`. Pat's My settings has no Change password.

**TC-006 — The lone admin.** Caleb is the only admin and forgot the password. On the server: `docker compose exec api /homepad-api reset-link caleb@example.com`. *Expected:* a `/#reset=…` path and its expiry. Opening it on the Homepad address works as TC-001.

---

## 6. Data Model

Migration `0022_password_resets`. Runs once under the new runner (SPEC-household-catalog-owner Q3), and is still written with `IF NOT EXISTS`.

```sql
CREATE TABLE IF NOT EXISTS password_resets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash  BYTEA       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,  -- NULL for the CLI
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS password_resets_live_idx ON password_resets (user_id)
    WHERE used_at IS NULL AND revoked_at IS NULL;
```

- "Live" is `used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`.
- Accept also checks the target is still an adult with a real hash (a role change to kid is impossible, but the check is cheap).
- The existing hourly sweep also deletes rows whose `expires_at`, `used_at` or `revoked_at` is more than 30 days old.
- No `users` change. `hasPassword` is computed: role is adult and `password_hash <> 'oidc:no-local-password'`.
- Session store gains `DestroyAllForUser(ctx, userID, except string)`, shared with SPEC-household-manage-adults; whichever lands first defines it (see the plan's file-ownership map).
- Down migration: `DROP TABLE IF EXISTS password_resets`.

## 7. API Contract

### New, admin-only (`classAdminOnly`)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/admin/accounts/{id}/reset-link` | no body → `201 {id, expiresAt, token}`. 404 not an adult; 409 `self` or `sso_account`. |

### New, public (`classPublic`, rate-limited)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/password-resets/lookup` | `{token}` → `200 {email, name, expiresAt}`. 404 any dead token; 429. |
| POST | `/api/password-resets/accept` | `{token, password}` → `200` `/api/me` body + session cookie. 400 rule or unknown field; 404 dead token; 429. |

### New, signed-in adult (`classKidForbidden`)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/me/password` | `{currentPassword, newPassword}` → `204`. 400 rule; 403 `wrong_password`; 409 `sso_account`; 429. |

### Changed

| Route | Change |
|---|---|
| `GET /api/me` | Adds `hasPassword` (boolean). Additive. |
| `POST /api/register`, `POST /api/invites/accept` | 400 over 72 bytes (AC-017). |

The token travels only in POST bodies. All new routes go through `router.handle`, and `routes_test.go` gains them.

### CLI

`homepad-api reset-link <email>`: a subcommand in `cmd/homepad-api/main.go`, dispatched on `os.Args[1]` before the server starts. Exit 0 with the path and expiry on stdout; exit 1 with the reason on stderr.

## 8. Frontend Implementation

- `src/api.ts`: `createResetLink(id)`, `lookupReset(token)`, `acceptReset(token, password)`, `changePassword(current, next)`; `User` gains `hasPassword`.
- `src/accounts/`: **Make a reset link** in `AdultRowMenu.tsx` (made by SPEC-household-manage-adults) opens `ResetLinkDialog.tsx`, which reuses the invite dialog's link-once view and clipboard fallback.
- `src/app/App.tsx`: a `#reset=` fragment is read next to the `#invite=` one (from #565), removed with `history.replaceState`, and renders `ResetPasswordScreen` in place of the sign-in screen.
- `src/library/SettingsPanel.tsx` (personal mode): a **Password** group with the Change password form, shown when `hasPassword`.
- Copy (plain; UX may adjust):
  - Dialog: "Reset link for Jo. It works once, for 24 hours. Send it to Jo yourself." Button **Copy link**.
  - Screen: "Set a new password for jo@example.com." Fields **New password**, **Type it again**. Button **Save password**.
  - Mismatch: "The two passwords don't match."
  - Too short: "Use at least 8 characters."
  - Dead link: "This reset link doesn't work anymore. Ask for a new one."
  - Change password done: "Password changed. Your other devices are signed out."
- Docs: `docs/accounts.md` (or the home UX picks) gets "Forgotten passwords" with the CLI line for the lone admin.

## 9. Design (Kare)

UX artifact: to do (/add:ux). Surfaces:

1. the row menu item and the reset-link dialog (link-once view, clipboard fallback);
2. the reset screen: live, dead, and already-signed-in-as-someone-else states;
3. My settings → Password: the form, wrong-password and success states.

## 10. Upgrade and Compatibility

- Additive: one new table, new routes, one new `GET /api/me` field. Nobody is signed out by the upgrade.
- An older web build ignores `hasPassword`. Ship both halves together.
- Release-note lines:
  - "Forgot a password? An admin can make a one-time reset link in Administration → Accounts. It works for 24 hours."
  - "You can change your own password in My settings."
  - "If you are the only admin and forget your password, run `docker compose exec api /homepad-api reset-link you@example.com` on the server."

## 11. Out of Scope

- Sending reset links by email or any other channel.
- Self-service "Forgot password?" on the sign-in screen (it would need email).
- Kid passwords.
- Password strength rules beyond 8 characters minimum and 72 bytes maximum.
- Two-factor sign-in.
- Adding a local password to an SSO account (Q4 alternative).

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Pending (§0 Q1–Q6) |
| Product | Walt | Pending |
| Design | Kare | Pending (UX artifact to do) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-19 | 0.1.0 | Draft for 18.0.0, checked against `homepad-api` `79e3b03` and `homepad` `6eb8a35`. |
