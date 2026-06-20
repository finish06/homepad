# SPEC — Settings: Admin-Global vs. Per-User Clarity

**Spec ID:** SPEC-settings-admin-vs-user  
**Date:** 2026-06-20  
**Status:** Approved — dispatch to Stitch  
**Author:** Walt (product)  
**Requested by:** Caleb Dunn  
**Implementation spec:** [`v11-admin-ux-clarity.md`](./v11-admin-ux-clarity.md) — read that for full code changes, testids, and CSS  
**Scope:** Frontend-only (React/Vite/Tailwind). No API changes, no data model changes.

---

## 1. Problem

Caleb reports: *"It's unclear which settings are admin-global (affect all users / the instance) versus per-user (affect only the current user's dashboard)."*

This is a real structural problem in the current UI. Here is exactly where the confusion lives, grounded in the code as-shipped today:

### 1a. UserMenu — two admin controls, zero scope signal

`UserMenu.tsx` shows both "Edit dashboard" and "Admin settings" as adjacent admin-only menu items with no visual grouping and no label that explains their scope:

- **"Edit dashboard"** → puts the catalog into edit mode; the admin can add, rename, reorder, and delete tiles — but only on *their own personal dashboard*. No other user's dashboard is touched.
- **"Admin settings"** → opens the `SettingsPanel` modal, which controls the *shared App Library catalog and system settings* — changes there affect every user on this homepad.

These two controls are visually identical in the menu. An admin has no UI signal telling them which one affects only themselves and which one affects everyone.

### 1b. SettingsPanel — titled "Settings," acts as a global admin panel

The modal is titled **"Settings"** — a word users read as *personal preferences*. But every control inside it (App Library CRUD, system config display) is **global state**. An admin opening it expecting personal preferences gets global admin controls instead.

### 1c. Non-admins — no signal that their dashboard *is* their settings

Non-admin users see Appearance and Log out in the menu. There is no settings entry point and no copy explaining that their tiles, categories, and icons are their personal dashboard, managed directly on the home screen. New users look for a "Settings" page and find nothing.

### 1d. Edit mode — personal vs. global is invisible at point of action

When an admin enters edit mode, no contextual label says "you are editing *your* dashboard." An admin who is also a heavy user of the global App Library may genuinely wonder: "Are these edits going to affect other users?"

---

## 2. What is NOT ambiguous (already clear in the current UI)

- The App Library browse modal (`LibraryBrowse.tsx`) already uses "Add apps to your dashboard" and `aria-label="Add {name} to my dashboard"` — the per-user nature of copying is clear.
- The System Settings section in the admin panel already carries a "Read-only — set via environment variables and redeploy" note.
- The API enforces admin-gating on all global library mutations; this is not a security gap — it is a user comprehension gap.

---

## 3. Decision

Scope this fix to four targeted, frontend-only changes (no new routes, no new modals, no API changes). These changes address every ambiguity identified above without restructuring the UI. Full implementation detail is in [`v11-admin-ux-clarity.md`](./v11-admin-ux-clarity.md).

| Change | Addresses |
|---|---|
| Admin section label + scope tags in UserMenu | 1a |
| Non-admin "your dashboard is your settings" note | 1c |
| Rename SettingsPanel title to "Admin Panel" + global-scope subtitle | 1b |
| Edit mode "Editing your personal dashboard" banner in Catalog | 1d |

---

## 4. Acceptance Criteria

These are the product acceptance criteria — written from a user's perspective. Stitch writes tests against these. Walt verifies these at staging PAT.

**AC-01 — Admin sees a distinct scope label in the menu.**  
When a logged-in admin opens the user menu, they see a visually distinct "ADMIN" section label (with a shield icon, amber-tinted, accessible contrast) above the "Edit dashboard" and "Admin settings" items in both light and dark themes. A non-admin user does not see this label.

**AC-02 — Scope tags tell the admin which control is personal and which is global.**  
"Edit dashboard" carries a small "personal" tag. "Admin settings" carries a small "global" tag styled in amber. Both tags are readable in light and dark themes. A non-admin user does not see these tags.

**AC-03 — Non-admin users see a plain-language explanation in the menu.**  
When a non-admin opens the user menu, they see a note reading "Your tiles, categories, and icons are your personal dashboard — manage them directly on the home screen." Admins do not see this note.

**AC-04 — The admin settings modal is titled "Admin Panel," not "Settings."**  
Opening the admin settings modal shows the heading "Admin Panel" and a subtitle reading "Changes here are global — they affect all users on this homepad." The word "Settings" no longer appears as the modal heading.

**AC-05 — The App Library section explicitly states it is shared.**  
The section note inside the admin modal for the App Library contains the phrase "all users" and "personal dashboards" so the admin understands that editing the library affects all users but never touches their existing copies.

**AC-06 — The System section explicitly states it applies globally.**  
The System section note contains "globally to all accounts."

**AC-07 — Edit mode shows a contextual banner at point of action.**  
When the admin activates edit mode, a banner reading "Editing your personal dashboard" appears in the catalog. When edit mode is off, the banner is absent. The banner makes clear to the admin that their edits touch only their own tiles.

**AC-08 — No regressions in existing functionality.**  
All existing `data-testid` values (`menu-edit`, `menu-admin-settings`, `settings-panel`, `settings-library`, `settings-system`, `settings-close`, tile/status/library testids) are preserved unchanged. The full existing vitest suite passes with zero new failures.

**AC-09 — Accessible in both themes.**  
The new scope tags, admin section label, and edit mode banner meet axe-core accessibility checks (no color-only signaling, accessible names on all interactive elements). All new elements render correctly in light and dark themes.

**AC-10 — User comprehension: scope is self-evident.**  
A user (any role) who has never used homepad before can, using only the UI, correctly identify: (a) which menu actions affect only themselves, (b) which menu actions affect all users, and (c) where their personal dashboard settings live. (Verified manually during Walt's PAT.)

---

## 5. Out of Scope for This Spec

The following are recognized but deferred to keep this shippable in one focused PR:

- A dedicated "Account Settings" page or modal for non-admins (current pattern — inline dashboard editing — is sufficient; a new page would be a bigger UX investment)
- Admin visibility into other users' dashboards (explicitly excluded by v9 design)
- Live mutation of system settings (OIDC, registration) through the UI (remains env/redeploy)
- Any changes to `LibraryBrowse.tsx` (already uses clear "your dashboard" language)

---

## 6. Implementation

See [`v11-admin-ux-clarity.md`](./v11-admin-ux-clarity.md) for:

- Exact JSX changes for `UserMenu.tsx`, `SettingsPanel.tsx`, `Catalog.tsx`
- New CSS classes and their `index.css` location
- New `ShieldIcon` SVG component
- All `data-testid` values for the new elements
- Test plan and slicing recommendation (single PR, branch `feat/v11-admin-ux-clarity`)

**Build pipeline:**  
`CI (lint + vitest)` → `Gracie QA (staging)` → `Walt PAT (staging)` → `prod`

**Walt's PAT checklist:**
- [ ] Admin UserMenu shows "ADMIN" label + scope tags; non-admin does not
- [ ] "Admin Panel" title + subtitle render correctly in the modal
- [ ] Library note says "all users" and "personal dashboards"
- [ ] System note says "globally to all accounts"
- [ ] Edit mode banner appears and disappears correctly
- [ ] No visual regressions in light and dark themes
- [ ] Existing test suite passes with zero new failures
