# UX: Household basics

**Spec:** [`SPEC-household-basics.md`](../SPEC-household-basics.md) §9 (v0.1.0, Draft)
**Author:** Kare (design), drafted 2026-11-07
**Status:** Draft — awaiting Caleb (spec §0 Q1–Q12, and H-1…H-4 below).

This doc designs the four surfaces in spec §9. Everything else reuses what exists: the auth card (`AuthForm`), the Admin Panel's Accounts section (`AccountsSection`), `Modal`, and the inline error and skeleton patterns from SPEC-kid-accounts UX §2.

---

## 1. Where it lives

```
Sign-in screen (no session)
  ├─ Set up Homepad          ← NEW, only while no account exists
  ├─ Sign in                 (existing; "Create account" only when sign-up is open)
  └─ Join Homepad            ← NEW, opened from an invite link (/#invite=…)

Account menu (admin) → Administration → Accounts
  ACCOUNTS                       [+ Add an adult]  [+ Add a kid]
    ├─ open-sign-up warning      ← NEW, only while HOMEPAD_REGISTRATION=open
    ├─ account list              (existing; "user" now reads "member")
    └─ PENDING INVITES           ← NEW, only when there is one
```

- **Add an adult** sits next to **Add a kid**, in the same section. Both create accounts, so they belong together.
- Nothing new goes in the user menu. Accounts is already one tap away.

## 2. Sign-in screen: three states

Same auth card, same width, same 44px controls. Only the title, subtitle, fields and secondary action change.

```
 Set up (no account yet)        Sign in (sign-up closed)       Sign in (sign-up open)
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│          [logo]          │   │          [logo]          │   │          [logo]          │
│         homepad          │   │         homepad          │   │         homepad          │
│   Set up Homepad         │   │ Sign in to your dashboard│   │ Sign in to your dashboard│
│   This first account is  │   │                          │   │                          │
│   the admin.             │   │ Email    [            ]  │   │ Email    [            ]  │
│                          │   │ Password [            ]  │   │ Password [            ]  │
│ Email    [            ]  │   │                          │   │                          │
│ Password [            ]  │   │ [        Sign in       ] │   │ [        Sign in       ] │
│ At least 8 characters.   │   │                          │   │ [     Create account   ] │
│                          │   │ ── or ──                 │   │                          │
│ [   Create admin account]│   │ [  Log in with PocketID ]│   │                          │
│                          │   │                          │   │                          │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

- **Set up** shows when `setupNeeded` is true. It has no "Sign in" link: there's nobody to sign in as. It asks only for email and password, as register does today. It has no PocketID button: an OIDC sign-in makes a member unless the provider's admin group says otherwise, so it isn't a sure way to make the first admin.
- **Sign in, closed:** no "Create account" and no hint about how to get an account. A kid who signs out sees a plain sign-in and nothing to do.
- **Sign in, open:** exactly today's card.
- **Loading** (the config call is in flight): the card renders the closed state, so "Create account" never flashes in and out.
- **Errors**
  - Set-up form: "Someone else just finished setup. Sign in instead." when the API answers 403 (the race in spec AC-003). The card then switches to Sign in.
  - Existing sign-in errors are unchanged.

## 3. Accounts: adding an adult

### 3.1 The section

```
┌ Admin Panel ──────────────────────────────────────────────── ✕ ┐
│ ACCOUNTS                         [+ Add an adult] [+ Add a kid] │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ⚠ Anyone who can open Homepad can create an account.        │ │
│ │   A kid who signs out could make an adult account.          │ │
│ │   To stop this, set HOMEPAD_REGISTRATION=invite_only. How › │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ● Caleb          admin    you                               │ │
│ │ ● Alex           member   alex@example.com                  │ │
│ │ ◉ Maya           kid      12 apps · 1 device         Edit › │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ PENDING INVITES                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Jordan       admin    made by Caleb · ends Nov 14  [Revoke] │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

