# Spec: Admins edit server settings in the UI

**Spec ID:** SPEC-admin-server-settings
**Version:** 0.2.1
**Created:** 2026-11-23
**Author:** Claude (spec step for Caleb's request of 2026-11-23)
**Status:** Approved — Caleb 2026-11-23 ("looks great. kick it off"): Q1 A, Q2 A, Q3 A; UX A-1…A-6 as recommended. Ready for build.
**Repo:** `Code/homepad` — `api/` (migration, settings store, live config, routes, OIDC test sign-in) and the web app (Admin Panel → System, docs)
**Estimate:** ~3.5 days (table and store, live config holder, guards, OIDC test sign-in, recovery flag, the shared row in the web app, docs, tests)
**Depends on:** SPEC-v26-admin-env-config (the allowlist this spec keeps), SPEC-status-degraded-threshold (the precedence model this spec copies), SPEC-signin-hardening (trusted proxies, `OIDC_MEMBER_GROUP`), SPEC-status-widgets (the server key and the guarded outbound client), SPEC-backup-import (what a backup may hold)
**Target version:** 18.1.0
**Supersedes, once shipped:** SPEC-v26-admin-env-config (the read-only Environment Configuration list)
**UX:** [`specs/ux/admin-server-settings-ux.md`](./ux/admin-server-settings-ux.md) (Draft, A-1…A-6)
**Issues folded in:** SPEC-status-degraded-threshold OQ-1 (no way back to "unset"); related: #599 (the member role is `user` in the API)

---

## 0. Decisions

**Q1–Q3 decided (Caleb, 2026-11-23): A, A, A** — the recommended option each time.

**Decided (Caleb, 2026-11-23):**
- "All of these settings need to be able to be set in the UI by admins." The list is the 14 rows of Admin Panel → System → Environment Configuration.
- "They should not be changed via DB commands. They should be stored in DB." Admins change them in the UI. Nobody needs SQL.
- "All settings should be shared in same styling except unique exclusions." One row pattern; the exclusions are in §2.3.
- Precedence: a value saved in the UI wins, then the env var, then the built-in default. Env stays the starting value, so existing installs keep working with no step. This is the model the "Slow" threshold already uses (migration 0014).

**Q1 — The OIDC client secret at rest.** [AC-013, AC-014] Today it lives only in the pod's env. Saved in the UI, it sits in Postgres. Anyone with a database dump or a DB backup then has it, and with it they can act as Homepad at the identity provider.
- (A) Seal it with `HOMEPAD_SECRET_KEY`, the AES-256-GCM key widget API keys already use. With no server key, the UI can't save a secret; the row says why. The env secret still works.
- (B) Store it as plain text, and say so in the docs.
- (C) Keep the secret env-only. Every other OIDC setting is editable.
- **Recommended: A.** It reuses code that is already reviewed and shipped. A DB dump alone no longer gives up the secret. The cost: installs without `HOMEPAD_SECRET_KEY` must add it first, as they already do for widget keys.

**Q2 — Changing single sign-on when no admin has a password.** [AC-021…AC-024] A wrong issuer, client ID or secret breaks single sign-on. If every admin signs in only with single sign-on, nobody can get back in. Those accounts can't get a reset link or use `reset-link` either (SPEC-password-reset-link Q4).
- (A) Before an OIDC change applies, the admin must pass a **test sign-in** with the new values. The change is allowed if an admin has a local password, or if the acting admin just passed the test.
- (B) Allow OIDC changes only while some admin has a local password. SSO-only households can't edit sign-in in the UI.
- (C) Allow any change, with a warning. Rely on the recovery flag (§2.6).
- **Recommended: A.** B blocks the households most likely to use single sign-on. C makes a typo cost a restart. A is about half a day more than B.

**Q3 — The read-only env-config route.** [AC-036] `GET /api/admin/env-config` returns raw env values. After this spec, they may not be what the server uses.
- (A) Keep the route as it is until 19.0.0, mark it deprecated in the docs, and stop calling it from the web app.
- (B) Remove it in 18.1.0.
- **Recommended: A.** It costs nothing to keep. Removing a route is a breaking change, and someone may have scripted it.

---

## 1. Overview

Server settings come from env vars. To change one, an admin edits the deployment and restarts. This spec makes 13 of the 14 listed settings editable in Admin Panel → System. The values are stored in Postgres. Most apply at once, with no restart.

### 1a. What exists today (checked in the code, `homepad` `gitea/main` at `ec170e3`)

- **The read-only list.** `GET /api/admin/env-config` (`api/internal/api/env_config.go`) returns `{key, value}` for a fixed allowlist of 14 keys, read with `os.Getenv`. `DATABASE_URL` and `OIDC_CLIENT_SECRET` are not on it. The web app shows them in `SystemSettings` (`src/library/SettingsPanel.tsx`) with an `env` badge, grouped as Server and Identity (OIDC).
- **The one setting that already works this way.** `system_settings.status_degraded_ms` (migration 0014) is nullable. NULL means "use `GATUS_DEGRADED_MS`, else 1000". `PATCH /api/admin/settings` writes it and calls `poller.SetDegradedAfter`, so it applies live. There is no way back to NULL from the UI (SPEC-status-degraded-threshold OQ-1). Backups carry it as `statusDegradedMs`.
- **Every other key is read once at boot** (`api/cmd/homepad-api/main.go`, `api/internal/api/server.go`):

| Key | Read in | Held as | Live today? |
|---|---|---|---|
| `GATUS_BASE_URL` | `main.go` → `gatus.NewClient` | `Client.BaseURL`, a plain field | No |
| `GATUS_DEGRADED_MS` | `main.go`, then the saved value wins | `Client.DegradedAfter`, has a setter | Yes (UI value) |
| `COOKIE_SECURE` | `newServer` → `ParseCookieSecure` | `server.cookieSecure` | No |
| `HOMEPAD_REGISTRATION` | `main.go` → `RegistrationFromEnv` | `server.registration` | No |
| `HOMEPAD_MAX_ACCOUNTS` | `main.go` → `ParseMaxAccounts`; junk stops the API | `server.maxAccounts` | No |
| `HOMEPAD_TRUSTED_PROXIES` | `main.go` → `ParseTrustedProxies`; junk stops the API | `server.trusted`, plus a refresh goroutine for hostnames | No |
| `PORT` | `main.go` → `http.Server.Addr` | the listener | No (can't be) |
| `OIDC_*` (8 keys, secret included) | `oidc.ConfigFromEnv()` | `server.oidc`; the `Provider` caches discovery and keys forever | No |

- **OIDC routes exist only if enabled at boot.** `routes()` registers `GET /api/auth/oidc/login` and `/callback` only when `d.OIDC.Enabled`. Turning SSO on live needs them always registered.
- **A sealer already exists.** `widgets.Sealer` (`api/internal/widgets/secrets.go`) seals widget keys with AES-256-GCM under `HOMEPAD_SECRET_KEY`. A nil sealer means "no server key", and the widget API refuses to store a key. `HOMEPAD_SECRET_KEY` is not on the env-config allowlist.
- **A guarded outbound client exists.** `widgets.Client` refuses link-local and metadata addresses, follows no redirects, and caps time and size. The Gatus client (`&http.Client{}`, no timeout) and the OIDC provider (10 s timeout) don't use it.
- **Audit is log lines.** For example `accounts: admin <id> changed role of <id> from user to admin` (`api/internal/api/adults.go`). There is no audit table.
- **Backups never hold config.** SPEC-backup-import AC-004: no OIDC config, env config or Gatus base URL. `TransferTx.SetSettings` writes only `show_uptime_display` and `status_degraded_ms`.
- **Invites ignore the registration mode.** `POST /api/invites/accept` works in every mode. The first account registers and becomes admin in every mode (`handleRegister`).
- **Trusted proxies take more than CIDRs.** `ParseTrustedProxies` accepts addresses, CIDR ranges and hostnames.
- **Production gap.** `OIDC_MEMBER_GROUP` is unset in production, so under `invite_only` single sign-on makes no member accounts. This spec lets an admin set it in the UI (TC-007).

### 1b. Decisions in this draft (not for Caleb unless he disagrees)

- **Storage: a new key/value table, `server_settings`** (§3). Reasons in §3.1.
- **Recovery: an env flag, `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true`** (§2.6). Not a CLI.
- **Backups don't carry server settings** (§2.8), except `statusDegradedMs`, which they already carry.
- **Server-side confirm.** Risky changes need `confirm` in the request. A script can't skip the warning by skipping the UI.

---

## 2. Model

### 2.1 Where a value comes from

For each key, the server uses the first of these that exists:

1. **UI** — a row in `server_settings` (or, for `GATUS_DEGRADED_MS`, a non-NULL `system_settings.status_degraded_ms`).
2. **env** — the env var, set and not blank.
3. **default** — the built-in default in §2.2.

A saved empty string is a real UI value, not "unset". For example, a UI value of "" for `GATUS_BASE_URL` turns status off even when the env var is set. **Reset** deletes the UI value, so env or the default applies again.

With `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true`, step 1 is skipped for every key (§2.6).

### 2.2 The settings

| Key | Group | Label | Type and rule | Default | Applies |
|---|---|---|---|---|---|
| `COOKIE_SECURE` | Server | Secure cookies | boolean | `true` | Live, on the next cookie set |
| `HOMEPAD_TRUSTED_PROXIES` | Server | Trusted proxies | comma list of addresses, CIDR ranges and hostnames; parsed by `ParseTrustedProxies`; at most 64 entries; `0.0.0.0/0` and `::/0` refused | empty (trust none) | Live |
| `PORT` | Server | Server port | read-only | `8080` | After restart (§2.3) |
| `GATUS_BASE_URL` | Status | Gatus address | empty, or an `http`/`https` URL with no query or fragment; trailing `/` trimmed | empty (status off) | Live, from the next poll |
| `GATUS_DEGRADED_MS` | Status | "Slow" threshold | whole number, 0–600000 ms; 0 turns "Slow" off | `1000` | Live (already) |
| `HOMEPAD_REGISTRATION` | Accounts | Sign-up | `open` or `invite_only` | `invite_only` | Live |
| `HOMEPAD_MAX_ACCOUNTS` | Accounts | Account limit | whole number, 0–10000; 0 is no limit | `0` | Live |
| `OIDC_ENABLED` | Sign-in | Single sign-on | boolean | `false` | Live |
| `OIDC_ISSUER` | Sign-in | Issuer | `https` URL (or `http`, with a warning); trailing `/` trimmed | empty | Live |
| `OIDC_DISCOVERY_URL` | Sign-in | Discovery URL | empty (derived from the issuer), or an `http`/`https` URL | empty | Live |
| `OIDC_REDIRECT_URL` | Sign-in | Redirect URL | absolute URL whose path ends in `/api/auth/oidc/callback` | empty | Live |
| `OIDC_CLIENT_ID` | Sign-in | Client ID | 1–255 characters, no spaces | empty | Live |
| `OIDC_CLIENT_SECRET` | Sign-in | Client secret | write-only, 1–1024 characters (§2.4) | empty | Live |
| `OIDC_ADMIN_GROUP` | Sign-in | Admin group | 0–255 characters, trimmed | empty | Live |
| `OIDC_MEMBER_GROUP` | Sign-in | Member group | 0–255 characters, trimmed | empty | Live |

"Live" means the next request or poll after the save uses the new value, on the process that saved it. Homepad runs one API process. If more ever run, each reloads `server_settings` every 25 seconds, so a change reaches them within 30 (AC-030).

**How each one goes live** (the build notes for §1a's "No" column):

- `COOKIE_SECURE`, `HOMEPAD_REGISTRATION`, `HOMEPAD_MAX_ACCOUNTS`: handlers read them from one live config holder (`atomic.Pointer` to an immutable snapshot), not from `server` fields. Cookies already set keep their old flag until the server sets them again. The backup plan (`transfer/plan.go`) reads the account limit from the same holder.
- `HOMEPAD_TRUSTED_PROXIES`: parse and resolve the new list first, then swap the pointer. Stop the old refresh goroutine and start one for the new list.
- `GATUS_BASE_URL`: a locked setter on the Gatus client, like `SetDegradedAfter`. Saving triggers one `PollNow`.
- `OIDC_*`: the login and callback routes are always registered. When single sign-on is off they answer 404, as today. A change builds a new `Provider`, so cached discovery and keys are dropped. A login started before the change fails on callback with `sso_failed`. The person tries again.
- `/api/auth/config` reads `oidcEnabled` and `registration` from the holder, so the sign-in screen follows on its next load.

### 2.3 Exclusions — what doesn't follow the pattern

Every row uses the one shared row (UX §2): label, value, source badge, Edit, Reset. These differ, and why:

| Key | How it differs | Why |
|---|---|---|
| `PORT` | Read-only row. Badge `env` or `default`. No Edit, no Reset. A line says "Set on the server. Applies after restart." | The process is already listening on it. It can't rebind while running, and the web container's proxy points at it. |
| `DATABASE_URL` | Never shown, not even as "set". | It holds the database password. It is also how the server finds the settings, so it can't live in them. |
| `OIDC_CLIENT_SECRET` | Write-only row. Shows "Set" or "Not set", never the value. Edit is "Replace". Reset is "Remove saved secret". | It is a credential (§2.4). |
| `HOMEPAD_SECRET_KEY` | Never shown, never editable. The secret row names it only to say why it can't save (Q1 A). | It seals the client secret. Stored in the same database, it would protect nothing. |
| `HOMEPAD_SETTINGS_FROM_ENV_ONLY` | Not a row. When on, a banner shows over the section and every row is read-only. | It is the way out when the UI is wrong (§2.6), so the UI can't turn it off. |
| The Sign-in group | Same rows, but one Save for the whole group ("Review and save"), not one per row. | The OIDC values only work together. Saving the issuer alone, then the client ID, would leave a broken state in between. |
| Show uptime display | Same row, no source badge, no Reset. | It has no env var. It lives in `system_settings` as before. It joins the Status group so all System rows look alike. |

### 2.4 The client secret

- **Never returned.** No route returns it: not GET, not PATCH, not an error message. GET gives `isSet`, `source` and `envIsSet` only.
- **Never logged.** The audit line says `(set)`, `(replaced)` or `(removed)`.
- **Sealed at rest (Q1 A).** Sealed with the server key, with additional data `server_settings:OIDC_CLIENT_SECRET`. With no server key, PATCH of the secret answers 409 `no_secret_key` and the row says "To save the secret here, add `HOMEPAD_SECRET_KEY` on the server. The env secret still works."
- **Can't be opened** (the server key changed): the row shows "Saved secret can't be read. Replace it." The server uses the env secret if there is one, and logs one warning at boot. The same as a widget's `secret_unreadable`.
- **Replacing the client ID keeps the secret.** The UI says "Replace the secret too if the provider gave you a new one."

### 2.5 Guards

Each guard runs on the server. When a guard needs a confirm, the server answers 409 `{"error":"confirm_required","warnings":[…]}`. The UI shows the warning and resends with `confirm` listing those warning codes. Reset runs the same guards as saving the value it would leave in place.

**Single sign-on (Q2 A).**
- **Discovery before save.** When the change leaves single sign-on on, the server fetches the discovery document with the guarded client. It must answer 200 within 5 s and have `authorization_endpoint`, `token_endpoint` and `jwks_uri`. Its `issuer` must equal the issuer (trailing `/` ignored). Otherwise 422 `{"error":"discovery_failed","message":…}`, and nothing is saved.
- **Never zero ways in.** After the change, some admin must still be able to sign in. A change that turns single sign-on off, or changes any OIDC value while it stays on, is allowed only when either:
  - (a) an admin has a local password, or
  - (b) the acting admin passed a test sign-in (below) with exactly these values in the last 10 minutes.
  - Otherwise 409 `would_lock_out`.
- **Test sign-in.** `POST /api/admin/server-settings/oidc/test` takes the staged Sign-in values. It answers with an authorize URL. The web app opens it in a new tab. The callback sees that the state belongs to a test, uses the staged values, and doesn't start a session. It passes when the verified email belongs to the acting admin, or the groups include the staged admin group. The result is a token bound to the admin and a hash of the staged values. PATCH sends it as `oidcTest`. The staged redirect URL must already be registered at the provider; the UI says so.
- **Sessions survive.** No OIDC change signs anyone out.
- **Turning it on** needs an effective issuer, client ID, secret and redirect URL. Missing ones: 400 naming them.

**Trusted proxies.**
- Parsed with `ParseTrustedProxies`. A bad entry: 400 naming it.
- `0.0.0.0/0` and `::/0` are refused: trusting everyone lets anyone choose their own address, which turns the sign-in limits off.
- Always confirm (`trusted_proxies`). The warning shows "Homepad sees you as `<address>` now. With this list, it would see `<address>`." A wrong list makes every client share one sign-in limit, or lets clients fake their address.
- A hostname that doesn't resolve on save is a warning, not an error. It is retried as today.

**Secure cookies.**
- Turning it **on** needs confirm (`cookie_secure_on`): "On plain `http://`, nobody can sign in after this. People already signed in stay signed in until their cookie runs out or they sign out." When the admin's page is `http://`, the dialog leads with that.
- Turning it **off** needs confirm (`cookie_secure_off`): "Only do this on plain `http://`. On `https://` it makes sign-in cookies less safe."

**Account limit lower than today's count.**
- Allowed, with confirm (`max_accounts_below_count`). The warning gives the numbers: "There are 7 accounts and 2 pending invites. Nobody is removed. New accounts and invites are refused until there are fewer than 5." Kids count, as today.

**Sign-up.**
- To `open`: confirm (`registration_open`), with the warning Accounts already shows about kids.
- To `invite_only`: no confirm. Invites still work, the first account on an empty install still registers as admin, and single sign-on follows the group rule. AC-020 guards all three.

**Gatus address.**
- Saving runs one fetch of `<url>/api/v1/endpoints/statuses` with the guarded client. A failure is a warning in the response, not an error: Gatus may just be down.

### 2.6 Recovery: `HOMEPAD_SETTINGS_FROM_ENV_ONLY`

If a saved value breaks sign-in, the admin can't reach the UI to fix it. The way out:

1. Set `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true` on the API and restart it.
2. The server ignores every UI value. Env, then defaults, apply. The saved values stay in the database, unchanged.
3. Sign in. Admin Panel → System shows a banner: "Server settings come from the environment only. Saved values are ignored." Rows show the env or default value, with that badge. Edit is off. **Reset still works**, so the admin can clear the bad value.
4. Remove the flag and restart. The remaining saved values apply again.

**Why a flag and not a CLI:** it needs no shell in the container, works the same in Docker and Kubernetes, and changes no data. The `reset-link` CLI needs an exec into the pod, which not every host gives. Only `true`/`1`/`yes`/`on` turn it on. Any other value is off, with a boot warning.

### 2.7 Audit

- One log line per changed key, after the write commits:
  `settings: admin <user id> changed OIDC_ISSUER from "https://old.example.com" to "https://id.example.com"`
  `settings: admin <user id> reset HOMEPAD_MAX_ACCOUNTS (was "5"; now env "10")`
  `settings: admin <user id> changed OIDC_CLIENT_SECRET (replaced)`
- Refusals log too: `settings: admin <user id> refused OIDC_ENABLED: would_lock_out`.
- `server_settings.updated_by` and `updated_at` keep the last change per key. The row shows "Saved by <name>, <date>".
- No secret value appears in any log line, response or error (AC-028).

### 2.8 Backup and restore

- Server settings are **not** in a backup, and a restore never writes `server_settings`. This keeps SPEC-backup-import AC-004 true: no OIDC config, env config or Gatus address in the file. A backup is often moved to another machine, where the old proxy list or redirect URL would be wrong.
- `statusDegradedMs` stays in the backup, as today. It is a household setting more than a server one.
- The client secret can never be in a backup (AC-029).

---

## 3. Data Model

### 3.1 Why a key/value table, not more columns on `system_settings`

- **"Not set" is natural.** No row means "not set in the UI". Reset is `DELETE`. Thirteen nullable columns would need a NULL convention per column.
- **Backups stay safe by structure.** `system_settings` is what backup and restore read and write. A separate table can't reach a backup by accident.
- **Audit per key.** Each row has its own `updated_by` and `updated_at`.
- **The allowlist stays in one place.** The table's `CHECK` lists the keys; so does the Go allowlist. A test keeps them equal (AC-002).
- The cost: values are text, so typing is in Go. Every value is validated on write, and again on boot (§3.3).

`GATUS_DEGRADED_MS` stays in `system_settings.status_degraded_ms`. Backups and the public `GET /api/system/config` already read it there. Reset sets it to NULL, which closes SPEC-status-degraded-threshold OQ-1. Migration `0025_status_degraded_meta` adds `status_degraded_updated_by` and `status_degraded_updated_at` beside it, so it records who saved it and when, like a `server_settings` row (AC-007). A value saved before 0025 keeps working; its time is taken from the row's `updated_at` and its saver stays unknown (`updatedBy: null`).

### 3.2 Migration `0024_server_settings`

```sql
-- 0024_server_settings.up.sql — SPEC-admin-server-settings §3.
-- One row per server setting saved in the UI. No row = not set in the UI:
-- the env var, then the built-in default, applies. Idempotent.
CREATE TABLE IF NOT EXISTS server_settings (
    key         TEXT PRIMARY KEY CHECK (key IN (
                  'COOKIE_SECURE', 'HOMEPAD_TRUSTED_PROXIES',
                  'GATUS_BASE_URL',
                  'HOMEPAD_REGISTRATION', 'HOMEPAD_MAX_ACCOUNTS',
                  'OIDC_ENABLED', 'OIDC_ISSUER', 'OIDC_DISCOVERY_URL',
                  'OIDC_REDIRECT_URL', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET',
                  'OIDC_ADMIN_GROUP', 'OIDC_MEMBER_GROUP')),
    value       TEXT,           -- NULL only for OIDC_CLIENT_SECRET
    sealed      BYTEA,          -- OIDC_CLIENT_SECRET only (Q1 A)
    nonce       BYTEA,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((key = 'OIDC_CLIENT_SECRET') = (sealed IS NOT NULL AND value IS NULL))
);
```

Down: `DROP TABLE IF EXISTS server_settings;`. `PORT` is not in the table: it can't be saved.

No data is moved. A fresh install and an upgraded one both start with an empty table, so every key keeps its env or default value.

### 3.3 Reading at boot

- `main.go` reads env as today, then reads `server_settings` and builds the first live snapshot.
- A saved value that fails today's validation (say, a rule got stricter) is ignored with a warning naming the key, and env or the default applies. Two keys fail closed instead, to match their env rules: `HOMEPAD_REGISTRATION` falls to `invite_only`, and `HOMEPAD_MAX_ACCOUNTS` stops the API, as a junk env value does.
- A bad env value keeps its current behavior (junk proxies or account limit stop the API) only when no UI value replaces it. A good UI value lets the API start.

---

## 4. Acceptance Criteria

### Storage and precedence

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | Migration 0024 creates `server_settings` (§3.2). It is idempotent and has a down file. An upgraded install with an empty table behaves exactly as before for every key. | Must |
| AC-002 | The editable allowlist is one named Go value. The table's `CHECK`, the allowlist and the GET response's keys are equal; a test compares them. No route takes a key that isn't on it (404). | Must |
| AC-003 | For each key, the effective value is UI, else env, else default (§2.1). A test covers all three sources for every key. | Must |
| AC-004 | A saved empty string is a UI value and wins over env, for the keys where empty is allowed (§2.2). | Must |
| AC-005 | Reset deletes the UI value; the badge and value fall back to env or default. For `GATUS_DEGRADED_MS`, reset sets `status_degraded_ms` to NULL. | Must |
| AC-006 | A saved value that fails validation at boot is ignored with a warning, except `HOMEPAD_REGISTRATION` (falls to `invite_only`) and `HOMEPAD_MAX_ACCOUNTS` (stops the API) (§3.3). | Must |

### API

| ID | Criterion | Priority |
|---|---|---|
| AC-007 | `GET /api/admin/server-settings` returns `{envOnly, settings:[…]}` with, per key: `key`, `group`, `type`, `value`, `source` (`ui`/`env`/`default`), `envValue`, `defaultValue`, `editable`, `applies` (`live`/`restart`), `saved`, `updatedAt`, `updatedBy`; plus `choices` for a `choice` key, `savedValue` when a saved value passes today's rule, `savedInvalid` when it doesn't, and `readOnlyReason` when `editable` is false. `updatedAt` (RFC 3339) and `updatedBy` (`{id, name}`) are set for every key saved in the UI, `GATUS_DEGRADED_MS` included. Secrets carry `isSet`, `envIsSet`, `unreadable` and no value. | Must |
| AC-008 | `PATCH /api/admin/server-settings` takes `{set:{KEY:value…}, confirm?:[code…], oidcTest?:token}`. All keys in one request save in one transaction, or none do. The response is the full GET body. | Must |
| AC-009 | `DELETE /api/admin/server-settings/{key}` resets one key and returns the full GET body. | Must |
| AC-010 | All three routes are `classAdminOnly`: no session 401, member 403, kid 403. `routes_test.go` lists them. | Must |
| AC-011 | Each key is validated by the §2.2 rule. A bad value: 400 `{"error":"invalid","key":…,"message":…}` in plain words; nothing is saved. | Must |
| AC-012 | `PORT` is in GET with `editable:false, applies:"restart"`. PATCH or DELETE of `PORT`: 400 `read_only`. `DATABASE_URL` and `HOMEPAD_SECRET_KEY` are never in any response, as key or value. | Must |

### The client secret

| ID | Criterion | Priority |
|---|---|---|
| AC-013 | The secret is never in any response body, log line or error. A test sets a known secret and greps every response of the three routes and the captured log. | Must |
| AC-014 | With a server key, the saved secret is sealed (`sealed`, `nonce`; `value` NULL). Without one, PATCH of the secret is 409 `no_secret_key` and the env secret keeps working (Q1 A). | Must |
| AC-015 | A sealed secret that can't be opened shows `unreadable:true`; the server uses the env secret and logs one warning at boot. | Must |

### Live apply

| ID | Criterion | Priority |
|---|---|---|
| AC-016 | Every key marked Live in §2.2 takes effect on the saving process without a restart: the next cookie set, sign-up, account check, client-address lookup, Gatus poll or SSO login uses it. One test per key. | Must |
| AC-017 | The OIDC login and callback routes are always registered and answer 404 while single sign-on is off. Turning it on live makes them work; turning it off makes them 404. `/api/auth/config` follows at once. | Must |
| AC-018 | An OIDC change builds a new provider (fresh discovery and keys). A login started before the change fails on callback with `sso_failed`, not a 500. | Must |
| AC-019 | Saving trusted proxies resolves hostnames before the swap, stops the old refresh loop and starts a new one. No goroutine leaks (test counts them across 20 saves). | Must |

### Guards

| ID | Criterion | Priority |
|---|---|---|
| AC-020 | Under `invite_only` set in the UI: invites are still accepted, the first account on an empty install still registers as admin, and SSO follows the group rule. | Must |
| AC-021 | An OIDC change that leaves single sign-on on runs discovery first (§2.5). A failure is 422 `discovery_failed` and saves nothing. | Must |
| AC-022 | Turning single sign-on off, or changing any OIDC value, with no admin who has a local password and no valid `oidcTest` token, is 409 `would_lock_out` and saves nothing. | Must |
| AC-023 | `POST /api/admin/server-settings/oidc/test` returns an authorize URL for the staged values. A test callback starts no session. A pass gives a token bound to the admin and the values' hash, valid 10 minutes; a token for other values is refused. | Must |
| AC-024 | No OIDC change ends any session. | Must |
| AC-025 | Changes that §2.5 marks confirm (`trusted_proxies`, `cookie_secure_on`, `cookie_secure_off`, `max_accounts_below_count`, `registration_open`) answer 409 `confirm_required` with the warnings until resent with those codes. | Must |
| AC-026 | Trusted proxies: `0.0.0.0/0` and `::/0` are 400. The `trusted_proxies` warning shows the caller's address now and under the new list. | Must |
| AC-027 | An account limit below the current accounts plus pending invites removes nobody; new accounts and invites get the existing 409 until under the limit. | Must |

### Audit, backup, recovery

| ID | Criterion | Priority |
|---|---|---|
| AC-028 | Every save, reset and refusal writes the §2.7 line. Secrets show `(set)`, `(replaced)` or `(removed)`. `updated_by` and `updated_at` are set. | Must |
| AC-029 | A backup made with every server setting saved holds none of them (except `statusDegradedMs`) and never the secret. A restore leaves `server_settings` unchanged. SPEC-backup-import AC-004's test grows to cover this. | Must |
| AC-030 | With more than one API process, a change made on one applies on the others within 30 seconds. | Should |
| AC-031 | With `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true`, every UI value is ignored, `envOnly` is true, PATCH is 409 `env_only`, DELETE still works, and the saved rows are unchanged (§2.6). | Must |

### Web

| ID | Criterion | Priority |
|---|---|---|
| AC-032 | Admin Panel → System renders every setting with the one shared row (UX §2), in the groups Server, Status, Accounts, Sign-in. The read-only Environment Configuration list is gone. The section note no longer says "set via environment variables and redeploy". | Must |
| AC-033 | Each row shows its source badge (`UI`, `env`, `default`). After a save it reads `UI`; after a reset, `env` or `default`. Reset shows only when the source is `UI`, and says what it falls back to ("Reset to env: 10"). | Must |
| AC-034 | The row states in UX §4 all work: loading, editing, saving, saved, validation error, server refusal, confirm, reset. A failed save keeps the draft and shows the server's message. | Must |
| AC-035 | The secret row, the `PORT` row, the env-only banner and the Sign-in group's one Save follow UX §3, §5, §6 and §7. | Must |
| AC-036 | The web app no longer calls `GET /api/admin/env-config`. The route stays, unchanged, marked deprecated in the docs until 19.0.0 (Q3 A). | Must |
| AC-037 | The settings code stays in the lazy `SettingsPanel` chunk. The entry chunk grows by under 100 bytes gzip, checked with `tests/infra/bundle-budget.test.ts`. | Must |

### Docs

| ID | Criterion | Priority |
|---|---|---|
| AC-038 | README (sign-up, single sign-on, running it for real), `.env.example`, `docs/single-sign-on.md`, `docs/monitoring.md` and `docs/accounts.md` say each setting can be set in Admin Panel → System, that the UI wins over env, and how to use `HOMEPAD_SETTINGS_FROM_ENV_ONLY`. `.env.example` lists the flag with a one-line comment. | Must |
| AC-039 | `docs/single-sign-on.md` covers the test sign-in, the lockout rule, and setting `OIDC_MEMBER_GROUP` in the UI. | Must |
| AC-040 | SPEC-v26-admin-env-config and SPEC-status-degraded-threshold (OQ-1) point here. The CHANGELOG names the flag and the new rule that the UI beats env. | Must |

---

## 5. User Test Cases

**TC-001 — Change a value, then reset it.** Env has `GATUS_BASE_URL=http://gatus:8080`. Admin opens System → Status → Gatus address → Edit, enters `https://status.example.com`, saves. *Expected:* "Saved". Badge `UI`. Tiles show status from the new address within one poll, no restart. Reset → "Reset to env: http://gatus:8080?" → Reset. *Expected:* badge `env`, the old value, status back.

**TC-002 — Bad input.** Account limit `-3`, then `lots`. *Expected:* "Enter a whole number from 0 to 10000." Nothing saved. Trusted proxies `0.0.0.0/0`. *Expected:* "That trusts every address. Anyone could pick their own address, and the sign-in limits would stop working."

**TC-003 — Account limit below the count.** 7 accounts, 2 pending invites. Set the limit to 5. *Expected:* the warning with those numbers. Confirm. Nobody is removed. Make an invite: "This Homepad has reached its limit of 5 accounts."

**TC-004 — Close sign-up.** Registration `open` in env. Set Sign-up to Invite only. *Expected:* no restart; the sign-in screen in a private window has no "Create account". An existing invite link still makes an account.

**TC-005 — Secure cookies on plain http.** On an `http://` install, turn Secure cookies on. *Expected:* the dialog leads with "This page is on http://". Confirm. In a private window, sign-in fails. The admin's own session still works.

**TC-006 — Recover.** After TC-005, sign out. Set `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true` and restart the API. *Expected:* sign-in works; System shows the env-only banner; Secure cookies shows `env`. Reset Secure cookies. Remove the flag and restart. *Expected:* sign-in still works; Secure cookies shows `env`.

**TC-007 — Fix the production gap.** Single sign-on on, `invite_only`, Member group not set. Pat is verified in the provider and in group `homepad`. *Expected before:* "You don't have a Homepad account yet." Admin sets Member group to `homepad` → Review and save. *Expected:* saved, no restart. Pat signs in and gets a member account.

**TC-008 — SSO-only admin changes the client ID.** The only admin has no password. They change the client ID. *Expected:* Save is blocked: "Test sign-in first." Test sign-in opens a tab at the provider; after sign-in it says "Test passed". Save. *Expected:* saved; the admin is still signed in; a fresh SSO sign-in works.

**TC-009 — Wrong issuer.** Set Issuer to `https://id.example.com/wrong`. *Expected:* "Couldn't read the sign-in settings at https://id.example.com/wrong/.well-known/openid-configuration." Nothing saved.

**TC-010 — Secret stays secret.** Replace the client secret. *Expected:* the row says "Set · Saved by Caleb, today". The browser's network tab and the API log never show the value. Without `HOMEPAD_SECRET_KEY`, Replace is off and the row says why.

**TC-011 — Port.** *Expected:* the Server port row shows `8080` with `default`, no Edit, and "Set on the server. Applies after restart."

**TC-012 — Member can't.** As a member, call `GET /api/admin/server-settings`. *Expected:* 403.

---

## 6. Test mapping

| AC | Test |
|---|---|
| AC-001, AC-002 | `api/internal/storage/server_settings_test.go` (migration, CHECK vs allowlist) |
| AC-003…AC-006 | `api/internal/api/server_settings_test.go` (precedence table, every key × UI/env/default; boot validation) |
| AC-007…AC-012 | `api/internal/api/server_settings_test.go`; `routes_test.go` class table |
| AC-013…AC-015 | `server_settings_secret_test.go` (grep responses and captured log; sealed columns; unreadable) |
| AC-016…AC-019 | `server_settings_live_test.go` (one subtest per key; OIDC route 404 ↔ live; goroutine count) |
| AC-020…AC-027 | `server_settings_guards_test.go`; OIDC discovery and test sign-in against the fake provider in `oidc_test.go` |
| AC-028 | log capture in `server_settings_test.go` |
| AC-029 | `api/internal/transfer` backup test (extends the AC-004 grep); restore leaves the table |
| AC-030 | `server_settings_reload_test.go` (two servers, one store) |
| AC-031 | `server_settings_envonly_test.go` |
| AC-032…AC-035 | `src/library/settings-server-settings.test.tsx` (mocked API: every state in UX §4, badges, secret row, port row, banner, group save) |
| AC-036 | `src/api.ts` test: no call to `/api/admin/env-config` from the panel |
| AC-037 | `tests/infra/bundle-budget.test.ts` |
| AC-038…AC-040 | `tests/infra/server-settings-docs.test.ts` (greps README, `.env.example`, docs) |
| TC-001, TC-005, TC-007, TC-008 | e2e on the PR preview, screenshots at 390 and 1440, light and dark |

---

## 7. API Contract

### New, admin-only (`classAdminOnly`)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/admin/server-settings` | → `200 {envOnly, settings:[Setting]}` |
| PATCH | `/api/admin/server-settings` | `{set:{KEY:value}, confirm?:[code], oidcTest?:token}` → `200` GET body. 400 `invalid` / `read_only`; 404 unknown key; 409 `confirm_required` / `would_lock_out` / `no_secret_key` / `env_only`; 422 `discovery_failed` |
| DELETE | `/api/admin/server-settings/{key}` | → `200` GET body. Same guards as PATCH (409 `confirm_required`, `would_lock_out`) |
| POST | `/api/admin/server-settings/oidc/test` | `{set:{OIDC_*:value}}` → `200 {authorizeUrl}`; 422 `discovery_failed` |
| GET | `/api/admin/server-settings/oidc/test/{id}` | → `200 {state:"pending"|"passed"|"failed", token?, message?}` (the panel polls it while the test tab is open) |

`Setting`, for a plain key:

```json
{ "key": "GATUS_BASE_URL", "group": "status", "value": "https://status.example.com",
  "source": "ui", "envValue": "http://gatus:8080", "defaultValue": "",
  "editable": true, "applies": "live",
  "updatedAt": "2026-11-23T18:04:00Z", "updatedBy": {"id": "…", "name": "Caleb"} }
```

For the secret: `{"key":"OIDC_CLIENT_SECRET","group":"signin","secret":true,"isSet":true,"envIsSet":false,"unreadable":false,"source":"ui",…}` — no `value`, no `envValue`.

Values travel as JSON types: booleans as `true`/`false`, numbers as numbers, the rest as strings. The PATCH is strict about it: a number sent as a string (`"GATUS_DEGRADED_MS": "1500"`) is a 400 `invalid` with that setting's message, and nothing is saved. Send `1500`. (#688)

#### Build notes (API PR, 0.2.1) — the contract the web app codes against

Where §7 was open, the API picked the reading simplest for the web app:

- **Every `Setting`** also has `type` (`boolean`, `number`, `string`, `list`, `choice`, `secret`), `saved` (a UI value is stored, used or not) and, for `choice`, `choices`. `settings` comes in display order. `group` is `server`, `status`, `accounts` or `signin`.
- **`envValue`** has the same JSON type as `value`, and is `null` when the env var is unset. So the Reset line is "Reset to env: `envValue`" when it isn't null, else "Reset to default: `defaultValue`".
- **`savedValue`** is the stored UI value, when `saved` and it passes today's rule (never for the secret). The env-only banner's "Saved value ignored: …" reads it. **`savedInvalid: true`** marks a stored value that fails today's rule and is ignored (§3.3).
- **`editable: false`** comes with `readOnlyReason`: `restart` (`PORT`), `env_only` (every row while the flag is on), or `no_secret_key` (the secret row with no server key). `updatedAt` and `updatedBy` are `null` when nothing is saved. `updatedBy` is also `null` when the saver is unknown: their account is gone, or a `GATUS_DEGRADED_MS` value was saved before migration 0025.
- **Trusted proxies** travel as one comma-separated string. The server trims each entry and stores `a,b`.
- **Error bodies** are `{error, message, key?, missing?, warnings?}`. Turning single sign-on on without the values it needs is 400 `{"error":"invalid","key":"OIDC_ENABLED","missing":["OIDC_CLIENT_ID",…]}`. A 404 `unknown_key` never echoes the key, so `DATABASE_URL` can't come back (AC-012). The 409 `no_secret_key` message doesn't name the env var; the web app has the §2.4 copy.
- **Confirm warnings** are `{code, message}` plus, for `trusted_proxies`, `currentAddress` and `newAddress`; for `max_accounts_below_count`, `accounts`, `pendingInvites` and `limit`.
- **Notes on a save that went through** come back in the PATCH/DELETE body as `warnings:[{code, message}]`: `gatus_unreachable` (the save-time fetch failed), `proxy_unresolved` (with `hosts`), `oidc_issuer_http`. They need no confirm.
- **DELETE** takes confirm codes and a test token as query parameters: `?confirm=a,b&oidcTest=…`. DELETE of a key with nothing saved is a 200 no-op.
- **PATCH of a value equal to the saved one** writes nothing and logs nothing.
- **Test sign-in.** POST answers `{id, authorizeUrl}`; `id` is what the status route takes. It accepts only `OIDC_*` keys (400 otherwise) and is 409 `env_only` while the flag is on. The callback lands the test tab on `/#oidc-test=passed` or `/#oidc-test=failed`. The status route is 404 `not_found` once the run is over 10 minutes old, or for another admin's run. Runs and tokens live in the process that started them.
- **Turning single sign-on off** when no admin has a password is always 409 `would_lock_out`: no test sign-in can help, since nobody could sign in afterwards.
- **While off**, the login and callback routes answer 404 with the body `single sign-on is off`.
- **Reload:** each process re-reads `server_settings` every 25 seconds (AC-030).

### Changed

| Route | Change |
|---|---|
| `GET /api/auth/config` | Reads the live config. |
| `GET /api/auth/oidc/login`, `/callback` | Always registered; 404 while off. The callback also serves test sign-ins. |
| `PATCH /api/admin/settings` | `statusDegradedMs: null` resets it (AC-005). |
| `GET /api/admin/env-config` | Unchanged; deprecated (Q3 A). |

---

## 8. Frontend Implementation

- `src/api.ts`: `adminServerSettings()`, `saveServerSettings(set, {confirm, oidcTest})`, `resetServerSetting(key)`, `startOidcTest(set)`, `oidcTestStatus(id)`. Errors keep `error`, `warnings` and `message` so the row can show them.
- `src/library/SettingsPanel.tsx`: `SystemSettings` renders the four groups from the GET body. `EnvConfigRows`, `EnvConfigSkeleton`, `ENV_LABELS` and `DegradedThresholdRow` are replaced by one `ServerSettingRow` (new file `src/library/ServerSettingRow.tsx`) plus a small editor per type: switch, number, text, list, choice, secret.
- The Sign-in group holds its drafts until "Review and save" (UX §7).
- The confirm dialog reuses `src/ui/Modal`.
- After a save, the panel tells `App.tsx` when `registration` or `oidcEnabled` changed, so the Accounts warning and the Add-an-adult PocketID line update without a reload.
- Labels in plain words, with the env name as the mono sub-label (SPEC-v26 §8.1 stays).

## 9. Design (Kare)

UX artifact: [`specs/ux/admin-server-settings-ux.md`](./ux/admin-server-settings-ux.md) (Draft). It covers the shared row and its states, the four groups, the secret row, the `PORT` row, the env-only banner, the Sign-in group's save and test sign-in, and the confirm dialogs. Six decisions (A-1…A-6) wait for Kare and Caleb.

## 10. Upgrade and Compatibility — what changes

- **Nothing changes on upgrade.** The table starts empty, so every setting keeps its env or default value.
- **New rule: a value saved in the UI beats env.** An admin who later edits env and restarts sees no change for a key saved in the UI. The row's badge shows why, and Reset fixes it. Release-note line: "Server settings can now be changed in Admin Panel → System. A value saved there wins over the environment. To ignore saved values, set `HOMEPAD_SETTINGS_FROM_ENV_ONLY=true` and restart."
- **Junk env is gentler** when a UI value replaces it: the API starts (§3.3).
- **The env-config route** stays, deprecated (Q3 A).
- **Q1 A:** installs without `HOMEPAD_SECRET_KEY` can't save the client secret in the UI until they add one.

## 11. Out of Scope

- Editing `PORT`, `DATABASE_URL`, `HOMEPAD_SECRET_KEY` or the web container's settings (`HOMEPAD_WEB_PORT`, `HOMEPAD_VERSION`).
- Rotating `HOMEPAD_SECRET_KEY`.
- A settings history beyond the last change per key and the log.
- Renaming the member role from `user` (#599). The Member group row says "member", as the UI does today.
- Per-household or per-user server settings.
- New settings that aren't env vars today (OIDC scopes, session lifetimes, rate limits).
- A CLI reset (§2.6 picks the flag).

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Approved 2026-11-23 — Q1 A, Q2 A, Q3 A |
| Product | Walt | Waived — Caleb approved directly |
| Design | Kare | Waived — Caleb approved the UX draft and A-1…A-6 as recommended |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-23 | 0.1.0 | Draft from Caleb's request of 2026-11-23, checked against `homepad` `gitea/main` `ec170e3`. |
| 2026-11-23 | 0.2.0 | Approved by Caleb: Q1–Q3 = A; UX A-1…A-6 as recommended. |
| 2026-11-23 | 0.2.1 | API build notes in §7: the fields, error bodies, notes and test sign-in details the web app codes against. No decision changed. |
