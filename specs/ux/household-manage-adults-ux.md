# UX: Manage adults

**Spec:** [`SPEC-household-manage-adults.md`](../SPEC-household-manage-adults.md) §9 (v0.1.0, Approved 2026-11-20)
**Author:** Claude for Kare (design), drafted 2026-11-20
**Status:** Draft — awaiting Caleb.

This doc designs the three surfaces in spec §9. Everything else reuses what exists: the Accounts section (`AccountsSection`), the `Modal` shell, the Revoke confirm's `alertdialog` pattern (`PendingInvites.tsx`), and the user menu's keyboard model (`UserMenu.tsx`).

Checked against `homepad` `gitea/main` `ad3d0fe`, which has the household-basics web half (#565) in it.

---

## 1. Where it lives

```
Account menu (admin) → Administration → Accounts
  ACCOUNTS                       [+ Add an adult]  [+ Add a kid]
    ├─ account list
    │    ├─ your own row          (no actions, as today)
    │    ├─ other adult rows      ← NEW: Manage ▾ menu
    │    └─ kid rows              (unchanged: the whole row opens the kid editor)
    └─ PENDING INVITES            (unchanged)
```

- **Each other adult's row gets one menu button, "Manage ▾".** Kid rows keep "Edit ›". Adults and kids are different, so the two affordances look different.
- **The menu holds every adult action.** That is the role change and Remove now. SPEC-password-reset-link adds **Make a reset link** to the same menu.
- Nothing new goes in the account menu or My settings.

**Bundle.** All of this rides in the Admin Panel chunk, which `App.tsx` already loads with `lazy()`. The confirm dialog loads with its own `lazy(() => import('./AdultConfirm'))` from `AdultRowMenu`, the same way `BackupSection` loads `RestoreModal`. The entry chunk gains 0 bytes from this surface. The menu's CSS goes in `household.css`, which is in the lazy admin chunk. `index.css` gets nothing.

## 2. The adult row and its menu

### 2.1 Desktop (Admin Panel, 640px wide, at 1280)

```
┌ Admin Panel ──────────────────────────────────────────────────── ✕ ┐
│ Changes here are global — they affect all users on this homepad.   │
│                                                                    │
│ ACCOUNTS                            [+ Add an adult] [+ Add a kid] │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ ● Caleb       admin    you                                     │ │
│ │ ● Alex        admin    alex@example.com             [Manage ▾] │ │
│ │ ● Jo          member   jo@example.com               [Manage ▾] │ │
│ │ ◉ Sam         kid      12 apps · 1 device               Edit › │ │
│ └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ PENDING INVITES                                                    │
│ ┌────────────────────────────────────────────────────────────────┐ │
│ │ Pat          member   made by Alex · ends Nov 26      [Revoke] │ │
│ └────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

Menu open on Jo's row (a member):

```
│ │ ● Jo          member   jo@example.com               [Manage ▴] │ │
│ │                                          ┌───────────────────┐ │ │
│ │                                          │ Make admin        │ │ │
│ │                                          │ Make a reset link │ │ │   ← SPEC-password-reset-link
│ │                                          │ ───────────────── │ │ │
│ │                                          │ Remove Jo…        │ │ │   ← danger red
│ │                                          └───────────────────┘ │ │
```

On an admin's row (Alex), the first item reads **Make member**.

### 2.2 Phone (390, the panel is 358px wide)

```
┌ Admin Panel ──────────────── ✕ ┐
│ ACCOUNTS                       │
│ [+ Add an adult] [+ Add a kid] │
│ ┌────────────────────────────┐ │
│ │ ● Caleb admin you          │ │
│ │ ● Alex admin a… [Manage ▾] │ │
│ │ ● Jo member  j… [Manage ▾] │ │
│ │ ◉ Sam  kid 12 apps… Edit › │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘

Menu open on Jo:
│ │ ● Jo member  j… [Manage ▴] │ │
│ │       ┌──────────────────┐ │ │
│ │       │ Make admin       │ │ │
│ │       │ Make a reset link│ │ │
│ │       │ ──────────────── │ │ │
│ │       │ Remove Jo…       │ │ │
│ │       └──────────────────┘ │ │
```

- The email truncates first (it already does: `.accounts-summary` has an ellipsis). The name, the role pill and **Manage ▾** never truncate.
- The menu opens under the button, aligned to the button's right edge. If there is no room below, it opens above. It is at least 200px wide.

### 2.3 Rules

- **Which rows get the menu:** every adult row except the signed-in admin's own (spec AC-010, Q1). Your own row stays as today: name, role pill, "you".
- **Menu items, in order:**
  1. **Make admin** (on a member) or **Make member** (on an admin).
  2. **Make a reset link** (SPEC-password-reset-link; only for adults with a password).
  3. A divider, then **Remove {name}…** in the danger colour.
- Every item opens a confirm (§3). Nothing happens straight from the menu.
- **Touch size.** The button and each item are at least 44px tall. The row is already 48px. On iPad the menu is the same popover; it isn't a bottom sheet.
- **States**
  - Loading and error: the list shows its skeleton or its "Couldn't load accounts. Retry" line, as today. There are no menus until the list is ready.
  - Only you and kids: no adult has a menu. Nothing else changes.
  - Kid rows don't change (AC-015).

## 3. The three confirms

Each is a small `Modal` with `role="alertdialog"`, the same card as "Revoke Jordan's invite?". Focus starts on **Cancel**, the safe choice. The primary button names the action, never "Confirm".

### 3.1 Remove

```
┌──────────────────────────────────────────────────────┐
│  Remove Alex?                                        │
│                                                      │
│  Alex will be signed out everywhere. Their           │
│  favorites and settings will be deleted. The apps    │
│  everyone shares stay as they are.                   │
│                                                      │
│  Alex's 1 pending invite will stop working.          │   ← only if they made one
│                                                      │
│  If Alex uses single sign-on, they can sign in       │   ← only when SSO is on
│  again that way. To stop that, remove them in your   │
│  identity provider too.                              │
│                                                      │
│                       [Cancel]   [Remove Alex]       │
└──────────────────────────────────────────────────────┘
```

- **Title:** "Remove Alex?"
- **Body:** "Alex will be signed out everywhere. Their favorites and settings will be deleted. The apps everyone shares stay as they are."
- **Invites line** (Q3, AC-004). It shows only when Alex made pending invites; the count comes from the Pending invites list already on screen (`createdBy.id`).
  - One: "Alex's 1 pending invite will stop working."
  - More: "Alex's 3 pending invites will stop working."
- **Single sign-on line** (Q4, AC-012). It shows when `oidcEnabled` is true: "If Alex uses single sign-on, they can sign in again that way. To stop that, remove them in your identity provider too." Homepad can't tell which adults use single sign-on, so it shows for every adult while SSO is on (A-4).
- **Buttons:** [Cancel] [Remove Alex]. Remove uses the danger style (`settings-danger-btn`). While it runs it reads "Removing…" and both buttons are disabled.
- **Success:** the dialog closes. The row leaves the list, and so do Alex's invites under Pending invites. A polite live region says "Alex was removed."

### 3.2 Make member

```
┌──────────────────────────────────────────────────────┐
│  Make Alex a member?                                 │
│                                                      │
│  Alex will be signed out on every device. After      │
│  that, Alex can't change apps, settings or accounts. │
│                                                      │
│                       [Cancel]   [Make member]       │
└──────────────────────────────────────────────────────┘
```

- **Title:** "Make Alex a member?"
- **Body:** "Alex will be signed out on every device. After that, Alex can't change apps, settings or accounts."
- **Buttons:** [Cancel] [Make member] (primary style; nothing is deleted). Busy: "Saving…".
- **Success:** the row's pill changes to "member" in place, and the menu's first item becomes **Make admin**. Live region: "Alex is now a member."

### 3.3 Make admin

```
┌──────────────────────────────────────────────────────┐
│  Make Jo an admin?                                   │
│                                                      │
│  Jo will be signed out on every device. After        │
│  signing in again, Jo can change apps, settings and  │
│  accounts.                                           │
│                                                      │
│  Admins can do everything you can, including         │   ← amber
│  inviting other admins.                              │
│                                                      │
│                       [Cancel]   [Make admin]        │
└──────────────────────────────────────────────────────┘
```

- **Title:** "Make Jo an admin?"
- **Body:** "Jo will be signed out on every device. After signing in again, Jo can change apps, settings and accounts."
- **Amber line:** "Admins can do everything you can, including inviting other admins." It's the same line and style as Add an adult (`.add-adult-warn`).
- **Buttons:** [Cancel] [Make admin]. Busy: "Saving…".
- **Success:** the pill reads "admin", and the first item becomes **Make member**. Live region: "Jo is now an admin."

### 3.4 Errors inside a confirm

The dialog stays open. One line in the error colour, `role="alert"`, sits above the buttons.

| Answer | Line | Then |
|---|---|---|
| 409 `last_admin` | Homepad needs at least one admin. | The primary button is disabled. Cancel reads **Close**. Closing reloads the list. |
| 409 `self` | You can't change your own account here. Ask another admin. | As above. |
| 404 | Alex isn't in Homepad anymore. | As above. The reload drops the row. |
| 401 | You were signed out. Reload the page to sign in again. | One button, **Reload**. |
| network or anything else | Couldn't remove Alex. Try again. / Couldn't change Alex's role. Try again. | Both buttons stay enabled. |

- `last_admin` and `self` only reach the screen from a stale list or a race (TC-003, TC-004). The menu never offers them on purpose, because your own row has no menu.
- **401** happens when another admin just changed *your* role or removed you: Q2 ends your sessions.

## 4. The last-admin and self states

```
Only one admin (Caleb), signed in as Caleb:

│ ● Caleb       admin    you                                     │   ← no menu
│ ● Jo          member   jo@example.com               [Manage ▾] │   ← Make admin, reset link, Remove
```

- **Your own row has no menu** (Q1, AC-005, AC-010). This is the whole design of the self rule. Nothing is greyed out, so there is nothing to explain.
- **The last admin is safe by construction.** Only admins see menus. An admin never sees their own menu. So the only admin can't be offered Make member or Remove. The 409 message in §3.4 covers races.
- **Two admins:** each sees **Make member** and **Remove** on the other (TC-003). If both act at the same moment, one confirm succeeds. The other gets "Homepad needs at least one admin." or, because its own session just ended, the 401 line.

## 5. What the changed person sees

- **Removed, or role changed:** their sessions end (AC-007, AC-008). Their next request gets 401, and the app shows the normal sign-in screen. There is no special copy. The person who did it is in the same household and can explain.
- **Conflict with today's web app (A-5).** Today only kid devices go to the sign-in screen on a 401 (`App.tsx`: `onUnauthorized={user.role === 'kid' ? … : undefined}`). Adults keep v13's quiet stop: polling ends and the dashboard stays on screen. Spec AC-007 and TC-001/TC-002 say the adult's open tab "shows the sign-in screen on its next poll", which today's app doesn't do. The fix is one line: pass `onUnauthorized` for every role. It's in the entry chunk but costs only a few bytes. It isn't in the plan's file map for this spec (§2 gives `App.tsx` to SPEC-password-reset-link), so it needs an owner.

## 6. Accessibility and copy

- **Menu button:** `<button aria-haspopup="menu" aria-expanded aria-label="Manage Alex">`. The visible text is "Manage", so the label starts with it (WCAG 2.5.3).
- **Menu:** `role="menu"`, labelled by the button. Items are `role="menuitem"`. The keyboard model is the one `UserMenu` uses:
  - Enter, Space or ↓ on the button opens the menu, with focus on the first item. ↑ opens it with focus on the last.
  - ↑ and ↓ move and wrap. Home and End jump to the first and last item.
  - Enter or Space chooses.
  - Escape closes the menu and returns focus to the button. It stops there, so the Admin Panel doesn't close too (one press, one layer).
  - Tab closes the menu and moves on.
  - A click outside closes it.
- **The divider** is `role="separator"`. "Remove Alex…" carries the ellipsis because it opens a dialog.
- **Confirms:** `role="alertdialog"` with `aria-labelledby` (the title) and `aria-describedby` (the first body paragraph). Tab is trapped (`trapTab`). Escape is Cancel, and it stops there.
- **Focus after a confirm closes**
  - Cancel: back to that row's **Manage** button.
  - Role change done: back to the same button. The row stays.
  - Remove done: to the next row's **Manage** button. If there isn't one, to the previous row's. If no adult rows are left, to **+ Add an adult**.
- **Live region:** one polite `role="status"` in the section, for the three success lines.
- **Tab order in the section:** + Add an adult → + Add a kid → each row in list order (Manage on adult rows, the whole row on kid rows) → each Revoke.
- **Copy:** roles are "admin" and "member", never "user". Say "remove", never "delete account" (favorites and settings *are* deleted, and the body says so). Every user-facing string in this doc is final copy.

## 7. Acceptance criteria covered

| Screen | ACs |
|---|---|
| §2 row menu | AC-010 (menu on every adult row but your own), AC-015 (kid rows unchanged) |
| §3.1 Remove confirm | AC-001, AC-004 (invites line, list update), AC-010 (asks first), AC-012 (SSO line), AC-014 (the limit message goes away on the next add) |
| §3.2–3.3 role confirms | AC-006, AC-008 (the "signed out" line), AC-010 |
| §3.4 errors | AC-003 (404 line), AC-005 (`self`), AC-009 (`last_admin`) |
| §4 self and last admin | AC-005, AC-009, AC-010 |
| §5 changed person | AC-007, AC-008 (needs A-5) |

AC-002, AC-011 and AC-013 have no UI.

## 8. Screenshot checkpoints (for TC-001…TC-007)

1. Accounts with you (admin), a second admin, a member, a kid and a pending invite, at 1280 and 390, light and dark.
2. The menu open on a member's row and on an admin's row, at 820 (iPad portrait) and 390.
3. The Remove confirm with the invites line and the SSO line, at 390.
4. Make admin with the amber line, at 1280.
5. The `last_admin` error inside a confirm, at 390.
6. A removed adult's other tab on the sign-in screen (after A-5), at 390.

## 9. Docs

Spec §8 leaves the home to UX. **Recommended: a new `docs/accounts.md`**, as the plan's file map already says. It gets an "Adults" section (who can remove or change whom, the one-admin rule, what removal deletes, the SSO caveat). SPEC-password-reset-link adds "Forgotten passwords" after it. `docs/kid-accounts.md` links to it.

## 10. Decisions for Caleb

- **A-1: The trigger is "Manage ▾" text.** A "⋯" icon is the alternative. Kid rows already say "Edit ›" in words, and a text button is easier to find on a touch screen. **Recommended: "Manage ▾".**
- **A-2: A menu, or buttons in the row.** With three actions (two before the reset link lands), buttons crowd the row at 390. **Recommended: a menu.**
- **A-3: Your own row gets no hint.** The alternative is a line such as "Another admin can change your account." The rule rarely matters, and a line on every visit is noise. **Recommended: no hint.**
- **A-4: The SSO line shows for every adult while SSO is on.** The list doesn't say who uses single sign-on, and an adult with a password can also use SSO with the same email. The line is a caution, so showing it too often is the safe side. **Recommended: as the spec says, whenever `oidcEnabled`.**
- **A-5: Adults go to the sign-in screen on a 401.** This is a conflict between the spec and today's app (§5). **Recommended: pass `onUnauthorized` for every role, owned by this spec, as a one-line `App.tsx` change coordinated with SPEC-password-reset-link.** The alternative is to reword AC-007 and the TCs to "the next action fails", which leaves a removed adult looking at a live-looking dashboard.
- **A-6: Make admin asks first.** The spec lists three confirms. Promoting isn't destructive, but it signs the person out, so asking is fair. **Recommended: ask, as the spec says.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-20 (Claude for Kare) |
| Product | Caleb | Pending (A-1…A-6) |
