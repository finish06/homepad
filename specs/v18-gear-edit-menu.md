# homepad v18 — Gear: Unified Edit-Dashboard Menu

**Spec ID:** v18-gear-edit-menu  
**Date:** 2026-06-28  **Status:** Shipped — v12.5.0 (2026-06-29, PR #176)  
**Author:** Walt (product lead)  **Requested by:** Caleb Dunn  
**Audience:** Stitch (implementer), Gracie (tech-QA). Frontend-only. No API changes.  
**App:** homepad — React + Vite + Tailwind. Builds on main (post #169 — Gear/Arrange restored).

---

## 1. Problem

Edit-dashboard actions are scattered across three different surfaces, with no single discovery path:

| Action | Where it lives today |
|---|---|
| Arrange tiles (drag-drop reorder) | Gear button in header — direct toggle |
| Add apps from library | Standalone "+ Add apps" button above the tile grid |
| Enter admin edit mode (per-tile icon controls, CategoryManager, add custom app) | Avatar menu → "My Dashboard" → "Edit dashboard" (toggle) |

A user who wants to do ANY editing — add an app, rearrange, manage categories, upload an icon — has to know which surface to go to. The Gear is already in the header as the natural edit-dashboard control, but it only exposes one action (arrange), leaving the rest buried or scattered.

**Caleb's words:** *"All edit dashboard actions come available when one hits the Gear."*

**SPEC-149 context:** That spec added a "Done editing" exit button to the editMode banner, and its §6 explicitly said "Avatar-menu toggle ('Edit dashboard' in UserMenu) — still works, not removed." **This spec supersedes that clause** — "Edit dashboard" in UserMenu IS removed here, replaced by the Gear menu.

---

## 2. Goal

**One click on the Gear → all edit-dashboard actions available, role-appropriately.**

A user never has to hunt across surfaces. The Gear is the single, discoverable entry point for anything that changes the layout or content of their dashboard.

---

## 3. Design Decisions

| # | Decision | Rationale |
|---|---|---|
| **D1** | Gear changes from a toggle button (`aria-pressed`) to a **dropdown menu trigger** (`aria-haspopup="menu"`). | A single toggle only surfaces one mode. A menu can carry all edit actions without requiring the user to discover them separately. |
| **D2** | The Gear menu is divided into two sections: an unlabeled personal section (all users) and an **"Admin editing"** labeled section (admins only), using the existing amber/shield visual language from UserMenu's "Administration" section. | Visual language consistency. The amber + shield pattern already signals "admin / global" to users familiar with the UserMenu. |
| **D3** | "Arrange tiles" is a **toggle menu item** inside the Gear menu (checkmark when active), replacing the current `aria-pressed` Gear toggle. The drag-grip behavior on tiles is unchanged. | The same function, just accessed through the menu instead of a bare toggle. |
| **D4** | "Add apps" is a **direct action** in the Gear menu personal section — clicking it opens LibraryBrowse and closes the Gear menu. The standalone "+ Add apps" button above the tile grid **remains** as a secondary contextual entry (especially valuable for onboarding). | Two entry points for the same action is fine and helpful. The Gear consolidates; the inline button aids onboarding discoverability. |
| **D5** | "Edit tiles" (admin) is a **toggle menu item** that controls `editMode` — same gate as before, just moved from UserMenu to Gear. When on: the edit-mode banner appears, per-tile icon upload/edit controls appear, CategoryManager appears, and the inline "+ Add app" button appears in the catalog. | EditMode as a concept is preserved; only the trigger surface changes. |
| **D6** | "Add custom app" (admin) is a **direct action** in the Gear menu. Opens ServiceForm immediately, **without requiring editMode to be active first**. The user adds a custom app, the form closes, and they're back to their normal (or arrange, or edit) view. | Requiring editMode to add one app is unnecessary friction. The ServiceForm is self-contained. |
| **D7** | The Gear icon shows a **highlighted/active appearance** whenever ANY editing mode is active — arrange OR editMode. This gives a persistent ambient signal that editing is on, even with the menu closed. | Users can see at a glance whether a mode is active without opening the menu. Matches the existing active styling already on the Gear. |
| **D8** | UserMenu "My Dashboard" section: **remove** the admin-only "Edit dashboard" button. Admins get "Go to my dashboard" (same as non-admins). The personal section is now symmetric for all roles. | The Gear handles all admin editing. The UserMenu "My Dashboard" section is purely navigational — "Go to my dashboard" — for both roles. No admin-specific item needed there. |
| **D9** | Gear menu closes on: outside click, Escape key, and after any direct action (Add apps, Add custom app). It does **not** close when a toggle item (Arrange tiles, Edit tiles) is clicked — the user may want to toggle and then use another item. Wait, it DOES close after a toggle too — to keep behavior predictable. Re-open the menu to see current state. | Standard dropdown menu behavior. Consistent with UserMenu. |

Wait — on D9 revised: **the Gear menu closes after every click** (both toggles and direct actions). Toggles update state immediately; the user can re-open the menu to see the new checkmark state. Predictable, simple.

---

## 4. Changes — Detailed

### 4.1 `AppHeader.tsx` — Gear becomes a menu trigger

**Replace `SettingsGear` component:**

```tsx
// v18 — the Gear menu trigger. Opens a dropdown with all edit-dashboard
// actions for the current user's role. Icon highlights when any edit mode is
// active (arrange OR editMode). aria-haspopup replaces the old aria-pressed.
function GearMenuTrigger({
  anyModeActive,
  onClick,
}: {
  anyModeActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="settings-gear"
      aria-label="Edit dashboard"
      aria-haspopup="menu"
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full outline-none transition
        hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-500
        dark:hover:bg-neutral-800
        ${anyModeActive
          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
          : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
        }`}
    >
      {/* same gear SVG as before */}
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth={1.8} className="h-5 w-5">
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a
             1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65
             1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06
             a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65
             0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65
             1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0
             0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65
             1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65
             0 0 0-1.51 1Z" />
      </svg>
    </button>
  );
}
```

**Add `GearMenu` component** (positioned dropdown, same pattern as `UserMenu`):

```tsx
// v18 — the Gear dropdown. Contains all edit-dashboard actions.
// `onClose` fires on outside click and Escape; every action also fires it.
function GearMenu({
  isAdmin,
  arrange,
  editMode,
  onToggleArrange,
  onToggleEditMode,
  onAddApps,
  onAddCustomApp,
  onClose,
}: {
  isAdmin: boolean;
  arrange: boolean;
  editMode: boolean;
  onToggleArrange: () => void;
  onToggleEditMode: () => void;
  onAddApps: () => void;
  onAddCustomApp: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click + Escape (same pattern as UserMenu).
  useEffect(() => {
    function onDocPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    }
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  function act(fn: () => void) { fn(); onClose(); }

  return (
    <div
      ref={menuRef}
      data-testid="gear-menu"
      role="menu"
      aria-label="Edit dashboard"
      className="gear-menu"
    >
      {/* Personal section — all users */}
      <div data-testid="gear-menu-section-personal" className="menu-section-label">
        My Dashboard
      </div>

      <button
        type="button"
        role="menuitem"
        data-testid="gear-arrange"
        onClick={() => act(onToggleArrange)}
        className="menu-item"
      >
        <ArrangeIcon />
        Arrange tiles
        {arrange && <CheckIcon />}
      </button>

      <button
        type="button"
        role="menuitem"
        data-testid="gear-add-apps"
        onClick={() => act(onAddApps)}
        className="menu-item"
      >
        <PlusIcon />
        Add apps
      </button>

      {/* Admin editing section — admins only */}
      {isAdmin && (
        <>
          <div className="menu-sep" />
          <div data-testid="gear-menu-section-admin" className="menu-administration-section">
            <ShieldIcon />
            Admin editing
          </div>

          <button
            type="button"
            role="menuitem"
            data-testid="gear-edit-tiles"
            onClick={() => act(onToggleEditMode)}
            className="menu-item"
          >
            <PencilIcon />
            Edit tiles
            {editMode && <CheckIcon />}
          </button>

          <button
            type="button"
            role="menuitem"
            data-testid="gear-add-custom-app"
            onClick={() => act(onAddCustomApp)}
            className="menu-item"
          >
            <PlusIcon />
            Add custom app
          </button>
        </>
      )}
    </div>
  );
}
```

**New icons needed** (inline SVGs, same pattern as existing icons in `UserMenu.tsx` — `aria-hidden`, `className="menu-icon"`):
- `ArrangeIcon` — a 4-grip or 6-dot handle (≈ `⠿` shape); or use a simple 3-line sort icon.
- `CheckIcon` — a simple checkmark (✓), trailing, muted, to signal the toggle is active. Renders on the right inside the menu item.
- `PlusIcon` — a `+` circle, reused for both "Add apps" and "Add custom app."
- `PencilIcon` — already exists in `UserMenu.tsx`; move to a shared location or copy into `AppHeader.tsx`.
- `ShieldIcon` — already exists in `UserMenu.tsx`; same.

**`AppHeader` component:** thread new props and own the Gear menu open/close state.

```tsx
export default function AppHeader({
  user,
  arrange = false,
  editMode = false,
  onToggleArrange = () => {},
  onToggleEditMode = () => {},
  onOpenLibrary,           // new — triggers LibraryBrowse via parent
  onOpenCustomAppForm,     // new — triggers ServiceForm via parent (admin)
  onToggleEdit,            // KEEP for UserMenu (admin settings still there)
  onOpenAdminSettings,
  onGoToDashboard,
  onLogout,
  alertCount,
  onAlertClick,
  bellRef,
}: { ... }) {
  const [gearOpen, setGearOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const anyModeActive = arrange || editMode;

  return (
    <header ...>
      <div ...>
        <span className="wordmark">homepad</span>
        <LauncherTrigger />
        <div className="flex items-center gap-3">
          <LastUpdated />
          <div className="relative">
            <GearMenuTrigger
              anyModeActive={anyModeActive}
              onClick={() => setGearOpen((o) => !o)}
            />
            {gearOpen && (
              <GearMenu
                isAdmin={isAdmin}
                arrange={arrange}
                editMode={editMode}
                onToggleArrange={onToggleArrange}
                onToggleEditMode={onToggleEditMode}
                onAddApps={onOpenLibrary}
                onAddCustomApp={onOpenCustomAppForm}
                onClose={() => setGearOpen(false)}
              />
            )}
          </div>
          <AlertBell count={alertCount} onClick={onAlertClick} bellRef={bellRef} />
          <UserMenu
            user={user}
            onToggleEdit={onToggleEdit}
            onOpenAdminSettings={onOpenAdminSettings}
            onGoToDashboard={onGoToDashboard}
            onLogout={onLogout}
          />
        </div>
      </div>
    </header>
  );
}
```

---

### 4.2 `App.tsx` — Thread new props + expose library/form open from parent

`Home` component owns `editMode`, `settingsOpen`, and now also `browseOpen` (LibraryBrowse) and `customFormOpen` (ServiceForm add mode). Pass callbacks into `AppHeader` and into `Catalog`:

```tsx
const [browseOpen, setBrowseOpen] = useState(false);
const [customFormOpen, setCustomFormOpen] = useState(false);

<AppHeader
  ...
  editMode={editMode}
  onToggleEditMode={() => setEditMode((on) => !on)}  // for Gear "Edit tiles"
  onOpenLibrary={() => setBrowseOpen(true)}
  onOpenCustomAppForm={() => setCustomFormOpen(true)}
  ...
/>

<Catalog
  ...
  editMode={editMode}
  browseOpen={browseOpen}
  onBrowseClose={() => setBrowseOpen(false)}
  customFormOpen={customFormOpen}
  onCustomFormClose={() => setCustomFormOpen(false)}
  onExitEdit={() => setEditMode(false)}
/>
```

**Note on `browseOpen` / `customFormOpen` lifting:** The LibraryBrowse modal and ServiceForm (add mode) currently live INSIDE Catalog's own state (`setBrowseOpen`, `setForm`). These need to be lifted to `App.tsx` so the Gear (inside AppHeader) can trigger them. The Catalog continues to own the open-state for the edit-service flow (editing an existing tile) — that stays internal.

---

### 4.3 `UserMenu.tsx` — Remove admin "Edit dashboard"; use "Go to my dashboard" for all roles

**Replace the "My Dashboard" block (§4.1 of v12 spec) with:**

```tsx
{/* My Dashboard — personal section, same for ALL users */}
<div data-testid="menu-my-dashboard-section" className="menu-section-label">
  My Dashboard
</div>

<button
  type="button"
  role="menuitem"
  data-testid="menu-go-dashboard"
  onClick={() => choose(onGoToDashboard)}
  className="menu-item"
>
  <GridIcon />
  Go to my dashboard
  <span className="menu-scope-tag">personal</span>
</button>

{!isAdmin && (
  <p data-testid="menu-dashboard-note" className="menu-dashboard-note">
    Your tiles, categories, and icons are your personal dashboard —
    manage them directly on the home screen.
  </p>
)}
```

**Removed:**
- The admin-only "Edit dashboard" button (`data-testid="menu-edit"`) — it is now the Gear's "Edit tiles" toggle.
- `onToggleEdit` prop from UserMenu (no longer needed — Gear owns editMode toggling).

**UserMenu prop interface change:**
- Remove: `onToggleEdit: () => void`
- Keep all others unchanged.

---

### 4.4 `index.css` — Gear menu styles

Add `.gear-menu` — a positioned dropdown, styled identically to `.user-menu`:

```css
.gear-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  min-width: 200px;
  background: var(--menu-bg);
  border: 1px solid var(--menu-border);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, .12);
  padding: 6px 0;
  outline: none;
}
.dark .gear-menu {
  box-shadow: 0 8px 24px rgba(0, 0, 0, .4);
}
```

The `.menu-item`, `.menu-section-label`, `.menu-administration-section`, `.menu-sep`, and `menu-scope-tag` classes are already defined and reused as-is. No new color tokens.

---

### 4.5 `UserMenu.test.tsx`, `AppHeader.test.tsx` — Test migrations

**UserMenu tests:**
- Remove assertions for `menu-edit` (the "Edit dashboard" button is gone).
- Remove assertions for `onToggleEdit` wiring.
- Add assertion: both admin and non-admin see `menu-go-dashboard` in the "My Dashboard" section.
- Non-admin still sees `menu-dashboard-note` (unchanged).
- Admin does NOT see `menu-dashboard-note` (unchanged).

**AppHeader tests (new: `settings-gear-arrange.test.tsx` updates):**
- `settings-gear` now opens a menu (not toggles arrange directly); update any tests that checked `aria-pressed` behavior.
- Add tests for `gear-menu` open/close (outside click, Escape).
- Add tests for `gear-arrange`, `gear-add-apps`, `gear-edit-tiles`, `gear-add-custom-app` renders and behavior.
- Admin: all four items present. Non-admin: only `gear-arrange` + `gear-add-apps` present; `gear-edit-tiles` + `gear-add-custom-app` absent.
- `gear-arrange` click → closes menu + fires `onToggleArrange`.
- `gear-add-apps` click → closes menu + fires `onOpenLibrary`.
- `gear-edit-tiles` click (admin) → closes menu + fires `onToggleEditMode`.
- `gear-add-custom-app` click (admin) → closes menu + fires `onOpenCustomAppForm`.
- Checkmark renders on `gear-arrange` when `arrange=true`; absent when `arrange=false`.
- Checkmark renders on `gear-edit-tiles` when `editMode=true`; absent when `editMode=false`.
- Gear icon carries active class when `anyModeActive=true`; not when false.

---

## 5. What Is NOT Changing

- `data-testid="settings-gear"` — preserved (behavior changes from toggle to menu trigger, but testid stays).
- `data-testid="gear-menu"` — new; `data-testid="user-menu"` unchanged.
- `data-testid="menu-go-dashboard"` — already exists (added in post-#96 reconciliation); now shown for admins too.
- `data-testid="menu-admin-settings"`, `menu-administration-section`, `menu-my-dashboard-section`, `menu-logout` — all unchanged.
- `data-testid="edit-mode-banner"`, `data-testid="exit-edit-mode"` (SPEC-149 exit button) — unchanged. "Done editing" still exits editMode.
- `data-testid="open-library"` (the standalone "+ Add apps" button above the catalog) — **stays**. It is a secondary entry; the Gear is the primary hub.
- `data-testid="add-service"` (the inline "+ Add app" button inside editMode in Catalog) — stays for the editMode view; the Gear "Add custom app" is the no-editMode path.
- Admin per-tile controls (`drag-handle`, `tile-menu`, icon upload, etc.) — unchanged; still gated by `editMode`.
- `data-testid="menu-edit"` — **removed** (the only breaking testid change; any test referencing it must be updated to use `gear-edit-tiles`).
- No API changes, no routing changes, no new backend endpoints.

---

## 6. Acceptance Criteria

| # | Criterion | Verify |
|---|---|---|
| **A1** | Clicking the Gear opens a **dropdown menu** (`gear-menu`), not a toggle. The menu renders in both light and dark themes. | Component + PAT |
| **A2** | **All users** see two items in the Gear menu: `gear-arrange` ("Arrange tiles") and `gear-add-apps` ("Add apps"). Both render for admin and non-admin users. | Component (admin + non-admin) |
| **A3** | **Admins only** see two additional items under an amber "Admin editing" section: `gear-edit-tiles` ("Edit tiles") and `gear-add-custom-app` ("Add custom app"). Non-admins do NOT see `gear-menu-section-admin`, `gear-edit-tiles`, or `gear-add-custom-app`. | Component (admin + non-admin) |
| **A4** | `gear-arrange` is a **toggle**: clicking it fires `onToggleArrange`, closes the menu, and a checkmark is visible on the item when `arrange=true` (none when false). | Component + PAT |
| **A5** | `gear-add-apps` click fires `onOpenLibrary` (which opens LibraryBrowse). Menu closes. | Component + PAT |
| **A6** | `gear-edit-tiles` (admin) is a **toggle**: clicking it fires `onToggleEditMode`, closes the menu, and a checkmark is visible when `editMode=true` (none when false). | Component + PAT |
| **A7** | `gear-add-custom-app` (admin) click fires `onOpenCustomAppForm` (opens ServiceForm in add mode). Menu closes. The ServiceForm opens **without requiring editMode to be active first**. | Component + PAT |
| **A8** | The **Gear icon highlights** (indigo active style) when `arrange=true` OR `editMode=true`. It returns to the neutral style when both are false. | Component + PAT |
| **A9** | The Gear menu **closes** on outside click and on Escape key. Focus returns to `settings-gear` on Escape. | Component + PAT |
| **A10** | Both admin and non-admin users see **`menu-go-dashboard`** in the UserMenu "My Dashboard" section. **`menu-edit` does not exist anywhere** in the document for either role. | Component (admin + non-admin) |
| **A11** | The `edit-mode-banner` "Done editing" button (`exit-edit-mode`) still exits editMode. Clicking `gear-edit-tiles` while editMode is on also exits. Both paths work. | Component + PAT |
| **A12** | All **existing tests pass** (zero new failures) after `menu-edit` references are migrated to `gear-edit-tiles` in test files. | `vitest run` |
| **A13** | No axe-core violations on the Gear menu (admin role + arrange=true, editMode=true) — 0 violations. | jest-axe |
| **A14** | Light and dark themes: all Gear menu items, section labels, and checkmarks are legible. The amber "Admin editing" section label matches the existing `menu-administration-section` visual style. | Visual PAT |
| **A15** | **Mobile (375px):** the Gear menu fits within the viewport — no overflow, no clipped items. | PAT on mobile viewport |

---

## 7. Out of Scope

- Moving "Manage categories" into the Gear menu as a direct action — CategoryManager stays inside the editMode flow for now. Admin clicks "Edit tiles" → enters editMode → CategoryManager appears inline, same as today.
- A keyboard shortcut to open the Gear menu.
- Non-admin edit mode (edit mode remains admin-only, no change to that gate).
- Persisting editMode across reloads (intentionally ephemeral).
- Any backend, API, or routing changes.

---

## 8. Slicing

Single PR. The change touches five files plus test updates.

**Branch:** `feat/v18-gear-edit-menu`

**Files touched:**
1. `src/AppHeader.tsx` — GearMenuTrigger + GearMenu components; thread new props
2. `src/App.tsx` — lift `browseOpen` + `customFormOpen` state; thread `editMode` into AppHeader; wire new callbacks
3. `src/UserMenu.tsx` — remove `onToggleEdit` prop + `menu-edit` button; add `menu-go-dashboard` for admins
4. `src/Catalog.tsx` — accept lifted `browseOpen`/`customFormOpen` props; keep own state for service-edit flow
5. `src/index.css` — `.gear-menu` class
6. `src/UserMenu.test.tsx` — remove `menu-edit` assertions; add `menu-go-dashboard` for admin
7. `src/settings-gear-arrange.test.tsx` — update for new menu behavior; add full Gear menu tests
8. `src/App.test.tsx` — update any AppHeader prop wiring assertions

---

## 9. PAT Checklist (Walt verifies at staging)

- [ ] Gear opens a dropdown (not a toggle) — menu renders with expected items
- [ ] Non-admin sees Arrange + Add apps only; no admin section visible
- [ ] Admin sees Arrange + Add apps + Admin editing section + Edit tiles + Add custom app
- [ ] Arrange tiles toggle: checkmark on when active, Gear highlights, drag grips appear on tiles
- [ ] Add apps: opens LibraryBrowse, no editMode required
- [ ] Edit tiles toggle: checkmark on when active, Gear highlights, edit-mode banner appears with "Done editing" button, per-tile admin controls appear
- [ ] Add custom app: opens ServiceForm directly from Gear, without entering editMode
- [ ] "Done editing" button still exits editMode from the banner
- [ ] UserMenu "My Dashboard" shows "Go to my dashboard" for admin (no "Edit dashboard")
- [ ] Gear menu closes on outside click and Escape
- [ ] Active Gear state correct in light and dark themes
- [ ] Mobile viewport: menu fits, no overflow
- [ ] All vitest pass, 0 axe violations
