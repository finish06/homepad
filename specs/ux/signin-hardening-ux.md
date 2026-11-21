# UX: Sign-in hardening

**Spec:** [`SPEC-signin-hardening.md`](../SPEC-signin-hardening.md) §9 (v0.1.1, Approved 2026-11-20)
**Author:** Claude for Kare (design), drafted 2026-11-20
**Status:** Draft — awaiting Caleb.

Spec §9 names one surface: the sign-in screen's error line and wait state. This doc designs that surface. It also covers three small places the spec's changes reach:
- the same wait line on the Join and reset screens;
- the two new rows in Admin Panel → System (AC-013, AC-017);
- the Add-an-adult dialog's PocketID line, which Q2 makes wrong (§5).

Everything reuses the sign-in card (`src/app/AuthForm.tsx`) and its `.auth-error` line.

Checked against `homepad` `gitea/main` `ad3d0fe`. The plan's file map says `src/app/App.tsx` (`AuthForm`); `AuthForm` now lives in its own file, `src/app/AuthForm.tsx`.

---

## 1. Where it lives

```
Sign-in card (AuthForm)
  ├─ SSO message line          ← NEW: under the subtitle, above Email
  │                               (from /#signin-error=<code>)
  └─ error line                (existing, above the button)
                                ← NEW copy: the wait line on 429

Join screen, reset screen      ← the wait line, same formatter
Admin Panel → System           ← NEW rows: OIDC member group, Trusted proxies
Add an adult dialog            ← PocketID line reworded (§5)
```

**Bundle.** `AuthForm` is in the entry chunk, so this is the one spec whose UI costs entry bytes. Keep it small:
- **In the entry:** four short messages, the `Retry-After` formatter, and the fragment check. That's about 400 characters of copy, roughly 250 to 350 bytes gzip with the code.
- **Measure it.** Run `npm run build` and check the bundle-budget test before merging. If this spec's share goes over about 400 bytes, move the code→message map into a small lazy module. Import it only when a `#signin-error=` is present; the 429 line stays inline (S-1).
- **Outside the entry:** the System rows are in the `SettingsPanel` chunk, and the Add-an-adult line in the Admin Panel chunk. Both are lazy.
- **No new CSS.** It uses `.auth-error` in light and dark.

## 2. The SSO message (`/#signin-error=<code>`)

When single sign-on fails, the API sends the browser to `/#signin-error=<code>` (AC-002). `App.tsx` reads the code and takes the fragment out of the address bar with `history.replaceState` (AC-003), in the same once-on-mount step as `#invite=` and `#reset=`. It then passes the code to `AuthForm`. Reading it in `App.tsx`, rather than in `AuthForm`, means the fragment is cleared even when a session exists and the sign-in card never mounts.

### 2.1 Desktop (1280)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                      ┌──────────────────────────────┐                        │
│                      │            [logo]            │                        │
│                      │           homepad            │                        │
│                      │   Sign in to your dashboard  │                        │
│                      │                              │                        │
│                      │  You don't have a Homepad    │  ← .auth-error,        │
│                      │  account yet. Ask your admin │    role="alert"        │
│                      │  for an invite.              │                        │
│                      │                              │                        │
│                      │  Email    [               ]  │                        │
│                      │  Password [               ]  │                        │
│                      │                              │                        │
│                      │  [         Sign in        ]  │                        │
│                      │  ─────────── or ───────────  │                        │
│                      │  [  Log in with PocketID  ]  │                        │
│                      └──────────────────────────────┘                        │
│                              homepad v18.0.0                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Phone (390), one per code

```
 email_unverified             not_invited
┌────────────────────────┐   ┌────────────────────────┐
│         [logo]         │   │         [logo]         │
│        homepad         │   │        homepad         │
│ Sign in to your        │   │ Sign in to your        │
│ dashboard              │   │ dashboard              │
│                        │   │                        │
│ Your identity provider │   │ You don't have a       │
│ hasn't confirmed your  │   │ Homepad account yet.   │
│ email. Ask your admin  │   │ Ask your admin for an  │
│ to mark it as          │   │ invite.                │
│ verified.              │   │                        │
│                        │   │                        │
│ Email [              ] │   │ Email [              ] │
│ Password [           ] │   │ Password [           ] │
│ [      Sign in       ] │   │ [      Sign in       ] │
│ ──────── or ────────── │   │ ──────── or ────────── │
│ [Log in with PocketID] │   │ [Log in with PocketID] │
└────────────────────────┘   └────────────────────────┘

 account_limit                sso_failed
┌────────────────────────┐   ┌────────────────────────┐
│         [logo]         │   │         [logo]         │
│        homepad         │   │        homepad         │
│ Sign in to your        │   │ Sign in to your        │
│ dashboard              │   │ dashboard              │
│                        │   │                        │
│ This Homepad has       │   │ Single sign-on didn't  │
│ reached its account    │   │ work. Try again.       │
│ limit.                 │   │                        │
│                        │   │                        │
│                        │   │                        │
│                        │   │                        │
│ Email [              ] │   │ Email [              ] │
│ Password [           ] │   │ Password [           ] │
│ [      Sign in       ] │   │ [      Sign in       ] │
│ ──────── or ────────── │   │ ──────── or ────────── │
│ [Log in with PocketID] │   │ [Log in with PocketID] │
└────────────────────────┘   └────────────────────────┘
```

