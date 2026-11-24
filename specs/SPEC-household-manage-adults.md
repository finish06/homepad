# Spec: Manage adults — remove an adult, change a role

**Spec ID:** SPEC-household-manage-adults
**Version:** 0.1.2
**Created:** 2026-11-19
**Author:** Claude (spec step for Caleb's 18.0.0 theme, "a household you can manage")
**Status:** SHIPPED — 18.0.0 (2026-11-22). Approved — Caleb, 2026-11-20: every §0 question decided. Status line read "Approved" until 2026-11-22.
**Repo:** `Code/homepad-api` (routes, storage) + `Code/homepad` (Accounts UI, docs)
**Estimate:** ~2 days (two routes under the account lock, session ending, Accounts row actions, confirm dialogs, tests)
**Depends on:** SPEC-household-catalog-owner (hard: removing or demoting the first admin is unsafe until it ships), SPEC-household-basics (Accounts adult rows, invites; web half #565 must be on `homepad` main)
**Target version:** 18.0.0 (ships with the catalog-owner change)
**UX:** [`specs/ux/household-manage-adults-ux.md`](./ux/household-manage-adults-ux.md) (APPROVED 2026-11-20, A-1…A-6)
**Issues folded in:** SPEC-household-basics Q6 / §11 ("removing an adult or changing an adult's role")

---

## 0. Open questions — decisions for Caleb

All questions are decided.

**Decided (Caleb, 2026-11-19):** the theme is household management; an admin can remove an adult and change an adult's role; the last admin can never be removed or demoted.

**Decided — Q1, acting on yourself (Caleb, 2026-11-20): A.** [AC-005, AC-010] An admin can't remove or demote themselves. Another admin does it.

**Decided — Q2, sessions on a role change (Caleb, 2026-11-20): A.** [AC-008] Every session of the changed account ends.

**Decided — Q3, the removed adult's invites (Caleb, 2026-11-20): A.** [AC-004] Their pending invites are revoked.

**Decided — Q4, removing an SSO adult (Caleb, 2026-11-20): A.** [AC-012] Allowed. The confirm says they can sign in again through the identity provider unless they are removed there too.

**Decided — Q5, removing a member (Caleb, 2026-11-20): A.** [AC-001] Any adult, admin or member, can be removed. The last admin never can.

---

## 1. Overview

An admin can add an adult today (invites), but not take one away, and not make a member an admin or the other way round. A household changes: a partner moves out, a roommate leaves, a teenager is old enough to stop being an admin. This spec adds both actions to Accounts, with guards so the install always keeps at least one admin.

### 1a. What exists today (checked in the code, `homepad-api` `gitea/main` at `79e3b03`, `homepad` `gitea/main` at `6eb8a35`)

- **No route changes or deletes an adult.** `internal/api/admin_accounts.go` says so at the top: every `{id}` there goes through `KidByID`, which treats an adult's id as not found. `server.go` registers `PATCH`/`DELETE /api/admin/kids/{id}` and nothing for adults.
- **Deleting the catalog owner deletes the catalog** (`services.user_id … ON DELETE CASCADE`, migration 0007). SPEC-household-catalog-owner removes that. Demoting the first admin would also move "the owner" to another admin (`SharedCatalogOwnerID`, `internal/storage/storage.go`). Same fix.
- **The role is read on every request.** `currentUser` (`internal/api/auth.go`) loads the user row with `UserByID` each time, and `requireAdmin` (`internal/api/library.go`) checks `u.Role` from that row. So a role change takes effect on the next request even if the session lives on.
- **Sessions cascade.** `sessions.user_id … ON DELETE CASCADE` (migration 0017). Deleting a user ends all their sessions; their next request gets 401. The session store (`internal/session/session.go`) has `Destroy` (one token), `RevokeByHandle` (one handle, scoped to a user) and no "end all for a user" method.
- **Kids have no managing adult.** `kid_allowed_services` and `users` have no column linking a kid to an adult. Any admin manages any kid (`handleUpdateKid`, `handleSetKidServices`). A kid's sessions belong to the kid, even when an admin started them with sign-in-here (`handleSignInHere`).
- **Invites point at their maker with `ON DELETE SET NULL`** (`created_by`, `used_by`, migration 0019). Deleting an adult keeps their invites; the lookup then shows an empty inviter name (`inviteSelect` uses `LEFT JOIN users`).
- **Every account insert takes one advisory lock** (`withAccountLock`, `internal/storage/accounts.go`). No delete or role change uses it, because none exists.
- **The Accounts list shows adults** (`GET /api/admin/accounts`, `newAccountView`) with name, email, role and last seen. Rows have no actions for adults today.
- **Audit is log lines only.** No audit table. The existing style is `sign-in-here: admin <id> signed a device in as kid <id>` and the `invite:` lines.
- **Backups never create or delete adults.** Restore matches adults by email and skips unknown ones (SPEC-backup-import §2.2). Roles are not in the backup file.

### 1b. Decisions

- Caleb, 2026-11-19: the actions and the last-admin rule (above).
- Caleb, 2026-11-20: Q1 A (not on yourself), Q2 A (a role change ends every session), Q3 A (the removed adult's invites are revoked), Q4 A (SSO adults can be removed, with the identity-provider caveat), Q5 A (any adult can be removed, never the last admin).

---

## 2. Model

### 2.1 Change a role

- In **Accounts**, an adult row gets **Make admin** or **Make member**.
- The change is refused if it would leave no admin. With Q1 = A, an admin's own row shows no role action.
- The changed account is signed out everywhere (Q2). The next time they sign in they see the screens for their new role.

### 2.2 Remove an adult

- An adult row gets **Remove**. The confirm names the person and says what goes: their sign-in, their favorites, their app order and their settings. Nothing in the shared app list changes.
- The removal is refused if it would leave no admin. With Q1 = A, an admin can't remove themselves.
- Their sessions end at once (FK cascade). Their pending invites are revoked (Q3). Their pending password-reset links go with the account (SPEC-password-reset-link, FK cascade).
- Kids are not affected: no kid belongs to an adult (§1a).
- A removed adult who uses a password can come back only through a new invite (or `open` sign-up). One who uses single sign-on can sign in again unless the identity provider stops them, or invite-only applies to OIDC (SPEC-signin-hardening). The confirm says so when OIDC is on (Q4).

### 2.3 The last-admin rule

"Admins" means rows with `role = 'admin'`. Both actions run in one transaction under the account lock (`accountsLockKey`), count admins inside it, and refuse when the result would be zero. Two admins demoting each other at the same moment can't both win.

---

## 3. Security notes

| Path | Closed by |
|---|---|
| A member or kid removes or demotes someone | Both routes are `classAdminOnly` (`requireNotKid` in front, `requireAdmin` in the handler). AC-002. |
| An admin removes a kid through the adult route | The adult routes resolve `{id}` to adults only; a kid's id is 404. Kids keep `DELETE /api/admin/kids/{id}`. AC-003. |
| Promoting someone to `kid`, or a kid to admin | `role` must be `admin` or `user`. The target must be an adult. AC-006. |
| Two admins race and leave none | One lock, one transaction, count inside (AC-009). |
| A demoted admin keeps acting as admin in an open tab | Role is read per request; sessions also end (Q2). AC-008. |
| A removed adult keeps a session | FK cascade; tested by request after removal (AC-007). |
| Removing the person who holds the catalog | Not possible to harm the catalog after SPEC-household-catalog-owner (AC-011). |

- **CSRF:** the session cookie is `SameSite=Lax`, and both routes need a JSON body or a `DELETE` from the app's origin. Same as every other admin route.
- **Audit lines** (no token, no email, ids only, matching the existing style):
  - `accounts: admin <id> removed adult <id> role=<role>`
  - `accounts: admin <id> changed role of <id> from <old> to <new>`
  - `accounts: admin <id> refused: would leave no admin (<route>)`
  - `invite: revoked <n> pending invites made by removed adult <id>` (Q3)

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | `DELETE /api/admin/accounts/{id}` removes an adult (admin or member, Q5) and answers 204. Their favorites, order, folded sections, prefs and sessions are gone. The catalog is unchanged. | Must |
| AC-002 | Both new routes: no session 401, member 403, kid 403. | Must |
| AC-003 | `{id}` that names a kid, an unknown id or a malformed id gets 404 on both routes. | Must |
| AC-004 | Removing an adult revokes their pending invites (Q3). Used invites keep their `used_by` and `created_by` history until the sweep (SET NULL on the deleted id). | Must |
| AC-005 | An admin acting on their own id gets 409 `{"error":"self"}` on both routes, and nothing changes (Q1). | Must |
| AC-006 | *(18.4.0: `member`, with `user` as a deprecated alias; SPEC-decisions-18.4.0.)* `PATCH /api/admin/accounts/{id}` with `{"role":"admin"}` or `{"role":"user"}` changes the role and answers 200 with the account row. Any other role, any other field, or no body is 400. Setting the role it already has is 200 and changes nothing (no sessions end). | Must |
| AC-007 | After removal, a request with the removed adult's old cookie gets 401, and the web app shows the sign-in screen (through AC-016). | Must |
| AC-008 | After a role change, every session of that account is ended (Q2). The changed adult's next request gets 401. | Must |
| AC-009 | A change that would leave zero admins gets 409 `{"error":"last_admin"}`, and nothing changes. With two admins sending opposite demotions at once, exactly one succeeds. | Must |
| AC-010 | Accounts shows **Make admin** / **Make member** and **Remove** on every adult row except the signed-in admin's own row, in the row's **Manage ▾** menu (UX §2). Every action asks first (UX §3). | Must |
| AC-011 | Removing or demoting the first admin leaves the catalog, every kid's allow-list and every other account's favorites unchanged (test on top of SPEC-household-catalog-owner). | Must |
| AC-012 | With `oidcEnabled`, the remove confirm adds the single sign-on line (Q4). | Must |
| AC-013 | Every action writes one §3 log line. No log line holds an email or token. | Must |
| AC-014 | A removal frees a place under `HOMEPAD_MAX_ACCOUNTS`. | Should |
| AC-015 | Kids, their allow-lists and their sessions are unchanged by any removal or role change. | Must |
| AC-016 | When a poll or request of a signed-in **adult** gets 401 (removed, role changed, or a password reset elsewhere), the web app shows the sign-in screen. `App.tsx` passes `onUnauthorized` to `ServicesProvider` for every role; today it does so for kids only, and adults keep v13's quiet stop (UX A-5). | Must |

---

## 5. User Test Cases

**TC-001 — A partner moves out.** *Precondition:* admins Caleb and Alex, member Jo, kid Sam. Caleb opens Accounts → Alex → **Remove**, reads the confirm, taps **Remove**.
*Expected:* Alex is gone from the list. Alex's open tab on another device shows the sign-in screen on its next poll. Jo and Sam see no change. The catalog is unchanged.

**TC-002 — Make a member an admin.** Caleb taps **Make admin** on Jo. *Expected:* Jo's open tab goes to the sign-in screen. After signing in, Jo sees Administration.

**TC-003 — The last admin.** Only Caleb is admin. *Expected:* Caleb's own row shows no role or remove action. `PATCH /api/admin/accounts/<caleb>` `{"role":"user"}` → 409 `self`. With a second admin Alex: Alex demotes Caleb → works; then Caleb, now a member, can't reach the route (403).

**TC-004 — The race.** Two admins, two browsers. Each demotes the other at the same moment (scripted). *Expected:* one 200, one 409 `last_admin`; one admin remains.

**TC-005 — Escalation attempts.** As member: both routes 403. As kid: 403. As admin: `PATCH` a kid's id → 404; `{"role":"kid"}` → 400; `{"role":"admin","email":"x"}` → 400.

**TC-006 — Removing an SSO user.** OIDC on. Remove Jo, who signs in with PocketID. *Expected:* the confirm shows the single sign-on line. After removal Jo's sessions end.

**TC-007 — Invites they made.** Alex makes an invite, then Caleb removes Alex. *Expected:* the invite is gone from Pending invites, and its link shows "This invite link doesn't work anymore."

---

## 6. Data Model

No migration. Everything needed already exists: `users.role` (with its CHECK), the FK cascades on `sessions`, `favorites`, `user_layout`, `user_collapsed_categories`, and `ON DELETE SET NULL` on `invites.created_by` / `used_by`.

Storage additions (`internal/storage/adults.go`, new):

- `RemoveAdult(ctx, actorID, targetID) (User, error)`: under `withAccountLock`; `ErrNotFound` for a non-adult; `ErrSelf`; `ErrLastAdmin`; revokes pending invites with `created_by = target` (Q3); deletes the row.
- `SetAdultRole(ctx, actorID, targetID, role) (old User, changed bool, err error)`: same lock and errors.

Session store addition: `DestroyAllForUser(ctx, userID, except string) (int64, error)` on `session.Store`, `PgStore` and `MemoryStore`, with a contract test in `internal/session/contract_test.go`. `except` is a token to keep, or `""` for none; this spec always passes `""`. SPEC-password-reset-link uses the same method (see the plan's file-ownership map). Removal doesn't need it (cascade), but role change does.

## 7. API Contract

### New, admin-only (`classAdminOnly`)

| Method | Path | Body / result |
|---|---|---|
| PATCH | `/api/admin/accounts/{id}` | `{role}` → `200` account row (same shape as `GET /api/admin/accounts`). 400 bad body; 404 not an adult; 409 `self` or `last_admin`. |
| DELETE | `/api/admin/accounts/{id}` | `204`. 404 not an adult; 409 `self` or `last_admin`. |

409 bodies are JSON, `{"error":"self"}` or `{"error":"last_admin"}`, so the web app can show the right line without parsing text. Both routes go through `router.handle`, and `routes_test.go`'s class table gains them.

### Changed

None in this spec. `GET /api/admin/accounts` already returns what these actions need. SPEC-password-reset-link AC-021 adds `hasPassword` to its rows, for the reset-link item.

## 8. Frontend Implementation

- `src/api.ts`: `setAccountRole(id, role)`, `removeAccount(id)`.
- `src/accounts/AccountsSection.tsx`: adult rows get a row menu (new `AdultRowMenu.tsx`) with the actions in §2. SPEC-password-reset-link adds **Make a reset link** to the same menu; see the plan's file-ownership map.
- `src/app/App.tsx`: one line. `ServicesProvider` gets `onUnauthorized={() => setUser(null)}` for every role, not only kids (AC-016, UX A-5). This spec owns the line; SPEC-password-reset-link owns the rest of `App.tsx` (plan §2).
- Confirm dialogs use the existing `Modal`. **The final copy is in the UX artifact §3 and supersedes the drafts below.** Drafts (plain, UX may adjust):
  - Remove: "Remove Alex? Alex will be signed out everywhere. Their favorites and settings will be deleted. The apps everyone shares stay as they are." Buttons: **Remove**, **Cancel**.
  - With OIDC on, add: "Alex can still sign in with single sign-on until you remove them there too."
  - Make member: "Make Alex a member? Alex will be signed out and can't change apps or settings after that." Buttons: **Make member**, **Cancel**.
  - Make admin: "Make Jo an admin? Jo will be signed out, then can change apps, settings and accounts." Buttons: **Make admin**, **Cancel**.
  - 409 `last_admin`: "Homepad needs at least one admin."
- Docs: a new `docs/accounts.md` with an "Adults" section (UX §9, decided). `docs/kid-accounts.md` links to it.

## 9. Design (Kare)

UX artifact: [`specs/ux/household-manage-adults-ux.md`](./ux/household-manage-adults-ux.md) (APPROVED 2026-11-20, A-1…A-6 at the recommendations). Surfaces:

1. the adult row menu in Accounts (where it sits next to the kid rows, touch size on iPad);
2. the three confirms, including the OIDC line;
3. the last-admin and self states (no action shown, and the 409 message if a stale screen tries).

## 10. Upgrade and Compatibility

- Additive routes. No migration. Nobody is signed out by the upgrade.
- Must ship in the same release as SPEC-household-catalog-owner, or after it. A build of this spec on a 17.x database would let an admin delete the catalog.
- Release-note line: "Admins can now remove an adult, or make someone an admin or a member, in Administration → Accounts. Homepad always keeps at least one admin."

## 11. Out of Scope

- An adult deleting their own account from My settings.
- Removing an adult at the identity provider, or a SCIM-style sync.
- Moving a kid between adults (there is no such link).
- An audit table or an audit screen.
- Changing an adult's email or name as an admin.

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Approved 2026-11-20: all §0 questions decided |
| Product | Walt | Pending |
| Design | Kare | Approved 2026-11-20 (`specs/ux/household-manage-adults-ux.md`, A-1…A-6) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-19 | 0.1.0 | Draft for 18.0.0, checked against `homepad-api` `79e3b03` and `homepad` `6eb8a35`. |
| 2026-11-20 | 0.1.1 | UX artifact approved (A-1…A-6). AC-016: adults go to the sign-in screen on a 401 (A-5), with the `App.tsx` line in §8. AC-007 and AC-010 point at the UX. Docs home is `docs/accounts.md`. |
| 2026-11-22 | 0.1.2 | Marked SHIPPED (18.0.0). §1b records Q1–Q5 in place of the stale "Pending" line (#593). |
