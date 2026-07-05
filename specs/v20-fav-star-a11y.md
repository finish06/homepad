# homepad v20 — Favorite Star: Touch Target & Contrast Fix

**Spec ID:** v20-fav-star-a11y
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Shipped — v13.9.0 (PR #306, merged). Design co-sign confirmed on built UI (§10).
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

- [x] `specs/v20-fav-star-a11y.md` merged to `main`
- [x] Kare design §8 written and Kare sign-off present in this file
- [x] Walt sign-off present in this file (below)
- [ ] `feat(v20)` PR merged — closes #255, `CHANGELOG.md` entry for v13.9.0
- [ ] AC-001 through AC-005 verified green by QA pool
- [ ] PAT passed (Walt) — prod vote cast

---

## 8. Design — Kare

Design owner: Kare. All values below are measured off the live `.app-grid-tool-fav` block
(`src/index.css:2476`) and the sRGB WCAG contrast formula — not eyeballed. The whole fix is
**two changed lines and one added rule in `src/index.css`; `AppGrid.tsx` is untouched** (no
wrapper element is needed).

### 8.1 Touch target — transparent hit-area extension via `::before` (NOT padding, NOT size+offset)

Both approaches the brief names (padding; size+offset) reach ≥44×44, but both do it by
**growing the button's painted box from 34→44px** — which enlarges the hover pill and pushes
the focus-visible ring out to a 44px circle floating 5px off the 16px glyph. That's a visible
change to the hover/focus affordance and fails **AC-004** ("all hover/focus-visible styles are
visually unchanged"). So I reject both for a third, cleaner form of the same visual≠hit-area
pattern the codebase already uses (width selector, §6.3):

**Keep the painted button exactly as-is (34×34 at `top:4 right:4`) and extend only the
invisible hit area with a centered, transparent `::before`.**

```css
/* src/index.css — .app-grid-tool-fav: change ONE property, add touch-action */
.app-grid-tool-fav {
  position: absolute;
  top: 4px;                 /* UNCHANGED — glyph stays in its corner, 0px delta */
  right: 4px;               /* UNCHANGED */
  width: 34px;              /* UNCHANGED — painted pill / hover bg / focus ring stay 34px */
  height: 34px;             /* UNCHANGED */
  font-size: 16px;          /* UNCHANGED — glyph ≤20px (AC-002) */
  color: #64748b;           /* CHANGED  — was #94a3b8 (see §8.2) */
  opacity: 0.5;             /* UNCHANGED — see §8.3 */
  touch-action: manipulation; /* ADD — kills the 300ms double-tap-zoom delay so the tap fires instantly */
  /* …all other existing declarations unchanged… */
}

/* ADD — 44×44 transparent hit area, centered on the button. Part of the button box,
   so a pointer event anywhere in it fires the button's onClick (AC-001). No paint. */
.app-grid-tool-fav::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 44px;
  height: 44px;
}
```

**Geometry (measured):** the button's center sits at `4 + 34/2 = 21px` from the tile's top and
right edges. The `::before` is 44×44 centered on that point, so it spans from `-1px` to `43px`
in both axes — i.e. the hit area extends **1px past the tile's top and right edges** (into the
inter-tile gap; `.app-grid-tool-wrap` is `position:relative` with no `overflow:hidden`, so it
is not clipped) and reaches **43px down / 43px left** into the tile. Net hit area: **44×44px,
AC-001 met.** The **visual ★/☆ glyph does not move at all — 0px delta**, comfortably inside the
≤5px budget. Because the painted box is still 34×34, the hover pill and the focus ring are
**geometrically identical to today** (AC-004), and the ring still hugs the glyph instead of
floating off it. The `::before` deliberately overlaps the top-right ~44px of the underlying
`<a>` — that IS the fix for AC-006 (a casual corner tap toggles the star instead of opening the
link); the link stays clickable everywhere else.

### 8.2 Default ☆ color (light mode) — `#64748b` (slate-500)

| | Color | Contrast on `#ffffff` | vs floor |
|---|---|---|---|
| Was | `#94a3b8` (slate-400) | **2.56:1** | fails ≥3:1 |
| **Spec** | **`#64748b` (slate-500)** | **4.76:1** | clears ≥3:1 **and ≥4.5:1** |

Rationale — this is the design-system-correct token, not just "a darker gray":
- **It clears the floor with margin (4.76:1).** It even passes the 4.5:1 *text* floor, so the
  fix is robust whether the ☆ is graded as a graphic or as text.
- **It tightens the hover progression.** Rest was slate-400 → hover slate-600 (`#475569`,
  7.58:1) — a 2-step jump. slate-500 → slate-600 is a clean **one-step** darken on hover, which
  reads as more intentional.
- **It unifies the resting-star color across modes** (dark mode is already `#64748b`). The brief
  allowed light≠dark; landing them on the same slate-500 token instead *simplifies* the palette
  story to a single "resting star = slate-500" rule (Principle 8, consistency), with dark mode's
  value unchanged as required.

Untouched, confirmed: hover `#475569` (7.58:1), favorited `#f59e0b` (amber, decorative +
label-paired), focus ring `#6366f1`, and the dark-mode block (`.dark .app-grid-tool-fav {
color:#64748b }`).

### 8.3 Opacity — keep `0.5`, unchanged

Resting opacity stays **0.5**. On the **primary device (iPad, and any touch device)** the
existing `@media (hover: none){ .app-grid-tool-fav{ opacity:1 } }` (`src/index.css:2606`) already
forces full opacity, so the ☆ renders at the full `#64748b` = **4.76:1** exactly where the
brief's §1 concern lives — "read it clearly in ambient light" on the iPad. On hover-capable
(desktop) devices the 0.5 rest is deliberate progressive disclosure; the star reaches full
opacity (and full 4.76:1) the moment it is actionable (tile-hover / `:focus-visible`). The 3:1
non-text floor is evaluated in that perceivable/actionable state, which passes. Raising the rest
opacity to clear 3:1 while dimmed would need ~0.8 (measured), which would visibly un-hide the
star on desktop and break the "hidden until hover" behavior and AC-004 — so I keep 0.5.

### 8.4 Focus-visible ring — unchanged

`box-shadow: 0 0 0 2px #6366f1` is **unchanged**. Because §8.1 keeps the painted box at 34×34,
the ring wraps the same 34px pill it does today, snug to the glyph. (This is the second reason
to prefer the `::before` form: the size+offset approach would have stretched this ring to a 44px
circle detached from the 16px glyph — an ugly, unintended change.)

### 8.5 Design acceptance — measured checklist for QA/Stitch

- [x] `tile-favorite` hit area (via `::before`) = **44×44px** at 768px; `elementFromPoint` at all four 44px-zone corners resolves to the ★ control; a real click 3px outside the painted box toggled favorite. (AC-001 ✓ live)
- [x] Glyph `font-size` = 16px (≤20px); painted box 34×34 unchanged from pre-v20. (AC-002 ✓ live)
- [x] Computed `.app-grid-tool-fav` color in light mode = `rgb(100,116,139)`; contrast vs `#ffffff` = **4.76:1**. (AC-003 ✓ live)
- [x] Visual ★/☆ corner position 0px delta; status pip `.app-grid-tool-status` 9×9 at top-left 8/8 unmoved. (AC-004 ✓ live)
- [x] Dark-mode ☆ = `#64748b` unchanged; favorited amber ★ renders in its pill; hover pill / focus ring geometry unchanged. (AC-004 ✓ live)

---

## 9. Sign-offs

**Walt (product):** ✓ approved 2026-07-05 — product acceptance criteria are correct; this fixes
the right gap without scope creep; ready for Kare design section.

**Kare (design):** ✓ **DESIGN GO** 2026-07-05 — §8 authored and measured. Fix is two changed
lines + one added rule in `src/index.css` (`AppGrid.tsx` untouched): a transparent `::before`
lifts the ★ hit area to 44×44 with **0px** glyph movement and no change to the hover pill or
focus ring (AC-004), and the default light ☆ moves slate-400→**slate-500 `#64748b` = 4.76:1** on
white, clearing the ≥3:1 non-text floor with margin. Opacity `0.5` and the `#6366f1` focus ring
are unchanged, with rationale in §8.3–§8.4. Cleared to build once Walt's product sign-off (above)
holds — both are now present.

---

## 10. Built-UI design co-sign — Kare

**Verdict: APPROVE — design GO** (2026-07-05). Distinct from the §9 *spec-time* GO: this is
the co-sign on the **built** PR (#306, `v13.9.0`, footer `418ce7a`), measured off the running
homepad-staging DOM at **768px (iPad portrait)**, light + dark. Source matched §8 exactly; the
below is verified on what actually **renders**.

| AC | Live measurement | Result |
|---|---|---|
| AC-001 | `::before` = **44×44px**; `elementFromPoint` at all 4 corners of the 44px zone → ★ control; real `mouse.click` **3px outside the painted 34px box** flipped `→ is-favorite` (amber `#f59e0b`). Link (`a.app-grid-tool`) still hit 30px below. | ✅ ≥44×44, 0px glyph move |
| AC-002 | `font-size:16px`; painted box **34×34**, `box-shadow:none` at rest — unchanged. | ✅ |
| AC-003 | Light ☆ `color` = `rgb(100,116,139)` = `#64748b` (slate-500) → **4.76:1** on white. `@media (hover:none)` fires on the iPad → opacity **1.0** → effective rendered contrast **4.76:1**. | ✅ clears ≥3:1 (and ≥4.5:1) |
| AC-004 | Status pip `.app-grid-tool-status` **9×9 @ top-left 8/8** unmoved; dark ☆ `#64748b` unchanged; favorited amber ★ + hover pill / focus ring geometry unchanged. | ✅ no regression |

**Checks run:** touch-targets (elementFromPoint + real corner-tap), contrast (alpha-composited
computed style), position/8pt-grid, responsive 768px light+dark.
**Findings:** none (0 blocker/major/minor). Faithful build of §8 — nothing to file.
**Artifacts (Kare workspace):** `_v20_light_768.png`, `_v20_dark_768.png`, `_v20_favorited_768.png`.
**Co-sign recorded on:** PR Code/homepad#306 (comment, 2026-07-05) + this §10. Closes design work on #255.
