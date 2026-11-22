# Spec: Sign-in hardening — rate limits, verified emails for single sign-on, invite-only for SSO

**Spec ID:** SPEC-signin-hardening
**Version:** 0.1.4
**Created:** 2026-11-19
**Author:** Claude (spec step for Caleb's 18.0.0 theme, "a household you can manage")
**Status:** SHIPPED — 18.0.0 (2026-11-22). The `email_verified` refusal and the three small bug fixes (login timing, the callback cookie, the 72-byte limit) shipped earlier, in 17.1.0. Approved — Caleb, 2026-11-20: every §0 question decided. Status line read "Approved" until 2026-11-22.
**Repo:** `Code/homepad-api` (limiter, client address, OIDC rules) + `Code/homepad` (sign-in screen messages, README, `.env.example`, docs)
**Estimate:** ~2.5 days (per-client limiter with trusted proxies, login limits and timing, OIDC invite-only rule, OIDC error landing, docs and PocketID guide, tests)
**Depends on:** SPEC-household-basics (registration modes, invite bucket), SPEC-password-reset-link (its public routes move onto this limiter). Builds after SPEC-household-manage-adults and SPEC-password-reset-link.
**Target version:** 18.0.0
**UX:** [`specs/ux/signin-hardening-ux.md`](./ux/signin-hardening-ux.md) (APPROVED 2026-11-20, S-1…S-6)
**Issues folded in:** homepad-api #89 (OIDC `email_verified`; merged in #91, shipped in 17.1.0, see §0), SPEC-household-basics §11 (login and register rate limits, `X-Forwarded-For`, Q5 option C)

---

## 0. Open questions — decisions for Caleb

All questions are decided.

**Decided (Caleb, 2026-11-19):**
- Single sign-on links or creates an account by email only when the provider says the email is verified (`email_verified` is `true`). The docs explain how to make PocketID send it.
- `X-Forwarded-For` is not trusted unless the admin configures which proxies to trust.

**Decided — Q1, the `email_verified` refusal ships in 17.1.0 (Caleb, 2026-11-19: "a").** [AC-001, §10] It is merged on `homepad-api` main in #91 (closing #89) and ships in 17.1.0 as a security fix. The 17.1.0 release notes carry the PocketID steps (§2.6), and the 18.0.0 notes repeat them. Marked "shipped in 17.1.0" below; 17.1.0 was not yet tagged when this was recorded. Its ACs stay in this spec as regression guards.

**Decided — Q3, login attempt limits (Caleb, 2026-11-19: "yes").** [AC-004, AC-005] As proposed: per client, 10 a minute, burst 10. Per email: after 10 failed attempts in 15 minutes, that email gets 429 for 15 minutes, right password or not.

**Decided — Q4, the quickstart and trusted proxies (Caleb, 2026-11-19: "yes").** [AC-007, AC-008] Proxy headers are trusted only when `HOMEPAD_TRUSTED_PROXIES` is set. The quickstart leaves it unset. The docs explain the effect (every client shares one limit) and how to set it.

**Decided — fix three small bugs now (Caleb, 2026-11-19).** These were fixed ahead of 18.0.0 in homepad-api #99, which shipped in 17.1.0, separate from this spec's build. Their ACs stay here as regression guards:
- login timing shows whether an email exists (§2.3, AC-009);
- the OIDC callback cookie ignores `COOKIE_SECURE` (former Q5, AC-016);
- passwords over 72 bytes cause a 500 (AC-018).

**Decided — Q2, invite-only and SSO (Caleb, 2026-11-20): A.** [AC-010…AC-013] An existing account (matched by verified email) always signs in. A new identity gets an account only when its groups include `OIDC_ADMIN_GROUP` (admin) or the new `OIDC_MEMBER_GROUP` (member). Everyone else is refused.

---

## 1. Overview

Three gaps in how people sign in:

1. Nothing limits password guessing on `POST /api/login`, or account spam on `POST /api/register`.
2. Single sign-on trusted any email the provider sent. That is fixed on `homepad-api` main (#89) and needs docs, a clear error, and an upgrade note.
3. `invite_only` closes password sign-up, but any identity the provider signs in still gets an account.

### 1a. What exists today (checked in the code, `homepad-api` `gitea/main` at `79e3b03`, `homepad` `gitea/main` at `6eb8a35`)

- **No limit on login or register.** `handleLogin` and `handleRegister` (`internal/api/auth.go`) are registered `classPublic` with no wrapper (`server.go`). Only `POST /api/invites/lookup` and `/accept` are wrapped, with `rateLimited(s.inviteBucket, …)`.
- **The one bucket is per process.** `tokenBucket` (`internal/api/ratelimit.go`) is a single mutex-guarded bucket, `DefaultInviteLimit` 30 a minute, burst 10. Its comment: "per process, not per IP: behind the web container's nginx every request has the same peer."
- **The API never reads a client address.** No code in `internal/` reads `X-Forwarded-For`, `X-Real-IP` or `RemoteAddr` (searched, tests excluded). The quickstart's nginx (`deploy/compose/nginx.conf`, `location /api/`) does send `X-Real-IP $remote_addr` and `X-Forwarded-For $proxy_add_x_forwarded_for`.
- **Login leaks whether an email exists, by timing.** `handleLogin` runs bcrypt only when `UserByEmail` finds an adult. An unknown email answers at once; a known one takes a bcrypt compare.
- **`email_verified` is already enforced on `main`** (merged in #91, `0a8f362`, after `v17.0.0`; no tag contains it). `handleOIDCCallback` (`internal/api/oidc.go`) refuses with 403 "oidc email is not verified" unless the claim is `true`, before it looks up or creates any account. So it refuses existing linked accounts too. The claim comes from the ID token, with a userinfo fallback that counts only for the same address. `optionalBool` (`internal/oidc/oidc.go`) accepts `true` and `"true"`; absent stays unset (refused); anything else is false.
- **OIDC errors are plain text.** Every failure in `handleOIDCCallback` is `http.Error`, so the browser lands on a bare text page at `/api/auth/oidc/callback`.
- **OIDC creates accounts in every mode.** `resolveOIDCUser` links an existing adult by email, or calls `CreateOIDCUser` (`internal/storage/accounts.go`) with role `admin` when the groups include `OIDC_ADMIN_GROUP`, else `user`. It never reads `s.registration`. The only limit is `HOMEPAD_MAX_ACCOUNTS`. On an empty install the first SSO identity becomes a member when no admin group matches, leaving no admin (SPEC-household-basics §3.6).
- **Scopes requested:** `openid profile email groups` (`ConfigFromEnv`).
- **Callback cookie:** `s.startSession(w, r, u, false)`. The comment says it "has never honoured COOKIE_SECURE". Local login uses `s.cookieSecure`, which defaults to true (`ParseCookieSecure`, `internal/api/cookie.go`).
- **Registration modes:** `RegistrationFromEnv` (`internal/api/limits.go`) defaults to `invite_only` when unset. Unrecognized values fail closed.

### 1b. PocketID: what makes it send `email_verified: true`

Checked in the PocketID source at tag **v2.19.3** (latest release, 2026-11-15, commit `c0abd93`), github.com/pocket-id/pocket-id.

- **Since v2.2.0, `email_verified` is per user.** `backend/internal/oidc/claims_service.go` sets `claims["email_verified"] = user.EmailVerified` when the `email` scope is asked for and the user has an email. Up to v2.1.0 it was one global switch (`backend/internal/service/oidc_service.go` at v2.1.0: `EmailsVerified.IsTrue()` from the app config).
- **Existing users:** in the admin UI, **Settings → Users**, open the user, and use the toggle at the right of the **Email** field. Its tooltip reads **"Mark as verified"** (or "Mark as unverified" when it's on). Save. (`frontend/src/routes/settings/admin/users/user-form.svelte`; strings `mark_as_verified` / `mark_as_unverified` in `frontend/messages/en.json`.)
- **New users and changed emails:** **Settings → Application Configuration → Email** tab, switch **"Emails verified by default"**, described as "When enabled, users' email addresses will be marked as verified by default upon signup or when their email address is changed." It does not change existing users. It is greyed out when **Email Verification** is set to **Required**. (`app-config-email-form.svelte`; `emails_verified_by_default` in `en.json`.) The matching environment variable is `EMAILS_VERIFIED=true` (`backend/internal/appconfig/model.go`), which takes effect when `UI_CONFIG_DISABLED=true`. The env-var docs page (pocket-id.org/docs/configuration/environment-variables) lists `EMAILS_VERIFIED`; that page labels itself as docs for an unreleased version.
- **The other route:** set **Email Verification** to **Optional** or **Required** with SMTP configured, and users verify their own address by email.
- **PocketID v2.1.0 and older:** one switch, **"Emails Verified"** (application configuration), described as "Whether the user's email should be marked as verified for the OIDC clients." Turning it on marks every user verified. When upgrading PocketID to v2.2.0 or later, its migration (`20260109090200_email_verification.up.sql`) copies that switch into every existing user's flag.

So the setting Caleb remembered ("Emails Verified") is the pre-v2.2.0 name. On current PocketID it is **"Emails verified by default"** for new users, plus **"Mark as verified"** per existing user.

### 1c. Decisions

- Caleb, 2026-11-19: verified emails required; `X-Forwarded-For` untrusted unless configured.
- Caleb, 2026-11-19: the `email_verified` refusal ships in 17.1.0 as a security fix, with the PocketID steps in the 17.1.0 notes (Q1, "a").
- Caleb, 2026-11-19: login limits as proposed (Q3, "yes"); proxy headers trusted only when `HOMEPAD_TRUSTED_PROXIES` is set (Q4, "yes").
- Caleb, 2026-11-19: login timing, the callback cookie and the 72-byte 500 are fixed ahead of 18.0.0 in a homepad-api bug-fix PR (it became #99, shipped in 17.1.0).
- Caleb, 2026-11-20: Q2 A — under `invite_only`, a new SSO identity gets an account only through `OIDC_ADMIN_GROUP` or the new `OIDC_MEMBER_GROUP`; an existing account always signs in.

---

## 2. Model

### 2.1 Rate limits

One limiter, keyed by client, replaces the per-process bucket.

| Route | Per client | Per email or account | Process ceiling |
|---|---|---|---|
| `POST /api/login` | 10/min, burst 10 | 10 failures in 15 min → 15-min lock for that email (Q3, decided) | 120/min |
| `POST /api/register` | 5/min, burst 5 | — | 120/min |
| `POST /api/invites/lookup`, `/accept` | 30/min, burst 10 | — | 120/min (`/accept` only) |
| `POST /api/password-resets/lookup`, `/accept` | 30/min, burst 10 | — | 120/min (`/accept` only) |
| `POST /api/me/password` | — | 5 failures in 15 min → 15-min lock (SPEC-password-reset-link) | — |
| `GET /api/auth/oidc/login` | 20/min, burst 10 | — | — |

- The process ceiling bounds bcrypt work on the box whatever the client keys are. The bcrypt routes share it.
- Over a limit: `429`, `Retry-After` in whole seconds, body "too many attempts". The per-email lock answers 429 for that email whether or not the password is right, so it reveals nothing.
- Buckets live in memory, per process, in a map capped at 10,000 keys; idle keys are dropped after 15 minutes. A restart clears them. More than one API replica means each has its own limits, which the docs say.

### 2.2 Which address is "the client"

- **Default (decided):** the TCP peer of the request (`RemoteAddr`). `X-Forwarded-For` and `X-Real-IP` are ignored.
- **`HOMEPAD_TRUSTED_PROXIES`:** a comma-separated list of addresses, CIDR ranges or hostnames (resolved at startup and every 5 minutes). When the peer is in the list, the client is the right-most `X-Forwarded-For` entry that isn't. When the peer isn't in the list, the header is ignored.
- A value that doesn't parse stops the API at startup with a message naming it, like `HOMEPAD_MAX_ACCOUNTS`.
- **What this means for the quickstart (Q4, decided):** every API request comes from the web container, so every client has the same key. The per-client limits then act as one shared limit. Someone hammering the login form can make everyone wait. The per-email lock still protects each account. The docs say this plainly and show the setting.

### 2.3 Login timing (fixed ahead of 18.0.0 in homepad-api #99, shipped in 17.1.0)

When `UserByEmail` finds no adult, `handleLogin` compares the password against a fixed dummy bcrypt hash at `DefaultCost` before answering 401. Unknown and known emails then take about the same time. AC-009 stays as a regression guard.

### 2.4 Single sign-on: verified email (shipped in 17.1.0)

Shipped in 17.1.0 (#91, closing #89; Q1, decided): an SSO sign-in is refused unless `email_verified` is `true`. This spec adds:

- **A clear landing.** Every OIDC callback failure redirects to `/#signin-error=<code>` instead of a text page. Codes: `email_unverified`, `not_invited`, `account_limit`, `sso_failed` (everything else). The sign-in screen shows a message for each (§8).
- **The start route's limit lands there too** (UX S-5, decided 2026-11-20). Over its §2.1 limit, `GET /api/auth/oidc/login` redirects (302) to `/#signin-error=too_many` instead of answering 429 with a text body. The browser reaches that route by full-page navigation, so a 429 would show a bare text page.
- **Docs** (§2.6) and **upgrade notes** (§10).

### 2.5 Single sign-on under `invite_only` (Q2 = A)

| Mode | Existing adult, verified email | New identity in `OIDC_ADMIN_GROUP` | New identity in `OIDC_MEMBER_GROUP` | Any other new identity |
|---|---|---|---|---|
| `open` | signs in | created as admin | created as member | created as member |
| `invite_only` | signs in | created as admin | created as member | refused, `not_invited` |

- `OIDC_MEMBER_GROUP` is new and optional. Unset means no group shortcut for members.
- An empty install under `invite_only` gets its first account from SSO only through `OIDC_ADMIN_GROUP`, so it can never end up with only a member.
- `HOMEPAD_MAX_ACCOUNTS` still applies to every creation.
- A kid is never reached: `UserByEmail` never returns one.

### 2.6 Docs text (README "Single sign-on" and `docs/single-sign-on.md`)

Plain copy, ready to paste:

> **Single sign-on needs verified emails.** Homepad signs you in with single sign-on only when your identity provider says your email is verified. Without that, anyone who could change their email at the provider could sign in as someone else here.
>
> **PocketID 2.2 and newer**
>
> 1. For people who already have a PocketID account: open **Settings → Users** and open each person. Next to **Email**, turn on the toggle ("Mark as verified"). Save.
> 2. For people you add later: open **Settings → Application Configuration → Email** and turn on **Emails verified by default**. This does not change people who already exist.
> 3. Or set **Email Verification** to **Optional** or **Required**, and set up email in PocketID. Then people verify their own address.
>
> If you run PocketID with `UI_CONFIG_DISABLED=true`, set `EMAILS_VERIFIED=true` in its environment instead of step 2.
>
> **PocketID 2.1 and older:** turn on **Emails Verified** in Application Configuration. This marks every user's email as verified.
>
> **Other providers:** make sure the ID token or the userinfo answer has `"email_verified": true`. Homepad asks for the `openid profile email groups` scopes.
>
> **Who gets an account.** With `HOMEPAD_REGISTRATION=invite_only` (the default), single sign-on creates an account only for people in `OIDC_ADMIN_GROUP` (they become admins) or `OIDC_MEMBER_GROUP` (they become members). Anyone else needs an invite first. After they accept it, they can sign in with single sign-on if their email matches.
>
> **Sign-in limits.** Homepad limits how fast sign-in can be tried. If another proxy sits in front of Homepad, set `HOMEPAD_TRUSTED_PROXIES` to its address so Homepad can tell people apart. Without it, everyone shares one limit.

---

## 3. Security notes

| Threat | Closed by |
|---|---|
| Password guessing on one account | Per-email lock (AC-005) |
| Password guessing across many accounts from one client | Per-client bucket (AC-004) |
| Burning CPU with bcrypt | Process ceiling (AC-006) |
| Learning which emails have accounts, by timing | Dummy compare (AC-009) |
| Spoofing `X-Forwarded-For` to dodge limits | Header ignored unless the peer is a trusted proxy (AC-007) |
| Signing in as a local account by setting its email at the provider | `email_verified` required (AC-001, shipped in 17.1.0) |
| A stranger with an account at the provider gets a Homepad account under `invite_only` | Group allow-list (AC-010) |
| SSO session cookie sent over plain HTTP | Callback follows `COOKIE_SECURE` (AC-016; fixed ahead of 18.0.0) |

- **Lockout as a weapon.** With the decided limits (Q3), anyone who knows an email can keep that account locked by failing on purpose. The lock is 15 minutes and touches only password sign-in for that email. SSO and existing sessions keep working. This trade is accepted for a household app; the docs mention it.
- **Logging.** `ratelimit: <route> limited client=<addr>` and `ratelimit: login locked for an email` at most once a minute per key. The email itself is never logged. `oidc: refused new identity under invite_only (not in an allowed group)`. `oidc: refused sign-in: email_verified is not true` (exists).

---

## 4. Acceptance Criteria

### Verified email (refusal shipped in 17.1.0; AC-001 is a regression guard, the landing and docs are new)

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | An SSO sign-in whose `email_verified` is absent, `false`, or anything but `true`/`"true"` creates no account, links no account and starts no session, for new and existing accounts alike. (Shipped in 17.1.0, covered by `oidc_test.go`; kept as a regression guard.) | Must |
| AC-002 | Every OIDC callback failure redirects (302) to `/#signin-error=<code>` with one of the §2.4 codes. No failure renders a text page. | Must |
| AC-003 | The sign-in screen reads `#signin-error=`, removes it from the address bar, and shows the §8 message for that code. | Must |

### Rate limits

| ID | Criterion | Priority |
|---|---|---|
| AC-004 | Each route in §2.1 enforces its per-client limit. Over it: 429 with a `Retry-After` of at least 1. Under it, behavior is unchanged. | Must |
| AC-005 | After 10 failed logins for one email in 15 minutes, that email gets 429 for 15 minutes, even with the right password (Q3, decided). Other emails are unaffected. A success before the tenth failure clears that email's count. | Must |
| AC-006 | The bcrypt routes share a process-wide ceiling of 120 a minute. | Must |
| AC-007 | With `HOMEPAD_TRUSTED_PROXIES` unset, a request with a forged `X-Forwarded-For` is keyed by its peer address. | Must |
| AC-008 | With `HOMEPAD_TRUSTED_PROXIES` set and the peer in it, the client is the right-most untrusted `X-Forwarded-For` entry. With the peer not in it, the header is ignored. An unparsable value stops the API at startup with a message naming the variable. | Must |
| AC-009 | Login for an unknown email runs one bcrypt compare. In a test, the median time for unknown and known-wrong-password emails differs by under 20%. Fixed in homepad-api #99 (shipped in 17.1.0); kept as a regression guard. | Should |

### invite-only and SSO

| ID | Criterion | Priority |
|---|---|---|
| AC-010 | Under `invite_only`, a new SSO identity is created only when its groups include `OIDC_ADMIN_GROUP` (admin) or `OIDC_MEMBER_GROUP` (member). Otherwise: no account, redirect with `not_invited`. | Must |
| AC-011 | Under `invite_only`, an SSO identity whose verified email matches an existing adult signs in, whatever its groups. | Must |
| AC-012 | Under `open`, SSO creation is unchanged from 17.1.0. | Must |
| AC-013 | `OIDC_MEMBER_GROUP` joins the env-config allowlist and shows in Admin Panel → System. | Must |

### Docs and config

| ID | Criterion | Priority |
|---|---|---|
| AC-014 | The README "Single sign-on" section and `docs/single-sign-on.md` carry the §2.6 text. `.env.example` lists `OIDC_MEMBER_GROUP` and `HOMEPAD_TRUSTED_PROXIES` with one-line comments. | Must |
| AC-015 | The CHANGELOG lists exactly what breaks (§10) and links the PocketID steps. | Must |
| AC-016 | The OIDC callback sets the session cookie's `Secure` from `COOKIE_SECURE`, like local login. Fixed in homepad-api #99 (shipped in 17.1.0); kept as a regression guard. | Should |
| AC-017 | `HOMEPAD_TRUSTED_PROXIES` joins the env-config allowlist. | Must |
| AC-018 | `POST /api/register` and `POST /api/invites/accept` refuse a password over 72 bytes with 400, never 500. Fixed in homepad-api #99 (shipped in 17.1.0); kept as a regression guard. (SPEC-password-reset-link AC-017 asks for the same.) | Should |

### Web (from the UX artifact, approved 2026-11-20)

| ID | Criterion | Priority |
|---|---|---|
| AC-019 | Over its limit, `GET /api/auth/oidc/login` redirects (302) to `/#signin-error=too_many`. The sign-in screen shows "Too many tries. Wait a minute and try again." (UX S-5.) | Must |
| AC-020 | This spec's web change adds at most about 400 bytes gzip to the entry JS chunk. It is measured with `npm run build` and `tests/infra/bundle-budget.test.ts` before merge, and the PR records the before and after. Over that, the SSO code→message map moves to a lazy module loaded only when a `#signin-error=` code is present (UX S-1). | Must |
| AC-021 | With `oidcEnabled`, the Add-an-adult dialog's PocketID line follows the registration mode. `open`: "They can also sign in with PocketID. No invite needed." `invite_only`: "PocketID only makes accounts for people in your admin or member group. Anyone else needs this invite. After they join, they can use PocketID too if it has the same email." The old line ("They use PocketID? …") is gone (UX S-4). | Must |

---

## 5. User Test Cases

**TC-001 — Guessing a password.** Try a wrong password for `jo@example.com` 10 times, then the right one. *Expected:* the 11th try says "Too many tries. Wait 15 minutes and try again." Caleb can still sign in at once.

**TC-002 — Forged header.** With `HOMEPAD_TRUSTED_PROXIES` unset, send 11 logins in a minute, each with a different `X-Forwarded-For`. *Expected:* the 11th is 429.

**TC-003 — Behind a proxy.** Set `HOMEPAD_TRUSTED_PROXIES` to the proxy's address. Two laptops each try 10 wrong logins for different emails. *Expected:* neither blocks the other.

**TC-004 — PocketID user not verified.** In PocketID, turn off "Mark as verified" for Jo. Jo taps the single sign-on button. *Expected:* back on Homepad's sign-in screen: "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified." No session.

**TC-005 — Fix it.** Turn the toggle back on. Jo tries again. *Expected:* signed in.

**TC-006 — Stranger under invite-only.** `invite_only`, `OIDC_MEMBER_GROUP=homepad`. Pat has a PocketID account, verified, not in `homepad`. *Expected:* "You don't have a Homepad account yet. Ask your admin for an invite." No account in Accounts. Add Pat to `homepad` in PocketID and try again: signed in as a member.

**TC-007 — Existing user under invite-only.** Jo has a password account; Jo signs in with PocketID, same verified email, in no group. *Expected:* signed in as Jo.

---

## 6. Data Model

No migration. Limits are in memory.

## 7. API Contract

### Changed

| Route | Change |
|---|---|
| `POST /api/login` | Per-client and per-email limits (AC-004, AC-005); dummy compare (AC-009). |
| `POST /api/register` | Per-client limit. |
| `POST /api/invites/lookup`, `/accept`, `POST /api/password-resets/lookup`, `/accept` | Per-client limit, replacing the single bucket. The two `/accept` routes also share the ceiling; the lookups run no bcrypt and skip it (homepad-api #110). |
| `GET /api/auth/oidc/login` | Per-client limit. Over it: 302 to `/#signin-error=too_many` (AC-019). |
| `GET /api/auth/oidc/callback` | Failures redirect to `/#signin-error=<code>` (AC-002). `invite_only` rule (AC-010). Cookie `Secure` from `COOKIE_SECURE` (AC-016). |
| `GET /api/admin/env-config` | Allowlist gains `OIDC_MEMBER_GROUP`, `HOMEPAD_TRUSTED_PROXIES`. |

### New settings

| Variable | Meaning | Default |
|---|---|---|
| `HOMEPAD_TRUSTED_PROXIES` | Addresses, CIDRs or hostnames whose `X-Forwarded-For` is believed | unset (trust none) |
| `OIDC_MEMBER_GROUP` | Under `invite_only`, members of this group get a member account on first SSO sign-in | unset |

## 8. Frontend Implementation

- `src/app/App.tsx` reads `#signin-error=` with the `#invite=`/`#reset=` reader, clears it with `history.replaceState`, and passes the code to `src/app/AuthForm.tsx` (its own file since #565). `AuthForm` shows one line above the form. It shows 429 answers from login, register and set-up with the wait time from `Retry-After` (`Result` gains `retryAfter`). `JoinScreen` and `ResetPasswordScreen` use the same wait formatter.
- `src/accounts/AddAdultDialog.tsx`: the PocketID line by registration mode (AC-021, UX §5).
- `src/library/SettingsPanel.tsx`: labels for `OIDC_MEMBER_GROUP` and `HOMEPAD_TRUSTED_PROXIES` (the second under Server, with a help line when empty; UX §4).
- Entry-chunk budget: AC-020.
- **The final copy is in the UX artifact (§2, §3, §5) and supersedes the drafts below.** Drafts (plain; UX may adjust):
  - `email_unverified`: "Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified."
  - `not_invited`: "You don't have a Homepad account yet. Ask your admin for an invite."
  - `account_limit`: "This Homepad has reached its account limit."
  - `sso_failed`: "Single sign-on didn't work. Try again."
  - `too_many`: "Too many tries. Wait a minute and try again." (AC-019)
  - 429: "Too many tries. Wait N minutes and try again." (seconds under a minute: "Wait a minute and try again.")
- README, `.env.example`, `docs/single-sign-on.md` (new), `docs/development.md` sequence diagram (the callback's new branches).

## 9. Design (Kare)

UX artifact: [`specs/ux/signin-hardening-ux.md`](./ux/signin-hardening-ux.md) (APPROVED 2026-11-20, S-1…S-6 at the recommendations). Main surface: the sign-in screen's error line and wait state, in light and dark, at 390 and 1440. It also covers the System rows and the Add-an-adult PocketID line.

## 10. Upgrade and Compatibility — what breaks

Exactly these, and nothing else:

1. **SSO sign-in stops for anyone whose provider doesn't send `email_verified: true`**, including people who already have a Homepad account. They see the `email_unverified` message. Fix: §2.6. Shipped in 17.1.0 (Q1, decided); the 18.0.0 notes repeat it for anyone who skipped 17.1.0.
2. **Under `invite_only`, SSO no longer creates accounts for new people outside `OIDC_ADMIN_GROUP` and `OIDC_MEMBER_GROUP`.** This includes installs with no `HOMEPAD_REGISTRATION` set, which are `invite_only` since 17.1.0. People who already have an account are not affected. Fix: set `OIDC_MEMBER_GROUP`, or send an invite.
3. **Fast repeated sign-in attempts get "Too many tries".** Scripts that log in in a loop need to slow down. With no trusted proxy set, the limit is shared by everyone.
4. **With `COOKIE_SECURE` on (the default) and Homepad served over plain HTTP, SSO sign-in stops working**, the same way password sign-in already does there. Fix: `COOKIE_SECURE=false` on plain-HTTP installs, which password sign-in already needs. This landed in homepad-api #99, in 17.1.0.

Not affected: existing sessions (nobody is signed out), password sign-in under the limits, invites, kids.

Release-note lines:

- "Single sign-on now needs a verified email. In PocketID, open Settings → Users and turn on 'Mark as verified' for each person, and turn on 'Emails verified by default' for new people. Details: docs/single-sign-on.md." (In the 17.1.0 notes, Q1; repeated in 18.0.0.)
- "With invite-only sign-up, single sign-on only creates accounts for people in your admin group, or in the new `OIDC_MEMBER_GROUP`. Others need an invite."
- "Sign-in now has a speed limit. If a proxy sits in front of Homepad, set `HOMEPAD_TRUSTED_PROXIES` to its address."

## 11. Out of Scope

- A setting to accept unverified emails.
- Carrying an invite through single sign-on (Q2 option C).
- Shared limits across several API replicas (Redis or Postgres-backed).
- CAPTCHA, two-factor, or alerts on failed sign-ins.
- `X-Real-IP` and the `Forwarded` header.
- Signing out SSO users when the provider removes them.

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Approved 2026-11-20: all §0 questions decided |
| Product | Walt | Pending |
| Design | Kare | Approved 2026-11-20 (`specs/ux/signin-hardening-ux.md`, S-1…S-6) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-19 | 0.1.0 | Draft for 18.0.0, checked against `homepad-api` `79e3b03`, `homepad` `6eb8a35`, and PocketID v2.19.3 (`c0abd93`). |
| 2026-11-19 | 0.1.1 | Caleb decided Q1 ("a": ships in 17.1.0), Q3 and Q4 ("yes"), and to fix login timing, the callback cookie and the 72-byte 500 ahead of 18.0.0 in a homepad-api bug-fix PR. |
| 2026-11-20 | 0.1.2 | UX artifact approved (S-1…S-6). AC-019: the OIDC start route's limit redirects with `too_many` (S-5). AC-020: the entry-chunk measure-before-merge rule (S-1). AC-021: `AddAdultDialog.tsx` joins the file list with the two-mode PocketID line (S-4). `AuthForm` path corrected. |
| 2026-11-22 | 0.1.3 | §2.1: the invite and reset-link lookups skip the process ceiling (they run no bcrypt); only the `/accept` routes, login and register share it (homepad-api #110, from the #109 review). |
| 2026-11-22 | 0.1.4 | Marked SHIPPED (18.0.0). §1c records Q2 in place of the stale "Pending" line (#593). The bug-fix PR is named: homepad-api #99, shipped in 17.1.0. |
