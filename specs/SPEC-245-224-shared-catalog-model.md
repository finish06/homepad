# SPEC — #245 + #224: Shared Catalog Model (Admin-Managed Reads, Admin-Gated Writes)

**Spec ID:** SPEC-245-224-shared-catalog-model
**Date:** 2026-07-02
**Author:** Walt (product lead)
**Status:** Ready for Stitch — backend-only policy change; no UI-bearing changes (no Kare co-sign required)
**Repos:** `Code/homepad-api` (primary) + `Code/homepad` (minor copy update)
**Issues:** #245 (non-admin empty grid), #224 (write gate missing)
**Caleb's directive:** "All users see the shared, admin-managed set of categories/services. Writes are admin-only."

---

## 1. Problem

Two bugs shipped together under homepad v9's per-user dashboard model:

**Bug #245 — Non-admin users get an empty App Grid.**
`GET /api/categories` and `GET /api/services` both filter by the caller's `user_id`. Since non-admin users have no categories or services assigned to them in the DB (the admin's catalog is owned by the admin's user row), a non-admin logs in and sees a completely empty dashboard. There is nothing to launch.

**Bug #224 — Any user can create/rename/delete categories and services.**
`POST /api/categories`, `PATCH /api/categories/:id`, `DELETE /api/categories/:id`, `PUT /api/categories/order`, and the equivalent service write endpoints (`POST /api/services`, `PATCH /api/services/:id`, `DELETE /api/services/:id`) have no admin gate. Any logged-in user can modify the shared catalog structure.

These two bugs pull in opposite directions — #245 non-admins see nothing, #224 anyone can write — but they share a root cause: the v9 per-user scoping model was implemented without completing the read-side (shared catalog for reads) and write-side (admin gate for writes) policy.

**Caleb's directive (2026-07-02):** restore the **shared catalog model** — everyone reads the same admin-managed grid; only admins can change it. This is a policy reversal on the v9 per-user services model.

---

## 2. New model: shared read, admin-managed writes

| Operation | Old behavior (v9 per-user) | New behavior |
|---|---|---|
| `GET /api/categories` | Returns caller's own categories (→ empty for non-admins) | Returns the shared catalog categories (admin-owned rows), ordered by `sort_index` |
| `GET /api/services` | Returns caller's own services (→ empty for non-admins) | Returns the shared catalog services (admin-owned rows), with caller's favorites and live Gatus status |
| `POST /api/categories` | Any authenticated user can create (no admin gate) | **Admin only** — 403 if `role != 'admin'` |
| `PATCH /api/categories/:id` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `DELETE /api/categories/:id` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `PUT /api/categories/order` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `POST /api/services` | Any authenticated user | **Admin only** — 403 if not admin |
| `PATCH /api/services/:id` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `DELETE /api/services/:id` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `POST/DELETE /api/services/:id/icon` | Owner-scoped, no admin gate | **Admin only** — 403 if not admin |
| `GET/PUT /api/favorites/:id` | Per-user — **unchanged** | Per-user — unchanged |
| `GET/PUT /api/me/collapsed-categories` | Per-user — unchanged | Per-user — unchanged (collapse state is personal; the categories being collapsed come from the shared set) |
| `GET /api/library` | Admin-curated library — unchanged | Unchanged |

---

## 3. Reconciliation with SPEC-app-grid §3C

`SPEC-app-grid.md §3C` ("Multi-tenant compatibility") states: "The tools (links) inside each box are **per-user** — each user sees their own services for that category."

**This spec supersedes §3C and AC-025 of SPEC-app-grid.** Caleb's directive (2026-07-02) resolves the policy: services are **shared and admin-managed**, not per-user. Every user sees the same service tiles. Per-user library copying (`POST /api/library/:id/add`) is superseded as the mechanism for populating a user's grid — the shared set IS the grid.

The existing App Library (`GET /api/library`, `POST /api/library/:id/add`) may be retained as an admin tool for browsing candidates, but the "copy to my personal dashboard" path no longer drives what users see. This is a **product model change**, not a bug fix — Caleb explicitly requested it.

