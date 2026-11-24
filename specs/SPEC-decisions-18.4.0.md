# Spec: Caleb's decisions for 18.4.0

**Spec ID:** SPEC-decisions-18.4.0
**Version:** 0.1.0
**Created:** 2026-11-24
**Author:** Claude (from Caleb's decisions of 2026-11-24 on #599, #352, #488 and the docs-vs-code list)
**Status:** In review
**Repo:** `Code/homepad` (web app and `api/`)
**Issues:** #599, #352, #488
**Target version:** 18.4.0

---

## 1. Overview

Four items. Caleb made each call; this spec says what each one changes and how it is tested.

1. **#599** The API calls the member role `member`. It still takes `user` as input until 19.0.0.
2. **#352** Tile icon colour stays per service. Docs only.
3. **#488** A one-line hint under "Show uptime display" says what it shows at each tile density.
4. **Docs match the code** for Reset, `COOKIE_SECURE`, `HOMEPAD_SECRET_KEY`, the Gatus image variable and the settings reload time.

## 2. #599 — the member role is `member` in the API

### 2.1 Where the role shows today

Read from the code at 18.3.0 (99d3a89):

| Place | What it does with the role |
|---|---|
| `GET /api/me`, `POST /api/login`, `POST /api/invites/accept`, `PATCH /api/me`, OIDC callback (`userView`, `api/internal/api/auth.go`) | Sends it |
| `GET /api/admin/accounts`, `PATCH /api/admin/accounts/{id}` (`accountView`, `admin_accounts.go`, `adults.go`) | Sends it; PATCH takes it |
| `POST /api/admin/invites`, `GET /api/admin/invites`, `POST /api/invites/lookup` (`invites.go`) | Create takes it; all three send it |
| Log lines in `invites.go` and `adults.go` | Print it |
| `users.role`, `invites.role` (CHECK `IN ('admin','user','kid')` / `IN ('admin','user')`) | Store `user` |
| Backups (`api/internal/transfer`) | Do **not** hold a role. An adult in a backup is matched by email; a kid sits in its own list. |

### 2.2 Decision: map at the API edge, no migration

The database keeps `user`. One small helper in `api/internal/api/roles.go` turns the stored value into the API value on the way out (`user` → `member`), and the input value into the stored value on the way in (`member` or `user` → `user`).

Why not a migration:

- **Rollback.** 18.3.0 code only knows `user`. After a migration to `member`, rolling the image back would treat every member as an unknown role: `IsAdultRole` is false, so they could not sign in. A down migration would have to run first. Mapping at the edge leaves the data the same, so any image can run on it.
- **Reach.** The literal `'user'` is in about fifteen SQL statements and two CHECK constraints. A migration changes all of them at once for a name no one sees inside the database.
- **Backups.** They hold no role, so nothing in a backup changes either way.

The cost is one helper that every role-carrying response must use. A test checks every response listed in §2.1 so a new one can't forget it (AC-001…AC-004).

Removing the `user` input in 19.0.0 is a one-line change in the helper. The database can be renamed then too, if wanted, as part of a major.

### 2.3 Deprecation

A request that sends `"role": "user"` still works. The response carries a `Warning: 299` header saying `user` is deprecated and goes away in 19.0.0. The response itself says `member`.

### 2.4 Web

The web sends `member`. It reads `member`, and reads `user` as `member` too, so it works against an 18.3.0 API during a rolling update. The mapping lives in `src/api.ts`, at the edge, so the rest of the app only sees `admin`, `member` or `kid`.

## 3. #352 — tile icon colour is per service

Keep it as built. `initialBadge` (`src/icons.ts`) hashes the service name to a hue. The v15 design-system spec §3.7 asked for one hue per category; that spec lives on the `design/v15-reference` branch and was never merged. The decision is recorded in `specs/DECISIONS.md`, which supersedes §3.7 for tile icons. No code change.

## 4. #488 — uptime hint

What "Show uptime display" shows, read from `src/grid/AppGrid.tsx` and `src/index.css`:

| Density | 24h/7d/30d line | Recent-checks dots | Dots label ("75% / 4 checks") |
|---|---|---|---|
| Large | shown | shown | shown |
| Compact | hidden | shown | hidden |
| List | hidden | shown | hidden |

The dots need check history, so only monitored tiles (those with a Gatus key) show them.

Hint under the switch, in the style of "Show widgets":

> Recent checks on monitored tiles. Large also shows 24h, 7d and 30d uptime.

## 5. Docs match the code

| Item | Code | Fix |
|---|---|---|
| Reset in Admin Panel → System | Deletes the saved value; the env value applies, or the built-in default if env doesn't set it (`server_settings.go`, AC-005 of SPEC-admin-server-settings) | README, `docs/accounts.md`, `docs/monitoring.md`, `docs/single-sign-on.md`, `.env.example`, the UX spec note and the panel note say "env value, or the default". CHANGELOG 18.1.0 and `src/changelog.json` stay as history. |
| `COOKIE_SECURE` | Defaults to true (`cookie.go`) | Intended. compose and `.env.example` set false on purpose, for the http://localhost quickstart. Their comments now say the API's own default is true. |
| `HOMEPAD_SECRET_KEY` | Seals widget keys and the OIDC client secret saved in the panel | compose and `.env.example` comments say both. |
| Gatus image | `compose.yaml` uses `GATUS_VERSION`; `compose.build.yaml` and `.env.example` use `GATUS_IMAGE` | Both compose files and `.env.example` use `GATUS_VERSION`, pinned to `v5.37.0`. `compose.build.yaml` moves off `latest`, and loses the option to swap the image registry. |
| Settings reload | `SettingsReloadEvery = 25 * time.Second` | SPEC-admin-server-settings §2.2 says 25 seconds. AC-030's "within 30 seconds" is a bound and stays. |

## 6. Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | `GET /api/me` and the accept-invite response give a member `"role": "member"`. Admin and kid are unchanged. | Must |
| AC-002 | `GET /api/admin/accounts` and `PATCH /api/admin/accounts/{id}` give a member `"role": "member"`. | Must |
| AC-003 | `POST /api/admin/invites`, `GET /api/admin/invites` and `POST /api/invites/lookup` give `"role": "member"` for a member invite. | Must |
| AC-004 | `POST /api/admin/invites` and `PATCH /api/admin/accounts/{id}` take `member`. They still take `user`, answer the same, and add a `Warning: 299` header. Any other role is 400 with `role must be "admin" or "member"`. | Must |
| AC-005 | The database still stores `user`. No migration. | Must |
| AC-006 | A backup holds no role, and a backup from 18.3.0 still restores (the release fixtures in `api/internal/transfer/testdata/backups`). | Must |
| AC-007 | The web sends `member`, and reads both `member` and `user` as a member. | Must |
| AC-008 | `specs/DECISIONS.md` records per-service tile icon hue and supersedes v15 §3.7 for it. | Must |
| AC-009 | My settings shows the §4 hint under "Show uptime display", linked to the switch with `aria-describedby`. | Must |
| AC-010 | No doc outside the CHANGELOG history says Reset goes back to `.env`. | Must |
| AC-011 | compose and `.env.example` say `COOKIE_SECURE` is false here for plain http and that the API defaults to true. | Must |
| AC-012 | compose comments on `HOMEPAD_SECRET_KEY` mention the OIDC client secret. | Must |
| AC-013 | `.env.example`, `compose.yaml` and `compose.build.yaml` use the same Gatus variable. | Must |
| AC-014 | SPEC-admin-server-settings gives the reload as 25 seconds everywhere. | Must |

## 7. Tests

| AC | Test |
|---|---|
| AC-001…AC-005 | `api/internal/api/role_member_test.go` (integration, real Postgres) |
| AC-006 | `api/internal/transfer` release fixtures (existing) and `TestRoleMember_BackupHoldsNoRole` |
| AC-007 | `src/api.role.test.ts`, `src/accounts/AddAdultDialog.test.tsx`; fixtures across the web tests now say `member` |
| AC-009 | `src/library/SettingsPanel.test.tsx` (cap6 v2 block) |
| AC-010…AC-014 | `tests/infra/docs-match-code-18.4.0.test.ts` |
