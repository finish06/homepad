# UX: Password reset link, and changing your own password

**Spec:** [`SPEC-password-reset-link.md`](../SPEC-password-reset-link.md) §9 (v0.1.1, Approved 2026-11-20)
**Author:** Claude for Kare (design), drafted 2026-11-20
**Status:** APPROVED — Caleb, 2026-11-20 (R-1…R-6 at the recommendations).

This doc designs the three surfaces in spec §9. Everything else reuses what exists:
- the adult row menu from the manage-adults UX ([`household-manage-adults-ux.md`](./household-manage-adults-ux.md) §2);
- the invite dialog's link-once view and clipboard fallback (`AddAdultDialog.tsx`, household-basics UX §3.3);
- the Join screen's card and states (`JoinScreen.tsx`, household-basics UX §4);
- the My settings rows (`SettingsPanel.tsx`, personal scope).

Checked against `homepad` `gitea/main` `ad3d0fe`.

---

## 1. Where it lives

```
Accounts → an adult's row → Manage ▾
  ├─ Make admin / Make member          (manage-adults)
  ├─ Make a reset link                 ← NEW: opens the reset-link dialog
  └─ Remove …                          (manage-adults)

/#reset=<token>                        ← NEW: the reset screen, in place of sign-in

My settings
  ├─ DASHBOARD                         (existing rows)
  └─ PASSWORD                          ← NEW: Change password
```

**Bundle.** Nothing here is in the entry chunk except what `App.tsx` needs to notice a `#reset=` link:
- `ResetPasswordScreen` loads with `lazy(() => import('./ResetPasswordScreen'))`, like `JoinScreen`. `App.tsx` gains only the lazy stub and the fragment check. Reuse one fragment reader for `#invite=` and `#reset=`, so the check costs a few dozen bytes.
- `ResetLinkDialog` loads with `lazy()` from `AdultRowMenu`, inside the Admin Panel chunk.
- The Change password form lives in the `SettingsPanel` chunk, which is already lazy.
- Add `ResetPasswordScreen` (and `JoinScreen`, which is missing today) to `LAZY_CHUNKS` in `tests/infra/bundle-budget.test.ts`. Both hang off `App.tsx`, so a stray static import there would land in the entry chunk.
- No new CSS goes in `index.css`. The reset screen uses the auth card classes. The dialog uses the `household.css` classes. The form uses the settings classes.

## 2. Make a reset link

### 2.1 The menu item

- **Make a reset link** sits second in the adult row menu, after the role item and before the divider (manage-adults UX §2.3).
- It shows on every adult row with a password. It doesn't show on your own row, on kid rows, or on accounts that only use single sign-on (AC-018).
- **R-1 (decided).** `GET /api/admin/accounts` gains `hasPassword` on each adult row (spec AC-021), so the menu can hide the item for SSO-only accounts.

### 2.2 The dialog

It opens at once and makes the link straight away. Making a link changes nothing for Jo until it's used, so there's no "are you sure" step (R-2).

Desktop (1280) and phone (390) use the same card: `min(520px, 100vw − 32px)`.

