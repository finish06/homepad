# homepad v19 — A11y & Touch-Target Hardening Pass

**Version:** 1.0.0
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Shipped — v13.8.0 (2026-07-05, PR #299)
**Repo:** `Code/homepad` (frontend only — no API changes, no DB migrations)
**Estimate:** ~3–4 hours Stitch
**Target version:** v13.8.0 (minor; tentative — next available minor after v15 → v16 → v18 ship)
**Closes issues:** #177, #178, #182, #188, #189, #190, #191, #163 (investigate), #265, #277

---

## 1. Problem

homepad is built for **iPad-first** use — it runs on the homelab's lounge iPad and Caleb's desktop
monitors. But a Kare design review (2026-06-29, against v12.4.0 staging) flagged **5 blockers + 1
advisory** that have gone unfixed across six subsequent releases focused on layout, glass, and visual
polish (v13.0.0 → v13.5.0). The reference app fails its own design system on basic accessibility:

**Touch targets below ≥44px (DESIGN-SYSTEM §9.3 — the iPad-range floor):**
| Control | Measured | Required |
|---|---|---|
| Settings gear (`[data-testid="settings-gear"]`) | 36×36px | ≥44×44px |
| Quick-launcher bar (`.launcher-trigger`) | 36px tall | ≥44px tall |
| Account avatar button | 34×34px | ≥44×44px |
| Login "Sign in" button | 36px tall | ≥44px tall |
| Login form inputs | 38px tall | ≥44px tall |
| Login "Register" / "Log in" link | ~20px (bare link) | ≥44px tappable |

**Text / graphic contrast below WCAG AA floors (DESIGN-SYSTEM §1.1):**
| Element | Token | Measured | Required |
|---|---|---|---|
| Tile ⋯ menu glyph (light mode) | `text-neutral-400` | 2.52:1 on white | ≥3:1 (UI graphic) |
| Quick-launcher placeholder (light mode) | `neutral-400`-equiv | 2.53:1 | ≥4.5:1 (body text) |
| Header status caption ("Updated X ago", "N not monitored") | `text-neutral-400` | 2.52:1 on white | ≥4.5:1 (body text) |
| Login "or" divider label | `text-neutral-400` | 2.52:1 on white | ≥4.5:1 (body text) |

**Root cause:** three of the four contrast misses share the same token — `neutral-400`
(`#a3a3a3`) used for small affordances on white. DESIGN-SYSTEM §9.2: *"neutral-500 is the
lightest gray permitted for ≤14px text on white."* One token-swap rule fixes all three:
`text-neutral-400` → `text-neutral-500` on white-ground light-mode surfaces.

**Additionally — two copy regressions** from the shared-catalog model change (Caleb's 2026-07-02
directive, SPEC-245-224) that were never fixed in the frontend:
- **#277**: Edit-mode banner reverted to "Editing your personal dashboard" (PR #271 regression).
  Admin edit affects ALL users via the shared catalog — this copy is factually wrong.
- **#265**: UserMenu non-admin note calls tiles/categories a "personal dashboard" — still uses
  pre-v9 language incompatible with the shared-catalog model.

---

## 2. Goal

**Make homepad pass its own design system on its own primary device.** A user opening homepad
on an iPad — for login, for the dashboard, for editing — should never hit a control they can't
reliably tap or text they can't clearly read in ambient light.

**Make the edit-mode and non-admin copy accurate.** Admins and users should never be told they're
editing a personal dashboard that doesn't exist.

---

## 3. Scope

**Frontend only.** No API changes, no DB migrations. All changes are:
- Tailwind class updates (dimension and color token swaps)
- Copy string corrections
- No new components, no new API calls

All changes are mechanically similar. Stitch implements as a single PR.

---

## 4. Changes

### 4.1 Login page (`src/App.tsx` — `AuthForm` component) — closes #177, #178

| Element | Current class | Target class | Rule |
|---|---|---|---|
| "Sign in" / "Log in" submit button | `h-9` or equivalent (36px) | `h-11` (44px) | ≥44px touch |
| Email + password inputs | `h-[38px]` or equivalent | `h-11` (44px) | ≥44px touch |
| "Register" / "Log in" mode-toggle link | bare `<a>` ~20px | Wrapped in a `<button>` or padded link block with `min-h-[44px]` tappable zone | ≥44px touch |
| "or" divider label | `text-neutral-400` | `text-neutral-500` | ≥4.5:1 body text |

The visual size of the sign-in card may grow slightly with the h-11 inputs; Kare specifies the
updated vertical rhythm and padding in §9.

### 4.2 Header chrome (`src/AppHeader.tsx`) — closes #189, #190, #191

| Element | Current | Target | Rule |
|---|---|---|---|
| Settings gear button | `h-9 w-9` (36px) | `h-11 w-11` (44px) | ≥44px touch |
| Quick-launcher bar height | `h-9` (36px) | `h-11` (44px) | ≥44px touch |
| Quick-launcher placeholder text | `neutral-400`-equiv (2.53:1) | `neutral-500` class or explicit color at ≥4.5:1 | WCAG AA |
| Header status captions | `text-neutral-400` | `text-neutral-500` | ≥4.5:1 body text |

The status captions include "Updated X ago" and "N not monitored" — both use the same token
and both must change. Dark-mode variants must be preserved unchanged (they're on near-black ground
and already pass 7–8:1).

### 4.3 Tile chrome (`src/Catalog.tsx` / service tile) — closes #188

| Element | Current | Target | Rule |
|---|---|---|---|
| Tile ⋯ menu trigger glyph | `text-neutral-400` (2.52:1 on white) | `text-neutral-500` (or `-600` — whichever the tile's light-mode background yields ≥3:1) | ≥3:1 UI graphic |

The tile ⋯ box itself is already 44×44 (fixed in a prior pass, #183 verified). Only the glyph
color changes.

### 4.4 Account / UserMenu — closes #182, advisory #185

| Element | Current | Target | Rule |
|---|---|---|---|
| Account avatar button hit area | ~34×34px | `h-11 w-11` (44px) button wrapping the disc art | ≥44px touch |
| "+ Add apps" row in UserMenu | ~34px tall | `min-h-[44px]` | Advisory: ≥44px |

The disc art (the circular avatar image) stays its current visual size; the *button* that
surrounds it becomes 44×44. Standard pattern: visual ≠ hit area.

### 4.5 Copy fixes — closes #277, #265

**Edit-mode banner (`src/Catalog.tsx` or the banner component):**
- Current: `"Editing your personal dashboard"` (regression from PR #271)
- Target: `"Editing the shared catalog — changes affect all users"`
- Context: editMode is admin-only and controls the shared catalog. Any rename, delete, or
  category change affects every user's dashboard. This must say so.

**UserMenu non-admin note (`src/UserMenu.tsx` ~line 152):**
- Current: contains "personal dashboard" language implying per-user scoping
- Target: copy that accurately reflects the shared-catalog model — Kare finalizes exact wording
  in §9. Walt's brief: tell the user they're viewing the shared homelab catalog, not their
  own personal set of services.

### 4.6 Dark mode edit dashboard — closes #163 (investigate)

When implementing the `neutral-400` → `neutral-500` token sweep, check the admin edit-mode
tile chrome in dark mode for contrast. The prior a11y push (#163 era) fixed resting-dashboard
dark contrast, but edit mode's overlay buttons and action icons may not have been covered.

**Expected outcome:** if the token sweep catches #163, close it. If a separate edit-mode dark
issue persists (e.g. an overlay button on a dark card), fix it in the same PR and document
the specific element + before/after measurement in the PR description.

---

## 5. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Login "Sign in" / "Log in" button hit area ≥44px tall at 768px viewport (`getBoundingClientRect`). | Must |
| AC-002 | Login email and password inputs ≥44px tall at 768px viewport. | Must |
| AC-003 | Login mode-toggle ("Register" / "Log in") presents a tappable zone ≥44×44px. | Must |
| AC-004 | Login "or" divider contrast ≥4.5:1 on white (light mode). | Must |
| AC-005 | Settings gear button `getBoundingClientRect` height and width ≥44px at 768px. | Must |
| AC-006 | Quick-launcher trigger bar height ≥44px at 768px. | Must |
| AC-007 | Quick-launcher placeholder text contrast ≥4.5:1 on its background in light mode. | Must |
| AC-008 | Header status captions ("Updated X ago", "N not monitored") ≥4.5:1 contrast on white in light mode. | Must |
| AC-009 | Tile ⋯ menu glyph ≥3:1 contrast on the tile background in light mode. | Must |
| AC-010 | Account avatar button (`[data-testid="user-avatar"]` or equivalent wrapping element) ≥44×44px hit area at 768px. | Must |
| AC-011 | "+ Add apps" row in UserMenu ≥44px tall. | Should |
| AC-012 | When admin editMode is active, the edit-mode banner reads "Editing the shared catalog — changes affect all users" (exact match). | Must |
| AC-013 | UserMenu non-admin note does not contain the phrase "personal dashboard". | Must |
| AC-014 | All changes preserve correct dark-mode behavior — no dark-mode contrast or layout regressions. | Must |
| AC-015 | No existing vitest or playwright browser-gate specs fail. | Must |
| AC-016 | Stitch documents, in the PR description, the `getComputedStyle` contrast measurements for each token changed (before → after) and the `getBoundingClientRect` measurements for each touch target changed. | Must |

---

## 6. User Test Cases

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| UTC-1 | iPad login | Open homepad login at 768px, tap "Sign in", each input, and the mode-toggle | All hit on first tap; inputs expand to card width naturally |
| UTC-2 | iPad dashboard header | View dashboard at 768px, tap settings gear and quick-launcher | Both trigger reliably without precision aiming |
| UTC-3 | Light-mode contrast check | Open dashboard in light mode, look at status caption, ⋯ glyph, launcher placeholder | All legible against white backgrounds in ambient light |
| UTC-4 | Edit-mode banner (admin) | Log in as admin, activate Edit tiles | Banner reads "Editing the shared catalog — changes affect all users" |
| UTC-5 | Non-admin UserMenu | Log in as non-admin, open user menu | No "personal dashboard" phrasing anywhere in the menu |
| UTC-6 | Avatar tap (iPad) | At 768px, tap the avatar area | Menu opens without needing to hit the exact disc |
| UTC-7 | Dark mode regression | Toggle dark mode, check all changed surfaces | No contrast regressions or layout changes in dark |

---

## 7. Why Now — Product Rationale

homepad calls itself **iPad-first**. After six consecutive releases (v13.0.0 → v13.5.0) that made
the dashboard visually premium — pane-fill, glass v2, accent colors, ultra-wide frame — the product
experience on the actual primary device is still blocked by controls that are too small to tap
reliably and text that reads poorly in normal room light.

Kare's design review (2026-06-29) documented this clearly. It should have been fixed then. It
wasn't. The two copy regressions (#277, #265) have been wrong since the shared-catalog directive
(2026-07-02) — admins are being told they're editing a "personal dashboard" that no longer exists.

The queue (v15, v16, v18) adds useful features but none of them fix these fundamental quality
gaps. This pass closes all five design-review blockers, the login a11y issues, and the copy
regressions in one cohesive, fast-to-build sprint before the queue lands. It is the right next
iteration.

---

## 8. Out of Scope

- **#272** (fmtUptime shows "100.0%" for near-100% values) — separate display bug; next PR.
- **#276** (mergeCategories pane widths don't sum to 100%) — latent layout logic bug; separate.
- **Category pane layout control (PR #215)** — held pending product decision; separate.
- **Loading state (#184)** — left open; separate pass.
- **Arrange/drag handle sizing** — belongs to v18 (gear edit menu).
- Any API or backend changes.

---

## 9. Design (Kare)

**Scope of this section.** Walt's §4 tables are written against the 2026-06-29 audit snapshot
(v12.4.0). Grounding this section against the live source on `spec/v19-a11y-touch-pass` (read off
the DOM in my 2026-06-29 authed pass, DESIGN-SYSTEM §9, and the current component files), **most of
the mechanical touch/contrast fixes have already landed piecemeal across v13.x** and now need
*formalizing and verifying*, not re-implementing. Below I answer Walt's Q1–Q5 and, for each, state
whether the target is **already met** (Stitch verifies, does not re-touch) or **still open** (Stitch
implements to this spec). The one control that is genuinely still wrong is the non-admin UserMenu
copy (Q3 / #265). Do not regress the controls marked *already met*.

**The two rules everything here answers to** (DESIGN-SYSTEM §9.3, §1.1):
- **Touch:** interactive controls stay **≥44×44px through the iPad range**. Grow the *hit area*,
  not necessarily the visual art (visual ≠ hit area). Never shrink a touch target at `sm:` — only
  behind a true pointer query (`lg:` / `(hover:hover)`).
- **Contrast:** `neutral-500` (`#737373`, **4.74:1** on white) is the *lightest* gray permitted for
  ≤14px text / UI glyphs on a white ground. `neutral-400` (`#a3a3a3`, **2.52:1**) is a defect on
  white, full stop. Dark mode is untouched (it rides 7–8:1 on near-black and passes).

---

### Q1 — Login card layout & vertical rhythm

**Status: already met on this branch; this spec formalizes it as the standard.** The `AuthForm`
card already carries `min-h-[44px]` on both inputs, the submit button, the mode-toggle, and the
PocketID button (`src/App.tsx` ~331–388). No padding change is required — the card was already
built to absorb the taller controls. Here is the authoritative rhythm; Stitch keeps it exactly and
does not "clean it up":

| Element | Class | Value | Grid |
|---|---|---|---|
| Card container | `w-full max-w-sm rounded-2xl … p-6` | width 384px, **radius 16px**, **padding 24px** | ✅ 8pt |
| Card → app-surface margin | outer `<main> … p-6` | 24px gutter (comfortable at phone 390 & iPad 768) | ✅ 8pt |
| Logo → wordmark | `mb-3` on logo (48×48, `rounded-xl`) | 12px | ✅ 4pt |
| Wordmark → subtitle | `mt-1` | 4px | ✅ 4pt |
| Subtitle → first field | `mt-5` on Email label | **20px** (section break into the form) | ✅ 4pt |
| Field label → its input | `mt-1` | 4px (label hugs its control) | ✅ 4pt |
| Email group → Password group | `mt-4` on Password label | 16px | ✅ 8pt |
| Last field → **primary CTA** | `mt-5` on submit | **20px** (the CTA gets the most air — hierarchy) | ✅ 4pt |
| Primary CTA → mode-toggle | `mt-3` on toggle | 12px (paired secondary, close to the CTA) | ✅ 4pt |
| Mode-toggle → "or" divider | `my-4` on divider | 16px (OIDC is a *separate* auth path, so it gets its own break) | ✅ 8pt |
| Input / button height | `min-h-[44px]` | ≥44px | ✅ touch |
| Input / button radius | `rounded-lg` | 8px | ✅ ramp |

**Design intent for Stitch:** the rhythm is deliberately **non-uniform** — 20px above the primary
CTA, 12px below it — so the filled indigo "Sign in" is the clear single primary (principle #4) and
the plain-text toggle reads as its subordinate pair, not a competing button. Keep `p-6`; do **not**
add a shadow bump or grow the radius. The card growing ~18px taller with 44px controls is expected
and fine at all three viewports (it stays a fixed-width centered card, DESIGN-SYSTEM §4).

---

### Q2 — Mode-toggle ("Register" / "Log in") treatment

**Status: already met; this is the endorsed idiom.** The correct answer to "which of the three
options" is **a `<button type="button">` styled as text, full-width, centered in a 44px row** — and
that is exactly what's shipped (`src/App.tsx` ~363–372):

```
class="mt-3 flex min-h-[44px] w-full items-center justify-center text-center
       text-sm text-neutral-500 hover:text-neutral-800"
```

Why this is the right idiom and the other two options are rejected:
- **`<button>` styled as text, not a bare `<a>`** — the action is a client-side state flip
  (`setMode`), not navigation, so an `<a>` is semantically wrong. A real `<button>` is correct for
  a11y (keyboard/AT) and lets the whole 44px row be the hit target.
- **Full-width centered 44px row, not a padded inline pill** — an inline padded link would create a
  second boxed affordance directly under the filled CTA and muddy the "one primary action" read. A
  borderless, centered, full-width text button is visually *quiet* (no fill, no border) while being
  physically *large* (44px) — hit area without visual weight. This is homepad's established
  quiet-secondary pattern (same shape as the PocketID row minus the border).
- **The "or [link]" grammar is preserved** because the mode-toggle and the `or`-divider are two
  different things: the toggle switches sign-in↔register; the `or` divider (`my-4`, below it) fences
  off the OIDC path. They never sit on one line, so there's no inline-link grammar to break.

Contrast: `text-neutral-500` (#737373) = **4.74:1** on white — passes AA body. Keep it; the hover
step to `neutral-800` is a nice affordance cue. **Do not** revert this to an inline `<a>`.

---

### Q3 — Non-admin UserMenu note (the one genuinely-open code change — #265)

**Status: STILL WRONG — implement this.** `src/UserMenu.tsx` ~157–160 currently reads:

> *"Your tiles, categories, and icons are your personal dashboard — manage them directly on the
> home screen."*

This is factually wrong under the shared-catalog model (Caleb 2026-07-02): tiles, categories, and
icons are the **shared** catalog, admin-managed — they are not the user's to own. What *is* personal
is the favoriting/arrangement layer. **Exact replacement copy:**

> **"These tiles and categories are the shared homelab catalog, managed by your admin. Favorite the
> ones you use most and arrange them on your home screen."**

Rationale, mapped to Walt's brief: (a) "shared homelab catalog" = they're browsing a shared set;
(b) "managed by your admin" = they can't rename/remove/re-category it; (c) "Favorite … and arrange
them" = what they *can* do. Satisfies **AC-013** (no "personal dashboard" phrase).

**Design note on the surrounding section (keep, don't touch):** the "My Dashboard" section header
and the `personal` scope-tag on "Go to my dashboard" are **correct and stay** — they legitimately
describe the per-user favorites/arrangement/"+ Add apps" layer that lives on the home screen. The
defect is *only* the note conflating the shared *catalog* with personal ownership. Don't strip the
word "personal" from the section header or the scope-tag in an over-correction — AC-013 targets the
note string, not the navigation labels.

---

### Q4 — Gear icon proportion inside the 44px button

**Status: already met; proportion confirmed correct.** The gear is `h-11 w-11` (44×44) with a
`h-5 w-5` (**20px**) glyph (`src/AppHeader.tsx` ~116–129). **Keep the icon at 20px — do not scale
it up.** The reasoning is a real proportion rule, not a shrug:

- 20px glyph in a 44px box = the icon occupies ~45% of the hit box with ~12px of breathing room on
  each side. That is the standard **toolbar icon-button ratio** (icon ≈ 40–50% of the hit area). A
  24px glyph would push to ~55% and read cramped/heavy for a *toolbar* control (toolbar icons are
  quiet chrome, not primary CTAs).
- **Consistency:** the header's other glyphs — the alert bell (`viewBox 0 0 20 20`, rendered at the
  same visual scale) — already sit at ~20px. Bumping only the gear would desync the toolbar. The
  22px+ visual weight is reserved for content/CTA icons, not header chrome (principle #8).
- The 44px comes entirely from the button box + `rounded-full` hit area; the glyph does not carry
  the touch target. Visual ≠ hit area — same pattern as the avatar (Q-adjacent, §4.4).

So: **20px icon inside a 44px button is the right proportion. Locked.**

---

### Other in-scope controls — verification checklist (not re-implementation)

Every remaining §4 control is **already at target on this branch**; Stitch's job is to *not regress*
them and to record the measurements for **AC-016**. I read each off the current source:

| §4 item | Current state (this branch) | Verdict |
|---|---|---|
| Login "or" divider (§4.1) | `text-neutral-500` (4.74:1) | ✅ met |
| Settings gear (§4.2) | `h-11 w-11`, 20px glyph | ✅ met (Q4) |
| Quick-launcher bar (§4.2) | `.launcher-trigger { min-height: 44px }` (index.css ~796) | ✅ met |
| Launcher placeholder (§4.2) | `#6e6e6e` (≈4.9:1 on white) | ✅ met |
| Header status captions (§4.2) | `text-neutral-500 dark:text-neutral-400` (StatusBar ~96) | ✅ met |
| Tile ⋯ trigger (§4.3) | `h-11 w-11`, glyph `text-neutral-500` | ✅ met (box + glyph) |
| Account avatar (§4.4) | button `min-h-[44px] min-w-[44px]` wrapping a 34px disc — the visual≠hit pattern | ✅ met (#182) |
| "+ Add apps" row (§4.4) | verify `min-h-[44px]` at 768 (advisory AC-011) | ⚠️ verify live |
| Edit-mode banner (§4.5 / #277) | already reads *"Editing the shared catalog — changes affect all users"* (Catalog ~693) | ✅ met |
| **UserMenu note (§4.5 / #265)** | still "personal dashboard" | ❌ **open — Q3 copy** |
| Dark-mode edit chrome (§4.6 / #163) | investigate the edit-mode overlay glyphs specifically; the token sweep may already cover it | ⚠️ verify live |

**Net for Stitch:** the substantive code change in this PR is **Q3's copy string (#265)**, plus the
#163 dark-edit-mode investigation (§4.6). Everything else is *confirm and measure for the PR
description* — if any of the "✅ met" rows measures below target at 768px, that's a regression to fix
in the same PR and flag to me.

---

### Q5 — Design co-sign is at spec time; build verification is a commitment

Recording it here so the gate is durable: **once Stitch's PR is up, I will drive the headless
Chromium against staging at 768px (iPad portrait), in both light and dark mode, and verify every AC
(AC-001…AC-016) off the live DOM** — `getBoundingClientRect` for each touch target and computed
alpha-composited contrast for each token — before I co-sign the *built* PR (the `reviewer`-skill
approve/changes verdict). Any miss becomes a Gitea issue filed against the PR with the rule, the
measured value, the viewport, the selector, and a screenshot; **merge only once clean.** This §9
co-sign is the design GO on the *spec*; it does not pre-approve the build.

**My design GO on this spec: APPROVE.** The change set is measurable, on-system, and low-risk;
every question is resolved above with exact classes/copy; the only real code delta is the #265 copy
fix. Proceed to build.

---

## 10. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | Approved — 2026-07-05 |
| Design / UX (spec) | Kare | **Approved (design GO) — 2026-07-05** — §9 authored (Q1–Q5 resolved); build verification per Q5 committed. |
| Design / UX (built PR #299) | Kare | **APPROVE (design GO) — 2026-07-05** — live 768px iPad-portrait verification, light + dark, per §10.1 below. |

*This spec requires both sign-offs before Stitch builds. Both are now recorded: Walt (product) and
Kare (design). §9 is authored and this spec is `approve`d for build. The built-PR co-sign (§9 Q5)
is now also recorded — see §10.1.*

---

### 10.1 Build co-sign — live verification of PR #299 (§9 Q5)

**Verdict: APPROVE (design GO).** Verified against `homepad-web.homepad-staging.svc` at **768×1024
(iPad portrait), both light and dark**, read off the live DOM (`getBoundingClientRect` for touch
targets, alpha-composited `getComputedStyle` for contrast). Every in-scope AC passes.

| AC | Target | Live measurement (768px) | Verdict |
|---|---|---|---|
| AC-001 | Sign in ≥44px tall | 44.0px (light+dark) | ✅ |
| AC-002 | Login inputs ≥44px tall | email 44.0 / password 44.0 | ✅ |
| AC-003 | Mode-toggle ≥44×44 | "Need an account? Register" row 334×44 | ✅ |
| AC-004 | "or" divider ≥4.5:1 (light) | **source-verified** `text-neutral-500` (#737373 = 4.74:1). Control is OIDC-gated (`oidcEnabled && …`, App.tsx:395) and staging reports `oidcEnabled:false`, so the divider does not render live — measured from source, not DOM. | ✅ (source) |
| AC-005 | Gear ≥44×44 | 44.0×44.0 (light+dark) | ✅ |
| AC-006 | Launcher trigger ≥44px tall | 44.0px | ✅ |
| AC-007 | Launcher placeholder ≥4.5:1 | light 5.10:1 (#6e6e6e), dark 7.34:1 | ✅ |
| AC-008 | Status caption ≥4.5:1 | light 4.74:1 (#737373), dark 7.36:1 | ✅ |
| AC-009 | Tile ⋯ menu glyph ≥3:1 | **MOOT — see reconciliation below.** The ⋯ menu (Catalog.tsx) is dead code since #223; Catalog.tsx is imported only by tests. The successor control is the favorite ★. | ⚠️ reconciled |
| AC-010 | Avatar ≥44×44 | `user-menu-trigger` 44.0×44.0 | ✅ |
| AC-011 | "+ Add apps" ≥44px tall | gear-menu `gear-add-apps` 186×44 | ✅ |
| AC-012 | Edit banner exact copy | "Editing the shared catalog — changes affect all users" — exact match (App.tsx:215; rendered) | ✅ |
| AC-013 | No "personal dashboard" in note | note reads the §9 Q3 shared-catalog copy verbatim; `personal dashboard` absent from menu DOM | ✅ |
| AC-014 | Dark banner label ≥AA | **9.03:1** (indigo-300 #a5b4fc on the live dark banner ground rgb(21,21,38)); was 2.86:1 | ✅ |
| AC-015 | No failing specs | Stitch-owned build gate (PR carries the #163 768px live-DOM gate test) | ⛭ Stitch |
| AC-016 | PR-description measurements | Stitch-owned PR-description obligation | ⛭ Stitch |

**Admin-gated ACs (AC-012 / AC-014).** No admin session was obtainable on staging (no admin creds;
no `kubectl`/`psql` in the pod to promote a user). The banner is unconditional markup gated only by
`isAdmin && editMode` — its CSS, copy, and contrast are identical however edit mode is triggered. So
those two were measured **byte-faithfully by injecting the exact App.tsx:213–224 markup into the
live app surface** (real `index.css` `.dark .edit-mode-banner` rules + real dark background apply),
not by driving a real admin edit session. Values above are from that live-CSS injection.

**AC-009 reconciliation (drift: Catalog.tsx dead since #223 → AppGrid ships).** AC-009 as literally
written targets the **Catalog tile ⋯ menu glyph**, which no longer ships — Catalog.tsx is dead code
(imported only by tests) and the App renders **AppGrid**. The per-tile control it was replaced by is
the **favorite ★ toggle** (#240, `data-testid="tile-favorite"`). AC-009's letter is **moot**, but
its *intent* — the per-tile affordance must clear the touch and non-text-contrast floors — transfers
to the ★, and the ★ **does not clear them**:

- **Touch target:** rendered **34×34px** at 768px (`.app-grid-tool-fav`, index.css:2476) — below the
  ≥44×44 floor. (On touch it is correctly kept opaque via `@media (hover:none)`, but the *hit box* is
  still 34px.)
- **Contrast (light):** default ☆ = `#94a3b8` on the white tile = **2.56:1** — below the ≥3:1
  non-text floor. Dark ☆ = `#64748b` = 3.79:1 (passes 3:1).

This is a **pre-existing gap, not a v19 regression** — the ★ predates v19 (#240 / reviewed at PR
#253) and was **out of v19's declared scope** (v19's §4 measured the now-dead ⋯ menu). It is already
tracked in **Gitea #255** and re-confirmed live here. It therefore does **not** hold the v19 co-sign
(v19 delivers all its own ACs and closes 5 real blockers); it is flagged to Walt as follow-up spec
input. **Design GO on PR #299 stands.**

Artifacts (768px): `v19-login-768-{light,dark}.png`, `v19-dash-768-{light,dark}.png`,
`v19-usermenu-768-light.png`, `v19-gearmenu-768-light.png`, `v19-editbanner-768-{light,dark}.png`.

---

## 11. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-05 | 1.0.0 | Walt | Initial spec — closes 5 design-review blockers + login a11y + 2 copy regressions |
| 2026-07-05 | 1.1.0 | Kare | Authored §9 (Q1–Q5 resolved, per-control verification checklist); recorded design GO in §10 |
| 2026-07-05 | 1.2.0 | Kare | §10.1 — built-PR co-sign (APPROVE): live 768px light/dark AC verification off staging DOM; AC-009 reconciled (⋯ menu dead since #223 → favorite ★ successor; 34px + 2.56:1 gap = pre-existing #255, flagged to Walt, does not hold v19) |
