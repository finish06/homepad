# homepad v11 — Admin / Personal Scope Clarity — Product Spec

**Version:** 1.0  **Date:** 2026-06-18  **Status:** Shipped — prod v11.0.0 (commit 4acf4019, 2026-06-18)
**Author:** Walt (product)  **Requested by:** Caleb Dunn
**Audience:** Frontend developer; backend untouched — web-only change.
**App:** homepad — React + Vite + Tailwind CSS. Light + Dark themes.
**Builds on:** [`v9-per-user-dashboards.md`](./v9-per-user-dashboards.md), [`v7-ux-redesign.md`](./v7-ux-redesign.md)

---

## 1. Problem Statement

Caleb (admin) reports the admin vs. personal settings split is **confusing** after
the v9 per-user model shipped. The root causes, grounded in the actual code:

1. **"Admin settings" in the UserMenu sits next to "Edit dashboard" with no visual
   grouping or scope label** — both are admin-only but they do fundamentally
   different things: "Edit dashboard" touches *only the admin's personal tiles*;
   "Admin settings" controls *global, cross-user state* (the App Library every
   user browses; system configuration). Nothing in the current UI signals which
   scope a control operates at.

2. **The SettingsPanel modal is titled "Settings"** — a word that reads as
   *personal preferences*, not *global admin controls*. An admin clicking it
   reasonably expects their own settings; instead they get shared-state management.

3. **Non-admins have no settings path at all.** They see Appearance + Log out in
   the menu; the Settings modal is unreachable. There's no "dead-end" — but there's
   also no explicit signal that their tiles, categories, and icons *are* their
   personal settings, managed right on the dashboard. A new user wonders "where are
   my settings?" and the answer is invisible.

4. **Inside the admin panel, sections lack scope labels.** "App Library" and
   "System" have no copy that says *these changes affect all users* — the admin has
   to infer that from context.

---

## 2. Goal

Make the admin / personal scope split **unmistakable** without a redesign.
No new routes. No API changes. Front-end-only, surgical, no regressions.

**A user (any role) should be able to answer these questions without reading
documentation:**
- "Which of my actions affect only me?"
- "Which of my actions affect every user on this homepad?"
- "Where do I find my personal settings?"
- "Where do I find admin-only controls?"

---

## 3. Design Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | Admin-only items in UserMenu get a dedicated, visually distinct **"ADMIN" section label** — an inline divider styled with the existing amber/warning token, not a color outside the v7 palette. | Separates scope visually without adding a new palette entry; matches the existing "APPEARANCE" section label pattern already in the menu. |
| **D2** | "Admin settings" menu item label stays unchanged; the section label does the scope signaling. The `data-testid` is **preserved**. | Minimizes diff; existing tests are untouched; the section label is the primary signal. |
| **D3** | SettingsPanel title: **"Settings" → "Admin Panel"**. Subtitle added under the title. No layout restructure. | The title is the first thing an admin reads on open; getting it right is the highest-value single-character change in this spec. |
| **D4** | Non-admin users get a **"Your dashboard is your settings"** note in the UserMenu — a one-liner above Log out — so they have a mental model, not a mystery. | Zero new surface; fits in the existing menu structure. Non-admins never see admin items; this closes the "where are my settings?" gap. |
| **D5** | App Library section note is updated to make **scope explicit** ("shared — all users browse this"). System section note already says env/redeploy; extend it to note global scope. | Copy-only change; no structural change. |
| **D6** | When **edit mode** is active, show a subtle contextual label on the catalog ("Editing your dashboard") so an admin in edit mode knows they are touching their personal tiles, not global state. | Closes the remaining confusion: Edit dashboard (personal) vs. Admin Panel (global) are now unambiguously labeled at point-of-use. |
| **D7** | All v7 design tokens apply. No new colors. The "ADMIN" section label uses `--text-muted` + an amber or rose tint from Tailwind (`text-amber-600 dark:text-amber-400`), which is already in the Tailwind config. | Stay in the existing palette; no new CSS variables. |

---

## 4. Changes — Detailed

### 4.1 `UserMenu.tsx` — Admin section label + non-admin note

**Current admin block (lines 126–152):**
```tsx
{isAdmin && (
  <button ... data-testid="menu-edit">Edit dashboard</button>
)}
{isAdmin && (
  <button ... data-testid="menu-admin-settings">Admin settings</button>
)}
```