### 2.3 Copy (exact)

| Code | Line |
|---|---|
| `email_unverified` | Your identity provider hasn't confirmed your email. Ask your admin to mark it as verified. |
| `not_invited` | You don't have a Homepad account yet. Ask your admin for an invite. |
| `account_limit` | This Homepad has reached its account limit. |
| `sso_failed` | Single sign-on didn't work. Try again. |
| any other code | the `sso_failed` line |

- `account_limit` reuses `accountLimitMessage(undefined)` from `src/lib/accountLimit.ts`, which already returns this exact text.
- The code is matched with `^#signin-error=([a-z_]+)$`. Anything else in the fragment is ignored and cleared.

### 2.4 Behaviour

- The line sits under the subtitle and above Email (spec §8: "one line above the form"). It's about single sign-on, so it doesn't sit next to the password field.
- It stays until the next sign-in attempt: Sign in, Create account, or the PocketID button. Typing doesn't clear it.
- The PocketID button stays enabled. After `email_unverified`, the fix happens at the provider (TC-005), and the next try should just work.
- **Set up** (no account yet) has no PocketID button. If a code arrives on an empty install, the Set up card still shows the line in the same place.
- Kid devices never see these lines. Kids don't use single sign-on.

## 3. The wait line (429)

Login, register and set-up answer 429 with `Retry-After` (AC-004, AC-005). The card shows the wait in the existing error spot, above the button.

```
 Desktop (1280), card only
┌──────────────────────────────┐
│            [logo]            │
│           homepad            │
│   Sign in to your dashboard  │
│                              │
│  Email    [jo@example.com ]  │
│  Password [••••••••       ]  │
│                              │
│  Too many tries. Wait 15     │
│  minutes and try again. You  │
│  can still use PocketID.     │
│                              │
│  [         Sign in        ]  │
│  ─────────── or ───────────  │
│  [  Log in with PocketID  ]  │
└──────────────────────────────┘
```

```
 Phone (390)
┌────────────────────────┐
│         [logo]         │
│        homepad         │
│ Sign in to your        │
│ dashboard              │
│                        │
│ Email [jo@example.com] │
│ Password [••••••••   ] │
│                        │
│ Too many tries. Wait   │
│ 15 minutes and try     │
│ again. You can still   │
│ use PocketID.          │
│ [      Sign in       ] │
│ ──────── or ────────── │
│ [Log in with PocketID] │
└────────────────────────┘
```

### 3.1 Copy (exact)

One shared formatter, `waitMessage(retryAfterSeconds)`, in a tiny module that the entry chunk and the lazy Join and reset screens import:

| `Retry-After` | Line |
|---|---|
| missing, unreadable, or 60 or less | Too many tries. Wait a minute and try again. |
| over 60 | Too many tries. Wait N minutes and try again. (N = seconds ÷ 60, rounded up) |

- With single sign-on on, the sign-in card adds: "You can still use PocketID." The per-email lock touches only password sign-in (spec §3), so this is true and it's the fastest way in (S-2). It uses the same provider name as the button.
- TC-001's 15-minute lock reads "Too many tries. Wait 15 minutes and try again."
- The same line serves Sign in, Create account and Set up.
- `JoinScreen` and `ResetPasswordScreen` replace their fixed "Wait a minute" line with the formatter. They add no PocketID sentence.

### 3.2 Behaviour

- **The button stays enabled.** There's no countdown and nothing disables. The API answers 429 for a locked email and for a busy client, and the body doesn't say which. Disabling Sign in would also block a different person signing in on the same device (TC-001: "Caleb can still sign in at once").
- The line clears on the next submit. If that submit is also limited, it's replaced.
- **API change.** `Result` gains `retryAfter?: number`, read from the `Retry-After` header on 429 in `resultRequest`. That's a few bytes in the entry, counted in §1.

## 4. Admin Panel → System: two new rows

`GET /api/admin/env-config` gains both variables (AC-013, AC-017). The rows render through the existing `EnvConfigRows`. They need labels, and one needs a group.

```
SERVER
  …
  Trusted proxies            —                                          env
  HOMEPAD_TRUSTED_PROXIES    When this is empty, everyone shares one
                             sign-in limit.

IDENTITY (OIDC)
  …
  OIDC admin group           homepad-admins                             env
  OIDC_ADMIN_GROUP
  OIDC member group          homepad                                    env
  OIDC_MEMBER_GROUP
```

- `ENV_LABELS` gains `OIDC_MEMBER_GROUP: 'OIDC member group'` and `HOMEPAD_TRUSTED_PROXIES: 'Trusted proxies'`.
- `SERVER_KEYS` gains `HOMEPAD_TRUSTED_PROXIES`, so it sits under Server and not under "Other". `OIDC_MEMBER_GROUP` falls under Identity (OIDC) by its prefix.
- **The help line** (S-3) shows under Trusted proxies only when it's empty: "When this is empty, everyone shares one sign-in limit." It uses `.settings-kv-help`, the class "Show widgets" already uses. It's the one place an admin can see the cost of the default without reading the docs.
- A long proxy list wraps. Empty values keep today's "—" with "not set" for screen readers.
- At 390 the rows stack as today.