- **Warning box** (spec AC-006): shows only while sign-up is `open`. The second line shows only when at least one kid exists. "How ›" links to the README's registration section. It uses the existing amber "affects everyone" tone. It can't be dismissed: it goes away when the setting changes.
- **Role pill** reads "member" for the `user` role (spec AC-021).
- **The footnote changes** from "Adults are listed only. Kids are managed here." to nothing. The buttons say what you can do.
- **Pending invites**
  - Shows only when there is at least one.
  - Each row: name, role pill, who made it, when it ends, **Revoke**.
  - **Revoke** asks first: "Revoke Jordan's invite? The link stops working." Buttons: [Cancel] [Revoke]. A link might already be in someone's messages, so a slip can't be undone by trying again.
  - Used and expired invites drop off. The account list shows who joined.
- **Loading and error:** the same skeleton rows and inline "Couldn't load accounts. Retry" as today. Pending invites load with the account list and share its error.

### 3.2 Add-an-adult dialog: the form

A `Modal`, the same shell as the kid editor.

```
┌ Add an adult ────────────────────────────────────── ✕ ┐
│ Name   [ Alex                ]                         │
│                                                        │
│ Role   (•) Member                                      │
│            Uses the dashboard. Keeps their own         │
│            favorites and settings.                     │
│        ( ) Admin                                       │
│            Also adds apps, and manages accounts        │
│            and settings.                               │
│                                                        │
│ You'll get a link to send them. It works once, for     │
│ 7 days. They pick their own email and password.        │
│                                                        │
│ They use PocketID? They can sign in with it. No        │
│ invite needed.                                         │
│                                                        │
│                          [Cancel]  [Create link]       │
└────────────────────────────────────────────────────────┘
```

- **Name** is required, 1–40 characters, with the error inline under the field. It labels the invite and becomes the account's display name, which the adult can change when they join.
- **Role** defaults to **Member**. Radio buttons, not a dropdown: two options, each with one line saying what it means.
- Picking **Admin** adds a line in amber under the options: "Admins can do everything you can, including inviting other admins."
- The **PocketID line** shows only when single sign-on is on (spec AC-022). It uses the provider name the sign-in button already uses.
- **Create link** is disabled until the name is valid. While it's working, it reads "Creating…".
- **Errors:**
  - Account limit: inline above the buttons, "This Homepad has reached its limit of 12 accounts."
  - Anything else: "Couldn't create the invite. Try again."
  - The form keeps what was typed.

### 3.3 Add-an-adult dialog: the link, once

The same modal, after **Create link** works.

```
 Secure page (https)                            Plain http (no clipboard)
┌ Invite for Alex ─────────────────────── ✕ ┐  ┌ Invite for Alex ─────────────────────── ✕ ┐
│ Send Alex this link.                      │  │ Send Alex this link.                      │
│                                           │  │                                           │
│ [ https://home.example/#invite=Qm9…  ]    │  │ [ http://homepad.lan/#invite=Qm9… ]       │
│ [ Copy link ]  [ Share… ]                 │  │   (selected)                              │
│                                           │  │ Press ⌘C to copy.                         │
│ It works once, until Nov 14.              │  │                                           │
│ You won't see this link again.            │  │ It works once, until Nov 14.              │
│                                           │  │ You won't see this link again.            │
│                                  [Done]   │  │                                  [Done]   │
└───────────────────────────────────────────┘  └───────────────────────────────────────────┘
```

- The link is built from the page's own address, so it points wherever the admin is using Homepad.
- **Copy link** turns into "Copied" for 2 seconds.
- **Share…** shows only where the browser offers a share sheet (iPad, iPhone).
- **Without a clipboard** (plain `http://` on a LAN, where browsers block it): the field is selected on open. The hint says "Press ⌘C to copy." on a keyboard device and "Press and hold to copy." on touch.
- **"You won't see this link again."** is the one surprise worth stating: the server keeps no copy. Closing the dialog any way (Done, ✕, Escape) asks nothing, since there's nothing unsaved.
- After closing, the invite is in Pending invites.

