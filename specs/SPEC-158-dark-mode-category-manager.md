# Spec: Dark Mode Contrast — Edit Dashboard Category Manager (Issue #158)

**Date:** 2026-06-26  **Status:** Ready for build  
**Author:** Walt (product lead)  **Issue:** #158  
**Requested by:** Caleb Dunn  
**Audience:** Stitch (implementer), Gracie (tech-QA).  
**App:** homepad — React + Vite + Tailwind. Builds on current main (a02ae4b).

---

## 1. Problem

When an admin enters edit mode in dark theme and opens the **category manager**
(the `CategoryManager` panel that appears at the top of the dashboard), the
inner controls render with hardcoded light-mode colors:

- The "Categories" section heading (`text-neutral-500`) — acceptable contrast
  but lacks a dark counterpart.
- The **"New category" text input** — light `border-neutral-300` border,
  light/default background. In dark mode: low-contrast border and typically a
  white or light background inside a dark container. Text is
  near-invisible against the form background.
- The **"Add category" button** — `border-indigo-200 text-indigo-600
  hover:bg-indigo-50`. In dark mode: washed-out, nearly invisible border and
  text.
- **Each `CategoryRow`'s rename input** — same missing dark classes as the
  "New category" input.
- **"Save" button** in each row — `border-neutral-200 text-neutral-700
  hover:bg-neutral-50`. In dark mode: invisible border, near-invisible text.
- **"Delete" button** in each row — `border-red-200 text-red-600
  hover:bg-red-50`. In dark mode: faint border and washed-out red text.

The outer `CategoryManager` container **already has** `dark:border-neutral-800
dark:bg-neutral-900`, so the shell is correct. The inner controls simply missed
their `dark:` Tailwind variants when v4 shipped.

No spec (v4 categories, v3 dark mode, v11 edit-mode UX) contains an explicit
dark-mode acceptance criterion for these controls. This spec closes that gap and
authorises the fix.

---

## 2. Goal

Every control inside the edit-dashboard category manager — headings, text
inputs, and buttons — must be legible and visually coherent when the app is in
dark mode, matching the same contrast standard as the rest of the admin edit-mode
UI (inputs, buttons in `ServiceForm.tsx`, the `CategoryManager` outer shell, etc.).

---

## 3. Changes Required

All changes are in `src/Catalog.tsx` — CSS class additions only. No logic
changes. No API changes.

### 3.1 `CategoryManager` — "Categories" heading

Current:
```
className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500"
```
Add: `dark:text-neutral-400`

### 3.2 `CategoryManager` — "New category" input

Current:
```
className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
```
Add: `dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder-neutral-500 dark:focus:border-indigo-400`

### 3.3 `CategoryManager` — "Add category" button

Current:
```
className="rounded-lg border border-indigo-200 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-60"
```
Add: `dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950`

### 3.4 `CategoryRow` — rename input

Current:
```
className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-indigo-500"
```
Add: `dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:focus:border-indigo-400`

### 3.5 `CategoryRow` — "Save" button

Current:
```
className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
```
Add: `dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800`

### 3.6 `CategoryRow` — "Delete" button

Current:
```
className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
```
Add: `dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950`

---

## 4. Tests

Add to `src/Catalog.test.tsx` (or an appropriate edit-mode dark-mode test block):

1. **Heading legibility in dark mode:** Render `CategoryManager` with the `dark`
   class on `<html>`. Assert `data-testid="category-manager"` is in the DOM and
   the `<h3>` inside it contains the class `dark:text-neutral-400` (or verify via
   snapshot).

2. **Input dark classes present:** Assert the `category-name-input` element has
   `dark:bg-neutral-800` in its `className`. Same for `category-rename-input`.

3. **Button dark classes present:** Assert `category-create` button has
   `dark:text-indigo-400`; `category-rename` button has `dark:text-neutral-300`;
   `category-delete` button has `dark:text-red-400`.

4. **No regression:** All existing `CategoryManager` and `CategoryRow` tests pass
   unchanged.

> Note: Tailwind class-presence checks are lightweight and appropriate here since
> the actual rendering is verified by PAT in the real browser.

---

## 5. Acceptance Criteria

| # | Criterion | How to verify |
|---|---|---|
| **A1** | In dark mode, the "Categories" heading inside the edit-dashboard category manager is visibly legible (not invisible or near-same-color as the background). | PAT: enter dark mode, enter edit mode, observe category manager heading. |
| **A2** | The "New category" text input has a visible dark-mode border, a dark background, and light-colored placeholder and text. It does not render as a white box in a dark panel. | PAT: focus the input, type text — text must be clearly visible. |
| **A3** | The "Add category" button is legible in dark mode — the label and border are visible against the dark panel background. | PAT: observe the button without hovering; confirm text and border are distinct. |
| **A4** | Each `CategoryRow` rename input follows the same dark-mode styling as A2. | PAT: create at least one category; observe its rename input in dark mode. |
| **A5** | Each `CategoryRow` "Save" button is legible in dark mode. | PAT: observe Save button; confirm text and border are visible. |
| **A6** | Each `CategoryRow` "Delete" button shows readable red-toned text and border in dark mode. | PAT: observe Delete button; confirm it reads as a danger action without being invisible. |
| **A7** | All controls behave identically in **light mode** — no regressions. | Run vitest suite; PAT light mode edit dashboard. |
| **A8** | `vitest run` — 0 failures with the new dark-mode class assertions added. | CI. |
| **A9** | No new axe-core violations on `CategoryManager` rendered in edit mode under `.dark` class. | jest-axe. |

---

## 6. What Is NOT Changing

- No API changes, no data-model changes, no routing changes.
- `CategoryManager` outer container styling (already correct, has dark: variants).
- Edit-mode banner (spec'd and shipped in #149 / SPEC-149).
- Any other edit-mode controls outside of `CategoryManager` / `CategoryRow`.
- All existing `data-testid` values are preserved.

---

## 7. Slicing

Single PR. Three additions total:
1. `src/Catalog.tsx` — add `dark:` classes to 6 elements (§3.1–3.6)
2. `src/Catalog.test.tsx` — new dark-mode assertions (§4)

**Branch:** `fix/158-dark-mode-category-manager`  
**Closes:** #158