```
 Making the link                     Secure page (https)
┌ Reset link for Jo ────────── ✕ ┐  ┌ Reset link for Jo ──────────────── ✕ ┐
│                                │  │ Send Jo this link.                   │
│                                │  │                                      │
│         ◌                      │  │ Reset link                           │
│   Making a link…               │  │ [ https://home.example/#reset=Qm9… ] │
│                                │  │ [ Copy link ]  [ Share… ]            │
│                                │  │                                      │
│                                │  │ It works once, until Nov 21 at 3:40  │
│                                │  │ PM. You won't see this link again.   │
│                                │  │                                      │
│                                │  │ Jo's password stays the same until   │
│                                │  │ they use it. A new link replaces     │
│                                │  │ this one.                            │
│                                │  │                                      │
│                         [Done] │  │                               [Done] │
└────────────────────────────────┘  └──────────────────────────────────────┘

 Plain http (no clipboard)                 Phone (390)
┌ Reset link for Jo ──────────────── ✕ ┐  ┌ Reset link for Jo ─────── ✕ ┐
│ Send Jo this link.                   │  │ Send Jo this link.          │
│                                      │  │                             │
│ Reset link                           │  │ Reset link                  │
│ [ http://homepad.lan/#reset=Qm9… ]   │  │ [ https://home.exa… ]       │
│   (selected)                         │  │ [ Copy link ]  [ Share… ]   │
│ Press ⌘C to copy.                    │  │                             │
│                                      │  │ It works once, until Nov 21 │
│ It works once, until Nov 21 at 3:40  │  │ at 3:40 PM. You won't see   │
│ PM. You won't see this link again.   │  │ this link again.            │
│                                      │  │                             │
│ Jo's password stays the same until   │  │ Jo's password stays the     │
│ they use it. A new link replaces     │  │ same until they use it. A   │
│ this one.                            │  │ new link replaces this one. │
│                                      │  │                             │
│                               [Done] │  │                      [Done] │
└──────────────────────────────────────┘  └─────────────────────────────┘
```

**Copy**
- Title: "Reset link for Jo"
- While making: "Making a link…" with the auth spinner.
- "Send Jo this link."
- Field label: "Reset link". It's a read-only `<input>` holding `{origin}/#reset={token}`.
- Buttons: **Copy link** (reads "Copied" for 2 seconds). **Share…** shows only where the browser has a share sheet; the share title is "Homepad password reset".
- No clipboard: the field is selected on open, with the same hint as invites: "Press ⌘C to copy." or "Press Ctrl+C to copy.", and "Press and hold to copy." on touch.
- "It works once, until Nov 21 at 3:40 PM. You won't see this link again." The time uses the device's locale and 12/24-hour choice. A day alone (as invites show) is too vague for 24 hours.
- "Jo's password stays the same until they use it. A new link replaces this one." The first sentence covers spec §2.1 and the second covers Q6 and AC-005.
- Closing (Done, ✕, Escape) asks nothing. Nothing is unsaved.

**Errors** (the spinner is replaced by one line in the error colour, `role="alert"`, with the buttons below it)

| Answer | Line | Buttons |
|---|---|---|
| 409 `sso_account` | Jo signs in with single sign-on only, so there's no password to reset. | [Close] |
| 409 `self` | To change your own password, use My settings. | [Close] |
| 404 | Jo isn't in Homepad anymore. | [Close] (the Accounts list reloads) |
| 401 | You were signed out. Reload the page to sign in again. | [Reload] |
| network or anything else | Couldn't make the link. Try again. | [Try again] [Close] |

**Reuse.** Move `LinkOnce` out of `AddAdultDialog.tsx` into `src/accounts/LinkOnce.tsx`. It takes the intro line, the field label, the footer lines and the share title as props. The invite dialog and the reset dialog then share one clipboard path. Both stay in lazy chunks.

## 3. The reset screen (`/#reset=<token>`)

It's the sign-in card again (`auth-card`, 400px max, centered), in place of the sign-in screen. `App.tsx` reads the token, takes it out of the address bar with `history.replaceState` right away (AC-019), and renders `ResetPasswordScreen`.

**Order:** look the link up first, then decide. Looking up doesn't use the link.
- No session, or signed in as the same email: show the form.
- Signed in as someone else: ask first (§3.3).

### 3.1 Desktop (1280)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                      ┌──────────────────────────────┐                        │
│                      │            [logo]            │                        │
│                      │  Set a new password          │                        │
│                      │  for jo@example.com.         │                        │
│                      │                              │                        │
│                      │  New password                │                        │
│                      │  [                        ]  │                        │
│                      │  At least 8 characters.      │                        │
│                      │  Type it again               │                        │
│                      │  [                        ]  │                        │
│                      │                              │                        │
│                      │  Saving signs you out on     │                        │
│                      │  your other devices.         │                        │
│                      │                              │                        │
│                      │  [      Save password      ] │                        │
│                      │  The link ends Nov 21 at     │                        │
│                      │  3:40 PM.                    │                        │
│                      └──────────────────────────────┘                        │
│                              homepad v18.0.0                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Phone (390): every state

