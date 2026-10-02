# Spec: the favorite ★ is only selectable in Arrange mode

**Status:** APPROVED 2026-10-01 — requested by Caleb; the admin/personal question
answered by him the same day (§3). Kare §9 not authored; §3.2 is a product call
on an indicator-vs-control split, flagged for review rather than deferred.

**Supersedes:** `SPEC-density-to-my-settings` **AC-008** ("admin-only") and
**TC-006** ("a non-admin sees Add apps but no Arrange apps"). Those are reversed
here deliberately, not forgotten — see §3.1. Two existing tests assert the old
behaviour and are updated by this spec's change, not deleted.

---

## 1. Problem

The favorite ★ on every tile is live at all times. It sits in the tile's
top-right corner, inside the tile's own hit area, and a single tap toggles a
favorite immediately. While browsing — the overwhelmingly common mode — the star
is a control nobody is deliberately aiming at, and hitting it instead of the app
is both easy and silently destructive: an unfavorite loses a user's own curation
with no undo and no confirmation.

Caleb's request, 2026-10-01: *"The favorite star in homepad should only be
selectable when in edit mode."*

## 2. Current state (code-confirmed 2026-10-01)

### 2.1 The star

`src/grid/AppGrid.tsx` ~1316 renders the ★ as a `<button>` with
`data-testid="tile-favorite"`, a sibling of the tile `<a>`. **It is inside no
gate at all** — every user sees an interactive star on every tile in every mode.

### 2.2 Arrange mode is admin-only

- `AppGrid.tsx:398` — `const editing = isAdmin && editMode;`
- `AppHeader.tsx:222` — the "Arrange apps" menu item is wrapped in `{isAdmin && …}`

So there is exactly one mode flag, and non-admins can never enter it. A naive
"gate the star on edit mode" would therefore remove favoriting from every
non-admin user outright.

### 2.3 Favorites are per-user — the backend is the authority

`requireAdmin` in `homepad-api/internal/api/library.go:43` is applied per handler.
Reading the handlers rather than inferring from the UI:

| operation | endpoint | `requireAdmin` | scope |
|---|---|---|---|
| favorite / unfavorite | `POST`/`DELETE /api/favorites/{id}` | no | **per-user** |
| tile order | `PUT /api/layout` (in `favorites.go`) | no | **per-user** |
| category order | `PUT /api/categories/order` | **yes** | shared catalog |
| category create / rename / delete | `/api/categories*` | **yes** | shared catalog |
| tile edit | `PATCH /api/services/{id}` | **yes** | shared catalog |

`shared_catalog_test.go:77` (`TestSharedCatalog_FavoritesRemainPerUser`) and
`favorites_test.go:68` (`TestPersonalSortOrderPersistsAcrossSessions`) assert the
first two rows directly.

### 2.4 What `editing` currently gates

One flag drives both personal and shared-catalog affordances — which is exactly
the boundary OQ-3 flagged and left open:

| affordance | line | class |
|---|---|---|
| box (category) drag-reorder | 427 | **shared** — server 403s a non-admin |
| `canManage` → category rename / delete / width | 552 | **shared** |
| tile edit pencil | 1336 | **shared** |
| tile drag-reorder within a box | 741 | personal (`PUT /api/layout`) |
| `is-editing` styling hooks | 422, 1245 | presentation |

## 3. Decisions (Caleb, 2026-10-01)

### 3.1 Arrange mode opens to every user

Gating the star on today's admin-only mode would have cost every non-admin the
ability to favorite anything — a per-user feature the backend explicitly
supports. So "Arrange apps" becomes visible to all users, and the star is gated
on *that*.

This requires splitting the single flag in two, because a non-admin must not
receive shared-catalog affordances:

- **`arranging`** = `editMode` — any user. Gates the ★.
- **`editing`** = `isAdmin && editMode` — unchanged. Keeps gating box drag,
  `canManage`, and the pencil.

Without the split, a non-admin in arrange mode would be handed a category drag
that the server rejects with 403 — a control that appears to work and then
silently fails.

### 3.2 Outside arrange mode the star still *shows*, it just does not *act*

The ★ does two jobs: it **indicates** that a tile is a favorite, and it
**controls** that state. Only the control is being withdrawn.

