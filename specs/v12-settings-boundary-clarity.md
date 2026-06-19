# homepad v12 — Settings Boundary Clarity

**Version:** 1.0  **Date:** 2026-06-19  **Status:** Draft  
**Author:** Walt (product)  **Requested by:** Caleb Dunn  
**Audience:** Frontend developer (Stitch); tech-QA (Gracie). Backend untouched. Frontend-only change.  
**App:** homepad — React + Vite. Builds on v11 (commit 4acf4019).

---

## 1. Problem — What Is Still Confusing After v11

v11 shipped "Admin Panel" title, an amber "Admin" section label with scope tags, and non-admin note. Caleb still finds the admin-vs-user boundary confusing. The three root causes that v11 did not close:

### 1a. A personal action sits inside the "Admin" section

`UserMenu.tsx` lines 128–160: the `isAdmin` block wraps **both** the "Admin" shield-label **and** "Edit dashboard" (scope: personal). An admin reads:

> **[🛡 Admin]**  
> Edit dashboard `personal`  
> Admin settings `global`

"Edit dashboard" is a personal action on the admin's own tiles. Placing it under a label called "Admin" signals that editing your dashboard is an admin-level operation — the opposite of what's true. The "personal" scope tag is correct but the grouping is stronger than the tag; users trust grouping over labels.

### 1b. Non-admins have no labeled personal-settings section — just a floating note

Non-admins get `menu-dashboard-note` (a `<p>` element with no surrounding section label). The menu reads:

> Identity → Appearance → *(text note)* → Log out

There is no "My Dashboard" heading, no affordance to navigate toward personal settings — just passive text. Non-admins reasonably conclude they have no settings, not that their settings are the dashboard.

### 1c. Read-only System fields have a paragraph disclaimer but no per-field indicator

`SettingsPanel.tsx` lines 113–128: the System section leads with a paragraph note ("Read-only — set via environment variables…"). Individual KV rows have no per-field badge. An admin scanning the KV list quickly misses the paragraph and wonders why clicking a value does nothing. The self-registration value reads `"Managed via environment (HOMEPAD_REGISTRATION)"` — exposing a raw env-var name, which is developer jargon and not user-facing copy.

---

## 2. Goal

Eliminate all three remaining confusion points with surgical copy + JSX changes.

A user — any role — should be able to answer these questions from the UI alone:

- "Which things in this menu affect only me?"
- "Which things in this menu affect every user?"
- "Where are my personal settings?"
- "What does it mean when a field shows 🔒 env?"

---

## 3. Design Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | Split the admin UserMenu block into **two distinct sections**: `My Dashboard` (personal, all users) and `Administration` (global, admins only). | "Edit dashboard" is personal; it must live in a personal section. Mixing a personal item under "Admin" is the primary source of confusion. |
| **D2** | `My Dashboard` section is visible to **all users** — admins get the "Edit dashboard" button; non-admins get a note inside the section rather than floating below it. | Symmetric IA: both roles have a labeled personal section. Non-admins stop seeing a menu that looks like it has no settings for them. |
| **D3** | `Administration` section is **admin-only** and contains only "Admin settings." The admin-only badge on this section now means exactly one thing: global state. | Removes the contradiction. The shield/amber label now only appears above genuinely global controls. |
| **D4** | Rename the section label from **"Admin"** to **"Administration"** to make it unambiguous that this is an administrative function section, not a user-role header. | "Admin" reads like a role label ("you are admin"); "Administration" reads like a capability section ("admin-level operations"). |
| **D5** | Each read-only KV row in System Settings gets an inline **`[env]` badge** (small, muted, styled like `library-chip`). | Per-field signal is instant; the paragraph note remains as context but no longer carries the solo burden of communicating read-only status. |
| **D6** | Self-registration value changes from `"Managed via environment (HOMEPAD_REGISTRATION)"` to `"Controlled by server environment"`. | Remove the raw env-var name — it is a developer-internal detail with no action implication for the admin viewing it. |
| **D7** | `data-testid` migration: `menu-admin-section` → `menu-administration-section`; new `menu-my-dashboard-section` added. All other existing testids preserved. | Tests must be updated in the same PR — breaking a testid silently is worse than an explicit migration. Stitch updates all affected test assertions. |
| **D8** | No new routes, no new modals, no API changes, no CSS palette additions. All new styling uses existing tokens (`--text-muted`, amber classes already in Tailwind config from v11). | Stay in the surgical change boundary. The `Administration` section inherits the existing `.menu-admin-section` styling; rename the CSS class too. |