**Impact on Amendment A1:** AC-001-A1 and the tile layout mechanics are unaffected. Only the data scoping changes. The frontend renders tools from `GET /api/services`; the URL and shape of that endpoint are unchanged — only the filtering (shared vs. per-user) changes.

---

## 4. Backend implementation (homepad-api)

### 4.1 Read endpoints — remove user_id filter, use shared set

**`GET /api/categories` (`internal/api/categories.go` → `handleListCategories`)**
- Old query: `SELECT … FROM categories WHERE user_id = $1 ORDER BY sort_index`
- New query: `SELECT … FROM categories ORDER BY sort_index`
- No user_id parameter. Return ALL categories in sort_index order (the admin's set, which is the shared set).
- Session gate unchanged (still requires authenticated user — 401 if not logged in).
- `store.ListCategories(ctx, u.ID)` → `store.ListCategories(ctx)` (remove userID arg; update storage method).

**`GET /api/services` (`internal/api/services.go` → `handleListServices`)**
- Old query: services filtered by `user_id = caller`
- New query: ALL services (no user_id filter), decorated with caller's favorites + Gatus snapshot
- Favorites remain per-user: `store.FavoriteIDs(ctx, u.ID)` is unchanged — favorites are looked up per-caller and stamped onto the shared service rows
- `store.ListServices(ctx, u.ID)` → `store.ListServices(ctx)` (remove userID arg; update storage method)

### 4.2 Write endpoints — add admin gate (403 if not admin)

For every write endpoint listed in §2 as "Admin only", add this check immediately after `currentUser` succeeds:

```go
if u.Role != "admin" {
    http.Error(w, "forbidden", http.StatusForbidden)
    return
}
```

Apply to:
- `handleCreateCategory`
- `handleUpdateCategory`
- `handleDeleteCategory`
- `handleSetCategoryOrder`
- `handleCreateService`
- `handleUpdateService`
- `handleDeleteService`
- `handleUploadIcon` / `handleDeleteIcon`

### 4.3 Storage layer updates

The `ListCategories` and `ListServices` storage methods currently take a `userID string` parameter and scope queries to it. Update both:

- Remove the `userID` parameter
- Remove `WHERE user_id = $1` from the SELECT
- Update all call sites in `api/` to match

No other storage methods change. Create/Rename/Delete operations still write a `user_id` (the admin performing the action — this is fine, the column is NOT NULL). The admin's `user_id` becomes the "owner" of shared rows, but reads no longer filter by it.

### 4.4 No migration required

The DB schema is unchanged. `user_id` columns on `categories` and `services` remain as-is. The admin's rows (which were already assigned during migration 0007) ARE the shared set. No data movement needed.

---

## 5. Data decisions flagged for Caleb

These require explicit Caleb resolution before or during the build. Stitch should flag them in the PR if they're not resolved first.

### Decision D-1: What happens to non-admin-created categories/services under #224?

Under the #224 bug, any user could create their own categories and services. If any non-admin users did so, those rows exist in the DB with `user_id = <non-admin-id>`. Under the new model, `GET /api/categories` and `GET /api/services` return ALL rows (no user_id filter). This means non-admin-created categories/services would appear in the shared grid for everyone.

**Walt's recommendation:** Add a `WHERE user_id = (SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1)` filter to reads — returning only the FIRST admin's set as the shared catalog — rather than returning all rows with no filter. This prevents non-admin-created junk from polluting the shared grid.

**Alternative:** Return all rows (no filter). Clean is: if non-admin rows exist they surface; admin can delete them. This is simpler to implement.

**Caleb: please confirm which approach.** Walt defaults to the "first admin's set" filter unless Caleb says otherwise.

### Decision D-2: Favorites pointing at non-admin services

If a non-admin user favorited a service they owned (under #224), and that service is now invisible (not in the shared set), their favorite FK exists but points to a row that won't be returned. The favorites query (`FavoriteIDs`) returns IDs; those IDs won't appear in the service list, so the orphan favorite is harmless (never rendered). No action needed unless Caleb wants a DB cleanup.

**Walt's recommendation:** Leave orphan favorites as-is. No migration. The data decays naturally (favorites for absent services are never rendered; if the shared-catalog admin later adds the same service, the favorite won't auto-reconnect — new service, new ID).

### Decision D-3: Collapse state for non-admin categories

Per-user collapse state (`me/collapsed-categories`) is keyed by category ID. Non-admin users have no collapse rows (they never had their own categories). Under the new model, they see the shared categories and can collapse them (per-user collapse is still valuable). This works correctly as-is — no changes needed to the collapse feature.

---

## 6. Frontend changes (homepad, minor)

The React frontend (`Code/homepad`) requires **no structural changes** — it already reads from `GET /api/categories` and `GET /api/services` and gates admin UI by `isAdmin` prop. The API returning the shared set transparently populates the grid for all users.

**One copy update required:**

In `Catalog.tsx`, the edit-mode banner currently reads (from v11): `"Editing your personal dashboard"`. Under the shared model, an admin is editing the **shared catalog** that all users see — not their personal dashboard. Update the banner copy to something like `"Editing the shared catalog — changes affect all users"`.

This is a product copy change, not a UI-bearing visual change. No Kare co-sign needed for this line of copy, but if the App Grid has its own edit-mode indicator, apply the same shared-catalog framing there.

---

## 7. Acceptance criteria

Testable against the staging API and UI.

**Read behavior**

| AC | Criterion |
|---|---|
| AC-001 | A non-admin user logging in sees the same categories as the admin — not an empty grid. |
| AC-002 | A non-admin user sees the same service tiles as the admin (the shared catalog). |
| AC-003 | `GET /api/categories` returns the same list regardless of which authenticated user calls it (admin or non-admin). |
| AC-004 | `GET /api/services` returns the same service list to all authenticated users. The `favorite` field reflects the CALLING user's favorites (per-user), not the admin's. |

**Write behavior (admin gate)**

| AC | Criterion |
|---|---|
| AC-005 | A non-admin calling `POST /api/categories` receives `403 Forbidden`. |
| AC-006 | A non-admin calling `PATCH /api/categories/:id` receives `403 Forbidden`. |
| AC-007 | A non-admin calling `DELETE /api/categories/:id` receives `403 Forbidden`. |
| AC-008 | A non-admin calling `PUT /api/categories/order` receives `403 Forbidden`. |
| AC-009 | A non-admin calling `POST /api/services` receives `403 Forbidden`. |
| AC-010 | A non-admin calling `PATCH /api/services/:id` receives `403 Forbidden`. |
| AC-011 | A non-admin calling `DELETE /api/services/:id` receives `403 Forbidden`. |
| AC-012 | An admin can still create, rename, reorder, and delete categories and services (existing admin behavior unchanged). |

**Favorites (unchanged)**

| AC | Criterion |
|---|---|
| AC-013 | User A favoriting a service does not affect User B's favorites. Favorites remain per-user. |
| AC-014 | `GET /api/services` returns `favorite: true` for services the CALLING user has favorited, regardless of whether another user has the same service favorited. |

**Collapse state (unchanged)**

| AC | Criterion |
|---|---|
| AC-015 | Collapse state is still per-user. User A collapsing the "Media" box does not collapse it for User B. |

**Tests**

| AC | Criterion |
|---|---|
| AC-016 | `go test ./...` passes green after all changes. |
| AC-017 | New tests cover: non-admin read sees shared categories (AC-001–AC-004), non-admin write gets 403 (AC-005–AC-011), admin write still works (AC-012), favorites remain per-user (AC-013–AC-014). |

---

## 8. Out of scope

- Library (`GET /api/library`, `POST /api/library/:id/add`) — unchanged
- Favorites endpoints — unchanged
- Collapse endpoints — unchanged
- OIDC / auth flows — unchanged
- Any homepad frontend structural changes beyond the one copy update in §6
- Per-user width preferences for App Grid boxes (already out of scope per SPEC-app-grid §4C)

---

## 9. Walt approval

**Walt — APPROVED** (policy change confirmed by Caleb 2026-07-02; no Kare co-sign required — no visual changes)

Stitch: build `homepad-api` first (backend policy), then validate with the homepad frontend. Resolve D-1 (§5) by flagging in the PR if Caleb hasn't confirmed — the implementation choice affects what the DB query looks like.
