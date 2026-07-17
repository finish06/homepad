# DESIGN — Login / Sign-in, glass restyle (v15 alignment)

**Author:** Kare (design/UX) · **Date:** 2026-07-17 · **Status:** proposal — Caleb picks the direction, then Walt+Stitch build
**Scope:** `src/App.tsx` login/register form (the unauthenticated view) · **Repo:** Code/homepad
**Task:** kare-homepad-login-redesign-da463f · **This is a proposal. No build.**

> One-line: the login is the *only* screen a user sees before the glass UI, and it's the *only* screen still on
> the pre-v15 generic Tailwind palette. It fails its own product's design language and — in dark mode — fails WCAG
> AA on five separate text elements. This doc measures the gap and specifies the glass login that closes it.

---

## 1. Method (how these numbers were taken)

Rendered the **live** login (`http://homepad.10.17.2.213.nip.io/`, unauthenticated) in the headless Chromium
sidecar at **390×844 (phone)** and **1440×900 (desktop)**, in both color schemes. Colors are `getComputedStyle`
reads off the live DOM; contrast is WCAG relative-luminance, alpha-composited over the real parent surface — not
eyeballed. Dark mode is the reported real-world state (operator critique + iPad-at-night usage) and is reached by
`prefers-color-scheme: dark` when logged out.

- Artifacts: `login-current-dark-phone.png`, `login-current-dark-desktop.png`, `login-current-phone.png` (light).
- Measured surfaces (dark): page `#0a0a0a` (lum 0.003) · card `#171717` (lum 0.009).

---

## 2. Measured diagnosis

### 2.1 The headline defect — pure-white input slabs on a near-black void
The email/password fields render **`rgb(255,255,255)` — pure white (lum 1.000)** on a page of lum 0.003. That is a
**19.8:1 brightness collision**: two lightbulb-white rectangles punched out of black. It is not a *text*-contrast
fail (text on white reads 10.37:1) — it is a **luminance-discontinuity / harshness** defect, and it is off-system:
nothing in the logged-in v15 UI is a flat white slab.

**Root cause (code):** `src/App.tsx` inputs carry `border border-neutral-300` with **no `bg-*` and no `dark:bg-*`**,
so they fall back to the UA white. The login predates the v15 `--v-*` token migration and never got dark overrides.

### 2.2 Five WCAG AA text fails in dark mode (this is the real bug, not just taste)
Because the card's text colors were never given `dark:` variants, they stay light-mode neutrals on the dark card:

| Element | Class | Color on `#171717` card | Measured | AA 4.5:1 |
|---|---|---|---|---|
| **"Email" / "Password" labels** | `text-neutral-700` | `rgb(64,64,64)` | **1.73:1** | ❌ FAIL |
| **"Log in with PocketID" label** | `text-neutral-700` | `rgb(64,64,64)` | **1.73:1** | ❌ FAIL |
| Subtitle "Sign in to your dashboard" | `text-neutral-500` | `rgb(115,115,115)` | **3.78:1** | ❌ FAIL |
| Secondary "Need an account? Register" | `text-neutral-500` | `rgb(115,115,115)` | **3.78:1** | ❌ FAIL |
| "or" divider | `text-neutral-500` | `rgb(115,115,115)` | **3.78:1** | ❌ FAIL |

The labels at **1.73:1** are effectively invisible — they only *look* legible in the screenshot because the eye
adapts to the blazing-white field directly beneath them. In light mode all of these pass (labels on white are fine,
subtitle 4.74:1), so this is a **dark-mode-only regression cluster**.

### 2.3 Off-system / brand disconnect (no measured fail, but the assignment)
- **No glass backdrop.** `<main>` has no `.app-surface` (measured `background-image: none`) — a flat neutral void
  where the dashboard has the accent-blob glass atmosphere.
- **Card isn't glass.** `formBackdrop: none` — flat `bg-white / dark:bg-neutral-900`, no `backdrop-filter`. The
  logged-in chrome is all `var(--v-glass)` + `blur(30px) saturate(112%)`.
- **CTA is off-token.** "Sign in" uses generic `bg-indigo-600` (`#4f46e5`), not the v15 `--accent-3`. It reads 6.29:1
  (fine) but it won't follow a user's chosen accent and it isn't the shipped blue.
