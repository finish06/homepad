# UX: Admins edit server settings

**Spec:** [`SPEC-admin-server-settings.md`](../SPEC-admin-server-settings.md) §9 (v0.1.0, Draft)
**Author:** Claude for Kare (design), drafted 2026-11-23
**Status:** Draft — decisions A-1…A-6 pending.

This doc designs one thing: the shared row every server setting uses in Admin Panel → System. It also covers the few places that differ from it (spec §2.3): the secret row, the `PORT` row, the env-only banner, the Sign-in group's one Save, and the confirm dialogs.

It builds on what ships today in `src/library/SettingsPanel.tsx`: `.settings-kv`, `.settings-kv-row`, `.settings-kv-label`, `.settings-kv-var`, `.settings-kv-group-label`, `.settings-env-badge`, the skeleton rows and the "Saving… / Saved ✓ / Couldn't save — try again." flag. Checked against `homepad` `gitea/main` `ec170e3`.

---

## 1. Where it lives

```
Admin Panel
  ├─ Accounts                      (unchanged)
  ├─ System                        ← CHANGED: the four groups below
  │    ├─ [env-only banner]        ← only with HOMEPAD_SETTINGS_FROM_ENV_ONLY
  │    ├─ SERVER     Secure cookies · Trusted proxies · Server port
  │    ├─ STATUS     Gatus address · "Slow" threshold · Show uptime display
  │    ├─ ACCOUNTS   Sign-up · Account limit
  │    └─ SIGN-IN    Single sign-on · Issuer · Discovery URL · Redirect URL ·
  │                  Client ID · Client secret · Admin group · Member group
  │                  [Test sign-in]  [Review and save]
  ├─ Widgets                       (unchanged)
  ├─ App Library                   (unchanged)
  └─ Backup                        (unchanged)
```

The old "Environment Configuration" list and its note ("set via environment variables and redeploy") are gone. New note:

> These settings apply to everyone. A value saved here wins over the server's environment. **Reset** goes back to it.

## 2. The shared row

One component, `ServerSettingRow`. Every setting uses it.

### 2.1 At rest (1280)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Gatus address                         https://status.example.com  [UI] │
│ GATUS_BASE_URL                                                         │
│ Saved by Caleb, Nov 23 · Env: http://gatus:8080    [Reset]    [Edit]   │
└────────────────────────────────────────────────────────────────────────┘
  ^ label (.settings-kv-label)            ^ value       ^ source badge
  ^ env name (.settings-kv-var, mono)
  ^ detail line (muted): who/when, and what Reset falls back to
```

Same row with no saved value:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Gatus address                                 http://gatus:8080  [env] │
│ GATUS_BASE_URL                                                         │
│                                                               [Edit]   │
└────────────────────────────────────────────────────────────────────────┘
```

