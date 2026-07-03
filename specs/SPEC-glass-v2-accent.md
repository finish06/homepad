# Spec: Glass v2 + ROYGBIV Accent Preference

**Trigger:** Caleb — direct request (Claude session, 2026-07-02): improve the glass
effect; "One preference to give users is a color accent choice (ROY-G-BIV options)."
**Version:** 1.0
**Status:** BUILT on `feat/glass-v2-accent` (stacked on `feat/ultrawide-fluid-frame`
/ PR #284) — rides CI + browser-gate + QA; not self-merged.
**Author:** Claude (on Caleb's direct dispatch)
**Repo:** `Code/homepad` — **frontend only. No backend changes. No migration.**

---

## 1. The problem — the blur has nothing to blur

The v1 glass recipe on `.app-grid-box` is sound, but `.app-surface` anchored both
ambient blobs at the **top corners of the page** at 10–12% alpha. Everything below
the first screenful sat on a flat base gradient, so `backdrop-filter: blur()` had
nothing to diffuse — boxes read as solid slabs, not glass. Tuning the box alone
cannot fix this.

## 2. The change

### G1 — Backdrop atmosphere (the 80% win)
`.app-surface` gains two more accent blobs (mid-page ~55%/42%, low ~8%/96%) so
scrolled rows keep atmosphere behind the glass, plus a tiled **feTurbulence SVG
grain** (3–4% white, data-URI) to stop the soft gradients banding on large
monitors. All blob alphas stay **≤0.14**, so no contrast floor can move.

### G2 — The material
`.app-grid-box`: `blur(10px)` → **`blur(14px) saturate(1.5)`** (both engines) —
saturate is what makes blurred color come through richer instead of grayer.
Glass alpha drops **0.72→0.65 light / 0.68→0.60 dark** so the atmosphere shows.

### G3 — The bevel
A second inset shadow — `inset 0 1px 0 rgba(255,255,255, .9 light / .16 dark)` —
highlights the top edge only (light catches the top of real glass). Still a
shadow: the 1px structural ring and the 808px content-box math (AC-004–008) are
untouched.

### G4 — ROYGBIV accent preference (Caleb's ask)
The blobs paint from `--accent-1`/`--accent-2` (space-separated RGB triplets,
`:root` defaults = the brand indigo/purple pair, byte-identical to v1). A new
**Appearance picker** (`AccentControl`, under ThemeControl in the user menu)
offers **Red · Orange · Yellow · Green · Blue · Indigo · Violet** — each a pair
of neighboring hues. **Indigo is the default** and renders exactly the brand
atmosphere.

- **Client-only** (localStorage `homepad.accent`, the THEME_CACHE_KEY naming) —
  a per-device cosmetic, keeping the pass frontend-only. `initAccent()` applies
  at boot (main.tsx); choosing the default clears the inline override so the
  stylesheet stays the source of truth.
- **Accent never touches a contrast-bearing token** — ambient blobs only.

### G5 — A11y fallback
`@media (prefers-reduced-transparency: reduce)`: boxes go near-solid
(0.96/0.97), `backdrop-filter: none` — the reduced-motion pattern applied to
transparency.

## 3. Acceptance criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-G1-1 | `.app-surface` paints ≥4 accent-var blobs per mode + grain; every blob alpha ≤0.14. | Must |
| AC-G2-1 | Box backdrop-filter is `blur(≤16px) saturate(>1)`; glass alpha ≥0.65 light / ≥0.60 dark. | Must |
| AC-G3-1 | The 1px structural inset ring is preserved; the bevel is an additional inset shadow (no border, no content-box change — a width-4 box still packs 4 columns). | Must |
| AC-G4-1 | Picker offers exactly the 7 ROYGBIV accents; every swatch ≥44×44 hit area; selection = aria-pressed + checkmark + ring (never color alone). | Must |
| AC-G4-2 | Choice applies instantly, persists per device, survives reload; corrupted cache degrades to indigo. | Must |
| AC-G4-3 | Default (indigo) renders byte-identical blob hues to pre-v2 brand values. | Must |
| AC-G5-1 | Under prefers-reduced-transparency, boxes are ≥0.96 alpha with no backdrop-filter. | Must |
| AC-G-6 | Worst-case composited title contrast stays ≥12:1 both modes; dark tile description ≥4.5:1 (measured: titles ~16:1, dark desc ~6.6:1 under the brightest blob). | Must |

## 4. Verification (done on-branch)

- `accent.test.ts` (10) — ROYGBIV list/order, CSS `:root` ↔ module pairing,
  resolve/apply/persist/degrade. `AccentControl.test.tsx` (5) — 44px targets,
  aria-pressed + checkmark, click-apply-persist, boot-from-cache.
  `glass-v2.test.ts` (7) — blob count/alpha caps, grain, saturate, blur ≤16,
  bevel + ring, alpha floors, reduced-transparency block. All green; existing
  UserMenu suite green with the control mounted.
- All 21 browser-gate specs green on the built app (real Chromium).
- Visual (Playwriter, built app, 2560): dark indigo default, red accent switch
  via the picker (instant re-hue + persisted through reload), green accent in
  light mode. Picker renders 4+3 in the 248px menu.

## 5. Out of scope

- Accent on any text/icon/ring token (contrast isolation is the design).
- Server-side persistence of the accent (client-only by design; revisit only if
  cross-device sync is asked for).
- Frosting other surfaces (menus, launcher) or nested tile glass — GPU cost and
  contrast risk; tiles stay opaque.