**Change to:**
```tsx
{isAdmin && (
  <>
    {/* ADMIN section divider — signals global scope to the admin */}
    <div data-testid="menu-admin-section" className="menu-admin-section">
      <ShieldIcon />
      Admin
    </div>
    <button ... data-testid="menu-edit" className="menu-item">
      <PencilIcon />
      Edit dashboard
      <span className="menu-scope-tag">personal</span>
    </button>
    <button ... data-testid="menu-admin-settings" className="menu-item">
      <LibraryIcon />
      Admin settings
      <span className="menu-scope-tag menu-scope-tag--global">global</span>
    </button>
  </>
)}
```

**Non-admin note — add before the final separator/logout:**
```tsx
{!isAdmin && (
  <p data-testid="menu-dashboard-note" className="menu-dashboard-note">
    Your tiles, categories, and icons are your personal dashboard — manage
    them directly on the home screen.
  </p>
)}
```

**New CSS classes needed (add to `index.css` under `@layer components`):**

```css
/* ADMIN section divider in UserMenu */
.menu-admin-section {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--amber-label, theme('colors.amber.600'));
}
.dark .menu-admin-section {
  color: theme('colors.amber.400');
}

/* Tiny scope tag on menu items */
.menu-scope-tag {
  margin-left: auto;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  color: #9aa3b8; /* --text-faint */
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(15,23,42,.05);
}
.menu-scope-tag--global {
  color: theme('colors.amber.700');
  background: theme('colors.amber.50');
}
.dark .menu-scope-tag--global {
  color: theme('colors.amber.300');
  background: rgba(251,191,36,.12);
}

/* Non-admin dashboard note */
.menu-dashboard-note {
  padding: 8px 12px 6px;
  font-size: 11px;
  color: #9aa3b8;
  line-height: 1.4;
}
```

**New icon — `ShieldIcon` (inline SVG, same pattern as `PencilIcon`):**
```tsx
function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={1.8} className="menu-icon" style={{opacity:1}}>
      <path strokeLinecap="round" strokeLinejoin="round"
            d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
    </svg>
  );
}
```

### 4.2 `SettingsPanel.tsx` — "Admin Panel" title + scope subtitle

**Current header block (lines 65–77):**
```tsx
<div className="library-head">
  <h2 className="library-title">Settings</h2>
  ...
</div>
```

**Change to:**
```tsx
<div className="library-head">
  <div className="settings-admin-title-group">
    <h2 className="library-title">Admin Panel</h2>
    <p className="settings-admin-subtitle">
      Changes here are global — they affect all users on this homepad.
    </p>
  </div>
  ...
</div>
```

Update `aria-label` on the dialog (line 60):
```tsx
aria-label="Admin Panel"
```

**New CSS class:**
```css
.settings-admin-title-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.settings-admin-subtitle {
  font-size: 11px;
  color: theme('colors.amber.700');
  font-weight: 500;
}
.dark .settings-admin-subtitle {
  color: theme('colors.amber.400');
}
```

### 4.3 `SettingsPanel.tsx` — Section scope notes

**App Library section — update `<p className="settings-section-note">` (line 205–207):**

Current:
```
Offers any user can browse and copy. Editing or deleting an offer never touches copies users already added.
```

Updated:
```
Shared catalog — all users see these offers in "Add apps." Editing or deleting an offer never touches copies users already added to their personal dashboards.
```

**System section — update `<p className="settings-section-note">` (line 106–108):**

Current:
```
Read-only — these are set via environment variables and a redeploy.
```

Updated:
```
Read-only — set via environment variables and redeploy. These settings apply globally to all accounts.
```

### 4.4 `Catalog.tsx` — Edit mode contextual label

When `editMode` is true, render a subtle banner at the top of the catalog:

```tsx
{editMode && (
  <div data-testid="edit-mode-banner" className="edit-mode-banner" role="status">
    <PencilIcon />
    Editing your personal dashboard
  </div>
)}
```

**CSS:**
```css
.edit-mode-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  margin-bottom: 12px;
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
  background: rgba(99,102,241,.07);
  border: 1px solid rgba(99,102,241,.15);
  border-radius: 8px;
}
.dark .edit-mode-banner {
  background: rgba(99,102,241,.12);
  border-color: rgba(99,102,241,.25);
}
```