```
 Loading                    Live                        Dead
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│        [logo]        │   │        [logo]        │   │        [logo]        │
│  Set a new password  │   │  Set a new password  │   │  This reset link     │
│                      │   │  for jo@example.com. │   │  doesn't work        │
│          ◌           │   │                      │   │  anymore.            │
│                      │   │  New password        │   │                      │
│                      │   │  [                ]  │   │  Ask for a new one.  │
│                      │   │  At least 8          │   │                      │
│                      │   │  characters.         │   │  [  Go to sign in  ] │
│                      │   │  Type it again       │   │                      │
│                      │   │  [                ]  │   │                      │
│                      │   │                      │   │                      │
│                      │   │  Saving signs you    │   │                      │
│                      │   │  out on your other   │   │                      │
│                      │   │  devices.            │   │                      │
│                      │   │  [  Save password  ] │   │                      │
│                      │   │  The link ends Nov   │   │                      │
│                      │   │  21 at 3:40 PM.      │   │                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘

 Signed in as someone else  Errors on Save              Too many tries
┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│        [logo]        │   │  New password        │   │        [logo]        │
│  Set a new password  │   │  [••••            ]  │   │  Set a new password  │
│                      │   │  Use at least 8      │   │                      │
│  You're signed in as │   │  characters.         │   │  Too many tries.     │
│  Caleb. Sign out to  │   │  Type it again       │   │  Wait a minute and   │
│  use this reset      │   │  [••••••••        ]  │   │  try again.          │
│  link.               │   │  The two passwords   │   │                      │
│                      │   │  don't match.        │   │  [    Try again    ] │
│ [Sign out and        │   │                      │   │                      │
│   continue]          │   │  [  Save password  ] │   │                      │
│ [   Keep me here   ] │   │                      │   │                      │
└──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

### 3.3 States and copy

- **Loading** (lookup in flight): the card shows the logo, the title "Set a new password" and a spinner. The screen-reader text is "Checking your link…". The card keeps the live form's height (`minHeight`, as `JoinScreen` does), so nothing jumps.
- **Live**
  - Title (one `h1`, two lines): "Set a new password for jo@example.com." The email line is muted. This is the spec's sentence, as TC-001 expects.
  - A hidden `<input type="email" autocomplete="username" readonly>` holds the email, so password managers save the new password against the right account.
  - **New password**: `autocomplete="new-password"`, with the hint "At least 8 characters." under it.
  - **Type it again**: `autocomplete="new-password"`.
  - Caveat line: "Saving signs you out on your other devices." (Q2, AC-008.)
  - Button: **Save password**. While working it shows the spinner and "Saving…".
  - Footer: "The link ends Nov 21 at 3:40 PM."
- **Errors on Save.** They show inline, under the field they belong to. The form keeps what was typed, and the link stays usable (AC-009).
  - Under 8 characters, under New password: "Use at least 8 characters."
  - Over 72 bytes, under New password: "That password is too long. Use 72 characters or fewer." The check counts bytes (`TextEncoder`), so a password with emoji hits it sooner. The copy says characters because that's what people count.
  - The two differ, under Type it again: "The two passwords don't match."
  - 429, above the button: "Too many tries. Wait a minute and try again." Once SPEC-signin-hardening lands, it reads the wait from `Retry-After` with the shared formatter ("Wait 5 minutes and try again.").
  - 404 on Save: the card switches to Dead.
  - Network or anything else, above the button: "Couldn't save the password. Try again."
  - The two client-side checks run on Save, never while typing.
- **Dead** (any 404 on lookup or Save): title "This reset link doesn't work anymore.", body "Ask for a new one.", and one button. It reads **Go to sign in**, or **Go to my dashboard** when a session exists. There's one message for every reason (AC-006, TC-002).
- **Signed in as someone else** (session email ≠ the link's email)
  - "You're signed in as Caleb. Sign out to use this reset link."
  - **Sign out and continue** signs out and shows the live form.
  - **Keep me here** drops the link and goes back to the dashboard. The link still works later.
  - This is the state an admin sees when they test a link on their own device.
- **Signed in as the same person:** straight to the live form. Saving ends every session, then signs this device in again, so nothing looks different.
- **Too many tries on lookup:** "Too many tries. Wait a minute and try again." with **Try again**, as the Join screen does.
- **Success:** straight to the dashboard, signed in. No welcome screen (household-basics precedent).

## 4. My settings → Password

A new section under **Dashboard** in My settings. It shows only when `GET /api/me` says `hasPassword` (AC-020). Kids never reach My settings' account rows, and their `hasPassword` is false anyway.

### 4.1 Desktop (My settings panel, 640px wide, at 1280)

```
┌ My settings ──────────────────────────────────────────────────── ✕ ┐
│ These apply to your dashboard only — nobody else is affected.      │
│                                                                    │
│ DASHBOARD                                                          │
│ …Show status bar · Show uptime display · Show widgets · density…   │
│                                                                    │
│ PASSWORD                                                           │
│ Change the password you sign in with.        [Change password]     │
└────────────────────────────────────────────────────────────────────┘

 Open:
│ PASSWORD                                                           │
│ Current password    [                              ]               │
│ New password        [                              ]               │
│                     At least 8 characters.                         │
│ Type it again       [                              ]               │
│                                                                    │
│ Your other devices will be signed out.                             │
│                                     [Cancel]  [Save password]      │
│                                                                    │
 Done:
│ PASSWORD                                                           │
│ ✓ Password changed. Your other devices are signed out.             │
│ Change the password you sign in with.        [Change password]     │
```

### 4.2 Phone (390)

```
┌ My settings ────────────────── ✕ ┐
│ PASSWORD                         │
│ Change the password you sign in  │
│ with.                            │
│ [       Change password        ] │
│                                  │
│  Open:                           │
│ Current password                 │
│ [                              ] │
│ That's not your current          │
│ password.                        │
│ New password                     │
│ [                              ] │
│ At least 8 characters.           │
│ Type it again                    │
│ [                              ] │
│ Your other devices will be       │
│ signed out.                      │
│ [ Cancel ]   [ Save password  ]  │
└──────────────────────────────────┘
```

### 4.3 States and copy

- **Closed:** the note "Change the password you sign in with." and a **Change password** button (`settings-ghost-btn`, 44px).
- **Open:** the form expands in place. It doesn't open a second dialog on top of My settings.
  - **Current password**: `autocomplete="current-password"`.
  - **New password**: `autocomplete="new-password"`, hint "At least 8 characters."
  - **Type it again**: `autocomplete="new-password"`.
  - A hidden `autocomplete="username"` field with the user's email, for password managers.
  - Caveat: "Your other devices will be signed out." (Q3, AC-013.)
  - Buttons: [Cancel] [Save password]. While working: "Saving…", with every field and button disabled.
- **Wrong current password** (403 `wrong_password`): "That's not your current password." under Current password. That field is cleared and focused. The new ones are kept. Nobody is signed out (AC-014, TC-003).
- **Too many wrong tries** (429, after 5 in 15 minutes): "Too many tries. Wait 15 minutes and try again.", with the minutes from `Retry-After` through the shared formatter. It sits above the buttons.
- **Rule errors:** the same lines as the reset screen: "Use at least 8 characters.", "That password is too long. Use 72 characters or fewer." and "The two passwords don't match."
- **409 `sso_account`** (a stale screen only): "This account signs in with single sign-on. It has no password to change here."
- **Network or anything else:** "Couldn't change the password. Try again."
- **Success:** the form closes and its fields are wiped. A line stays until My settings closes: "✓ Password changed. Your other devices are signed out." This is the spec's copy. This device stays signed in.
- **Escape** closes My settings, as today, and drops anything typed. It asks nothing: a half-typed password isn't worth a "Discard changes?" step.

## 5. Accessibility

- **Dialog:** `role="dialog"`, `aria-modal`, labelled by its title. Tab is trapped. Escape closes it and stops there, so the Admin Panel stays open. On open, focus goes to **Copy link**, or to the selected field when there's no clipboard. On close, focus returns to that row's **Manage** button.
- "Making a link…" and "Copied" use a polite `role="status"`. Errors use `role="alert"`.
- **Reset screen:** every field has a visible `<label>`. Errors are tied to their field with `aria-describedby` and set `aria-invalid`. On a failed Save, focus moves to the first field with an error. The hint "At least 8 characters." is also tied to New password.
- **Tab order on the reset screen:** New password → Type it again → Save password. In the ask state: Sign out and continue → Keep me here.
- **My settings:** **Change password** has `aria-expanded` and `aria-controls` (the form). Opening moves focus to Current password. Cancel and success return focus to **Change password**. The success line is `role="status"`.
- **Copy:** say "reset link", never "token". Say "password", never "credentials".

## 6. Acceptance criteria covered

| Screen | ACs |
|---|---|
| §2.1 menu item | AC-003 (not on your own row), AC-010 (not on SSO-only rows), AC-018, AC-021 (`hasPassword` on the list) |
| §2.2 dialog | AC-001, AC-004 (the time line), AC-005 ("a new link replaces this one"), AC-018 (shown once, Copy, fallback) |
| §3 reset screen | AC-006 (one dead message), AC-007, AC-008 (caveat line), AC-009 (errors keep the link), AC-012 (429), AC-019 |
| §4 Change password | AC-013, AC-014, AC-020 |

AC-002, AC-011, AC-015, AC-016 and AC-017 have no UI.

## 7. Screenshot checkpoints (for TC-001…TC-006)

1. The adult row menu with **Make a reset link**, at 820 and 390.
2. The reset-link dialog: making, secure page, plain http with the field selected. At 1280 and 390, light and dark.
3. The reset screen: loading, live, dead, signed in as someone else, and the mismatch error. At 390 and 1280, light and dark.
4. My settings → Password: closed, open with the wrong-password error, and done. At 1280 and 390.
5. TC-005: an SSO-only member's row, whose menu has no reset item (R-1, AC-021).

## 8. Decisions

- **R-1: The Accounts list needs `hasPassword`.** Without it, the UI can't hide **Make a reset link** for SSO-only accounts (AC-018, TC-005). The spec adds `hasPassword` to `GET /api/me` only, and manage-adults says the list "already returns what the UI needs". **Decided: add `hasPassword` to each adult row of `GET /api/admin/accounts`.** It's additive and computed the same way. The fallback is to show the item on every other adult and rely on the 409 line in §2.2, which means TC-005's "no Make a reset link" would fail.
- **R-2: No confirm before making a link.** Making one changes nothing until it's used, and it replaces the old link (the intended effect). **Decided: make it at once.** The alternative is a "Make a reset link for Jo?" step.
- **R-3: Lookup first, then the signed-in check.** The Join screen asks first, whatever the account. With reset, the same person is often signed in on this device, and asking them to sign out of their own account would be odd. **Decided: look up, then ask only when the emails differ.**
- **R-4: The expiry shows a time.** Invites show a day ("until Nov 14"), which is enough for 7 days. For 24 hours it isn't. **Decided: "until Nov 21 at 3:40 PM".**
- **R-5: Change password expands in place.** A nested dialog is the alternative. **Decided: in place.** It's three fields, and My settings is already a dialog.
- **R-6: The adult's other devices go to the sign-in screen.** TC-001 step 3 ("The tablet shows the sign-in screen on its next poll") and TC-003 depend on the same change as manage-adults A-5. Today an adult's tab stops polling on a 401 and shows nothing. **Decided: covered by manage-adults A-5 (SPEC-household-manage-adults AC-016), which owns the `App.tsx` line.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-20 (Claude for Kare) |
| Product | Caleb | Approved 2026-11-20 ("Accept all recommended": R-1…R-6 at the recommendations) |
