# SPEC: Mobile-Compact Collapsed Category Sections

**Issue:** Code/homepad #126  
**Status:** Approved — ready for implementation  
**Author:** Walt (product)  
**Scope:** `src/Catalog.tsx`, `src/index.css`  
**Effort estimate:** S (1–2 h, CSS only, no behavior change)

---

## Problem statement

On a 390×844 phone viewport, the homepad dashboard opens showing **four collapsed category headers and zero app tiles**. Every app tile is below the fold, requiring the user to scroll before reaching the thing they came for.

The cause is that every category section — whether expanded or collapsed to a single header row — inherits the same `space-y-8` (32 px) gap from its siblings and a `.cat-head` style that adds `padding-bottom: 0.7rem` + `margin-bottom: 1rem`. Together, each collapsed header consumes ~80 px. With four empty collapsed sections the first real tile appears at y ≈ 510 px on a ~783 px usable viewport.

The `space-y-8` spacing is right for desktop where expanded sections contain tile grids that deserve breathing room. It is wrong for a single-line collapsed header on a phone.

---

## What to build

Add a responsive Tailwind breakpoint so that below `sm` (640 px) the category-list containers use compact spacing. Above `sm`, nothing changes.

### File: `src/Catalog.tsx`

Two `<div className="space-y-8">` elements wrap the category sections (outer DndContext wrapper ~line 535, inner SortableContext div ~line 554). Change both to:

```tsx
className="space-y-2 sm:space-y-8"
```

This reduces the gap between category section blocks from 32 px to 8 px on mobile.

### File: `src/index.css`

The `.cat-head` class currently sets:
```css
.cat-head {
  padding-bottom: 0.7rem;
  margin-bottom: 1rem;
}
```

Add a mobile override inside the existing `@layer components` block (or as a media query appended after):

```css
@media (max-width: 639px) {
  .cat-head {
    padding-bottom: 0.25rem;
    margin-bottom: 0.25rem;
  }
}
```

This tightens collapsed header rows to ~40 px total on mobile while leaving expanded sections visually unchanged (the tile grid below provides its own spacing).

### No changes needed elsewhere

- `SortableSection` and `Section` components: no JSX changes
- DndKit drag-to-reorder: unaffected (spacing is purely visual CSS)
- Collapse/expand toggle: unaffected
- Favorites and Uncategorized sections: rendered inside the same `space-y-8` container and will also benefit from reduced gap, which is correct

---

## Acceptance criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| AC1 | On 390×844 viewport: with ≥ 1 collapsed categories and ≥ 1 expanded section containing tiles, the first tile is visible without scrolling (y < 844 px) | Playwright: `page.locator('.tile').first().boundingBox()` → y < 844 |
| AC2 | Each collapsed category header row occupies ≤ 48 px of vertical space (header height + gap combined) | Measure y-delta between consecutive collapsed section headers |
| AC3 | Desktop ≥ 640 px: category section spacing is visually unchanged (space-y-8 = 32 px gap) | Visual inspection at 1280×800 |
| AC4 | Expanding a collapsed section on mobile shows the tile grid immediately below the header with correct spacing | Manual tap test on 390-wide viewport |
| AC5 | Drag-to-reorder category sections functions on mobile (touch 200 ms press-hold) | Existing playwright mobile drag test passes |
| AC6 | Dark mode: no visual regressions in section spacing | Screenshot at 390 px in dark mode |
| AC7 | Existing vitest + playwright test suite passes with no new failures | `npm test && npx playwright test` |

---

## Out of scope

- Reordering tiles within a section (separate DndContext, unaffected)
- Changing the visual design of the category header (color, font, chevron)
- Horizontal scrolling pill rows or alternative category navigation patterns
- Touch-specific animations on category expand/collapse

---

## Test plan

1. Build and serve (`npm run build && npm run preview`)
2. Open DevTools → device emulation → iPhone 13 (390×844)
3. Log in as a user with ≥ 3 collapsed categories
4. **Verify AC1:** first tile is visible without scrolling
5. **Verify AC2:** each collapsed section row is ≤ 48 px tall
6. Tap a collapsed header to expand → tiles appear, no layout jump (AC4)
7. Switch to desktop (1280 px) → spacing reverts to spacious (AC3)
8. Switch to dark mode → no regressions (AC6)
9. Run `npx playwright test` — all pass (AC7)
