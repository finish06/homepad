# homepad v19 — A11y & Touch-Target Hardening Pass

**Version:** 1.0.0
**Created:** 2026-07-05
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare design §9. Stitch: do not build until §9 and both sign-offs are present.
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

*[This section is to be authored by Kare. Dispatching alongside spec publication.]*

Walt's design questions for Kare to resolve in this section:

**Q1 — Login card layout:** Expanding inputs and the submit button from 38px → 44px adds vertical
height to the auth card. Does the login card's padding / vertical rhythm need adjustment? What's
the correct spacing between elements on the expanded card? Specify the updated layout so Stitch
doesn't need to guess.

**Q2 — Mode-toggle treatment:** The "Register" / "Log in" toggle is currently a bare inline `<a>`
link (~20px tall). What's the preferred treatment to hit ≥44px without breaking the "or [link]"
visual grammar? Options: pad it to a full-width block link, use a `<button>` styled as text, or
center it in a 44px row. Which matches the design system's idiom?

**Q3 — Non-admin UserMenu copy:** The current note (containing "personal dashboard") needs
rewriting for the shared-catalog model. Draft the exact copy for the non-admin user note. Brief:
tell the user they're browsing the shared homelab catalog; they can favorite tiles; the catalog
itself is managed by the admin.

**Q4 — Gear button enlarged from 36→44px:** The settings gear currently matches the `h-9 w-9`
pattern of the era. At `h-11 w-11`, verify the gear icon fits visually inside the larger box
without feeling lost. Does the icon size need to scale with the button, or is 20px icon inside
44px button the right proportion for this toolbar?

**Q5 — Verify on staging:** Please verify the Stitch PR's implementation at 768px (iPad), in
both light and dark mode, against all AC items before co-signing. Flag any misses as Gitea issues
against the PR; merge only once clean.

---

## 10. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | Approved — 2026-07-05 |
| Design / UX | Kare | Pending |

*This spec requires both sign-offs before Stitch builds. Kare's §9 is pending — dispatching
alongside this commit. Spec is not `approve`d until both are recorded here.*

---

## 11. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-05 | 1.0.0 | Walt | Initial spec — closes 5 design-review blockers + login a11y + 2 copy regressions |
