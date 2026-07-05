# homepad v20 — Favorite Star: Touch Target & Contrast Fix

**Spec ID:** v20-fav-star-a11y
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare design §8. Stitch: do not build until §8 and both sign-offs are present.
**Repo:** `Code/homepad` (frontend only — CSS + AppGrid.tsx only, no API changes)
**Estimate:** ~1 hour Stitch
**Target version:** v13.9.0 (minor — first available after v19 ships at v13.8.0)
**Closes issues:** #255
**Pre-existing gap confirmed:** Live 768px PAT during v19 co-sign (PR #299 §10.1)

---

## 1. Problem

The per-tile ★ favorite toggle (`data-testid="tile-favorite"`, `AppGrid.tsx`) fails two
design-system floors on homepad's primary device (iPad, 768px):

**Touch target too small (DESIGN-SYSTEM §9.3 — ≥44×44px required):**

| Control | Current | Required |
|---|---|---|
| ★ favorite button (`.app-grid-tool-fav`) | 34×34px | ≥44×44px |

**Default ☆ contrast too low (DESIGN-SYSTEM §1.1 — ≥3:1 non-text graphic floor):**

| State | Color | Measured | Required |
|---|---|---|---|
| Default ☆ (light mode, unfavorited) | `#94a3b8` (slate-400) | 2.56:1 on white tile | ≥3:1 |
| Default ☆ (dark mode, unfavorited) | `#64748b` (slate-500) | 3.79:1 ✓ | ≥3:1 |

Both gaps are pre-existing (introduced with the App Grid in PR #240), tracked in Gitea **#255**,
and were explicitly out of scope for v19's a11y pass (which targeted login, header chrome, and the
tile ⋯ glyph/caption token sweep). V19 AC-009 targeted the ⋯ overflow menu, which is dead code
since PR #223 — the ★ toggle is the actual live affordance on tiles that needs this fix.

---

## 2. Goal

**A user tapping the ★ on their iPad can hit it reliably, and they can read it clearly in
ambient light.**

Fix both gaps with the patterns already established in this codebase:
1. **Touch target**: visual≠hit-area pattern — expand the button's clickable zone to ≥44×44px
   while keeping the ★/☆ glyph at its current ~16px visual size.
2. **Default ☆ contrast**: darken the unfavorited light-mode color from slate-400 (`#94a3b8`,
   2.56:1) to a value that clears ≥3:1 on the white tile. Slate-500 (`#64748b`, ~4.3:1) is the
   floor reference; Kare specifies the exact token in §8.

---

## 3. Scope & Out of Scope

**In scope:**
- `.app-grid-tool-fav` CSS: size → ≥44×44, positioning adjusted for expanded button
- Default ☆ light-mode color: darken to ≥3:1 on white tile
- Close Gitea issue #255

**Out of scope:**
- Favorited ★ state (amber) — amber-400 on white is decorative and always paired with
  label text; no change.
- Dark-mode ☆ (slate-500, 3.79:1) — already passes ≥3:1; no change.
- Any other tile affordance, layout, or interaction — touch it and you risk unintended
  regressions in the tight tile geometry.

---

## 4. Changes

**Files:** `src/index.css` (`.app-grid-tool-fav` block), possibly `src/AppGrid.tsx` if the
hit-area expansion requires a wrapper element.

### 4.1 Touch target expansion — visual≠hit-area pattern

Current:
```css
.app-grid-tool-fav {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 34px;
  height: 34px;
  /* glyph: font-size: 16px */
}
```

Target: button is ≥44×44; glyph stays 16px, centered. The visual ★ corner position
(top-right of tile) must stay within 5px of its current position. Kare specifies exact
values in §8 — the two common implementations are:

- **Padding approach**: keep width/height but add 5px transparent padding on each side,
  declare `touch-action: manipulation`.
- **Size approach**: change to `width: 44px; height: 44px` and adjust `top`/`right` to
  compensate (−5px each) so the visual glyph stays at its current corner position.

Either approach is valid; Kare picks in §8.

### 4.2 Default ☆ contrast — light mode only

```css
/* current */
.app-grid-tool-fav {
  color: #94a3b8; /* slate-400 — 2.56:1 on white */
}

/* target */
.app-grid-tool-fav {
  color: <kare-specifies>; /* ≥3:1 on white; reference floor: slate-500 (#64748b, ~4.3:1) */
}
```

The hover color (`#475569`, slate-600, ~7:1) and focus-visible ring (`#6366f1`) are untouched.
The favorited state (`color: #f59e0b`) is untouched.

The dark-mode rule (`.dark .app-grid-tool-fav { color: #64748b; }`) is untouched.

---

## 5. Acceptance Criteria

| ID | Priority | Criterion |
|---|---|---|
| AC-001 | must | The ★ favorite button (`data-testid="tile-favorite"`) has a hit area of ≥44×44px. A pointer event landing anywhere in the 44×44 zone toggles the favorite state. |
| AC-002 | must | The visual ★/☆ glyph renders at ≤20px font-size — the expanded hit area is transparent padding, not a larger glyph. |
| AC-003 | must | The default ☆ in light mode has measured contrast ≥3:1 against the white tile background (`#ffffff`). |
| AC-004 | must | The dark-mode ☆, the favorited ★ (amber) in both modes, tile layout (120px height), status-dot position, and all hover/focus-visible styles are visually unchanged. |
| AC-005 | must | Gitea issue #255 is closed by the PR. |
| AC-006 | should | On a 768px viewport (iPad), the ★ is reachable without precision — a casual corner tap lands in the hit area. |

---

## 6. User Test Cases

### TC-001 — Tap to favorite (768px / iPad viewport)

| Field | Value |
|---|---|
| **Precondition** | Dashboard loaded at 768px viewport width, light mode; at least one tile present; tile is unfavorited (☆ showing on hover). |
| **Steps** | 1. Hover (or hold) over a tile. 2. Tap the ☆ icon near the top-right corner of the tile. 3. Observe the tile. |
| **Expected** | The ☆ toggles to ★ (amber). The tile moves to / stays in the Favorites section. No precision tap required — a casual corner tap registers. |
| **Screenshot checkpoint** | Tile showing ★ in amber, tile card layout unchanged. |
| **Maps to** | AC-001, AC-006 |

### TC-002 — Default ☆ contrast (light mode)

| Field | Value |
|---|---|
| **Precondition** | Dashboard in light mode; at least one unfavorited tile with the ☆ visible (hover or always-visible state). |
| **Steps** | 1. Open browser DevTools. 2. Inspect `.app-grid-tool-fav` background color vs. tile background (#ffffff). 3. Compute contrast ratio or use the DevTools contrast checker. |
| **Expected** | Contrast ratio ≥3:1 reported. The ☆ is visibly distinct from the white tile background. |
| **Screenshot checkpoint** | DevTools showing contrast ≥3:1, ☆ visible against white tile. |
| **Maps to** | AC-003 |

### TC-003 — No regression: tile layout, dark mode, favorited state

| Field | Value |
|---|---|
| **Precondition** | Dashboard with at least one favorited and one unfavorited tile, both in light and dark mode. |
| **Steps** | 1. Verify favorited ★ (amber) is visually identical to pre-fix. 2. Switch to dark mode; verify dark ☆ is visually identical (no color change). 3. Verify tile card dimensions (120px height) are unchanged. 4. Verify status dot (top-left) is unaffected. |
| **Expected** | All states match the pre-v20 appearance; only the light-mode ☆ color and/or hit area change is observable. |
| **Maps to** | AC-002, AC-004 |

---

## 7. Definition of Done

- [ ] `specs/v20-fav-star-a11y.md` merged to `main`
- [ ] Kare design §8 written and Kare sign-off present in this file
- [ ] Walt sign-off present in this file (below)
- [ ] `feat(v20)` PR merged — closes #255, `CHANGELOG.md` entry for v13.9.0
- [ ] AC-001 through AC-005 verified green by QA pool
- [ ] PAT passed (Walt) — prod vote cast

---

## 8. Design — Kare (placeholder)

_Dispatched to Kare: `homepad-v20-kare-s001`. This section will be written by Kare and folded
in before the spec goes to Stitch. The design brief:_

- **Touch target**: specify exact CSS — which of the two implementation approaches (padding vs.
  size+offset), exact pixel values, and the resulting `top`/`right` values so the visual ★ stays
  in the corner within ≤5px of current.
- **Default ☆ color (light mode)**: specify the exact color token or hex. Must clear ≥3:1 on
  `#ffffff`. Must harmonize with the tile's hover ☆ color (#475569, slate-600) and the app's
  existing slate/neutral token vocabulary. Does NOT need to match dark mode (which stays
  #64748b).
- **Opacity transition**: current default opacity is 0.5 (hidden until hover); confirm this
  is unchanged or adjust with rationale.
- **Focus-visible ring**: confirm the `box-shadow: 0 0 0 2px #6366f1` ring is unchanged; or
  update if the size change makes the ring look off.

_Do not proceed to implementation until this section is complete and both sign-offs below are
present._

---

## 9. Sign-offs

**Walt (product):** ✓ approved 2026-07-05 — product acceptance criteria are correct; this fixes
the right gap without scope creep; ready for Kare design section.

**Kare (design):** _pending §8_