So, outside arrange mode: a favorited tile keeps a **non-interactive** ★, and an
unfavorited tile renders **nothing**. An inert ☆ on every unfavorited tile would
be a dead control — worse than the problem this spec fixes.

This is the one judgement call here and it is flagged for review rather than
asserted as obvious.

### 3.3 Out of scope

Per-user **tile drag-reorder** for non-admins is NOT part of this change, even
though `PUT /api/layout` already supports it per-user and §2.4 shows the UI
currently reaches it only via the admin flag. That is a real adjacent gap and is
recorded here as a follow-up, not smuggled in: this spec was asked for about the
star.

The consequence is acknowledged: for a non-admin, "Arrange apps" currently
enables only the star. The label over-promises for that role until the follow-up
lands.

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | Outside arrange mode, no tile exposes an **interactive** favorite control. There is no element a click, tap, or keyboard activation can use to toggle a favorite. | Must |
| AC-002 | Outside arrange mode, a **favorited** tile still renders a visible ★ carrying its state to assistive tech. It is not a `button`, has no `onClick`, and is not in the tab order. | Must |
| AC-003 | Outside arrange mode, an **unfavorited** tile renders no favorite element at all — no inert ☆, no zero-opacity ghost, no reserved gap. | Must |
| AC-004 | Inside arrange mode, the star is a `<button>` behaving exactly as it does today: `aria-pressed`, the existing `aria-label` pair, keyboard operable, and `onToggleFavorite` on activation. | Must |
| AC-005 | "Arrange apps" in the gear menu is visible to **every** authenticated user, keeping its `role="menuitemcheckbox"`, `aria-checked`, trailing ✓, and `data-testid="gear-edit-dashboard"`. | Must |
| AC-006 | A **non-admin** in arrange mode receives **no** shared-catalog affordance: no tile-edit pencil, no category rename / delete / width control, no box drag-reorder. | Must |
| AC-007 | An **admin** in arrange mode sees exactly what they see today, plus the unchanged star behaviour of AC-004. Nothing an admin can currently do is withdrawn. | Must |
| AC-008 | Toggling a favorite inside arrange mode does not navigate the tile link. The existing `preventDefault`/`stopPropagation` behaviour is retained. | Must |
| AC-009 | `data-testid="tile-favorite"` continues to identify the interactive control in arrange mode, so the existing favorite suites keep their handle. | Should |
| AC-010 | The non-interactive indicator of AC-002 is separately addressable for tests (`data-testid="tile-favorite-indicator"`), so "visible but inert" is assertable rather than inferred from the absence of a button. | Should |

## 5. User Test Cases

### TC-001: The star cannot be hit while browsing
**Precondition:** logged in, not in arrange mode, at least one favorited and one unfavorited tile.
**Steps:** try to click the ★ on the favorited tile; try to tab to it.
**Expected:** nothing toggles; the favorite count is unchanged; focus never lands on a favorite control. The ★ is still visibly there on the favorited tile.

### TC-002: A favorite is still legible while browsing
**Precondition:** as TC-001.
**Steps:** compare the favorited and unfavorited tiles.
**Expected:** the favorited tile shows ★; the unfavorited tile shows no star-shaped element at all.

### TC-003: Arrange mode restores the control
**Precondition:** logged in.
**Steps:** gear → Arrange apps. Click the star on a tile. Click it again.
**Expected:** it toggles on, then off, exactly as before, and the tile link never navigates.

### TC-004: A non-admin can curate their own favorites
**Precondition:** logged in as a **non-admin**.
**Steps:** open the gear menu.
**Expected:** "Arrange apps" is present. Entering it makes the stars operable; favoriting persists across a reload.

### TC-005: A non-admin gets no admin powers from arrange mode
**Precondition:** logged in as a **non-admin**, in arrange mode.
**Steps:** inspect a tile and a category box.
**Expected:** no pencil on any tile; no rename, delete or width control on any box; boxes cannot be dragged.

### TC-006: An admin loses nothing
**Precondition:** logged in as **admin**, in arrange mode.
**Steps:** exercise pencil, category rename/delete/width, box drag, tile drag.
**Expected:** all behave as before.

## 6. Notes

- No API change. No migration. Entirely a render-gating change plus one menu
  visibility change.
- `editMode` remains a single piece of session state; this spec adds a second
  *derived* flag, not a second mode.