---

## 4. Changes — Detailed

### 4.1 `UserMenu.tsx` — Two sections for admins, labeled section for non-admins

**Replace the current `isAdmin` block and non-admin note (lines 128–169) with:**

```tsx
{/* My Dashboard — personal section, visible to ALL users */}
<div
  data-testid="menu-my-dashboard-section"
  className="menu-section-label"
>
  My Dashboard
</div>

{isAdmin ? (
  /* Admins: active button to enter edit mode */
  <button
    type="button"
    role="menuitem"
    data-testid="menu-edit"
    onClick={() => choose(onToggleEdit)}
    className="menu-item"
  >
    <PencilIcon />
    Edit dashboard
    <span className="menu-scope-tag">personal</span>
  </button>
) : (
  /* Non-admins: contextual note inside the section (not floating below it) */
  <p data-testid="menu-dashboard-note" className="menu-dashboard-note">
    Your tiles, categories, and icons are your personal dashboard —
    manage them directly on the home screen.
  </p>
)}

{/* Administration — global section, admins only */}
{isAdmin && (
  <>
    <div className="menu-sep" />
    <div
      data-testid="menu-administration-section"
      className="menu-administration-section"
    >
      <ShieldIcon />
      Administration
    </div>
    <button
      type="button"
      role="menuitem"
      data-testid="menu-admin-settings"
      onClick={() => choose(onOpenAdminSettings)}
      className="menu-item"
    >
      <LibraryIcon />
      Admin settings
      <span className="menu-scope-tag menu-scope-tag--global">global</span>
    </button>
  </>
)}
```

**CSS changes in `index.css`:**

- Add `.menu-section-label` — identical visual style to current `.menu-label` (used by "Appearance"). The personal section label uses the same muted uppercase style, not amber. Amber is reserved for the administration section only.
- Rename `.menu-admin-section` → `.menu-administration-section` (same visual definition, same amber tint from v11). Update the class name on the element.

```css
/* Personal section label — same style as .menu-label */
.menu-section-label {
  padding: 8px 12px 3px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* Administration section label — rename of .menu-admin-section */
.menu-administration-section {
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
.dark .menu-administration-section {
  color: theme('colors.amber.400');
}
```

Remove the old `.menu-admin-section` CSS rule after renaming.

---

### 4.2 `SettingsPanel.tsx` — Per-field env badges + clean self-registration copy

**Replace `SystemSettings` component (lines 107–129):**

```tsx
function SystemSettings({ oidcEnabled }: { oidcEnabled: boolean }) {
  return (
    <section data-testid="settings-system" aria-labelledby="settings-system-h" className="settings-section">
      <h3 id="settings-system-h" className="settings-section-title">
        System
      </h3>
      <p className="settings-section-note">
        Read-only — set via environment variables and redeploy. These settings
        apply globally to all accounts.
      </p>
      <dl className="settings-kv">
        <div className="settings-kv-row">
          <dt>OIDC sign-in</dt>
          <dd>
            {oidcEnabled ? 'Enabled' : 'Disabled'}
            <span data-testid="settings-env-badge-oidc" className="settings-env-badge">env</span>
          </dd>
        </div>
        <div className="settings-kv-row">
          <dt>Self-registration</dt>
          <dd>
            Controlled by server environment
            <span data-testid="settings-env-badge-registration" className="settings-env-badge">env</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
```

**New CSS class:**

```css
.settings-env-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .06em;
  text-transform: uppercase;
  border-radius: 4px;
  color: #9aa3b8;
  background: rgba(15, 23, 42, .05);
  vertical-align: middle;
}
.dark .settings-env-badge {
  background: rgba(255, 255, 255, .07);
}
```

---

### 4.3 `UserMenu.test.tsx` — Test migration

Stitch updates all test assertions referencing `menu-admin-section` to use `menu-administration-section`. Specifically:

| Old assertion | New assertion |
|---|---|
| `getByTestId('menu-admin-section')` | `getByTestId('menu-administration-section')` |
| `queryByTestId('menu-admin-section')` not in document | `queryByTestId('menu-administration-section')` not in document |