## 4. Join screen (the invite link)

The auth card again, opened from `/#invite=…`. The token leaves the address bar as soon as it's read.

```
 Live invite                       Dead link                        Already signed in
┌──────────────────────────┐   ┌──────────────────────────┐   ┌──────────────────────────┐
│          [logo]          │   │          [logo]          │   │          [logo]          │
│      Join Homepad        │   │  This invite link doesn't│   │      Join Homepad        │
│ Caleb invited you.       │   │  work anymore.           │   │ You're signed in as      │
│ You'll be a member.      │   │                          │   │ Caleb. Sign out to use   │
│                          │   │  Ask for a new one.      │   │ this invite.             │
│ Name     [ Alex       ]  │   │                          │   │                          │
│ Email    [            ]  │   │  [   Go to sign in    ]  │   │ [ Sign out and continue ]│
│ Password [            ]  │   │                          │   │ [      Keep me here     ]│
│ At least 8 characters.   │   │                          │   │                          │
│                          │   │                          │   │                          │
│ [          Join        ] │   │                          │   │                          │
│ The link ends Nov 14.    │   │                          │   │                          │
└──────────────────────────┘   └──────────────────────────┘   └──────────────────────────┘
```

- **Live:** the role line reads "You'll be a member." or "You'll be an admin." Name is prefilled from the invite and can be changed.
- **Loading** (lookup in flight): the card shows the logo and a spinner in place of the form. No layout jump: the card keeps its live-invite height.
- **Dead link** (any 404): one message for every reason. The spec makes the API give one answer, so the UI can't tell expired from used anyway, and shouldn't try.
- **Already signed in:** shown when a session exists. **Sign out and continue** signs out, then shows the live form. **Keep me here** drops the invite and goes to the dashboard; the link still works later.
- **Errors on Join** (inline, under the field they belong to, and the form keeps its values):
  - Email already has an account: "That email already has an account. Sign in instead." with a **Sign in** link.
  - Too many tries (429): "Too many tries. Wait a minute and try again."
  - Short password or bad email: the existing messages.
- **Success:** straight to the new adult's dashboard. No welcome screen.

## 5. Accessibility and copy

- Every new control can be reached by keyboard. The role choice is a real radio group with a visible label. Each helper line is tied to its radio with `aria-describedby`.
- The link field is a read-only `<input>` with a visible label ("Invite link"), so a screen reader can read it and select it.
- "Copied" is announced through a polite live region.
- The warning box has `role="note"`, not `alert`: it's standing information, not something that just happened.
- Copy uses "invite" and "link", never "token". Roles are "member" and "admin". It never says "user" in the UI.

## 6. Screenshot checkpoints (for TC-001…TC-010)

1. The three sign-in states, at 390 and 1440, dark and light.
2. Accounts with the open-sign-up warning, one member, one kid and one pending invite, at 1440 and 820.
3. The Add-an-adult form with Admin picked (amber line showing), at 820.
4. The link-once view: secure page, and plain http with the field selected, at 820.
5. The Join screen: live, dead link, already signed in, at 390.

## 7. Decisions for Caleb

- **H-1: Where Add an adult sits.** Next to Add a kid in Accounts. The alternative is a separate "People" section. **Proposed: next to Add a kid.**
- **H-2: Revoke asks first.** Yes, because a sent link can't be unsent. Kid device sign-out doesn't ask, because signing in again undoes it. **Proposed: ask.**
- **H-3: "member" for the `user` role.** It reads better next to "kid" and "admin", and it's copy only. **Proposed: yes.**
- **H-4: Prefilled name on Join.** Prefilled from the invite and editable. The alternative is fixed. **Proposed: editable.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-07 |
| Product | Caleb | Pending |