- **Whole card bypasses the token layer** — every color is a raw `neutral-*` / `indigo-*` utility, none of the
  `--v-*` / `--accent*` vars that make the rest of the app one system.

### 2.4 What is already correct (keep it)
- **Touch targets pass.** Inputs 44px, Sign in 44px, secondary 44px, PocketID 44px — all ≥44×44 (measured). The
  redesign must *preserve* this (App.test.tsx guards it; they were once 36/38/20px).
- **Hierarchy is basically sound** — one primary button, logo→title→fields→CTA order is right. The glass restyle
  keeps the structure and re-skins it; it does not re-architect the flow.

---

## 3. The proposal — "the login is the first tile"

Design intent: **the sign-in card is the first glass tile you touch.** Same atmosphere, same frosted surface, same
accent, same radii as the dashboard — so the moment before login and the moment after feel like one product. The
gradient house-logo is the brand hook; we give it room to breathe with a soft accent bloom, and we retire every
flat-white and every off-token neutral.

Principle guardrails applied: contrast measured not eyeballed (§1 rules 1), 8pt spacing (rule 2), 44px targets
(rule 3), one primary action (rule 4), states designed (§6, rule 5), reduced-motion honored (rule 6), rendered at
both breakpoints (rule 7), built from existing tokens (rule 8).

### 3.1 Phone — 390×844 (mobile-first; this is the primary target)

```
┌───────────────────────────────────────┐ 390px
│░░░  .app-surface — dark accent-blob   ░│  ← same glass backdrop as the dashboard
│░░░░  gradient + grain (bg-1→bg-2)   ░░░│    (NOT flat #0a0a0a)
│░░           ╭─ accent bloom ─╮        ░│  ← soft brand-gradient halo behind the card
│░           (  radial #6366f1  )        │    (decorative, no text over it → no contrast limit)
│░      ┌───────────────────────────┐   ░│  ┐
│░      │        glass card          │   ░│  │  .auth-card = .health glass recipe:
│░      │  ┃██┃  ← gradient logo     │   ░│  │  var(--v-glass) · blur(30px) saturate(112%)
│░      │  ┗━━┛     in glass chip    │   ░│  │  1px var(--v-brd) · radius --r-panel (24px)
│░      │                            │   ░│  │  shadow 0 10px 34px var(--v-shadow)
│░      │  homepad          (H1)     │   ░│  │
│░      │  Sign in to your dashboard │   ░│  ┘  subtitle → var(--v-muted) 5.59:1 ✓
│░      │                            │   ░│
│░      │  Email                     │   ░│  ← label var(--v-txt) 11.5:1 ✓ (was 1.73 ✗)
│░      │  ┌──────────────────────┐  │   ░│  ┐  glass field: var(--v-field) fill
│░      │  │ you@home.lan         │  │≥44░│  │  text --v-txt · placeholder --v-muted 4.98:1
│░      │  └──────────────────────┘  │   ░│  ┘  1px --v-kbdbrd + inset highlight (NOT white)
│░      │  Password                  │   ░│
│░      │  ┌──────────────────────┐  │   ░│  ┐  focus: 2px --accent-mid ring 4.69:1 ✓
│░      │  │ ••••••••             │  │≥44░│  ┘  (≥3:1 — the 1.4.11-compliant indicator)
│░      │  └──────────────────────┘  │   ░│
│░      │  ┌──────────────────────┐  │   ░│  ┐  PRIMARY: solid var(--accent-3) #2e63e0
│░      │  │       Sign in        │  │≥44░│  │  white label 5.28:1 ✓ · full-width
│░      │  └──────────────────────┘  │   ░│  ┘
│░      │        Create account      │   ░│  ← secondary = text link, --v-muted 5.59:1 ✓
│░      │   ───────  or  ───────     │   ░│  ← rule var(--v-rule) · "or" --v-muted ✓
│░      │  ┌──────────────────────┐  │   ░│  ┐  TERTIARY: glass-outline (var(--v-glass)
│░      │  │ ◆  Log in with PocketID│ │≥44░│  │  + 1px --v-brd), label --v-txt 11.5:1 ✓
│░      │  └──────────────────────┘  │   ░│  ┘  (was 1.73 ✗)
│░      └───────────────────────────┘   ░│
│░░                                     ░░│
│░░░           homepad · v15.3          ░░│  ← faint --v-faint version footer (optional)
└───────────────────────────────────────┘
```