Add new assertions:
- Admin: `menu-my-dashboard-section` is in document; `menu-administration-section` is in document
- Non-admin: `menu-my-dashboard-section` is in document; `menu-administration-section` is NOT in document; `menu-dashboard-note` is inside the `menu-my-dashboard-section` region (or directly follows it)

---

## 5. What Is NOT Changing

- `menu-edit`, `menu-admin-settings`, `settings-panel`, `settings-library`, `settings-system`, `settings-close`, `menu-logout`, `menu-dashboard-note` — all testids preserved.
- Admin Panel title ("Admin Panel"), subtitle, App Library section, all Library testids — unchanged.
- Edit mode banner (`edit-mode-banner`) from v11 — unchanged.
- No new routes, modals, or API endpoints.
- Theme tokens, tile design, layout — untouched.

---

## 6. Acceptance Criteria

| # | Criterion | Test type |
|---|---|---|
| **A1** | An admin opening the UserMenu sees **"My Dashboard"** section label (`menu-my-dashboard-section`) above "Edit dashboard." The label is muted/uppercase, NOT amber. | Component (admin user) |
| **A2** | An admin opening the UserMenu sees **"Administration"** section label (`menu-administration-section`) with shield icon in amber, above "Admin settings" only. "Edit dashboard" is **not** inside this section. | Component (admin user) |
| **A3** | "Edit dashboard" (`menu-edit`) has scope tag `personal`. "Admin settings" (`menu-admin-settings`) has scope tag `global`. Both tags render in light and dark. | Component (admin user) |
| **A4** | A non-admin opening the UserMenu sees **"My Dashboard"** section label (`menu-my-dashboard-section`). | Component (non-admin user) |
| **A5** | A non-admin does **not** see an `Administration` section (`menu-administration-section` absent) and does **not** see `menu-edit`. | Component (non-admin user) |
| **A6** | Non-admin `menu-dashboard-note` appears inside or directly adjacent to the "My Dashboard" section — not floating between the separator and Log out with no heading. | Component (non-admin user) |
| **A7** | Admin does **not** see `menu-dashboard-note`. | Component (admin user) |
| **A8** | Each System Settings row in the Admin Panel has an **env badge**: `settings-env-badge-oidc` and `settings-env-badge-registration` both render, contain the text "env". | Component (admin, settings open) |
| **A9** | Self-registration `<dd>` text does **not** contain `"HOMEPAD_REGISTRATION"` or any raw env-var name. It reads `"Controlled by server environment"`. | Component assertion on `dd` text content |
| **A10** | All existing tests pass with zero new failures (after the `menu-admin-section` → `menu-administration-section` testid migration in test files). | `vitest run` — 0 failures |
| **A11** | No axe-core violations on `UserMenu` (admin role) or `SettingsPanel` (admin role) — 0 violations. | jest-axe |
| **A12** | Light and dark themes: "My Dashboard" label is muted (not amber); "Administration" label is amber. Both are visually legible at WCAG AA contrast. | Component render under `.dark` class |
| **A13** | A first-time admin user, shown only the menu, can correctly identify: (a) which item affects only them, (b) which item affects all users, (c) where to find their personal dashboard settings — without reading any documentation. | Manual — PAT |
| **A14** | A first-time non-admin user, shown only the menu, understands where their personal settings live. | Manual — PAT |

---

## 7. Slicing

Single PR. All three changes (UserMenu restructure, System Settings env badges, test migration) serve the same feature and are tiny — splitting adds overhead with no benefit.

**Branch name:** `feat/v12-settings-boundary-clarity`

**Files touched:**
1. `src/UserMenu.tsx` — section restructure (§4.1)
2. `src/SettingsPanel.tsx` — env badges + copy (§4.2)
3. `src/index.css` — new `.menu-section-label`, `.menu-administration-section`, `.settings-env-badge` (rename old `.menu-admin-section`)
4. `src/UserMenu.test.tsx` — testid migration + new assertions (§4.3)
5. `src/SettingsPanel.test.tsx` — add assertions for env badge testids

---

## 8. Out of Scope

- A dedicated "My Account" panel with profile editing, password change, etc. (no profile data exposed in the current API — deferred)
- Surfacing the actual self-registration enabled/disabled value (requires a new `GET /api/admin/config` endpoint — deferred; self-registration displays "Controlled by server environment" for now)
- Any admin visibility into individual users' dashboards (excluded per v9 design)
- Moving "Appearance" into the "My Dashboard" section (current placement is fine; not a confusing point)
