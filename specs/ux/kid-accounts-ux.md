# UX: Kid Accounts

**Spec:** [`SPEC-kid-accounts.md`](../SPEC-kid-accounts.md) §9 (v0.2.0, APPROVED 2026-10-22)
**Author:** Kare (design), drafted 2026-10-22
**Status:** DRAFT — awaiting Caleb's sign-off. Implementation (`/add:plan`, then the build) starts on APPROVED.

This doc designs the four surfaces in spec §9. Everything else reuses what exists: the Admin Panel shell (`SettingsPanel`), the user menu, `Modal`, and the dashboard grid.

---

## 1. Where it lives

```
Account menu (admin)
  ├─ Appearance
  ├─ My Dashboard  → Go to my dashboard · My settings
  └─ Administration
       ├─ Admin settings        (existing: System · Library)
       └─ Accounts              ← NEW, opens Admin Panel scrolled to "Accounts"
```

- **Accounts is a new section of the Admin Panel**, placed first, above System. It isn't a new top-level screen. It's global state, so it sits under the amber "Administration" label, which already means "affects everyone".
- The menu gets a second Administration item, "Accounts", which jumps straight to that section. People managing kids won't look under "Admin settings".

## 2. Accounts list

```
┌ Admin Panel ─────────────────────────────────────────── ✕ ┐
│ Changes here are global — they affect all users.          │
│                                                            │
│ ACCOUNTS                                    [+ Add a kid]  │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ● Caleb          admin   you                           │ │
│ │ ● Alex           user    alex@example.com              │ │
│ │ ◉ Maya           kid     12 apps · 1 device      Edit ›│ │
│ │ ◉ Leo            kid      6 apps · no devices    Edit ›│ │
│ └────────────────────────────────────────────────────────┘ │
│ Adults are listed only. Kids are managed here.             │
│                                                            │
│ SYSTEM …                                                   │
└────────────────────────────────────────────────────────────┘
```

- Rows: avatar dot in the account's color, display name, role pill (reuses `.role-pill`), then a summary. Adults show their email (truncated) and have no action (spec §10: listing only). Kids show "N apps · N devices" and an **Edit ›** affordance; the whole row is the target, at least 44px tall.
- **Empty state** (no kids yet): one line under the list, "Kids get a dashboard with only the apps you choose, signed in on their own device," plus the **+ Add a kid** button. No illustration.
- **Loading:** skeleton rows at a fixed height, the same pattern as the System section (§8.3), so the panel doesn't jump.
- **Error:** inline "Couldn't load accounts. Retry" in the section. The rest of the panel still works.

## 3. Kid editor

Opens over the Admin Panel as a `Modal` (the same shell as `ServiceForm`). Used for both **Add a kid** and **Edit**.

```
┌ Maya ──────────────────────────────────────────────── ✕ ┐
│ Name   [ Maya              ]    Color  ◉ ○ ○ ○ ○ ○        │
│                                                           │
│ APPS MAYA CAN SEE                12 of 52  [Search apps ] │
│ ▾ Media                      ☑ all (4)                    │
│     ☑ Plex   ☑ Jellyfin   ☑ Audiobookshelf   ☑ Kavita     │
│ ▾ Photos                     ◐ some (1 of 3)              │
│     ☑ Immich  ☐ PhotoPrism  ☐ Ente                        │
│ ▸ Monitoring                 ☐ none (6)                   │
│ ▸ Network                    ☐ none (5)                   │
│   …                                                       │
│ New apps you add later stay hidden until you tick them.   │
│                                                           │
│ DEVICES                                                   │
│   iPad · Safari · signed in Oct 22 · last used 2h ago     │
│                                         [Sign out]        │
│   [Sign in this device as Maya]                           │
│                                                           │
│ [Delete Maya]                       [Cancel]  [Save]      │
└───────────────────────────────────────────────────────────┘
```

- **Name** is required, 1–40 characters, and unique among kids. The error shows inline under the field. **Color** is a choice of six swatches from the existing accent tokens, with a default chosen for you.
- **App checklist**
  - It's grouped by the catalog's sections, in catalog order.
  - Each section header carries a tri-state checkbox (all / some / none) with a count; clicking it selects or clears the whole section.
  - Sections with at least one ticked app start expanded; the rest start collapsed. This keeps 50+ apps scannable.
  - Each app is a chip: icon, name, checkbox, and at least 44px tall for touch.
  - **Search** filters chips across all sections and expands any section with a match. The running "12 of 52" count is always visible.
  - The OQ-1 line ("New apps you add later stay hidden…") always shows. It's the one behavior an admin would otherwise be surprised by.
- **Devices** appears only when editing, not when adding.
  - Each row shows: the device from the user agent ("iPad · Safari"), when it signed in, and when it was last used.
  - **Sign out** revokes that session immediately, with no confirm. It's cheap to undo by signing in again.
  - "No devices yet" is the empty state.