The `PencilIcon` already exists in `UserMenu.tsx`; move it to a shared location (or inline a second copy in `Catalog.tsx` — simpler, since it's a trivial SVG).

---

## 5. What is NOT changing

- No API changes. No new routes. No data model changes.
- `data-testid="menu-edit"`, `data-testid="menu-admin-settings"`, `data-testid="settings-panel"`, `data-testid="settings-library"`, `data-testid="settings-system"` are **all preserved** exactly.
- Navigation structure: no new pages, no new modals, no route changes.
- The App Library browsing surface (`LibraryBrowse.tsx`) is untouched.
- The existing `settings-close` testid and modal close behavior are untouched.
- Theme, layout, tile design — all untouched.

---

## 6. Acceptance Criteria

Each criterion is user-observable and testable:

| # | Criterion | How verified |
|---|---|---|
| **A1** | An admin opening the UserMenu sees a distinct **"ADMIN" section label** (with shield icon, amber-tinted) before "Edit dashboard" and "Admin settings." The label renders in both light and dark mode with accessible contrast. | Component test: admin user → `menu-admin-section` renders; non-admin → absent. |
| **A2** | "Edit dashboard" shows a **"personal" scope tag**; "Admin settings" shows a **"global" scope tag** in amber styling. Both tags are visible in light and dark. | Component test: admin user → both tags present with correct text. |
| **A3** | A **non-admin** user opens the UserMenu and sees a **"Your tiles…" note** explaining their dashboard is their settings. The note does **not** appear for admins. | Component test: non-admin user → `menu-dashboard-note` renders; admin → absent. |
| **A4** | The Settings modal opens with title **"Admin Panel"** (not "Settings") and a subtitle reading "Changes here are global — they affect all users on this homepad." | Component test: admin opens settings → `settings-panel` aria-label = "Admin Panel"; subtitle renders. |
| **A5** | The App Library section note inside the Admin Panel includes the phrase **"all users"** and **"personal dashboards"**. | Component test: `settings-library` section note contains both phrases. |
| **A6** | The System section note includes **"globally to all accounts"**. | Component test: `settings-system` section note contains phrase. |
| **A7** | When **edit mode is active**, a `data-testid="edit-mode-banner"` banner reading "Editing your personal dashboard" appears in the catalog. It is absent when edit mode is off. | Component test: editMode=true → banner renders; editMode=false → absent. |
| **A8** | All **existing `data-testid` values** are preserved: `menu-edit`, `menu-admin-settings`, `settings-panel`, `settings-library`, `settings-system`, `settings-close`, all tile/status/library testids. | Run existing vitest suite: 0 new failures. |
| **A9** | The new scope tags and admin section label **pass axe-core** (no color-only signal, accessible names on all interactive elements). | jest-axe on UserMenu (admin role) — 0 violations. |
| **A10** | All new UI renders correctly in **light and dark** themes with no visual regressions. The amber admin label and scope tags are legible in both. | Component: render under `.dark` class; assert label + tags render. |
| **A11** | A user who has never used homepad, given only the UI, can correctly identify: (a) which menu items affect only them, (b) which affect all users, (c) where their personal dashboard settings live. | Manual verification during PAT. |

---

## 7. Slicing (single PR recommended)

This is a **front-end-only, copy + CSS + minor JSX change**. No migration, no API
delta, no backend. One PR is appropriate:

1. `UserMenu.tsx` — admin section label, scope tags, non-admin note, ShieldIcon
2. `SettingsPanel.tsx` — title, subtitle, scope notes on sections
3. `Catalog.tsx` — edit mode banner
4. `index.css` — new CSS classes per §4

Each is self-contained but all serve the single feature (scope clarity); splitting
them into separate PRs adds commit overhead with no benefit.

**Branch name:** `feat/v11-admin-ux-clarity`

---

## 8. Out of Scope

- Moving Appearance to its own "My Account" panel (deferred — the current menu
  placement is fine; non-admins can access it without a separate panel)
- Adding a dedicated non-admin "Account Settings" page
- Any admin capability to see/manage other users' dashboards (deliberately excluded
  per v9 design principles)
- Live system settings mutation (remains env/redeploy, per D7 from v9)

---

## 9. PAT Checklist (Walt will verify at staging)

Walt's PAT confirmed (2026-06-18, staging commit 4acf4019):
- [x] Admin UserMenu shows ADMIN label + scope tags; non-admin does not
- [x] "Admin Panel" title + subtitle render correctly in the modal
- [x] Library section note explicitly says "all users"
- [x] System section note says "globally to all accounts"
- [x] Edit mode banner appears/disappears correctly (#61 adminEdit gate verified)
- [x] No visual regressions in light + dark
- [x] Existing test suite passes (325 vitest green, 0 axe violations)
- [x] UserMenu dropdown z-index fix confirmed (header z-20, drop clears grips)
- [x] Browser-gate test #60 present in main (tests/browser-gate/header-zindex.spec.ts)

**PAT verdict: PASS — prod-ready. Shipped as v11.0.0.**