Card is full-width minus 24px gutters (≈342px), vertically centered. Field height 44px, 12px gap between fields,
20px between groups — all on the 4/8pt scale.

### 3.2 Desktop — 1440×900 (same card, richer atmosphere)

```
┌──────────────────────────────────────────────────────────────────────────────┐ 1440px
│░░░░░  .app-surface — accent-blob glass gradient + grain, full-bleed  ░░░░░░░░░░│
│░░░░           ╭─────────── soft brand-gradient bloom ───────────╮          ░░░░│
│░░░                       ┌───────────────────────────┐                      ░░░│
│░░░                       │  ┃██┃  gradient logo chip  │  ← glass card,        ░░│
│░░░                       │                            │    max-width 400px,   ░░│
│░░░                       │  homepad                   │    centered (no       ░░│
│░░░                       │  Sign in to your dashboard │    stretched full-    ░░│
│░░░                       │                            │    width form)        ░░│
│░░░                       │  Email                     │                       ░░│
│░░░                       │  ┌──────────────────────┐  │  identical stack to   ░░│
│░░░                       │  │ you@home.lan         │  │  the phone — the      ░░│
│░░░                       │  └──────────────────────┘  │  card doesn't reflow, ░░│
│░░░                       │  Password                  │  it just sits in more ░░│
│░░░                       │  ┌──────────────────────┐  │  breathing room, with ░░│
│░░░                       │  │ ••••••••             │  │  a larger, softer     ░░│
│░░░                       │  └──────────────────────┘  │  accent bloom behind. ░░│
│░░░                       │  [        Sign in        ] │                       ░░│
│░░░                       │        Create account      │                       ░░│
│░░░                       │   ───────  or  ───────     │                       ░░│
│░░░                       │  [ ◆ Log in with PocketID ]│                       ░░│
│░░░                       └───────────────────────────┘                       ░░│
│░░░░                          homepad · v15.3                               ░░░░│
└──────────────────────────────────────────────────────────────────────────────┘
```

**Deliberate call:** keep the single centered card at both breakpoints rather than a two-column "brand panel + form"
split. It's mobile-first, it's one component to build and test, and it keeps the login honest to the dashboard
(which is also a centered glass column). The desktop richness comes from *atmosphere* (bigger bloom, more negative
space), not a different layout. A split-hero is a possible future direction if Caleb wants more marketing weight —
noted, not specified here.

---

## 4. Glass token mapping (old → v15 token)

Everything below already exists in `src/index.css` **except one new token** (`--v-field`). Reuse over invention.

