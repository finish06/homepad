# Spec: Household basics — safe sign-up, adding an adult, every admin can edit

**Version:** 0.1.0
**Created:** 2026-11-07
**Author:** Claude (spec step for Caleb's approved next-work list, item 2)
**Status:** Draft — awaiting Caleb's answers to §0 (Q1–Q12)
**Repo:** `Code/homepad` (frontend, quickstart, docs) + `Code/homepad-api` (Go backend) + `demo-seed` branch config (demo only)
**Estimate:** ~3–4 days (invites API + migration, catalog-owner fix, account limit, auth-config + login/setup screen, Add-an-adult UI, docs, tests)
**Depends on:** SPEC-kid-accounts (17.0.0: Accounts section, persistent hashed sessions, route classes), SPEC-245-224 (shared catalog owner)
**Target version:** 17.1.0 (minor — no existing account loses access; the changed default only affects new self-registration, see §10)
**Issues folded in:** homepad-api #87, homepad-api #88, homepad #548

---

## 0. Open questions / decisions for Caleb

Answer "all defaults", or pick per question. Each default is what the rest of this spec is written against; a different pick changes the ACs named in brackets.

**Q1 — Default registration mode.** [AC-001, AC-007]
- **A (default):** `invite_only` becomes the default everywhere: `compose.yaml`, `compose.build.yaml`, `.env.example`, and the API when the variable is unset. The first account still registers and becomes admin. The code already does this under `invite_only` (§1a), so no new mode is needed.
- B: keep `open` as the default, but the API treats `open` as closed once any kid account exists.
- C: remove `open` entirely.

**Q2 — Existing installs that run with `open`.** [AC-006, §10]
- **A (default):** keep honoring an explicit `open`. While it's open, the Accounts section shows a warning, with an extra line once a kid exists. The CHANGELOG tells people how to check.
- B: once a kid account exists, treat `open` as `invite_only` and log a warning at startup.
- C: stop honoring `open` (breaking; would make this 18.0.0).

**Q3 — How an admin adds an adult.** [AC-008…AC-020]
- **A (default):** an invite link only. The admin enters a name and picks a role, then gets a one-time link. The adult opens it and sets their own email and password.
- B: the admin types the adult's email and a starting password. (There is no change-password route today, so the admin would know it for good.)
- C: both.

**Q4 — Invite lifetime.** [AC-010]
- **A (default):** 7 days, fixed.
- B: 24 hours, fixed.
- C: the admin picks 1, 7 or 30 days.

**Q5 — Invites and single sign-on (OIDC).** [AC-022]
- **A (default):** invites make password accounts only. OIDC stays as it is: the identity provider decides who can sign in, and `OIDC_ADMIN_GROUP` decides who is an admin. When OIDC is on, the Add-an-adult dialog says so.
- B: the invite page also offers "Continue with PocketID", and the new account gets the invite's role.
- C: B, and also: under `invite_only`, OIDC no longer auto-creates accounts. A new OIDC identity needs an invite or an existing account with that email.

**Q6 — Removing an adult, or changing their role.** [§11]
- **A (default):** not in this spec. Pending invites can be revoked. Removing adults gets its own spec, because deleting the catalog owner today deletes the whole catalog (`services.user_id … ON DELETE CASCADE`, §3.6).
- B: include remove and role change, with guards: not yourself, never the catalog owner, never the last admin.

**Q7 — #87 leftovers.** A second admin's "successful" creates wrote rows nobody can see (§1a). [AC-026]
- **A (default):** leave them where they are. The API logs a count at startup. No data migration.
- B: a one-time migration moves them into the shared catalog, skipping name and slug clashes.
- C: delete them.

**Q8 — The demo's account cap (#88).** [AC-028…AC-032]
- **A (default):** a general setting on `main`, `HOMEPAD_MAX_ACCOUNTS`. Unset means no limit. It counts every account (admin, member, kid) plus pending invites. The demo sets it to 12.
- B: a kid-only cap, hard-coded on the `demo-seed` branch.
- C: a `HOMEPAD_DEMO=true` switch on `main` that turns on fixed caps and hides invites.

**Q9 — Invites on the public demo.** [AC-032]
- **A (default):** allowed, inside the cap. Visitors can try the whole flow, and the reset wipes it.
- B: switched off on the demo.

**Q10 — How fast a kid's allow-list change shows up (#548).** [AC-033…AC-035]
- **A (default):** the kid dashboard polls every 20 seconds; adults stay at 60. Target: within 30 seconds.
- B: everyone polls every 30 seconds. Target: within 40 seconds. This changes v13's 60-second contract for adults.
- C: server push (SSE). Target: within 5 seconds. Much bigger change.

**Q11 — The sign-in screen on a fresh install.** [AC-004, AC-005]
- **A (default):** with no account yet, the screen becomes "Set up Homepad" with a form for the admin account. Once registration is closed, the "Create account" button is gone.
- B: only hide "Create account" when registration is closed.
- C: no change (today the button always shows and fails with "registration is invite-only").

**Q12 — Who gets to be the first admin.** On a fresh install, whoever reaches the page first becomes admin. [AC-003, §11]
- **A (default):** keep that, and make it safe against a race (only one account can win). Docs say to finish setup before exposing Homepad outside the LAN.
- B: the API prints a one-time setup code in its log, and the first registration needs it.

---

## 1. Overview

Caleb's next-work item 2, "Household basics": the pieces a household needs before kid accounts are safe to hand out. A kid who signs out must not be able to make an adult account. An admin must be able to add a spouse without reopening sign-up for everyone. A second admin must be able to edit the catalog. And the public demo must not fill up with kids.

### 1a. What exists today (checked in the code, `homepad-api` `gitea/main` at `32f3200`, `homepad` `gitea/main` at `9c7ce48`)

- **Sign-up is open by default.** `compose.yaml:52` and `compose.build.yaml:53` pass `HOMEPAD_REGISTRATION: ${HOMEPAD_REGISTRATION:-open}`; `.env.example:45` sets `open`; the API falls back to `envOr("HOMEPAD_REGISTRATION", "open")` (`cmd/homepad-api/main.go`). The README, `compose.yaml` header and `docs/kid-accounts.md` all tell the admin to switch to `invite_only` by hand after registering.
- **`invite_only` already lets the first account in.** `handleRegister` (`internal/api/auth.go`) makes the caller admin when `CountUsers` is 0, *before* it checks the mode. So "first account becomes admin, then sign-up is closed" is exactly what `invite_only` does today. The manual switch is unneeded.
- **The first-admin check is a race.** `CountUsers` then `CreateUser` are two statements with no lock. Two registrations at once on an empty install can both see 0 and both become admin.
- **The sign-in screen always offers "Create account"** (`src/app/App.tsx` `AuthForm`), whatever the mode. Under `invite_only` it fails with the raw error "registration is invite-only". `GET /api/auth/config` returns only `{oidcEnabled}`, so the web app can't know.
- **An admin can't add an adult.** `server.go` has `POST /api/admin/kids` and no route that creates, or invites, an adult. `POST /api/register` can only make a `user` after the first account. The only way to get a second admin is `OIDC_ADMIN_GROUP` or editing the database.
- **OIDC creates accounts on its own.** `resolveOIDCUser` (`internal/api/oidc.go`) creates a `user` (or `admin`, by group) for any identity the provider signs in, whatever `HOMEPAD_REGISTRATION` says. It links to an existing account by email.
- **#87, worse than the issue says.** The catalog is owned by the first admin (`SharedCatalogOwnerID`, `internal/storage/storage.go:47`), and reads use it. Writes still pass the *caller's* id (`u.ID`). For a second admin:
  - `PATCH`/`DELETE /api/services/{id}`, `PATCH /api/categories/{id}`, `PUT /api/categories/order`, icon `PUT`/`DELETE` and `fetch-icon`: **404**.
  - `POST /api/services`, `POST /api/categories`, `POST /api/library/{id}/add`: **201**, but the row is owned by the second admin, so it never shows on anyone's dashboard. The write "worked" and vanished.
  - `DELETE /api/categories/{id}`: **204 and nothing happens** (the store call is idempotent for "not mine").
  - `GET /api/library`: the `added` hint is checked against the caller's own rows, so every offer reads "not added".
  - Kid allow-lists already use the owner (`sharedOwnerSQL` in `internal/storage/kids.go`), so they are fine.
- **#88: there is no "demo mode" on `main`.** The demo is the long-lived `demo-seed` branch. Its only runtime difference is `SeedDemoIfNoUsers` in `main.go` (one shared admin plus a curated board on an empty database). Nothing limits kid creation, on the demo or anywhere.
- **#548: everyone polls every 60 seconds.** `POLL_MS = 60_000` in `src/services.tsx`. A kid shell adopts a changed member list on the next poll (`syncMembership`). Polling pauses while the tab is hidden and runs at once when it becomes visible again.
- **No rate limiting and no audit trail exist** anywhere in the API. The one admin-action log line is `sign-in-here` in `admin_accounts.go`.
- **Session tokens** are 32 random bytes, base64url, and only their SHA-256 is stored (`internal/session/session.go`). Invite tokens reuse that pattern.

### 1b. Decisions

Pending: §0 Q1–Q12. This section records Caleb's answers once given.

---

## 2. Model

### 2.1 Safe sign-up by default (scope 1)

- The default becomes **`invite_only`** (Q1). The first account still registers and becomes admin. After that, new adults come in through invites (§2.2). Kids come in through Accounts, as today.
- The first-admin check becomes **atomic**: register runs in one transaction under a Postgres advisory lock, so on an empty install exactly one account becomes admin (Q12).
- `GET /api/auth/config` tells the web app the mode and whether setup is still needed. The sign-in screen then shows **Set up Homepad** on a fresh install and drops **Create account** when sign-up is closed (Q11).
- An explicit **`open` keeps working** (Q2). While it's on, the admin sees a warning in Accounts.

### 2.2 Adding an adult: invite links (scope 2)

- In **Accounts**, an admin taps **+ Add an adult**, enters a name, picks **Member** or **Admin**, and gets a link. The link works once and lasts 7 days (Q4).
- The adult opens the link, sees who invited them and what role they'll have, and enters their email and a password. They're signed in straight away.
- The admin sees pending invites in Accounts and can revoke one. Once used, an invite drops off the list, and the new adult shows in the account list.
- Invites work in every registration mode. That's the point: sign-up can stay closed for good.
- Invites make password accounts. People who use single sign-on keep signing in with it, as today (Q5).
- `member` is UI copy for the existing `user` role. The API value stays `user`.

### 2.3 Every admin edits the same catalog (scope 3, #87)

- Every catalog write resolves the **shared catalog owner** after `requireAdmin`, the same way reads do. The caller's id is used only for the caller's own things: favorites, layout, collapsed sections, preferences.
- One helper does the resolving (`catalogOwner`, already in `icons.go`). The route classes in `server.go` gain a way to tell "admin-only catalog write" apart, and a test probes each such route as a second admin (AC-025). That enforces the rule instead of asserting it in a comment.
- This is a prerequisite for §2.2: admin invites will make second admins common.

### 2.4 An account cap, for the demo (scope 4, #88)

- New setting **`HOMEPAD_MAX_ACCOUNTS`** (Q8). Unset or `0` means no limit. A positive number caps the count of all accounts (admin, member, kid) plus pending, unexpired invites.
- At the cap, creating a kid, creating an invite, open self-registration and OIDC auto-creation are refused. Accepting an invite that already exists is never refused: it reserved its place when it was made. The first account is never refused.
- A value that isn't a whole number stops the API at startup with a clear message. A cap that silently turns off would leave the demo open, and that's the one place it's set.
- The demo sets it to 12 (Q8). Invites stay on there, inside the cap (Q9).

### 2.5 Kid allow-list changes show up faster (scope 5, #548)

- The kid shell polls every **20 seconds** (Q10). Adults stay at 60, so v13's contract and its tests don't move.
- Target: an open, visible kid dashboard shows the change **within 30 seconds** of the admin's Save. A hidden one still pauses, and catches up the moment it's visible again.
- This supersedes SPEC-kid-accounts AC-002's "within 60s" for kids. That spec is not edited; the README index notes the supersession when this ships.

---

## 3. Security notes

This is auth. Each item names the AC that pins it.

### 3.1 Privilege escalation paths, and what closes each

| Path | Closed by |
|---|---|
| A kid signs out and self-registers an adult account | Default `invite_only` (AC-001); warning when `open` is kept (AC-006) |
| A non-admin (member or kid) creates an invite, or an admin invite | Invite routes are `classAdminOnly`: `requireNotKid` in front, `requireAdmin` in the handler (AC-016) |
| The invitee picks their own role | The role is fixed when the invite is made. Accept decodes strictly; a `role` field is a 400 (AC-013) |
| An invite for the `kid` role | Only `admin` and `user` are allowed, by handler check and table CHECK (AC-016, §6) |
| Two people race to be the first admin | Advisory lock + one transaction (AC-003) |
| An old link reused | Single use: the accept marks it used in the same transaction that creates the user, `WHERE used_at IS NULL AND expires_at > now()` (AC-010) |
| A second admin silently writing outside the catalog | Owner resolution on every catalog write (AC-023, AC-025) |

### 3.2 Invite tokens

- 32 bytes from `crypto/rand`, base64url (256 bits). Guessing is not a realistic attack, so rate limits (3.4) are about CPU, not brute force.
- Only `sha256(token)` is stored, with a 32-byte CHECK as on `sessions`. A database dump can't be turned into working links.
- The token is returned once, in the create response. It is never logged and never returned again. To re-share, revoke and make a new one.
- The link carries the token in the **URL fragment** (`/#invite=…`). Browsers don't send fragments to the server, so the token never lands in nginx or proxy access logs, or in a `Referer` header. The web app reads it, then removes it from the address bar with `history.replaceState` (AC-020). The API receives it only in POST bodies.
- Lookup and accept give one identical 404 for every dead token: unknown, malformed, expired, used or revoked. That way the API isn't an oracle for which links ever existed.

### 3.3 Expiry and single use

- 7 days from creation (Q4). Expired and used rows are kept for 30 days for the audit trail, then swept by the existing hourly sweeper.
- Failures that are the invitee's fault (a bad email, a short password, an email already taken) roll back and leave the invite usable (AC-014).

### 3.4 Rate limits

- `POST /api/invites/lookup` and `/accept` share one in-process token bucket: 30 requests a minute, burst 10. Over it: `429` with `Retry-After`. Accept runs bcrypt, so this bounds CPU on a public route.
- The bucket is per process, not per IP. Behind the web container's nginx every request has the same peer address, and trusting `X-Forwarded-For` needs its own design. Login has no rate limit today; that gap is noted in §11 and isn't widened here.

### 3.5 Audit

No audit table exists. This spec adds log lines in the existing `sign-in-here` style, and never logs a token or hash:

- `invite: admin <id> created invite <id> role=<role> expires=<ts>`
- `invite: admin <id> revoked invite <id>`
- `invite: invite <id> accepted, created user <id> role=<role>`
- `register: first account <id> created as admin`
- `accounts: limit <n> reached, refused <route>`

The `invites` table keeps `created_by`, `used_by` and `used_at`, so the trail survives a log rotation for 30 days.

### 3.6 Other notes

- **CSRF.** The session cookie is `SameSite=Lax`, so a cross-site POST carries no cookie. Invite creation therefore can't be forged from another site. Accept is public and does no harm to a signed-in visitor beyond replacing their session, and the UI asks first (UX §4).
- **Email enumeration.** Accept answers 409 "email already has an account". Only someone holding a live invite can ask, which is acceptable.
- **The catalog owner is load-bearing.** `services.user_id` and `categories.user_id` are `ON DELETE CASCADE`, so deleting the first admin would delete the catalog. No route deletes an adult today, and this spec keeps it that way (Q6). Any later "remove an adult" spec must deal with this first.
- **OIDC on a fresh install.** Without `OIDC_ADMIN_GROUP`, the first OIDC sign-in makes a member, and that ends setup (`setupNeeded` counts adults). The install then has no admin. That's true today too. The setup screen has no PocketID button (UX §2), and the docs say to create the admin account first.
- **OIDC links by email** and doesn't check `email_verified`. If an identity provider lets a user set any email, that user could sign in as the matching local account. That's existing behavior, unchanged here, and listed in §11 for its own fix.

---

## 4. Acceptance Criteria

### Sign-up (scope 1)

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | `HOMEPAD_REGISTRATION` defaults to `invite_only` in `compose.yaml`, `compose.build.yaml`, `.env.example`, and in the API when the variable is unset or empty (Q1). | Must |
| AC-002 | On an install with no adult accounts, `POST /api/register` creates the account as admin in every mode. With one or more adults, `invite_only` returns 403 and `open` creates a `user`, unchanged. | Must |
| AC-003 | The first-admin bootstrap is atomic. With 10 concurrent registrations on an empty install, exactly one account is admin. Under `invite_only` the rest get 403. | Must |
| AC-004 | `GET /api/auth/config` adds `registration` (`"open"` or `"invite_only"`) and `setupNeeded` (true only when there are no adult accounts). `oidcEnabled` is unchanged. The route stays public. | Must |
| AC-005 | Sign-in screen: when `setupNeeded`, it shows **Set up Homepad** (UX §2). When sign-up is closed and setup is done, it shows no "Create account" control. When `open`, it behaves as today. | Must |
| AC-006 | An explicit `HOMEPAD_REGISTRATION=open` keeps working (Q2). While it's on, the Accounts section shows the open-sign-up warning (UX §3.1), with the kid line when one or more kids exist. | Must |
| AC-007 | README quickstart, the `compose.yaml` header, `.env.example`, `docs/kid-accounts.md` ("Before you start") and `docs/development.md` drop the "switch to `invite_only` afterwards" step. The CHANGELOG entry says how to check the mode (Admin Panel → System → Registration mode). | Must |

### Adding an adult (scope 2)

| ID | Criterion | Priority |
|---|---|---|
| AC-008 | An admin can create an invite with a name (1–40 characters, no control characters) and a role (`admin` or `user`). The response carries the token once. | Must |
| AC-009 | The token is 32 bytes from a CSPRNG, base64url. Only its SHA-256 is stored. It never appears in a log line, a list response, or any later response. | Must |
| AC-010 | An invite expires 7 days after it's made (Q4) and works once. The use is marked in the same transaction that creates the account. A second accept of the same token gets 404 and creates nothing. | Must |
| AC-011 | `GET /api/admin/invites` lists pending invites only (not used, not expired, not revoked): name, role, who made it, made and expiry times. `DELETE /api/admin/invites/{id}` revokes one. Revoked tokens get 404 at lookup and accept. | Must |
| AC-012 | `POST /api/invites/lookup {token}` returns `{name, role, inviterName, expiresAt}` for a live token. Every dead token (unknown, malformed, expired, used, revoked) gets the same 404 status and body. | Must |
| AC-013 | `POST /api/invites/accept {token, email, password, name?}` creates an adult with the invite's role and signs them in with an adult (30-day) session: 201 with the `/api/me` body. Unknown fields, including `role`, are a 400. | Must |
| AC-014 | An accept that fails on the invitee's input (invalid email, password under 8 characters, email already taken → 409) leaves the invite unused and still valid. | Must |
| AC-015 | Invites work in both registration modes. | Must |
| AC-016 | Create, list and revoke are admin-only: no session 401, member 403, kid 403. A role other than `admin` or `user` (including `kid`) is a 400. | Must |
| AC-017 | Lookup and accept share a rate limit of 30 a minute, burst 10. Over it: 429 with `Retry-After`. | Must |
| AC-018 | Create, revoke, accept and the first-admin bootstrap each write one log line (§3.5). No log line contains a token or a token hash. | Must |
| AC-019 | Accounts has **+ Add an adult** and a **Pending invites** list with Revoke (UX §3). After creating, the link shows once, with Copy. When the clipboard isn't available (plain `http://` on a LAN), the link shows in a selected read-only field instead. | Must |
| AC-020 | Opening `/#invite=<token>` shows the accept screen (UX §4). The token is removed from the address bar once read. A dead link shows "This invite link doesn't work anymore. Ask for a new one." | Must |
| AC-021 | The Accounts list shows the `user` role as "member". The API value is unchanged. | Should |
| AC-022 | OIDC sign-in is unchanged (Q5). When `oidcEnabled`, the Add-an-adult dialog shows the single sign-on line (UX §3.2). | Must |

### Every admin edits the catalog (scope 3, #87)

| ID | Criterion | Priority |
|---|---|---|
| AC-023 | Every catalog write acts on the shared catalog for any admin: `POST`/`PATCH`/`DELETE /api/services…`, `POST`/`PATCH`/`DELETE /api/categories…`, `PUT /api/categories/order`, icon `PUT`/`DELETE`, `POST /api/services/{id}/fetch-icon`, and `POST /api/library/{id}/add`. A second admin gets the same status and the same effect as the first. | Must |
| AC-024 | `GET /api/library`'s `added` hint is checked against the shared catalog, for every caller. | Must |
| AC-025 | A test walks the router's own route list. Every catalog-write route must be in the second-admin suite, which probes it as a second admin and checks that the change shows in `GET /api/services` or `/api/categories`. A new catalog route that isn't covered fails the test. | Must |
| AC-026 | Rows already written under a non-owner admin's id are left in place (Q7). At startup the API logs how many there are, when there are any. | Should |
| AC-027 | Single-admin installs see no change. Every existing catalog test passes unmodified. | Must |

### Account cap (scope 4, #88)

| ID | Criterion | Priority |
|---|---|---|
| AC-028 | `HOMEPAD_MAX_ACCOUNTS` caps all accounts plus pending, unexpired invites. Unset, empty or `0`: no limit. A value that isn't a non-negative whole number stops the API at startup with a message naming it. | Must |
| AC-029 | At the cap: `POST /api/admin/kids`, `POST /api/admin/invites`, `POST /api/register` in `open` mode, and OIDC auto-creation are refused with 409 "account limit reached". Nothing is created. Accepting an existing invite and creating the first account are never refused. | Must |
| AC-030 | `HOMEPAD_MAX_ACCOUNTS` joins the env-config allowlist and shows in Admin Panel → System. | Must |
| AC-031 | At the cap, saving a new kid or making an invite shows "This Homepad has reached its limit of N accounts." inline. The rest of Accounts still works. | Must |
| AC-032 | The public demo runs with `HOMEPAD_MAX_ACCOUNTS=12`, with invites on (Q9). Checked on the demo after Joe and Gus deploy it. | Must |

### Kid allow-list latency (scope 5, #548)

| ID | Criterion | Priority |
|---|---|---|
| AC-033 | An open, visible kid dashboard shows an allow-list change within 30 seconds of the admin's Save, with no reload. The kid shell polls every 20 seconds (Q10). Adult polling stays 60 seconds. | Must |
| AC-034 | A kid dashboard that becomes visible again polls at once and shows the current list. | Must |
| AC-035 | A hidden kid dashboard still doesn't poll. | Must |

---

## 5. User Test Cases

**TC-001 — Fresh install.** *Precondition:* new quickstart, `.env` holds only `POSTGRES_PASSWORD`.
1. Open Homepad. *Expected:* **Set up Homepad**, not the normal sign-in.
2. Create the admin account. *Expected:* signed in as admin. Admin Panel → System shows Registration mode `invite_only`.
3. Sign out. *Expected:* a sign-in screen with no "Create account". *Screenshot:* both screens, at 390 and 1440.

**TC-002 — A kid can't make an adult account.** *Precondition:* TC-001 done; kid Sam signed in on the iPad. Sam taps **Sign out**. *Expected:* a sign-in screen with no way to create an account. `POST /api/register` with a new email returns 403.

**TC-003 — Invite a spouse (happy path).**
1. Admin → Accounts → **+ Add an adult**, name "Alex", role **Member**, **Create link**. *Expected:* the link shows once, with **Copy**.
2. On another device, open the link. *Expected:* "Caleb invited you to Homepad. You'll be a member." The address bar no longer shows the token.
3. Enter an email and password, then tap **Join**. *Expected:* signed in to the dashboard as Alex, with no admin entries.
4. Back in Accounts. *Expected:* Alex listed as member; the invite is gone from Pending.

**TC-004 — Dead links.** Re-open TC-003's link; open a revoked invite's link; open a link after moving the clock 8 days. *Expected:* all three show "This invite link doesn't work anymore." All three API answers are the identical 404.

**TC-005 — Escalation attempts.** As a member: `POST /api/admin/invites` → 403. As a kid: → 403. Accept with `{"role":"admin", …}` → 400. Create an invite with `"role":"kid"` → 400. Accept with an email that's already registered → 409, and the invite still works afterwards.

**TC-006 — Second admin edits the catalog (#87).** *Precondition:* a second admin made through an admin invite. As them: add an app from the Library, create a category, rename it, reorder categories, upload an icon, edit a tile, then delete a tile. *Expected:* every change shows on the first admin's dashboard and on a member's. The Library shows "added" correctly.

**TC-007 — Account cap (#88).** *Precondition:* `HOMEPAD_MAX_ACCOUNTS=3`, one admin. Add a kid, then make an invite. *Expected:* both work (3 of 3). Add another kid → "This Homepad has reached its limit of 3 accounts." Accept the pending invite → works.

**TC-008 — Kid list update (#548).** With Sam's dashboard open, the admin unticks one app and ticks another on a different device, then saves. *Expected:* Sam's dashboard updates within 30 seconds, with no reload.

**TC-009 — Upgrade with `open` kept.** *Precondition:* a 17.0.0 install with `HOMEPAD_REGISTRATION=open` and one kid; upgrade the images only. *Expected:* everyone stays signed in. Accounts shows the open-sign-up warning with the kid line. "Create account" still shows on the sign-in screen.

**TC-010 — Copy on a plain-http LAN.** On `http://homepad.lan` (no TLS), make an invite. *Expected:* the link shows in a selected field with the hint to copy it. No error.

---

## 6. Data Model

Migration `0019_invites`. Like every migration here, it re-runs on every boot, so it must be idempotent (`IF NOT EXISTS`, guarded constraint adds).

```sql
CREATE TABLE IF NOT EXISTS invites (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash  BYTEA       NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    name        TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('admin', 'user')),
    created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    used_by     UUID        REFERENCES users(id) ON DELETE SET NULL,
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS invites_pending_idx ON invites (expires_at)
    WHERE used_at IS NULL AND revoked_at IS NULL;
```

- An invite creates no `users` row until it's accepted. So the `users_kid_credentials_check` rule (adults have email and password hash) holds without a placeholder hash.
- "Pending" means `used_at IS NULL AND revoked_at IS NULL AND expires_at > now()`. The account cap counts these.
- The sweeper deletes rows whose `expires_at`, `used_at` or `revoked_at` is more than 30 days old.
- No change to `users`. The cap is a count, so it needs no table.
- Down migration: `DROP TABLE IF EXISTS invites`.

## 7. API Contract

### New, admin-only (`classAdminOnly`)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/admin/invites` | `{name, role}` → `201 {id, name, role, createdAt, expiresAt, token}`. 400 bad name or role; 409 account limit. |
| GET | `/api/admin/invites` | `[{id, name, role, createdAt, expiresAt, createdBy: {id, name}}]`, pending only, newest first. |
| DELETE | `/api/admin/invites/{id}` | `204`. 404 when unknown, already used, already revoked or expired. |

### New, public (`classPublic`, rate-limited)

| Method | Path | Body / result |
|---|---|---|
| POST | `/api/invites/lookup` | `{token}` → `200 {name, role, inviterName, expiresAt}`. 404 for any dead token; 429. |
| POST | `/api/invites/accept` | `{token, email, password, name?}` → `201` `/api/me` body + session cookie. 400 validation or unknown field; 404 dead token; 409 email taken; 429. |

The token travels in the body, never the path or query, so it stays out of access logs.

### Changed

| Route | Change |
|---|---|
| `GET /api/auth/config` | Adds `registration` and `setupNeeded` (AC-004). |
| `POST /api/register` | Atomic bootstrap (AC-003). Account cap in `open` mode (AC-029). Responses otherwise unchanged. |
| `GET /api/auth/oidc/callback` | Account cap on auto-creation (AC-029); otherwise unchanged (Q5). |
| `POST /api/admin/kids` | 409 at the account cap (AC-029). |
| Catalog writes (AC-023 list), `GET /api/library` | Resolve the shared catalog owner (AC-023, AC-024). Status codes for the first admin unchanged. |
| `GET /api/admin/env-config` | Allowlist gains `HOMEPAD_MAX_ACCOUNTS` (AC-030). |

### Route classes

The five new routes are registered through `router.handle` with the classes above, and `routes_test.go`'s independent class table gains them. For AC-025, catalog writes get their own class (for example `classCatalogWrite`, enforced like `classAdminOnly`), so the second-admin suite can list them from the router instead of from a hand-kept copy.

## 8. Frontend Implementation

- **`authConfig()`** (`src/api.ts`) returns `{oidcEnabled, registration, setupNeeded}`, with safe fallbacks: when the call fails, assume closed and no setup, so a broken config read never shows "Create account".
- **`AuthForm`** (`src/app/App.tsx`) gets three states: set up, sign in, and sign in with sign-up (only when `open`). UX §2.
- **Invite accept screen.** On load, a `#invite=` fragment is read, removed with `history.replaceState`, and the accept screen renders in place of the sign-in screen. No router is needed; nginx already serves `index.html` for `/`. UX §4.
- **Accounts** (`src/accounts/AccountsSection.tsx`): **+ Add an adult** next to **+ Add a kid**; a Pending invites list; the open-sign-up warning; the "member" label (AC-021). The new `AddAdultDialog` uses the existing `Modal`. UX §3.
- **Copy link:** `navigator.clipboard.writeText` when `window.isSecureContext`, otherwise a selected read-only input with "Press and hold to copy" (touch) or "Press ⌘C to copy" (desktop). On iPad, `navigator.share` is offered when available. UX §3.3.
- **Kid poll interval:** `ServicesProvider` takes a poll interval. The kid shell passes 20 000 ms; everyone else keeps `POLL_MS` (AC-033).

## 9. Design (Kare)

UX artifact: [`specs/ux/household-basics-ux.md`](./ux/household-basics-ux.md) (Draft). Surfaces:

1. the sign-in screen's three states (set up, sign in, sign in with sign-up);
2. Accounts: **+ Add an adult**, Pending invites, the open-sign-up warning;
3. the Add-an-adult dialog: form, link-once view, the clipboard fallback;
4. the invite accept screen: live, dead, and already-signed-in states.

## 10. Upgrade and Compatibility

| Install | What happens on 17.1.0 |
|---|---|
| Quickstart with `HOMEPAD_REGISTRATION=open` in `.env`, or the old `compose.yaml` (which passes `open` explicitly) | Unchanged: sign-up stays open. Accounts shows the warning (AC-006). The CHANGELOG says to set `invite_only`. |
| Already on `invite_only` | Unchanged, except that the sign-in screen stops offering "Create account". |
| No `HOMEPAD_REGISTRATION` at all (for example a hand-written k8s manifest) | Sign-up closes. Existing accounts are untouched; the admin uses invites. The CHANGELOG calls this out. |
| A new quickstart | `invite_only` from the start. No manual step. |
| Several admins (via `OIDC_ADMIN_GROUP`) | Their catalog edits start working (#87). Earlier invisible rows stay invisible (Q7). |
| Public demo | Needs `main` merged into `demo-seed` and `HOMEPAD_MAX_ACCOUNTS=12` in its deploy config. Deploying goes through Joe and Gus. |

- Sessions are unaffected: nobody is signed out by this release.
- `GET /api/auth/config` fields are additive; an older web build ignores them. A 17.1.0 web build against a 17.0.0 API gets no `registration` field and falls back to closed (§8). The only effect is a missing "Create account" button on an `open` install until the API is upgraded too. Ship both halves together, as with 17.0.0.

## 11. Out of Scope

- Removing an adult or changing an adult's role (Q6). Needs the catalog-owner cascade dealt with first (§3.6).
- Password reset and password change, for anyone. (An invite-style one-time link is the likely shape later.)
- Sending invite emails. The admin shares the link however they like.
- A setup code for the first admin (Q12 alternative).
- Rate limiting `POST /api/login` and `POST /api/register`, and trusting `X-Forwarded-For`.
- Checking OIDC `email_verified` before linking by email (§3.6), and making `invite_only` gate OIDC auto-creation (Q5 option C).
- Moving the registration mode into the Admin Panel as an editable setting.
- Server push for kid list changes (Q10 option C).
- Multi-household isolation (PRD §4).

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Product | Caleb | Pending (§0 Q1–Q12) |
| Design | Kare | Drafted 2026-11-07 (`specs/ux/household-basics-ux.md`) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1.0 | Draft from Caleb's next-work item 2, homepad-api #87 and #88, and homepad #548, checked against `homepad-api` `32f3200` and `homepad` `9c7ce48`. |