Neither saved nor in env:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Account limit                                     No limit  [default]  │
│ HOMEPAD_MAX_ACCOUNTS                                                   │
│                                                               [Edit]   │
└────────────────────────────────────────────────────────────────────────┘
```

- **Badge words:** `UI`, `env`, `default`. Today's `.settings-env-badge` shape. `UI` gets the accent tint so a saved value stands out; `env` and `default` stay grey (with SPEC-v26 §8.6's darker grey for contrast).
- **Reset shows only when the badge is `UI`.** Its label says where it goes: "Reset to env" or "Reset to default".
- **Values in words where it helps:** `true`/`false` show as On/Off; `0` account limit as "No limit"; `0` ms as "Off"; empty as "—" (with the sr-only "not set"). The raw value is in the edit field.
- **Booleans are a switch, not Edit.** Flipping it is the edit. If the change needs a confirm (§8), the dialog opens before anything is sent.

### 2.2 Editing

```
┌────────────────────────────────────────────────────────────────────────┐
│ Gatus address                                                    [UI]  │
│ GATUS_BASE_URL                                                         │
│ [ https://status.example.com                                   ]       │
│ The address of your Gatus server. Leave empty to turn status off.      │
│                                              [Cancel]  [Save]          │
└────────────────────────────────────────────────────────────────────────┘
```

- One editor per type: text, number, choice (Sign-up: Open / Invite only, as a two-option segmented control), list (Trusted proxies: a text field, comma-separated, with a hint).
- Enter saves; Esc cancels. Save is off until the value changed and passes the client check.
- The help line is one plain sentence per setting (§9).

### 2.3 Phone (390)

```
┌──────────────────────────────┐
│ Gatus address           [UI] │
│ GATUS_BASE_URL               │
│ https://status.example.com   │
│ Saved by Caleb, Nov 23       │
│ Env: http://gatus:8080       │
│ [Reset]               [Edit] │
└──────────────────────────────┘
```

Stacked as SPEC-v26 §8.7: the value wraps, never truncates. Buttons are 44 px tall.

## 3. The secret row

```
┌────────────────────────────────────────────────────────────────────────┐
│ Client secret                                            Set  [UI]     │
│ OIDC_CLIENT_SECRET                                                     │
│ Saved by Caleb, Nov 23 · Env: set   [Remove saved secret]  [Replace]   │
└────────────────────────────────────────────────────────────────────────┘

Replace:
┌────────────────────────────────────────────────────────────────────────┐
│ Client secret                                                          │
│ OIDC_CLIENT_SECRET                                                     │
│ [ ••••••••••••••••                                  ] (password field) │
│ Paste the new secret. It can't be shown again after you save.          │
│                                              [Cancel]  [Save]          │
└────────────────────────────────────────────────────────────────────────┘
```

- The value shown is only "Set" or "Not set". The field starts empty; it never holds the old secret.
- `autocomplete="off"`; no show/hide toggle (A-3).
- **No server key:** Replace is off, and the detail line says "To save the secret here, add `HOMEPAD_SECRET_KEY` on the server. The env secret still works."
- **Unreadable:** value "Can't be read", detail "The server key changed. Replace the secret." Shown in the warning colour.

## 4. Row states

| State | What shows |
|---|---|
| Loading | Today's skeleton rows (3 per group), `aria-busy` on the list, sr-only "Loading server settings…" |
| Load failed | Today's in-place error: "Couldn't load server settings. Reload the page to try again." |
| Editing | §2.2 |
| Saving | Save reads "Saving…", field and buttons disabled |
| Saved | Row goes back to rest with the new value and badge `UI`; "Saved ✓" for 1.6 s next to the badge (today's timing) |
| Invalid (client) | Red line under the field, Save off. E.g. "Enter a whole number from 0 to 10000." |
| Refused (server 400/409/422) | The server's `message` under the field, red, `role="alert"`. The draft stays. |
| Needs confirm | The dialog in §8. Cancel keeps the draft open. |
| Reset | A small confirm popover: "Reset to env: http://gatus:8080?" [Cancel] [Reset]. Then the badge changes to `env`/`default` and "Reset ✓" shows. |
| Badge change | The badge cross-fades (150 ms, none with reduced motion). The new badge is announced with the saved flag: "Saved. Now set in the UI." / "Reset. Now from the environment." |

## 5. The `PORT` row

```
┌────────────────────────────────────────────────────────────────────────┐
│ Server port                                              8080 [default]│
│ PORT                                                                   │
│ Set on the server. Applies after restart.                              │
└────────────────────────────────────────────────────────────────────────┘
```

No Edit, no Reset. A lock icon is not added: the line says it (A-4).

## 6. The env-only banner

```
┌────────────────────────────────────────────────────────────────────────┐
│ ⚠ Server settings come from the environment only.                      │
│   Saved values are ignored while HOMEPAD_SETTINGS_FROM_ENV_ONLY is on. │
│   You can still reset a saved value. Remove the flag and restart to    │
│   use saved values again.                                              │
└────────────────────────────────────────────────────────────────────────┘
```

Shown above the groups, `role="status"`. Every Edit and switch is off. Reset stays on for rows that still have a saved value; those rows show "Saved value ignored: <value>" on the detail line.

## 7. The Sign-in group

The OIDC values only work together, so this group has one Save (spec §2.3).

```
SIGN-IN
┌────────────────────────────────────────────────────────────────────────┐
│ Single sign-on                                        (●  ) On   [env] │
│ Issuer                         https://id.example.com            [env] │
│ Discovery URL                  — (from the issuer)           [default] │
│ Redirect URL     https://homepad.example.com/api/auth/oidc/callback    │
│                                                                  [env] │
│ Client ID                      homepad                           [env] │
│ Client secret                  Set                               [env] │
│ Admin group                    homepad-admins                    [env] │
│ Member group      ✎ homepad                        changed, not saved  │
├────────────────────────────────────────────────────────────────────────┤
│ 1 change not saved.         [Discard]  [Test sign-in]  [Review and save]│
└────────────────────────────────────────────────────────────────────────┘
```

- Rows edit in place as in §2.2, but their Save button reads "Done". The change is held in the group's footer.
- **Review and save** opens a dialog listing each change (old → new) and runs the server checks.
- If the server answers `would_lock_out`, the dialog says:
  > No admin has a password, so a mistake here could lock everyone out. Test sign-in with the new settings first.
  >
  > [Test sign-in]
- **Test sign-in** opens the provider in a new tab. The footer reads "Waiting for the test sign-in…" and then "Test passed ✓" or the reason it failed. After a pass, Review and save works for 10 minutes. Changing a value again needs a new test.
- The dialog reminds: "The redirect URL must be registered with your provider first."
- Leaving the panel with unsaved Sign-in changes asks "Discard 1 change to sign-in settings?"

## 8. Confirm dialogs

All use `src/ui/Modal`, title + one or two short paragraphs + [Cancel] [primary]. The primary button names the action, never "OK".

**Secure cookies on, page on `http://`:**
```
┌───────────────────────────────────────────────┐
│ Turn on secure cookies?                       │
│                                               │
│ This page is on http://. After this, nobody   │
│ can sign in here until it's on https://.      │
│ People already signed in stay signed in until │
│ their sign-in runs out or they sign out.      │
│                                               │
│ If you get locked out, see "Recovery" in the  │
│ docs.                                         │
│                          [Cancel] [Turn on]   │
└───────────────────────────────────────────────┘
```
On `https://` the first paragraph is "On plain http://, nobody can sign in after this."

**Secure cookies off:** "Only do this on plain http://. On https:// it makes sign-in cookies less safe." [Turn off]

**Trusted proxies:**
```
┌───────────────────────────────────────────────┐
│ Save trusted proxies?                         │
│                                               │
│ Homepad sees you as 192.0.2.10 now.           │
│ With this list it would see 198.51.100.7.     │
│                                               │
│ A wrong list makes everyone share one sign-in │
│ limit, or lets people fake their address.     │
│                            [Cancel] [Save]    │
└───────────────────────────────────────────────┘
```

**Account limit below the count:** "There are 7 accounts and 2 pending invites. Nobody is removed. New accounts and invites are refused until there are fewer than 5." [Set limit to 5]

**Sign-up to Open:** "Anyone who can open Homepad can make an account, including a kid who signs out." [Open sign-up]

**Single sign-on off:** "People who only use single sign-on can't sign in until it's back on. Admins with a password still can." [Turn off]

## 9. Copy (labels and help lines)

| Key | Label | Help line (editing) |
|---|---|---|
| `COOKIE_SECURE` | Secure cookies | On for https://. Off only for plain http://. |
| `HOMEPAD_TRUSTED_PROXIES` | Trusted proxies | Addresses, ranges or names of proxies in front of Homepad, separated by commas. Empty: everyone shares one sign-in limit. |
| `PORT` | Server port | — |
| `GATUS_BASE_URL` | Gatus address | The address of your Gatus server. Leave empty to turn status off. |
| `GATUS_DEGRADED_MS` | "Slow" threshold | A check slower than this, in milliseconds, shows as Slow. 0 turns it off. |
| — | Show uptime display | (unchanged) |
| `HOMEPAD_REGISTRATION` | Sign-up | Invite only: people join by invite. Open: anyone can make an account. |
| `HOMEPAD_MAX_ACCOUNTS` | Account limit | Accounts plus pending invites. 0 is no limit. |
| `OIDC_ENABLED` | Single sign-on | Let people sign in with your identity provider. |
| `OIDC_ISSUER` | Issuer | Your provider's address, like https://id.example.com. |
| `OIDC_DISCOVERY_URL` | Discovery URL | Leave empty unless your provider says otherwise. |
| `OIDC_REDIRECT_URL` | Redirect URL | Homepad's address followed by /api/auth/oidc/callback. Register it with your provider. |
| `OIDC_CLIENT_ID` | Client ID | From your provider. |
| `OIDC_CLIENT_SECRET` | Client secret | From your provider. It can't be shown again after you save. |
| `OIDC_ADMIN_GROUP` | Admin group | People in this group get an admin account. |
| `OIDC_MEMBER_GROUP` | Member group | With invite-only sign-up, people in this group get a member account. |

Say "single sign-on", not "OIDC", in labels and dialogs. The env name stays as the mono sub-label for operators.

## 10. Accessibility

- Each row is a `dt`/`dd` pair, as today. Edit and Reset buttons carry the label: "Edit Gatus address", "Reset Gatus address to env".
- The source badge is text, not just colour, and is no longer `aria-hidden`: with three values it now means something. Its accessible text is "Set in the UI", "From the environment" or "Default".
- Errors use `role="alert"`; the saved and reset flags use `role="status"`.
- Focus: Edit moves focus into the field; Save or Cancel returns it to Edit. Dialogs trap focus and return it to the control that opened them.
- Contrast: the `UI` badge's accent tint must reach 4.5:1 for its text in light and dark. Measure before merge.
- Touch targets 44 × 44 at 390.

## 11. Acceptance criteria covered

| Screen | ACs |
|---|---|
| §2 shared row | AC-032, AC-033 |
| §3 secret row | AC-013…AC-015, AC-035 |
| §4 states | AC-034 |
| §5 PORT row | AC-012, AC-035 |
| §6 banner | AC-031, AC-035 |
| §7 Sign-in group | AC-021…AC-023, AC-035 |
| §8 dialogs | AC-025…AC-027 |

## 12. Screenshot checkpoints

1. System with every badge type, at 390 and 1440, light and dark.
2. A row in each §4 state at 1280.
3. The secret row: set, not set, no server key, unreadable.
4. The Sign-in footer with a pending change, waiting for the test, and passed.
5. Each §8 dialog at 390.
6. The env-only banner at 390 and 1440.

## 13. Decisions (pending)

- **A-1: Booleans save on flip.** A switch with a separate Save is one step too many. **Recommended: save on flip**, with the confirm dialog first when one applies.
- **A-2: The `UI` badge gets the accent tint.** It makes "this was changed here" easy to spot. **Recommended: yes**, grey for `env` and `default`.
- **A-3: No show/hide on the secret field.** Showing it invites a screenshot. **Recommended: no toggle.**
- **A-4: No lock icon on `PORT`.** The line under it says why. **Recommended: line only.**
- **A-5: The Sign-in group's one Save.** It breaks the per-row pattern, but per-row saves would make broken in-between states. **Recommended: one Save for the group.**
- **A-6: The "Saved by" line.** Helpful in a household with two admins, but it's one more line per row. **Recommended: show it only on rows with badge `UI`.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-23 (Claude for Kare) — pending |
| Product | Caleb | Pending (A-1…A-6) |