- **Save** stays disabled until something changes. Closing with unsaved changes asks "Discard changes to Maya?", the same dirty-form confirm `ServiceForm` uses.
- **Saving zero apps is allowed.** The kid then sees the empty dashboard (§5). A warning under the count reads: "Maya will see an empty dashboard."
- **Delete Maya** asks for confirmation ("Delete Maya? Their devices are signed out and their favorites are removed."). The button is destructive-styled and sits bottom left, away from Save.

## 4. "Sign in this device as Maya" confirm

This is the one step that can lock the admin out of their own session on that device, so it gets a full `Modal` confirm, not an inline toggle.

```
┌──────────────────────────────────────────────────────┐
│  Sign in this device as Maya?                        │
│                                                      │
│  You'll be signed out here, and this device will     │
│  show Maya's dashboard. It stays signed in until you │
│  sign it out from Accounts on another device.        │
│                                                      │
│  To manage Homepad again on this device, sign out    │
│  of Maya and sign in as yourself.                    │
│                                                      │
│               [Cancel]   [Sign in as Maya]           │
└──────────────────────────────────────────────────────┘
```

- The primary button names the kid, never just "Confirm".
- If the editor has unsaved changes, the button is disabled with the hint "Save first".
- On success, the page reloads straight into Maya's dashboard. The admin's own session on this device has ended, and the server ended it, not the UI.
- **Getting the admin back:** the kid's user menu has **Sign out** (§5). It isn't hidden; kids leaving the dashboard isn't a threat under D4 ("hiding is enough"). It returns to the normal login screen.

## 5. Kid dashboard (iPad)

This is the existing dashboard in a **kid shell**, gated on `role === 'kid'`:

- **Removed:**
  - edit mode;
  - the App Library and "+ Add";
  - tile edit/delete;
  - Admin entries;
  - "My settings" items other than the theme.
- **Kept:**
  - the tiles, grouped by section (empty sections hidden, OQ-2);
  - ⌘K search, over allowed apps only;
  - favorites (the star on long-press or hover, as today);
  - Recently Opened.
- **Health bar:** off by default (OQ-3). If an admin later turns it on for a kid, it counts only that kid's apps.
- **User menu:**
  - the kid's name and color dot, with no role pill (the word "kid" is for the admin, not shown to the child);
  - Appearance (theme);
  - Sign out.
- **Tiles** keep the existing "large" density as the default for kids; it gives the biggest touch targets.

```
iPad landscape (1180×820)                 iPad portrait (820×1180)
┌──────────────────────────────────────┐  ┌───────────────────────┐
│ Homepad            ⌘K        ◉ Maya ▾│  │ Homepad     ⌘K  ◉ Maya▾│
│                                      │  │                        │
│ ★ Favorites                          │  │ ★ Favorites            │
│ [Plex] [Kavita]                      │  │ [Plex] [Kavita]        │
│                                      │  │                        │
│ Media                                │  │ Media                  │
│ [Plex] [Jellyfin] [Audiobookshelf]   │  │ [Plex] [Jellyfin]      │
│ [Kavita]                             │  │ [Audiobookshelf][Kavita│
│ Photos                               │  │ Photos                 │
│ [Immich]                             │  │ [Immich]               │
└──────────────────────────────────────┘  └───────────────────────┘
```

- The grid itself is unchanged; it already reflows at 820 and 1180. Kid accounts change *what* renders, not the layout.
- **Empty state** (zero allowed apps): centered, "No apps yet. Ask a grown-up to add some." No buttons. Kids have nothing to act on here.
- **Session ended** (an admin signed this device out): the next request gets a 401, and the app shows the normal login screen. No special "you were removed" copy that a child would have to parse.

## 6. Accessibility and copy

- Every new control can be reached by keyboard. The section tri-state uses `aria-checked="mixed"`. Chips are real checkboxes with visible labels.
- The kid editor's title is the kid's name (or "Add a kid"), so screen readers announce what is being edited.
- Copy never says "child account", "restricted" or "parental controls". It says "kid", and describes hiding honestly: "apps Maya can see", not "apps Maya is allowed to use" (D4: hiding, not blocking).

## 7. Screenshot checkpoints (for TC-001…TC-007)

1. The Accounts section with one adult and two kids, at 1440 and 820.
2. The kid editor with one section fully selected, one partly, and one collapsed, at 820.
3. The sign-in-as confirm, at 820.
4. The kid dashboard at 1180×820 and 820×1180, dark and light.
5. The kid dashboard's empty state, at 820.

## 8. Decisions for Caleb

- **K-1: Where Accounts sits.** I put it first in the Admin Panel, with its own menu item. The alternative is a separate panel. *Recommend: in the Admin Panel; one fewer surface.*
- **K-2: Sign out on the kid's menu.** Visible, per D4. The alternative is hiding it behind a long-press. *Recommend: visible. Otherwise an admin on that device has no way back without a second device.*
- **K-3: Default density for kids.** *Recommend: large.*

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-10-22 |
| Product | Caleb | Pending (K-1…K-3) |
