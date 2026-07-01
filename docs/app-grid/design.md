# App Grid — Design Spec

**Author:** Kare (design/UX) · **Date:** 2026-07-01 · **Status:** design-side of the co-owned spec
(Walt owns *what/why* in `SPEC-INTAKE.md` → his product spec; this doc owns *how it looks & feels*).
**Builds to:** the Homelab Design System (`Code/design-system/DESIGN-SYSTEM.md`) + homepad's shipped
dark/light neutral tokens (`src/*.tsx`). **Target of record:** `docs/app-grid/mockup-1.png`,
`mockup-2.png` (dark-only mockups — light mode specced here by mapping to homepad's existing scale).

Every value below is either a homepad token already in the codebase or a value **measured off the
mockup pixels** (decoded via the Chromium sidecar) and **contrast-checked** (computed sRGB, WCAG). No
eyeballing.

---

## 0. TL;DR — the decisions that differ from a literal mockup trace

| # | Decision | Why (measured) |
|---|----------|----------------|
| 1 | **Active width button = `indigo-600` (`#4F46E5`), not the mockup's `#5B8CFF`.** | White text on the mockup blue is **3.16:1 — FAILS AA** (body text needs 4.5). White on `indigo-600` = **6.29:1 ✅**, and it's homepad's existing primary. Native *and* accessible. |
| 2 | **Map the mockup's slate surfaces onto homepad's `neutral` dark scale** (`neutral-900` box / `neutral-800` chip), not the mockup's blue-tinted `#171A23`/`#1E2230`. | App Grid is a homepad page under homepad chrome; it must match the shipped dark theme (§1.1), not invent a second dark palette. Same layering, native tokens. |
| 3 | **Width control is a real `radiogroup` with ≥44px touch targets** (not 28px unlabelled chips). Compacts to 32px **only** behind a pointer query, never at `sm`. | Mockup chips render ~28–32px; rule is ≥44×44 through the iPad range (DS §9.3). |
| 4 | **Narrow boxes (span ≤2, and all boxes <640px) swap the 6-button segmented control for a compact `Width ▾` select.** | Measured: the 1–6 segmented control needs **~264px** minimum; a span-1/-2 box is ~180–360px wide — the mockup's own width-2 "Docs" box **clips the "6" button and truncates link names** (`mockup-2.png`). The control physically cannot live inline in a narrow box. |

---

## 1. Tokens

### 1.1 Color / surfaces

App Grid is three stacked dark surfaces (page → box card → link chip), mirrored in light. Use
homepad's `neutral` scale (already in `tailwind`/`src`), **not** new slate values.

| Element | Dark (mockup intent → homepad token) | Light | Border |
|---|---|---|---|
| **Page ground** | `#0F1117` → **`neutral-950` `#0A0A0A`** (or `neutral-900` to match header) | `neutral-50 #FAFAFA` | — |
| **Box card** | `#171A23` → **`neutral-900 #171717`** | `#FFFFFF` | dark `neutral-800 #262626` / light `neutral-200 #E5E5E5`, **1px** |
| **Link chip / row** | `#1E2230` → **`neutral-800 #262626`** | `neutral-50 #FAFAFA` | dark `neutral-700 #404040` / light `neutral-200`, **1px** |
| **Icon chip (inside row)** | one step up from the row: `neutral-700` dark / `white` light | | subtle 1px `neutral-600`/`neutral-200` |

**Text**

| Role | Dark | Contrast (measured) | Light | Contrast |
|---|---|---|---|---|
| Page title "App Grid" | `neutral-50` 700/32px | 16.4:1 ✅ | `neutral-900` | 17.9:1 ✅ |
| Subtitle | `neutral-400 #A3A3A3` | **7.48:1** ✅ on `#0F1117` | `neutral-500 #737373` | **4.74:1** ✅ (floor) |
| Link name | `neutral-100 #F5F5F5` 16/600 | **16.4:1** ✅ | `neutral-800 #262626` | **15.1:1** ✅ |
| "width" label | `neutral-400` | 7.5:1 ✅ | `neutral-500` | 4.74:1 ✅ |

> **Rule enforced (DS §9.2):** `neutral-500` is the *lightest* gray allowed for ≤14px text on white;
> in dark, secondary text steps to `neutral-400`. Do not use `neutral-400` for body text on white.

**Accent / primary** — homepad `indigo-600 #4F46E5`. White-on-indigo = **6.29:1 ✅**.
Focus ring `indigo-500` (dark: `indigo-400`, 6.0:1 vs `neutral-900`).

### 1.2 Spacing (8pt grid)

| Token | Value | Applies to |
|---|---|---|
| Page padding | 24px (desktop) / 16px (<640) | around the grid |
| **Grid gap** (between boxes, both axes) | **16px** | homepad's shipped tile-grid gap — reuse it |
| Box padding | **16px** (`p-4`) | inside each box card |
| Header→links gap | 16px | title row to first link row |
| **Links grid gap** (inside box) | 12px | between link chips |
| Icon→name gap | 12px | inside a link row |
| Width-button gap | 4px | between segmented buttons |

All land on the 4/8 scale. Flag any one-off (`13px`, `gap-[7px]`).

### 1.3 Radius / elevation

| Element | Radius | Elevation |
|---|---|---|
| Box card | **16px** (`radius-lg`, `rounded-2xl`) | flat + 1px border (homepad is a flat/bordered surface, DS §1.5). Optional `shadow-sm` in light only. |
| Link chip / row | 12px (`radius-md`) | flat + 1px border; hover raises border, no shadow jump |
| Icon chip | 10–12px | — |
| Width button | 8px (`radius-sm`) | — |
| "+ Add box" | 16px | dashed border, no fill |

### 1.4 Type

Inter (homepad `font-ui`). Scale from DS §1.2: `12 · 14 · 16 · 20 · 24 · 32`.

| Role | Size / weight / line-height |
|---|---|
| Page title | 32 / 700 / 40 |
| Subtitle | 16 / 400 / 24 |
| Box title | 20 / 600 / 28 |
| Link name | 16 / 600 / 24 |
| "width" label + button digit | 14 / 500 |

### 1.5 Motion (DS §1.6)

- Width-button state change (bg/text): **150ms `ease-out`**.
- **Layout reflow on width change: no FLIP animation.** Grid track changes don't tween cleanly and
  jank is worse than a snap. Optionally cross-fade the box contents `120ms` opacity; nothing that
  moves layout. **`prefers-reduced-motion`: all of the above → 0ms.**

---

## 2. The width selector (the interactive centerpiece — a11y-critical)

Reused twice per box: sets the **box column-span** *and* **links-per-row** (spec §Width). It is the
one genuinely interactive control here, so it carries the a11y + touch weight.

### 2.1 Two variants, one measured breakpoint

The 1–6 (extensible to 8) segmented control needs **≈264px** (6 × 40px + 5 × 4px gap + "width" label
+ padding). A span-1 or span-2 box is narrower than that at every viewport — the mockup's own width-2
"Docs" box **clips the "6" and truncates link names** (`mockup-2.png`). So:

- **Segmented (default):** box **span ≥ 3** AND viewport **≥ 640px**. Inline 1–6 buttons in the header.
- **Select (compact fallback):** box **span ≤ 2**, OR **any** box below 640px. A single `Width ▾`
  native `<select>` chip (fits ~96px, one 44px target, bulletproof a11y). Same visual family, one tap
  to open, value shown ("Width 3").

Rule of thumb for Stitch: *if the segmented control's min-content width > the box's content width, render
the select.* Never let the control overflow or clip the box (the mockup-2 defect — **do not ship it**).

### 2.2 Segmented control — visual states

Buttons `1..6` (`..8` if the box's data allows; ceiling is the grid's max, per Caleb: 6 primary, 8 OK).

| State | Dark | Light | Notes |
|---|---|---|---|
| **Active** (selected) | `bg-indigo-600` + `text-white` (**6.29:1**) | same | one active per group |
| **Idle** | `bg-neutral-800` `text-neutral-300` (**10.2:1**) | `bg-neutral-100` `text-neutral-700` (**10.4:1**) | 1px `neutral-700`/`neutral-200` border |
| **Hover** (idle) | `bg-neutral-700` | `bg-neutral-200` | 150ms |
| **Focus-visible** | `ring-2 ring-indigo-400` + 2px offset | `ring-2 ring-indigo-500` | keyboard only |
| **Disabled** (n > max for grid) | 40% opacity, `aria-disabled` | same | e.g. 7/8 when grid caps at 6 |

**Sizes:** each button **44×44** (touch) through the iPad range; **`(hover:hover)` / `lg:` → 36×36**.
Never shrink at `sm:` (DS §9.3). `radius-sm` 8px, `gap 4px`. "width" label 14/500 to the left, 8px gap.

### 2.3 Segmented control — semantics & keyboard

Preferred build: **native radios** (free a11y), visually styled as the segmented control:

```html
<fieldset class="width-selector"> <!-- styled as inline segmented; legend visually-hidden -->
  <legend class="sr-only">Box width for “Analytics”</legend>
  <label><input type="radio" name="w-analytics" value="1" class="sr-only"> <span>1</span></label>
  … 2..6 …  <!-- checked = active styles via :checked + peer/has -->
</fieldset>
```

If built with ARIA instead: `role="radiogroup"` + `aria-label="Box width for Analytics"`; each button
`role="radio"` `aria-checked` `aria-label="Width {n}"`; **roving tabindex** (only the checked control
is `tab`-stop). Keyboard: **←/→ (and ↑/↓)** move + select, **Home/End** jump to 1/max, **Space/Enter**
confirm. Changing selection re-lays out live (spec §Behavior) and moves focus with the selection.

### 2.4 Select fallback — semantics

Native `<select aria-label="Box width for {title}">` with options `1..6(..8)`; the trigger shows
`Width {n}`. Native = full keyboard + SR support for free. 44px min height.

---

## 3. Link row (icon chip + name)

The whole row is **one link** (`<a href={url}>`), so the entire row is the tap target — must be
**≥44px tall** (mockup rows ~56px ✅). Layout: `[icon chip] —12px— [name]`, left-aligned, name
truncates with ellipsis + `title` attr (never wraps to a 3rd line; never overflows the chip — the
mockup-2 "Sp…"/"Ru…" truncation is *acceptable only because the box is genuinely narrow*, but always
keep the icon fully visible and the name single-line).

| Part | Spec |
|---|---|
| Icon chip | **40×40**, `radius 10–12`, `neutral-700` dark / `white` light + 1px border, icon glyph centered ~22–24px. If `icon` missing → monogram (first letter of `name`, `neutral-300`/`neutral-600`). |
| Name | 16/600, `neutral-100` dark (**16.4:1**) / `neutral-800` light (**15.1:1**), single line, ellipsis. |
| Row bg | `neutral-800` dark / `neutral-50` light, 1px border, `radius-md`. |
| **Hover** | border → `indigo-500/40`; bg lifts one step (`neutral-700` / `white`); 150ms. |
| **Focus-visible** | `ring-2 ring-indigo-400`(dark)/`500`(light) + 2px offset. |
| **Active/press** | `scale-[0.99]` (reduced-motion: none). |

**Internal links grid:** `grid-template-columns: repeat(var(--w), 1fr)`; extra links wrap to the next
row inside the box (spec §Width). `--w` = box width, **capped at 2 below 640px** (§4).

---

## 4. Responsive — the <640px contract (precise)

| Viewport | Page grid | Box span | Links-per-row inside a box | Width control |
|---|---|---|---|---|
| ≥1024 (desktop) | `repeat(6, 1fr)` (up to 8 if data uses it) | `span min(width, 6)` | `repeat(min(width,6), 1fr)` | segmented (span≥3) / select (span≤2) |
| 640–1023 (iPad) | `repeat(6, 1fr)` | same | same | same |
| **<640 (phone)** | **`repeat(2, 1fr)`** | **`span min(width, 2)`** | **`repeat(min(width,2), 1fr)`** | **select fallback for every box** |

So below 640px nothing exceeds 2 across — no horizontal overflow (spec §Responsive). A width-1 box =
1 col span, 1 link/row; width-6 box = 2 col span (full width), 2 links/row. Page padding drops to 16px;
grid gap stays 16px. "+ Add box" spans both columns.

CSS driver stays exactly the spec's one-variable model; only `--w` is clamped:
```css
.box   { grid-column: span min(var(--w), var(--cap)); }
.tools { grid-template-columns: repeat(min(var(--w), var(--cap)), 1fr); }
/* --cap: 6 (or 8) ≥640px; 2 below. Set via a media query or container query. */
```

---

## 5. "+ Add box" affordance

Full-width row **spanning all columns**, below the last box. Dashed 1px border `neutral-700` (dark) /
`neutral-300` (light), no fill, centered `+ Add box` label `neutral-400`/`neutral-500` (both ≥4.5:1),
**min-height 64px** (comfortably ≥44 target). `role="button"` (or a real `<button>`). **Hover:** border
→ `indigo-500`, label → `indigo-400`/`indigo-600`, 150ms. **Focus-visible:** `ring-2 ring-indigo-400`.
This is the *only* dashed surface — it reads as "add," consistent with homepad's `NOT_MONITORED`
dashed pattern (`src/StatusBar.tsx`).

---

## 6. States (every one is designed — DS principle #5)

| State | Design |
|---|---|
| **Empty** (no boxes) | Center a muted glyph + "No boxes yet" (`neutral-400`/`500`) + one primary `+ Add box` (indigo-600, white, ≥44) — mirror the reference empty state (DS §9.1, `homepad-auth-empty`). |
| **Box with no links** | Inside the box: a dashed inner row "No links" + the width control still present. Box never collapses to zero height. |
| **Loading** | Skeleton: 2–3 box cards with shimmer chips (`neutral-800`/`neutral-100`), **no bare gray text** (the #184 anti-pattern). Reduced-motion → static placeholders. |
| **Error** (failed load) | Inline card: "Couldn't load your grid" + a `Retry` button (secondary, ≥44). Text ≥4.5:1. |

---

## 7. Accessibility summary (verify at build)

- **Contrast:** every fg/bg pair above is computed and passes AA (active button is the one that *only*
  passes because we chose `indigo-600` over the mockup blue — hold that line).
- **Touch:** width buttons, link rows, select, "+ Add box" all ≥44×44 through the iPad range.
- **Keyboard:** width = radiogroup arrow-key semantics (or native radios/select); link rows are real
  anchors in DOM order; every interactive element has a visible `indigo` focus ring. Tab order follows
  reading order (title → width → links → next box → + Add box).
- **SR:** width control labelled per box ("Box width for {title}"); links expose their name; icon chips
  are decorative (`aria-hidden`) when the name is present.
- **Motion:** `prefers-reduced-motion` zeroes transitions; no layout FLIP.

---

## 8. Build checklist for Stitch (browser-gate criteria)

I will review the PR **in the browser** at 390 / 768 / 1440 and gate on:

1. Active width button renders `indigo-600` (**not** `#5B8CFF`); white digit ≥4.5:1. ← the load-bearing one
2. Width control ≥44×44 in touch range; segmented→select swap fires for span≤2 and <640px; **no clipping/overflow** of the control in any box (the mockup-2 defect must not ship).
3. Link rows ≥44px tall, single-line names, full icon, `indigo` focus rings.
4. <640px: page + boxes + links all cap at 2 across; zero horizontal scroll.
5. Surfaces use homepad `neutral` tokens in **both** dark and light; light mode specced here renders.
6. All four states (empty / no-links / loading / error) exist and pass contrast.
7. `prefers-reduced-motion` honored; no janky reflow on width change.

---

*Design-side sign-off is contingent on the built PR meeting §8. Token decisions here update the
Homelab Design System in the same breath if Caleb ratifies any evolution (e.g. adopting the box/chip
layering as the homepad "nested surface" pattern).* — Kare
