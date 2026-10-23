# Spec: Kid Accounts — a managed dashboard for kids on the family iPad

**Version:** 0.2.0
**Created:** 2026-10-20
**Author:** Caleb Dunn (via /add:spec)
**Status:** APPROVED (product, 2026-10-22) — implementation gated on the Kare §9 UX artifact
**Repo:** `Code/homepad` (frontend) + `Code/homepad-api` (Go backend)
**Estimate:** ~3–4 days (persistent sessions, accounts admin, per-kid allow-list, server-side filtering, UI, tests)
**Depends on:** shared catalog model (SPEC-245-224), v12-settings-boundary-clarity, per-user preferences (`PATCH /api/me`)
**Target version:** 17.0.0 (major — session storage moves from memory to Postgres; every existing session is ended once on deploy)

---

## 1. Overview

Caleb, 2026-10-20: *"Add ability to give kids a dashboard on iPad that I manage and they can open the web apps I want them to have."*

Homepad is pitched as the dashboard for a whole household, but today every account sees the entire shared catalog, and only the admin can shape it. There is no way to give a child a dashboard with just their apps.

### 1a. What exists today (grounded in the code)

- **Every account sees every service.** `handleListServices` (`homepad-api/internal/api/services.go:76`) returns the shared-catalog owner's rows to every caller. Only the per-user order and favorites differ.
- **`GET /api/status` returns the status of every Gatus key** in the poller snapshot to any signed-in user (`services.go:327`). Any user can see the full list of monitored keys, even ones not in the catalog.
- **The admin can't create accounts.** The only path is `POST /api/register`. With `HOMEPAD_REGISTRATION=invite_only`, registration is just closed: there are no invites and no admin "add user" route. To add a kid today, the admin has to reopen registration for everyone.
- **Sessions don't survive.** `internal/session/session.go` is an in-memory map ("A restart logs everyone out, which is acceptable for v1"), and the cookie has no `Max-Age`, so it's a browser-session cookie. Every deploy signs out every device. iPadOS can drop session cookies when a home-screen web app is evicted. A kid's iPad would fall back to the login screen regularly.

### 1b. Decisions (Caleb, 2026-10-20)

| # | Question | Decision |
|---|---|---|
| D1 | How does a kid get in? | **Stays signed in.** The admin creates the account and signs the iPad in once. It stays signed in for months, with no password for the kid. |
| D2 | How are apps chosen? | **Per kid.** In each kid's settings, the admin ticks the apps that kid can see. |
| D3 | What can a kid change? | **Favorites and theme only.** No adding, editing or reordering apps, and no settings beyond appearance. |
| D4 | Enforcement | **Hiding is enough.** The server never sends a kid an app outside their list. Blocking URLs typed into Safari is out of scope; docs point to iPad Screen Time / Guided Access. |

---

## 2. Model

A new role, **`kid`**, joins `admin` and `user`. A kid account:

- is created only by an admin (never by self-registration);
- may have no email and no password: it can be **signed in by the admin on the device** (§2.2);
- sees only the services on its **allow-list** (`kid_allowed_services`), filtered **server-side** in every endpoint that returns catalog data;
- can toggle favorites (on allowed services only) and set its theme; every other write is 403.

### 2.1 Persistent sessions (all roles)

Sessions move to Postgres (`sessions`: token hash, user id, created_at, last_seen_at, expires_at, user_agent). The cookie gets a `Max-Age`.

- **Kid sessions:** 180-day sliding expiry, renewed on use.
- **Admin and user sessions:** 30-day sliding expiry. This also fixes the "every deploy logs everyone out" problem for adults.
- Only a **SHA-256 of the token** is stored, so a DB dump can't be replayed as sessions.
- The admin can **sign a device out remotely** (§2.3). That matters for a lost or handed-down iPad.

### 2.2 "Sign in this device as …"

On the iPad, the admin signs in as themselves, opens **Accounts → [kid] → Sign in this device as [kid]**, and confirms. The admin's session on that device ends, and a kid session starts in its place. That's the only way to sign in a kid that has no password. A kid can't reach the admin's session from there: the swap is one-way and needs the admin's session to start.

Optional: the admin can set a password on a kid account, so an older kid can sign in on another device.

### 2.3 Accounts admin (new)

A new admin-only **Accounts** section lists every account (name, role, last seen). Through it the admin can:

- **create a kid account**, entering just a name and an avatar color;
- edit a kid's allowed apps: a checklist of the catalog, grouped by section, with "select all in section";
- see a kid's signed-in devices (user agent, last seen) and sign any of them out;
- delete a kid account, which removes its sessions, favorites and allow-list.

Managing adult accounts (create, delete, reset password) stays out of scope, apart from listing them (§10).

---

## 3. Open Questions (resolved)