## 5. Add an adult: the PocketID line (conflict with Q2)

Today the Add-an-adult dialog says, whenever SSO is on: "They use PocketID? They can sign in with it. No invite needed." With Q2 = A, under `invite_only` (the default), single sign-on makes an account only for people in `OIDC_ADMIN_GROUP` or `OIDC_MEMBER_GROUP`. For anyone else, the line becomes untrue. It's also a question, which the copy rules avoid.

This file (`src/accounts/AddAdultDialog.tsx`) isn't in the plan's file map for this spec. It needs to be added to spec 4's list (S-4).

Replacement, by registration mode (the dialog already loads `authConfig`):

| Mode | Line |
|---|---|
| `open` | They can also sign in with PocketID. No invite needed. |
| `invite_only` | PocketID only makes accounts for people in your admin or member group. Anyone else needs this invite. After they join, they can use PocketID too if it has the same email. |

```
┌ Add an adult ─────────────────────────────────────── ✕ ┐
│ …Name · Role…                                          │
│ You'll get a link to send them. It works once, for     │
│ 7 days. They pick their own email and password.        │
│                                                        │
│ PocketID only makes accounts for people in your admin  │
│ or member group. Anyone else needs this invite. After  │
│ they join, they can use PocketID too if it has the     │
│ same email.                                            │
│                          [Cancel]  [Create link]       │
└────────────────────────────────────────────────────────┘
```

## 6. Accessibility

- **The SSO line** is rendered after mount into a `role="alert"` element, so screen readers announce it on landing. Focus stays on the page's first field as today. The message isn't focused.
- **The wait line** and every other card error get `role="alert"`. Today's `.auth-error` paragraph has no role, so errors there aren't announced. This fixes that for every message on the card at no visible cost.
- **Contrast.** `.auth-error` on the light card was measured AA (`index.css`, the `--auth-card-fill` comment). Check it in dark mode in the screenshots below.
- **Tab order is unchanged:** Email → Password → Sign in → Create account (if open) → Log in with PocketID. No new focus stops.
- **Copy:** say "single sign-on" and "identity provider" in messages, and "PocketID" only where the button already names it. Don't say "rate limit", "429" or "OIDC" to people signing in.

## 7. Acceptance criteria covered

| Screen | ACs |
|---|---|
| §2 SSO message | AC-001 (`email_unverified`), AC-002, AC-003, AC-010 (`not_invited`) |
| §3 wait line | AC-004, AC-005 |
| §4 System rows | AC-013, AC-017 |
| §5 PocketID line | AC-010, AC-011 (what the admin is told matches the rule) |

AC-006…AC-009, AC-012, AC-014…AC-016 and AC-018 have no UI.

## 8. Screenshot checkpoints (for TC-001, TC-004, TC-006)

1. The sign-in card with each of the four SSO lines, at 390 and 1440 (the spec's widths) and 1280, light and dark.
2. The wait line for 15 minutes with SSO on, and for "a minute" with SSO off, at 390, light and dark.
3. Admin Panel → System with Trusted proxies empty (help line showing) and OIDC member group set, at 1280.
4. Add an adult under `invite_only` with SSO on, at 390.

## 9. Decisions for Caleb

- **S-1: The messages stay in the entry chunk.** They're about 300 bytes gzip against about 1,070 bytes of room, and the reset screen's `App.tsx` hook needs some of that room too. **Recommended: inline, measured before merge.** If this spec's share goes over about 400 bytes, the SSO code map moves to a lazy module loaded only when a code is present.
- **S-2: "You can still use PocketID." on the wait line.** It's true for the per-email lock, and it helps the person who forgot which password they used. **Recommended: add it when SSO is on.**
- **S-3: The help line under an empty Trusted proxies.** **Recommended: add it.** The other env rows have no help, but this is the one default with a cost that isn't visible.
- **S-4: Reword the Add-an-adult PocketID line** (§5). This is a conflict between Q2 and today's UI. **Recommended: the two lines in §5, with `AddAdultDialog.tsx` added to this spec's file list.**
- **S-5: The OIDC start route's own 429.** `GET /api/auth/oidc/login` gets a limit (20 a minute), but the browser reaches it by full-page navigation. Over the limit, the person sees a bare "too many attempts" text page. AC-002 covers callback failures only. **Recommended: the start route also redirects to `/#signin-error=`.** Which code to use is an API change for Caleb to approve: `sso_failed` ("Try again") is the wrong advice, so a fifth code `too_many` with the §3.1 wait line fits better. The alternative is to leave it, since 20 a minute is rarely hit by a person.
- **S-6: No countdown.** A ticking timer is entry-chunk code and noise for screen readers. **Recommended: a static line.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-20 (Claude for Kare) |
| Product | Caleb | Pending (S-1…S-6) |