| Element | Current (generic) | Proposed (v15 token) | Notes |
|---|---|---|---|
| Page backdrop | flat body `#0a0a0a` | **`.app-surface`** on `<main>` | the dashboard's exact gradient+blobs+grain |
| Brand bloom | — (none) | radial `--accent-1/--accent-2` @ ~0.14, behind card | decorative only, no text → contrast-exempt |
| Card | `bg-white dark:bg-neutral-900` | **`.health` glass recipe** | `var(--v-glass)` · `blur(30px) saturate(112%)` · `1px var(--v-brd)` · `--r-panel` 24px · `0 10px 34px var(--v-shadow), inset 0 1px 0 var(--v-hi)` |
| Logo chip | bare `<img>` rounded-xl | `.tile-icon`-style glass chip + accent glow | keeps the gradient house — the brand hook |
| H1 "homepad" | `text-xl font-semibold` (ok) | `var(--v-txt)`, keep weight/size | 16.4:1 already; just token it |
| Subtitle | `text-neutral-500` (3.78 ✗) | **`var(--v-muted)`** | 5.59:1 ✓ |
| Field labels | `text-neutral-700` (1.73 ✗) | **`var(--v-txt)`** 13px medium | 11.5:1 ✓ |
| **Input fill** | UA white (1.000, harsh) | **`--v-field`** = dark `rgba(255,255,255,.07)` / light `rgba(255,255,255,.62)` | *new token*; frosted, not a slab |
| Input text | `neutral-700`-ish | `var(--v-txt)` | dark 11.5:1 / light 14.3:1 ✓ |
| Placeholder | none | `var(--v-muted)` | dark 4.98:1 / light 4.60:1 ✓ (AA-legible) |
| Input border | `border-neutral-300` | `1px var(--v-kbdbrd)` + `inset 0 1px 0 var(--v-hi2)` | soft glass edge |
| Input focus | `focus:border-indigo-500` | `2px var(--accent-mid)` ring + border→`var(--accent)` | 4.69:1 ≥3:1 (1.4.11) |
| Input radius | `rounded-lg` | `--r-tile` (18px) or `--r-chip` (14px) | on-system radius |
| **Primary CTA** | `bg-indigo-600` (#4f46e5) | **solid `var(--accent-3)`** (#2e63e0) white label | 5.28:1 ✓ · accent-aware |
| Secondary link | `text-neutral-500` (3.78 ✗) | `var(--v-muted)` text button | 5.59:1 ✓ |
| "or" divider | `neutral-500` + `neutral-200` rule | `var(--v-muted)` text + `var(--v-rule)` line | 5.59:1 ✓ |
| PocketID button | outline, `text-neutral-700` (1.73 ✗) | glass-outline: `var(--v-glass)` + `1px var(--v-brd)`, label `var(--v-txt)` + `◆` mark | 11.5:1 ✓ |

**Why the CTA is a *solid* accent, not the brand gradient:** white on the full indigo→purple brand gradient drops to
**3.96:1 at the purple end (#a855f7) — a WCAG fail.** So the gradient stays *decorative* (logo + bloom, no text over
it) and the button uses the solid `--accent-3`, which carries its white label at 5.28:1. Personality where it's free,
legibility where it's required.

**Why `--v-field` is one new token, not a reuse:** the field needs a fill that is (a) clearly *not* the white slab,
(b) legible for text+placeholder, (c) distinct enough from the panel to read as an input. `--v-tile` (dark .055) is
identical to the panel glass and would vanish; `--v-focus-fill` is a focus color. A dedicated `--v-field` keeps the
intent explicit and mode-paired. Values chosen by the sweep in §5.2.

---

## 5. Measurable acceptance criteria

A build of this passes design review iff **every** row below is met, measured off the live DOM at 390 + 1440 in
**both** color schemes.

### 5.1 Contrast (the whole point — all currently-failing rows must flip to ✓)

| Check | Threshold | Proposed (dark) | Proposed (light) | vs current |
|---|---|---|---|---|
| Input text vs field | ≥4.5:1 | **11.52:1** | **14.26:1** | was 10.37 (on white) |
| Placeholder vs field | ≥4.5:1 (legible) | **4.98:1** | **4.60:1** | was n/a |
| Field label vs card | ≥4.5:1 | **11.52:1** | pass (dark text/light) | was **1.73 ✗** |
| PocketID label vs card | ≥4.5:1 | **11.52:1** | pass | was **1.73 ✗** |
| Subtitle vs card | ≥4.5:1 | **5.59:1** | 4.74:1 | was **3.78 ✗** (dark) |
| Secondary "Create account" vs card | ≥4.5:1 | **5.59:1** | 4.74:1 | was **3.78 ✗** (dark) |
| "or" divider text vs card | ≥4.5:1 | **5.59:1** | 4.74:1 | was **3.78 ✗** (dark) |
| Primary CTA label vs `--accent-3` | ≥4.5:1 | **5.28:1** | 5.28:1 | was 6.29 (off-token) |
| Field focus ring (`--accent-mid`) vs field | ≥3:1 (1.4.11) | **4.69:1** | ≥3:1 | was indigo border |

### 5.2 The one honest tension — field boundary at rest (call it out, don't hide it)
Dark-on-dark cannot cleanly hit the **1.4.11 3:1 boundary** with a soft glass field. The sweep (field fill vs the
panel behind it):

```
fill@a   field-vs-panel   text(.93)   placeholder(.54)
 0.07       1.22:1         11.52:1        4.98:1     ← chosen: best text/placeholder, soft look
 0.18       1.79:1          7.97:1        3.92:1
 0.34       3.07:1          4.75:1        2.73:1     ← only fill that clears 3:1-vs-panel, but placeholder FAILS & field looks bright again
```

Pushing the resting fill/border to a literal 3:1 edge either (a) re-brightens the field toward the slab we're
removing, or (b) breaks placeholder legibility. **Resolution:** the field is identified by a *compound* cue — fill
tint + `inset` highlight + `--v-kbdbrd` border + 44px height + persistent label — and the **focus state carries the
1.4.11-compliant ≥3:1 indicator (4.69:1)**, which is exactly when "which field am I in" must be unambiguous. This is
the standard resolution for dark glass forms and is stated here rather than papered over. **Acceptance = focus
indicator ≥3:1 (met, 4.69) + no reliance on the pure-white glare.** If Caleb wants a hard 3:1 *resting* edge, the
lever is a brighter dedicated `--v-field-brd` (accepting a slightly more "outlined" field) — flagged as an option.

### 5.3 Touch targets & spacing (preserve what passes)
- Every interactive row ≥ **44×44px**: email, password, Sign in, Create account, PocketID. (No regression from today.)
- Vertical rhythm on the 4/8pt scale: field gap 12px, group gap 20px, card padding 24px (`--r-panel` sibling).

### 5.4 No new WCAG fail; motion restraint
- `axe-core` on the built page: **zero** contrast/name-role violations at both viewports, both schemes.
- Focus ring is visible and ≥3:1 (keyboard path). Any card entrance / focus transition respects
  `prefers-reduced-motion` (fade only, no transform that could trap a child — the disney-trivia lesson).

---

## 6. States (every state is designed — rule 5)

The current login designs only the resting state. The glass login must also specify:

- **Error** (`setError`): inline row above the CTA, `var(--v-down)` text on the card. **Measure it** — `--v-down`
  dark `#f0686b` on `#171717`-equivalent glass must clear 4.5:1 (it does on the tile; verify on the glass card). The
  current `text-red-600` on the dark card is unverified and likely borderline.
- **Busy** (`busy`): CTA shows the `.app-spinner` affordance (already in the system, indigo ring) + "Signing in…",
  not the bare `…`. Disabled state dims to the token, not opacity-only.
- **Field focus / filled / invalid:** focus = accent ring (§5.1); invalid = `--v-down` 1px border + helper text.
- **OIDC-off:** when `oidcEnabled` is false the "or" + PocketID block is absent (already handled) — the card must
  still look complete (CTA + secondary), not truncated.

---

## 7. Before / after, at a glance

| | Before (measured, dark) | After (proposed, measured) |
|---|---|---|
| First impression | flat black void, two glaring white slabs | frosted glass card floating on the dashboard's own atmosphere |
| Inputs | pure white `#fff`, 19.8:1 brightness collision | `--v-field` frosted, text 11.5:1, placeholder 4.98:1 |
| Dark text | 5 elements at 1.73–3.78:1 (**all fail AA**) | all ≥4.98:1 (**all pass AA**) |
| CTA | generic `indigo-600`, off-token | solid `--accent-3`, accent-aware, 5.28:1 |
| Brand | logo only, no context | gradient logo in glass chip + accent bloom |
| System fit | 0 v15 tokens used | built entirely from `--v-*` / `--accent*` (one new: `--v-field`) |
| Touch targets | all ≥44px ✓ | preserved ≥44px ✓ |

---

## 8. Out of scope / open for Caleb

- **Direction pick:** single centered glass card (specified) vs a desktop split-hero (noted §3.2). Recommendation:
  ship the centered card first — it's mobile-first and one component.
- **Copy** (Walt owns): "Sign in to your dashboard" is fine; "Create account" vs "Register" wording is a product call.
- **New token** `--v-field` needs Caleb's nod as a design-system addition; if rejected, fall back to `--v-focus-fill`
  as the field fill (dark .09 — still passes, marginally brighter).
- This doc does **not** build. On direction approval it becomes the Design section of Walt's spec, then Stitch builds
  to §4/§5 and I verify the built page against §5 in the browser.
