# Spec: QA and test reliability cleanup for 18.5.0

**Spec ID:** SPEC-qa-cleanup-18.5.0
**Version:** 0.1.0
**Created:** 2026-11-24
**Author:** Claude (orchestrated 18.5.0 feature work, "QA and test reliability")
**Status:** SHIPPED — 18.5.0 (2026-11-24): #709, release #710. Status line read "In review" until 2026-11-25.
**Repo:** `Code/homepad` (`api/`, `.gitea/workflows/`, `tests/`, `docs/`)
**Issues:** #540, #552, #553, #567, #578, #591, #606, #607, #610
**Target version:** 18.5.0

---

## 1. Overview

Nine open issues. Most are QA advisories: a check QA could not run on staging, or a guard that would make a failure easier to read. This spec settles each one with a test or a small change. There are no database changes.

## 2. What the code already does (checked at `eadecf0`, 18.4.0)

### 2.1 #591 — deleting an adult account

#591 was filed on 2026-11-21 against `2a46451` (17.1.0). At that commit there was no adult delete route. **18.0.0 added it** (SPEC-household-manage-adults):

- `DELETE /api/admin/accounts/{id}` → 204 (`api/internal/api/adults.go`, `handleRemoveAdult`). It is `classAdminOnly`: no session 401, member 403, kid 403.
- Accounts → an adult's **Manage ▾** → **Remove <name>…** opens a confirm named after the person ("Remove Alex?").
- An admin can't remove themselves (409 `self`). The last admin can't be removed (409 `last_admin`). Both are checked in one transaction under the account lock (`storage.RemoveAdult`).
- Their pending invites and the live reset links they made are revoked.

What a removed adult owns, and what happens to it (every foreign key to `users`, read from the migrations):

| Table / column | On delete | Meaning |
|---|---|---|
| `sessions.user_id` | CASCADE | Signed out everywhere at once |
| `password_resets.user_id` | CASCADE | Reset links made **for** them go |
| `favorites.user_id`, `user_layout.user_id`, `user_collapsed_categories.user_id` | CASCADE | Their own favorites, order and folded sections |
| `kid_allowed_services.user_id` | CASCADE | Only ever a kid's row; an adult has none |
| `invites.created_by`, `invites.used_by` | SET NULL | History kept; pending ones are revoked first |
| `password_resets.created_by` | SET NULL | Live ones they made are revoked first |
| `server_settings.updated_by`, `system_settings.status_degraded_updated_by` | SET NULL | "Saved by" shows no name |

- **No shared data cascades.** The catalog has no owner column since 18.0.0 (migration 0021 dropped `services.user_id` and `categories.user_id`).
- **Kids are not touched.** No column links a kid to an adult.
- **SSO links:** Homepad keeps no OIDC link table. An SSO sign-in finds the account by verified email, so nothing is left behind. The confirm already says the person can sign in again through single sign-on (Q4 of that spec).
- **Audit:** log lines only, no table.

So #591 needs no new route, no migration and no UI. This spec adds the tests that were missing (AC-001, AC-002) and closes #591 with that evidence. The UI word stays **Remove**, as SPEC-household-manage-adults decided.

### 2.2 #552, #553, #567 — kid-accounts TC-001 on [mobile]

#570 (2026-11-08) renders the e2e `mobile` project at 1x instead of 3x. The CI runner has no GPU; WebKit painted the blurred glass panels in software, and at 3x one frame took seconds, so Playwright's "stable" check (which waits on animation frames) ran out of time at a different step on every retry. `tests/infra/e2e-mobile-project.test.ts` pins it.

Since then (CI E2E runs 6723 to 7344, 2026-11-20 to 11-24, 60 runs), kid-accounts TC-001 [mobile] has not failed or flaked once. The flaky runs in that window were `perf.spec.ts` [desktop] (4) and `backup-import.spec.ts` TC-008 [mobile] (1, run 7106).

Measured for this spec in the CI image (`mcr.microsoft.com/playwright:v1.60.0-noble`, Docker on a Mac, no GPU), `--retries=0`, at `eadecf0`:

| Run | Result |
|---|---|
| TC-001 [mobile] as configured (1x), `--repeat-each=20` | 20 passed |
| kid-accounts.spec.ts [mobile] (1x), `--repeat-each=30` | 60 passed (TC-001 30 of 30) |
| Control: TC-001 on the iPhone 13 at its own 3x, `--repeat-each=10` | 10 failed, each "waiting for element to be visible, enabled and stable" at a different step (lines 25, 32, 42) |

The control reproduces the #567 signature exactly, and the 1x setting removes it. So the cause was the 3x software paint, and the fix in #570 holds: TC-001 [mobile] passed 50 of 50. No `test.fixme` is needed.

## 3. Acceptance criteria

| ID | Issue | Criterion | Priority |
|----|-------|-----------|----------|
| AC-001 | #591 | A Go test removes an adult who has a live reset link made for them. Afterwards the link's lookup answers 404 and no `password_resets` row for them is left. | Must |
| AC-002 | #591 | A Go test reads every foreign key that points at `users` from the migrated database and compares it with the table in §2.1. A new key, or a changed delete rule, fails the test and names the column. | Must |
| AC-003 | #591 | A browser-gate test (mocked API) removes a **member** from Manage ▾. The confirm names the person, the row leaves, and the signed-in admin's own row still has no Manage button. | Must |
| AC-004 | #578 | Every deploy-cmd that sends `Authorization: token $GITEA_READ_TOKEN` first runs `: "${GITEA_READ_TOKEN:?HOMELAB_READ_TOKEN secret not set}"`, before the first curl. An empty or missing secret stops the job with that line. | Must |
| AC-005 | #578 | `scripts/ci/workflows.test.sh` checks AC-004 for every such curl in `.gitea/workflows/`. Action SHA pins are unchanged. No new internal host or address is added anywhere. | Must |
| AC-006 | #567 | `tests/e2e/kid-accounts.spec.ts` TC-001 [mobile] passes 20 of 20 runs with `--repeat-each=20 --retries=0` in the CI image (`mcr.microsoft.com/playwright:v1.60.0-noble`, no GPU). If it does not, the mobile variant is marked `test.fixme` with a comment pointing at #567. | Must |
| AC-007 | #606 | Browser gate: an SSO-only adult (`hasPassword: false`) in Accounts has a Manage menu with no "Make a reset link". Signed in as an SSO-only adult, My settings shows no Password section. | Must |
| AC-008 | #606 | Browser gate: when Change password answers 409 (the account has no password any more), the form shows "This account signs in with single sign-on. It has no password to change here." | Must |
| AC-009 | #607 | Browser gate, on localhost (a secure page): the reset-link dialog shows **Copy link**. Clicking it puts the link on the clipboard and the button reads **Copied**, then **Copy link** again after about 2 seconds. | Must |
| AC-010 | #610 | Browser gate: Admin Panel → System with `HOMEPAD_TRUSTED_PROXIES` empty shows "When this is empty, everyone shares one sign-in limit." under Trusted proxies. With a value set, the line is gone. | Must |
| AC-011 | #610 | Browser gate: a 429 with `Retry-After: 300` shows "Too many tries. Wait 5 minutes and try again." on the sign-in card and in Change password. `Retry-After: 45` shows "Wait a minute". | Must |
| AC-012 | #540 | The M7 weekly tracking table has a Source column. Every row names the getHomepad #26 weekly pull it came from, with its time in UTC. | Must |

## 4. Out of scope

- Renaming **Remove** to **Delete** in Accounts. SPEC-household-manage-adults chose the word.
- `backup-import.spec.ts` TC-008 [mobile] flaked once (run 7106) with the same "not stable" message. It has no issue yet; it is reported, not fixed here.
- Staging changes. Staging stays HTTP with every account on a password; the browser gate covers those paths instead.

## 5. Test plan

- `cd api && go test ./... -count=1 -p 1` against a throwaway Postgres 17.
- Control for AC-002: change one expected delete rule in the test; it fails and names the column.
- Control for AC-005: remove the guard from one deploy-cmd; `workflows.test.sh` fails.
- `npx playwright test -c playwright.gate.config.ts` on the new and changed browser-gate files.
- AC-006: the repeat run in the CI image, and a control run of the same test at the device's 3x scale.
- `npm run lint`, `npx vitest run`.

## 6. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-24 | 0.1.0 | Draft for 18.5.0, checked against `eadecf0`. |
