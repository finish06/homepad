# Spec: Quick Exit Edit Mode (Issue #149)

**Date:** 2026-06-26  **Status:** Ready for review  
**Author:** Walt (product lead)  **Requested by:** Caleb Dunn (issue #149)  
**Audience:** Stitch (implementer), Gracie (tech-QA).  
**App:** homepad — React + Vite. Builds on current main (post cap5, commit 4e827af).

---

## 1. Problem

The only way to exit edit mode today is:

> Avatar (top-right) → open UserMenu → click "Edit dashboard" (toggle off)

This is two steps hidden inside a menu — non-obvious and cumbersome. Once a user enters edit mode they have no direct visual path back out: the banner (`edit-mode-banner`) tells them they're editing but offers no affordance to stop.

Caleb's words: *"Enter and exit edit mode is cumbersome and non-intuitive to me. An X of sorts."*

---

## 2. Goal

A user in edit mode can exit in one click, directly from the edit-mode banner — without opening any menu.

The avatar-menu toggle remains as a secondary path (parity on both enter and exit).

---

## 3. UX Design

### 3.1 Banner layout — before vs. after

**Before (current):**
```
[✎  Editing your personal dashboard                                         ]
```
Passive — informs but offers no action.

**After:**
```
[✎  Editing your personal dashboard                        Done editing  ✕ ]
```
The banner becomes an active mode bar: label on the left, dismissal control on the right.

### 3.2 "Done editing" button

- **Label:** `Done editing`
- **Position:** right side of the banner, flex end
- **Size:** small pill — `font-size: 11px`, matching the banner text weight
- **Style:** quiet outlined button using the same indigo tokens as the rest of the banner. NOT a primary/filled button — it should read as "dismiss this mode" not "take an action"
- **Dark mode:** adapts using `--indigo-300` tones (matches banner dark rule already in `index.css`)
- **Hover:** subtle indigo bg fill
- **Click:** fires `onExitEdit()` — immediately exits edit mode
- **data-testid:** `exit-edit-mode`
- **Keyboard:** native `<button>` — tab-focusable, Enter/Space activates. No custom key handling needed.

### 3.3 Mockup (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ✏  Editing your personal dashboard          [ Done editing ]       │
└─────────────────────────────────────────────────────────────────────┘
```

Light mode: indigo-600 text, rgba(99,102,241,0.07) bg, indigo border.  
Dark mode: indigo-300 text, rgba(99,102,241,0.12) bg, indigo-400 border.  
The button inherits the banner's tonal palette; no new color tokens.

---

## 4. Changes — Detailed

### 4.1 `src/App.tsx` — Pass exit callback to Catalog

**Line 81** — current:
```tsx
<Catalog isAdmin={isAdmin} editMode={editMode} />
```

**Replace with:**
```tsx
<Catalog
  isAdmin={isAdmin}
  editMode={editMode}
  onExitEdit={() => setEditMode(false)}
/>
```

### 4.2 `src/Catalog.tsx` — Receive prop + wire into banner

**Prop interface (lines 118–124)** — add `onExitEdit`:
```tsx
export default function Catalog({
  isAdmin = false,
  editMode = false,
  onExitEdit,
}: {
  isAdmin?: boolean;
  editMode?: boolean;
  onExitEdit?: () => void;
}) {
```

**Banner (lines 520–525)** — current:
```tsx
{adminEdit && (
  <div data-testid="edit-mode-banner" className="edit-mode-banner" role="status">
    <PencilIcon />
    Editing your personal dashboard
  </div>
)}
```

**Replace with:**
```tsx
{adminEdit && (
  <div data-testid="edit-mode-banner" className="edit-mode-banner" role="status">
    <span className="edit-mode-banner-label">
      <PencilIcon />
      Editing your personal dashboard
    </span>
    {onExitEdit && (
      <button
        type="button"
        data-testid="exit-edit-mode"
        onClick={onExitEdit}
        className="edit-mode-banner-exit"
      >
        Done editing
      </button>
    )}
  </div>
)}
```

### 4.3 `src/index.css` — Banner layout + exit button styles

**Replace the existing `.edit-mode-banner` rule (lines 395–411) with:**

```css
/* v11 §4.4 D6 — edit-mode contextual banner; #149 adds inline exit button. */
.edit-mode-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 12px;
  margin-bottom: 12px;
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
  background: rgba(99, 102, 241, 0.07);
  border: 1px solid rgba(99, 102, 241, 0.15);
  border-radius: 8px;
}
.dark .edit-mode-banner {
  background: rgba(99, 102, 241, 0.12);
  border-color: rgba(99, 102, 241, 0.25);
}

.edit-mode-banner-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.edit-mode-banner-exit {
  font-size: 11px;
  font-weight: 600;
  color: #4f46e5;
  background: none;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 5px;
  padding: 2px 8px;
  cursor: pointer;
  line-height: 1.5;
  white-space: nowrap;
  flex-shrink: 0;
}
.edit-mode-banner-exit:hover {
  background: rgba(99, 102, 241, 0.1);
}
.dark .edit-mode-banner-exit {
  color: #a5b4fc;
  border-color: rgba(165, 180, 252, 0.3);
}
.dark .edit-mode-banner-exit:hover {
  background: rgba(99, 102, 241, 0.15);
}
```

### 4.4 `src/Catalog.test.tsx` — New assertions

Add to the edit-mode test block:

1. **Button renders in edit mode:** When `adminEdit` is true and `onExitEdit` is provided, `getByTestId('exit-edit-mode')` is in the document and its text content is `"Done editing"`.
2. **Button fires callback:** Clicking `exit-edit-mode` calls `onExitEdit` once.
3. **Button absent without prop:** When `onExitEdit` is not passed (or edit mode is off), `queryByTestId('exit-edit-mode')` is not in the document.
4. **Banner still present in both light and dark themes:** existing banner test continues to pass — no regression.

---

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| **A1** | While in edit mode, the `edit-mode-banner` contains a visible button labelled **"Done editing"** (`data-testid="exit-edit-mode"`). | Component test + PAT |
| **A2** | Clicking "Done editing" exits edit mode immediately — the banner disappears, per-tile controls disappear, and the page returns to normal view. | Component test + PAT |
| **A3** | The button is positioned on the **right side** of the banner; the pencil icon and label remain on the left. They do not overlap at any viewport width above 375px. | Visual PAT (desktop + mobile) |
| **A4** | The avatar-menu toggle still exits edit mode — clicking "Edit dashboard" in the menu while in edit mode exits. Both exit paths work. | Component test + PAT |
| **A5** | In **dark mode**, the button label and border are legible (indigo-300 tones). No white-on-white or invisible text. | PAT (dark mode) |
| **A6** | The button is keyboard-accessible: Tab reaches it; Enter/Space fires the exit. Focus is visible (browser default ring is acceptable). | PAT keyboard nav |
| **A7** | When `onExitEdit` is not passed (e.g., in isolated Catalog tests), no button renders and no runtime error occurs. | Component test |
| **A8** | `vitest run` — 0 failures, all existing tests pass after the new assertions are added. | CI |
| **A9** | No new axe-core violations on `Catalog` in edit-mode render (admin role). | jest-axe |

---

## 6. What Is NOT Changing

- Avatar-menu toggle ("Edit dashboard" in UserMenu) — still works, not removed.
- Banner copy "Editing your personal dashboard" — unchanged.
- Banner background, border, and text color tokens — unchanged.
- Edit-mode mechanics, `adminEdit` guard, per-tile controls — untouched.
- No new API endpoints, no routing changes, no modal changes.
- Non-admin users are unaffected (edit mode remains admin-only).

---

## 7. Slicing

Single PR. The change is three files (~15 lines of JSX/CSS) plus test additions.

**Branch:** `feat/149-quick-exit-edit-mode`  
**Files touched:**
1. `src/App.tsx` — pass `onExitEdit` to Catalog
2. `src/Catalog.tsx` — accept prop, render button in banner
3. `src/index.css` — banner layout + exit button styles
4. `src/Catalog.test.tsx` — new assertions (A1–A3, A7–A9)

---

## 8. Out of Scope

- Non-admin edit mode (edit mode is currently admin-only — no change to that gate).
- Persist edit mode across reloads (intentionally ephemeral by design, per v11).
- A floating "Done" chip or FAB — the banner approach is simpler and contextually tied to the mode indicator. No new components needed.
- Keyboard shortcut to exit edit mode (nice-to-have, separate issue if Caleb wants it).