- **OQ-1: New apps added to the catalog later.** Default: not visible to kids until ticked; the allow-list is explicit. Alternative: a per-kid "also show new apps in sections I've allowed" toggle. **Decided (2026-10-22): explicit only for v1.**
- **OQ-2: Categories.** A kid sees only sections that contain at least one allowed app, so empty sections are hidden. **Decided (2026-10-22): yes.**
- **OQ-3: Health bar for kids.** The summary ("All systems operational · N services") would count only the kid's allowed apps. Alternatively, hide the bar for kids by default (`showHealthBar=false` at creation). **Decided (2026-10-22): count allowed apps only, and default the bar off for kids.**
- **OQ-4: Iframe click action.** A tile set to open in an embedded overlay still loads the app's real URL; that's fine, because hiding doesn't block. **Decided (2026-10-22): no change.**

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | An admin can create a kid account with only a name. No email or password required. | Must |
| AC-002 | An admin can tick and untick, per kid, which catalog services that kid can see. The change applies on the kid's next poll, within 60s, with no sign-out. | Must |
| AC-003 | `GET /api/services` for a kid returns only allowed services. A service not on the list is never in the response body. | Must |
| AC-004 | `GET /api/status` for a kid returns statuses only for the Gatus keys of the kid's allowed services. | Must |
| AC-005 | `GET /api/categories` for a kid returns only categories that contain at least one allowed service (OQ-2). | Must |
| AC-006 | Icon reads (`GET /api/services/{id}/icon/*`) and favorite writes (`POST`/`DELETE /api/favorites/{id}`) for a service off the kid's list return 404, not 403, so a kid can't probe which IDs exist. | Must |
| AC-007 | A kid session gets 403 on every catalog, category, library, layout, icon-write, admin and settings mutation. `PATCH /api/me` accepts only `themePref` (D3). | Must |
| AC-008 | A kid's UI has no edit mode, no App Library, no "Add app", no Admin section and no tile-edit affordance. The user menu shows only Appearance (theme) and the kid's name. | Must |
| AC-009 | "Sign in this device as [kid]" replaces the admin's session on that device with a kid session, and needs the admin's session to start. | Must |
| AC-010 | Sessions persist across API restarts and deploys. The cookie carries `Max-Age`: kid 180 days and adult 30 days, both sliding. | Must |
| AC-011 | Only a hash of each session token is stored, never the raw token. | Must |
| AC-012 | An admin can list a kid's sessions and revoke any of them. A revoked device gets 401 on its next request, and the app shows the login screen. | Must |
| AC-013 | `POST /api/register` can never create a `kid` (self-registration can't pick a role). Existing register behaviour is unchanged. | Must |
| AC-014 | Deleting a kid removes its sessions, favorites, preferences and allow-list rows. | Must |
| AC-015 | A kid's dashboard installs and works as the home-screen PWA on iPadOS, with 44px targets and light/dark, the same as other users. | Must |
| AC-016 | The ⌘K launcher, for a kid, searches only allowed services. | Must |
| AC-017 | The docs (`docs/kid-accounts.md`, linked from the README) explain setup, and say plainly that Homepad hides apps but does not block URLs. They point to iPad Screen Time and Guided Access for that. | Must |
| AC-018 | No existing admin or user sees any change except: sessions now survive deploys, and admins have a new Accounts section. | Must |
| AC-019 | Kid health bar is off by default, and when shown it counts only allowed services (OQ-3). | Should |

---

## 5. User Test Cases

**TC-001 — Set up a kid's iPad (happy path).** *Precondition:* admin account, a catalog with 10+ services.
1. On the iPad, the admin signs in, then opens **Accounts → New kid account**, enters "Sam", and saves.
2. The admin ticks 4 apps (Jellyfin, Audiobookshelf, Immich, Khan Academy) and saves.
3. On Sam's row, the admin taps **Sign in this device as Sam** and confirms.
4. The admin adds Homepad to the Home Screen.

*Expected:* exactly 4 tiles in their sections, no admin or edit affordances, and Sam's name in the menu. *Screenshot:* the kid dashboard on iPad, portrait.

**TC-002 — It stays signed in.** *Precondition:* TC-001 done. The API is redeployed, and the iPad is closed for a week. *Expected:* opening the Home Screen icon goes straight to Sam's dashboard.

**TC-003 — Admin changes the list remotely.** From the admin's own phone, the admin unticks Immich and ticks Navidrome. *Expected:* within 60s Sam's iPad shows Navidrome and not Immich, with no reload.

**TC-004 — Kid can't escalate.** As Sam's session, call `POST /api/services`, `PATCH /api/services/{id}`, `GET /api/library`, `PATCH /api/admin/settings`, and `PATCH /api/me {"densityPref":"list"}`. *Expected:* all 403 (`PATCH /api/me` rejects the non-theme field). `GET /api/services/{immich-id}/icon/light` → 404.

**TC-005 — Lost iPad.** In **Accounts → Sam → Devices**, the admin taps **Sign out** on the iPad. *Expected:* the iPad's next poll gets 401, and the app shows the login screen.

**TC-006 — Favorites and theme.** Sam stars Jellyfin and switches to light. *Expected:* both persist across reloads. Sam can't star a hidden app, because there's no way to reach one.

**TC-007 — Deploy doesn't sign adults out.** An adult user signs in, and the API restarts. *Expected:* they're still signed in (AC-010).

---

## 6. Data Model

Migration `0017_kid_accounts`:

- `users.role`: allow `'kid'`. `users.email` and `users.password_hash` become nullable for `role = 'kid'` only (CHECK constraint). Add `users.display_name` and `users.avatar_color`.
- `kid_allowed_services (user_id → users ON DELETE CASCADE, service_id → services ON DELETE CASCADE, PRIMARY KEY (user_id, service_id))`. Deleting a service drops it from every kid's list.
- `sessions (token_hash bytea PRIMARY KEY, user_id → users ON DELETE CASCADE, created_at, last_seen_at, expires_at, user_agent text)`, indexed on `user_id` and `expires_at`. A sweep deletes expired rows.

The down migration restores the in-memory model, ending all sessions, and drops kid users.

## 7. API Contract

New, admin-only:

| Method | Path | Body / result |
|---|---|---|
| GET | `/api/admin/accounts` | `[{id, name, role, lastSeenAt}]` |
| POST | `/api/admin/kids` | `{name, avatarColor}` → `201 {id, …}` |
| PATCH | `/api/admin/kids/{id}` | `{name?, avatarColor?, password?}` |
| DELETE | `/api/admin/kids/{id}` | `204` |
| PUT | `/api/admin/kids/{id}/services` | `{serviceIds: [...]}` (whole-set replace, like `PUT /api/layout`) → `204` |
| GET | `/api/admin/kids/{id}/services` | `{serviceIds: [...]}` |
| GET | `/api/admin/kids/{id}/sessions` | `[{id, userAgent, createdAt, lastSeenAt}]` (`id` is an opaque handle, never the token) |
| DELETE | `/api/admin/kids/{id}/sessions/{sid}` | `204` |
| POST | `/api/admin/kids/{id}/sign-in-here` | Ends the caller's session, sets a kid session cookie → `204` |

Changed: `GET /api/me` gains `role: "kid"` and `displayName`. `GET /api/services`, `/api/status`, `/api/categories` and the icon reads filter for kids (AC-003…006).

The filtering lives in one storage-layer function: `VisibleServiceIDs(ctx, user)` returns nil (meaning everything) for admin and user, and the allow-list for a kid. Every handler that returns catalog data goes through it. A test lists every route in `server.go` and fails if a route that returns catalog data isn't covered. That enforces the rule instead of just asserting it.

## 8. Frontend Implementation

- `role === 'kid'` drives a **kid shell**: the existing dashboard with edit mode, the library, admin and tile-edit entry points removed. The user menu has the kid's name and Appearance only. Gate on the role, not on missing data, so a kid never sees an affordance that would 403 (PRD §2: "should never see admin affordances or get a 403").
- New **Admin → Accounts** panel: account list, the kid editor (name, color, app checklist grouped by section, devices), "Sign in this device as …" with a confirm step.
- Login screen: no change. A kid without a password can't sign in there, and the copy doesn't mention kids.

## 9. Design (Kare)

Needs a UX artifact at `specs/ux/kid-accounts-ux.md` before implementation (UI gate, GA). Surfaces:

1. the Accounts list;
2. the kid editor, with the app checklist for 50+ apps and select-all per section;
3. the "Sign in this device as …" confirm, which must say plainly that it signs the admin out on this device;
4. the kid dashboard on iPad, portrait and landscape.

## 10. Out of Scope

- Blocking URLs, DNS filtering, screen-time limits, schedules (D4).
- A profile picker or PINs on a shared iPad (D1 alternative; possible v2).
- Managing adult accounts (create, delete, reset password). Listing only.
- Per-kid custom tile order set by the admin. Kids get the catalog's default order, plus their favorites.
- Multi-household isolation (PRD §4, already out of scope).

## 11. Sign-offs

| Role | Name | Status |
|---|---|---|
| Product | Caleb | Approved 2026-10-22 (OQ-1…OQ-4 at the proposed defaults) |
| Design | Kare | Pending (§9) |

## 12. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-10-20 | 0.1.0 | Draft from Caleb's request and the D1–D4 interview answers. |
| 2026-10-22 | 0.2.0 | Approved by Caleb; OQ-1…OQ-4 resolved at the proposed defaults. |
