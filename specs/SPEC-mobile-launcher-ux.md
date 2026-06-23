# SPEC: Mobile Command Launcher UX — Hide Keyboard Hints, Fix Tap Targets

**Issue:** Code/homepad #127  
**Status:** Shipped — prod (PR #129, merged 2026-06-21 as b936511e)  
**Author:** Walt (product)  
**Scope:** `src/CommandLauncher.tsx`, `src/AppHeader.tsx`, `src/index.css`  
**Effort estimate:** S (1–2 h, CSS + minimal JSX class changes)

---

## Problem statement

The homepad command launcher (⌘K / search) has two mobile-specific UX problems discovered during PAT on a 390×844 viewport:

### Problem 1 — Keyboard hint footer confuses mobile users

The launcher always renders a footer bar:
```
↑↓ to move  ⏎ to open  Esc to close
```
These are keyboard-navigation controls. On a touchscreen there are no arrow keys, no Enter, and no Esc. The footer takes ~42 px of screen space and is meaningless — worse, it implies the user is doing something wrong if they can't find these keys.

**Source:** `CommandLauncher.tsx` lines 269–272, `div.launcher-footer`.

### Problem 2 — Search trigger and user avatar are 34 px — below the 44 px minimum

The search icon button in the header measures 34×36 px at (207, 12). The user-avatar button measures 34×34 px at (340, 13). Apple HIG and WCAG 2.5.5 both require interactive touch targets to be ≥ 44×44 px. At 34 px these buttons are a consistent mis-tap on a phone — users hit the area but the tap registers on the surrounding non-interactive region.

**Source:** `AppHeader.tsx` (or the CSS classes `.launcher-trigger`, `.user-avatar` in `index.css`).

---

## What to build

### Change 1 — Hide the keyboard hint footer on mobile

In `CommandLauncher.tsx`, add `hidden sm:flex` to the footer div's `className`:

**Before:**
```tsx
<div className="launcher-footer" data-testid="launcher-footer" aria-hidden="true">
```

**After:**
```tsx
<div className="launcher-footer hidden sm:flex" data-testid="launcher-footer" aria-hidden="true">
```

`hidden` sets `display:none`; `sm:flex` restores it at ≥ 640 px. The `aria-hidden="true"` attribute already prevents screen-reader exposure, so no ARIA changes are needed.

### Change 2 — Expand header tap targets to ≥ 44×44 px

The search trigger button and the user-avatar button in `AppHeader.tsx` need a larger interactive area on mobile without changing their visual size.

**Option A (preferred — Tailwind, inline):** Add `min-h-[44px] min-w-[44px]` to each button's `className` in `AppHeader.tsx`. The buttons are already flex-centered so the icon stays visually centered inside the larger touch area.

**Option B (CSS):** In `index.css`, add to the existing `.launcher-trigger` and `.user-avatar` rules:
```css
@media (max-width: 639px) {
  .launcher-trigger { min-height: 44px; min-width: 44px; }
  .user-avatar      { min-height: 44px; min-width: 44px; }
}
```

Either option is acceptable; Option A is preferred for co-location with the JSX.

> **As shipped (PR #129):** Option B (CSS) was implemented — a
> `@media (max-width: 639px)` block in `index.css` adds `min-height/min-width:
> 44px` to `.launcher-trigger` and `.user-avatar`. The header buttons keep their
> existing classNames, so `AppHeader.tsx` was untouched; the only JSX change was
> Change 1's footer class on `CommandLauncher.tsx`.

No visual changes on desktop (≥ 640 px) — the `min-h/min-w` only activates on mobile because the current button size (34 px) is already smaller than 44 px.

---

## Acceptance criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | On 390×844 viewport: `data-testid="launcher-footer"` is not visible (computed `display` is `none`) | `window.getComputedStyle(footer).display === 'none'` |
| AC2 | On ≥ 640 px viewport: the launcher footer is visible (no desktop regression) | Resize to 1280 px, verify footer visible |
| AC3 | Search trigger button bounding rect ≥ 44×44 px on 390-wide viewport | `getBoundingClientRect()` → width ≥ 44, height ≥ 44 |
| AC4 | User-avatar button bounding rect ≥ 44×44 px on 390-wide viewport | `getBoundingClientRect()` → width ≥ 44, height ≥ 44 |
| AC5 | Tapping the search trigger opens the launcher on mobile | `realTap(page, launcherTrigger)` → launcher visible |
| AC6 | Tapping a result row in the launcher navigates to the service URL on mobile | Tap first result → `page.url()` changes or new tab opens |
| AC7 | Arrow keys / Enter / Esc still work in the launcher on desktop | Keyboard E2E test passes |
| AC8 | Existing vitest + playwright test suite passes with no new failures | `npm test && npx playwright test` |

---

## Out of scope

- Converting the launcher to a bottom-sheet on mobile (a larger engineering change; may follow as a separate spec)
- Changing the visual icon or styling of the search trigger or avatar
- Adding a mobile-specific search hint (e.g. "Tap to search") — the search input placeholder already serves this purpose
- Changing any keyboard shortcuts or launcher behavior

---

## Test plan

1. Build and serve (`npm run build && npm run preview`)
2. Open DevTools → device emulation → iPhone 13 (390×844)
3. Log in; observe the header
4. **Verify AC3/AC4:** inspect search trigger and avatar bounding boxes ≥ 44 px each
5. Tap the search trigger → launcher opens (AC5)
6. Type a service name → results appear; tap a result → navigates (AC6)
7. **Verify AC1:** open DevTools console, run `getComputedStyle(document.querySelector('[data-testid="launcher-footer"]')).display` → `"none"`
8. Switch to 1280 px → footer visible again (AC2)
9. On desktop: open launcher with ⌘K, navigate with arrow keys, press Enter → navigates (AC7)
10. Run `npx playwright test` — all pass (AC8)
