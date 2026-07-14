# Homepad v15 — Design System Spec (glass reskin)

**Author:** Kare (design/UX) · **Date:** 2026-07-14 · **Status:** draft for co-sign (Walt product + Caleb approve)
**Reference (authoritative, Caleb's):** `design/v15-example.html` on branch `design/v15-reference` — render it, this spec is measured off it.
**Supersedes visual layer of:** v14.0.2 (`package.json` v14.0.2). **Preserves:** every v14 feature — this is a reskin/REPLACE of how it looks, not a feature cut.

> This is a token + component spec, not a build. It codifies the reference mockup into the homelab
> design language, **normalizes** the mockup's ad-hoc values onto a real scale, and folds back the v14
> features the mockup simplified away (5 status states, uptime sparkline, favorite/remove menu, arrange
> mode, description). It also relocates the accent picker per Caleb's hard constraint (§3, §7).

---

## 0. TL;DR for the fleet

- **Look:** frosted-glass panels on a static, accent-tinted ambient field. Rounded (panel 24 / tile 18 / icon 12), soft shadows, `backdrop-filter: blur(30px)`. Dark-first, full light mode. SF Pro type, SF Mono for numerics/status.
- **Two independent color axes** (this is the core mental model, §2): **accent** = the chrome/personality hue (8 choices, user-picked); **category hue** = the fixed per-group tile tint (Develop/Kids/External/Friends/Media). Changing accent never changes category tints, and **neither axis ever colors body text or status** — legibility is accent-proof.
- **Hard constraint (Caleb):** the accent **color picker stays under the User Profile menu** exactly as in v14 (it already lives in `AccentControl` there). The mockup's top-bar swatch row is a mockup-only affordance; **relocate it** (§7). Do **not** ship a top-level surface color control.
- **Reskin, mostly:** ⌘K palette, glass system, tiles, status bar, profile menu, mode toggle all EXIST in v14 — most of v15 is restyle + extend, not rebuild (§8). The one genuinely new surface is the **"All systems operational" health panel**.
- **Corrections folded in (§9):** the mockup has measured contrast/touch-target/grid misses (idle-tile text at 1.6–1.8:1, 38px topbar controls, off-grid spacing). The spec fixes each; Stitch builds to the spec, not to the raw mockup.

---

## 1. Rendered evidence

Screenshots read + measured off the live DOM (Chromium, 2× DPR):

| File | Viewport | Mode / accent |
|---|---|---|
| `v15-shots/desktop-dark-blue.png`   | 1440 | dark · blue |
| `v15-shots/desktop-light-blue.png`  | 1440 | light · blue |
| `v15-shots/desktop-dark-purple.png` | 1440 | dark · purple (alt accent) |
| `v15-shots/phone-dark-blue.png`     | 390  | dark · blue (topbar wrap) |
| `v15-shots/ipad-dark-blue.png`      | 768  | dark · blue |

(Full set incl. light/purple/green + ipad-light committed under `design/v15-shots/`.)

---

## 2. The two-axis color model (read this first)

v15 has **two orthogonal color systems**. Keeping them separate is what makes the palette safe.

1. **Accent (chrome hue)** — user-selectable, 8 options. Drives *personality only*: the wordmark gradient,
   avatar, brand mark, the ambient field tint (`--amb`), focus rings (`--accent-3`), search-focus border,
   tile-hover edge. Persisted per §7. **Never** used for body text, tile identity, or status.
2. **Category hue (tile identity)** — fixed, one per service group (Develop=violet, Kids=amber,
   External=cyan, Friends=slate, Media=green). Drives the tile icon tint + hover edge. **Independent of
   accent** — switching accent leaves tiles untouched.
3. **Status (semantic)** — `up`/`down`/`degraded`/`unknown`/`idle`, fixed green/red/amber/neutral.
   **Never** re-hued by accent or category. This is the v14 safety rule preserved: accent is cosmetic,
   status is truth.

Result: a user can pick any of 8 accents in either mode and never degrade the contrast of content or the
meaning of a status LED. Verified by measuring 3 accents × 2 modes (§6) — the text/status ratios move <0.6.

---

## 3. Design tokens

### 3.1 Typography
Stack (from mockup, keep):
```
--sans: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", system-ui, sans-serif;
--mono: "SF Mono", ui-monospace, "JetBrains Mono", Menlo, monospace;   /* numerics, status labels, counts, ⌘K */
```
Type scale — the mockup uses half-pixel optical sizes (13.5/14.5/15.5); **codified to a clean scale**, Stitch builds to these:

| Token | Size / weight / line-height | Role | Mockup value it replaces |
|---|---|---|---|
| `text-display` | 30 / 600 / 1.05, `-0.03em` | health headline "All systems operational" | 29px |
| `text-h2` | 20 / 600 / 1.2, `-0.02em` | brand wordmark | 19px |
| `text-section` | 16 / 600 / 1.2, `-0.01em` | section header name | 15.5px |
| `text-body` | 14 / 400 / 1.4 | tile name (600), sub copy | 14.5 / 13.5 |
| `text-sm` | 13 / 400 | search input, sub | 13.5px |
| `mono-num` | 23 / 600 (`.chip .n`), 15 (icon initials) | count numbers, icon monogram | 23 / 15 |
| `mono-label` | 11 / 500, `+0.16em`, uppercase | status LED, chip labels, meta, legend, kbd | 11px |
| `mono-count` | 12 / 400 | section count | 12px |

> Numeric/status text is **mono** on purpose — counts and LEDs read as instrument readouts and align in columns.

### 3.2 Spacing — 4pt base, 8pt rhythm
The mockup scatters `11 / 13 / 14 / 15 / 18 / 26 / 28 / 30px`. **Normalize to a 4pt scale**; the right column is what Stitch ships:

| Scale | 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 |
|---|---|
| grid gap | 13 → **12** |
| tile padding | `16 16 14` → **16** (all sides) |
| tile inner gap | 15 → **16** |
| chips gap | 11 → **12** |
| topbar padding | `11 16` → **12 16** |
| health panel padding | `26 30` → **24 32** |
| metrics gap | 18 → **20** |
| board (section) gap | 28 → **28** (=4×7, on 4pt; keep) |
| section-head bottom | 15 → **16** |

Rule going forward: **padding/gap/margin land on the 4pt scale (8pt preferred);** one-off px like `gap:13px` is a finding.

### 3.3 Radii  (matches mockup — keep verbatim)
```
--r-panel: 24px;   /* health panel, topbar pill uses 999px */
--r-tile:  18px;   /* service tiles */
--r-ico:   12px;   /* tile icon chip, chips */
--r-pill:  999px;  /* topbar, search, theme row, iconbtn/avatar circles */
--r-chip:  14px;   /* count chips */
```

### 3.4 Glass, border, shadow layers
Two glass tiers. **Dark** = light-on-dark translucency; **light** = white translucency (the "frosted" look).

```
/* structure — same in both modes, values swap via mode tokens */
.glass  { background: var(--glass);  backdrop-filter: blur(30px) saturate(112%);
          border: 1px solid var(--brd); box-shadow: 0 10px 34px var(--shadow), inset 0 1px 0 var(--hi); }
.ctl    { background: var(--glass2); backdrop-filter: blur(20px) saturate(112%);
          border: 1px solid var(--brd); box-shadow: inset 0 1px 0 var(--hi2); }   /* topbar controls */
.tile   { background: var(--tile);   backdrop-filter: blur(20px) saturate(112%);
          border: 1px solid var(--tilebrd); box-shadow: 0 6px 20px var(--shadow-tile), inset 0 1px 0 var(--tilehi); }
```

| Token | Dark | Light |
|---|---|---|
| `--glass` (panel fill) | `rgba(255,255,255,.055)` | `rgba(255,255,255,.55)` |
| `--glass2` (control fill) | `rgba(255,255,255,.05)` | `rgba(255,255,255,.50)` |
| `--tile` | `rgba(255,255,255,.055)` | `rgba(255,255,255,.52)` |
| `--brd` (border) | `rgba(255,255,255,.09)` | `rgba(255,255,255,.65)` |
| `--tilebrd` | `rgba(255,255,255,.08)` | `rgba(255,255,255,.62)` |
| `--hi` / `--hi2` (top inner light) | `rgba(255,255,255,.14/.10)` | `rgba(255,255,255,.90/.80)` |
| `--shadow` / `--shadow-tile` | `rgba(0,0,0,.34/.28)` | `rgba(30,42,72,.14/.10)` |
| `--hover` | `rgba(255,255,255,.085)` | `rgba(255,255,255,.78)` |

> **Reduced-motion / perf note:** glass is expensive on low-end iPads. v14 already falls back to no-blur under
> `prefers-reduced-motion`; keep that fallback (solid `--glass`-equivalent opaque tint) so panels stay legible
> without `backdrop-filter`.

### 3.5 Surface + text tokens

| Token | Dark | Light | Role |
|---|---|---|---|
| `--bg-1` / `--bg-2` | per-accent (§3.6) | per-accent pale | field gradient stops |
| `--txt` | `rgba(255,255,255,.93)` | `rgba(20,23,30,.92)` | body/primary text |
| `--muted` | `rgba(255,255,255,.54)` | `rgba(28,32,42,.62)` | secondary text |
| `--faint` | `rgba(255,255,255,.36)` | `rgba(28,32,42,.44)` | placeholder/least — **see §9, fails AA as text** |
| `--rule` | `rgba(255,255,255,.14)` | `rgba(24,30,48,.14)` | section-head hairline |

### 3.6 Accent themes (8) — full token set

Each accent defines `--accent` (light tint, for text-on-dark / gradients-start), `--accent-2` (mid, gradient),
`--accent-3` (deep, focus ring / gradient-end), `--on-accent` (text on solid accent), `--amb` (ambient field
tint), and dark `--bg-1/--bg-2` base. Light mode overrides only `--bg-1/--bg-2/--amb` (accents unchanged).

| accent | `--accent` | `--accent-2` | `--accent-3` | `--on-accent` | swatch (`--c`) |
|---|---|---|---|---|---|
| **blue**   | `#8FB8FF` | `#5A9BFF` | `#2E63E0` | `#fff` | `#4A90FF` |
| **teal**   | `#7FE3DC` | `#2BC4BC` | `#0E938D` | `#04140F` | `#22C4BC` |
| **green**  | `#63E6A6` | `#22C67D` | `#0E9A5C` | `#05130D` | `#22C67D` |
| **yellow** | `#FFDC7A` | `#FFC72E` | `#C79310` | `#241B00` | `#FFC72E` |
| **orange** | `#FFC08F` | `#FF8A3D` | `#E06A12` | `#2A1400` | `#FF8A3D` |
| **red**    | `#FF9A9C` | `#FF5A5C` | `#D63437` | `#fff` | `#FF5A5C` |
| **pink**   | `#FF9EC8` | `#FF5CA0` | `#D63A7C` | `#fff` | `#FF5CA0` |
| **purple** | `#C4B4FF` | `#9B7CFF` | `#6A4FCF` | `#fff` | `#9B7CFF` |

Dark field bases (per accent): blue `#0d1526/#080b14`, teal `#08201f/#061413`, green `#0a1b15/#07110d`,
yellow `#181407/#100c05`, orange `#1b1209/#120b06`, red `#1b0f13/#120a0c`, pink `#210e1a/#150a11`,
purple `#150e26/#0d0916`. Light bases are pale accent washes (e.g. blue `#eef3fb/#e2eaf6`) — full values in the reference `:root`.

**Migration from v14 (7 accents → 8):** v14 = `red, orange, yellow, green, blue, indigo, violet`
(localStorage `homepad.accent`). v15 = above 8: **adds** `teal` + `pink`; **consolidates** `indigo`+`violet` → `purple`.
On load, map stored `indigo`/`violet` → `purple`; unknown → `blue` (default). Default accent stays **blue**.

### 3.7 Category hue tokens (tile identity — fixed, accent-independent)

| category | tint (dark text) | icon bg | icon border | solid (light-mode icon) |
|---|---|---|---|---|
| Develop | `#C6BBFF` | `rgba(139,124,246,.16)` | `rgba(183,169,255,.32)` | `#7C6CF0` |
| Kids | `#EDC891` | `rgba(224,164,88,.16)` | `rgba(240,200,140,.32)` | `#D89A46` |
| External | `#93E0EE` | `rgba(76,196,217,.16)` | `rgba(140,220,235,.32)` | `#2FA9C0` |
| Friends | `#BCC6DD` | `rgba(124,137,166,.16)` | `rgba(180,190,215,.30)` | `#6E7B96` |
| Media | `#86DDBC` | `rgba(72,176,140,.16)` | `rgba(140,225,195,.32)` | `#34A883` |

> In v14 categories carry a per-category `--chip-hue`; v15 formalizes that as the table above. New categories
> pick a hue from an extended ramp (document additions back into this table — never inline a one-off).

### 3.8 Status tokens — **extend mockup's 3 to v14's 5** (functionality preservation)
The mockup shows only `up / idle / down`. v14 has **five** states (`api.ts`: `UP · DOWN · DEGRADED · UNKNOWN · NOT_MONITORED`). v15 **must** carry all five:

| status | dot / LED | meta text color | tile treatment |
|---|---|---|---|
| **up** (online) | `--up` `#43D18E` dark / `#0E9E5C` light, 3px halo | `--up` | normal glass |
| **down** (offline) | `--down` `#F0686B` dark / `#D23A3D` light, **pulsing** (respect reduced-motion), 3px red left-bar + red border | `--down` | `color-mix(--down 10%, --tile)` |
| **degraded** (NEW — carry from v14) | **amber** `#F5B34A` dark / `#B7791F` light, 3px halo, **no pulse** | amber | amber left-bar + amber-tinted border |
| **unknown** (NEW — carry from v14) | neutral `--muted`, solid dot | `--muted` | normal glass, no accent |
| **idle** (not monitored) | dashed ring `--idle`, no fill | see §9 fix | **de-emphasized via lower-alpha tokens, NOT blanket `opacity:.52`** (§9) |

Amber for degraded must itself clear AA: `#F5B34A` on dark tile ≈ 8:1, `#B7791F` on light tile ≈ 4.6:1 — both pass; if the build picks different ambers, re-measure.

### 3.9 Motion tokens
```
--dur-fast: .15s;  --dur: .18s;  --dur-slow: .40s;   /* mode/theme crossfade */
--ease: ease;      --ease-out: cubic-bezier(.2,.7,.2,1);
```
- Tile mount: `rise` — translateY(6px)+fade, `.45s`, staggered `+18ms` per tile (cap the stagger so a 47-tile board doesn't take ~0.85s; **cap total stagger ≤ 300ms**).
- Down dot: `pulse` 1.4s infinite — **only** for `down` (attention). Degraded does **not** pulse.
- Hover: tile `translateY(-2px)`, `.18s`. Swatch `scale(1.16)`, `.15s`.
- Mode/accent switch: `color/background .4s` crossfade. **Measurement caveat:** this 0.4s transition means automated contrast reads must settle ≥400ms after a mode flip (learned the hard way — see §6).
- **`prefers-reduced-motion`:** kill all animation/transition, tiles render at rest, idle at its dimmed token, down dot static. (Mockup already does this — keep.)

---

## 4. Components

Each component: anatomy → states → spacing → hierarchy → motion. Measured values in §6.

### 4.1 Topbar (`.topbar.glass`, pill, radius 999)
**Anatomy (v15 target, left→right):** brand mark + wordmark · flexible spacer · **⌘K search / command trigger** ·
freshness "updated Xs ago" (v14 `LastUpdated`) · gear/edit menu (v14, admin) · alert bell (v14) · **mode toggle** · **avatar → profile menu (contains the accent picker, §7)**.
**Removed vs mockup:** the inline **theme swatch row** — relocated under the avatar per §7.
- **States:** default; `search:focus-within` → border `--accent-3` + `--focus-fill`; iconbtn/avatar `:hover` → `--btnhover`; `:focus-visible` → 2px `--accent-3` ring.
- **Spacing:** pad `12 16`, gap 12. **Touch:** every control ≥44×44 hit area (§9 fixes the mockup's 38px).
- **Hierarchy:** wordmark is the only chromatic element on the left; controls are muted glyphs on the right, so the eye lands on the health panel below, not the chrome.
- **Motion:** brand mark + wordmark gradient crossfade on accent change (`.4s`).
- **⌘K trigger:** pill showing search glyph + "Search services…" + a `kbd` `⌘K` badge (mono, 11px). Opens the existing command palette (§4.5). On <640px collapse to glyph-only (v14 `LauncherTrigger` behavior — keep).

### 4.2 Health summary panel (`.health.glass`) — the NEW surface
Replaces v14's inline `StatusBar` count strip with a headline verdict + metrics. Two-column grid (`auto 1fr`, gap `24 40`), collapses to one column ≤720px.
- **Left (verdict):** a `status-led` micro-label (mono, uppercase, colored by aggregate state) → the **headline** ("All systems operational" / "N systems need attention" / "Checking…") → sub-line "`N` services across `G` groups · `M` monitored".
- **Right (metrics):** count **chips** (online/not-monitored/offline) + a **meter** (one tick per service, colored by status) + a **legend** with "updated Xs ago".
- **States (design ALL — v14 rule 5):**
  - *operational* — green LED, "All systems operational".
  - *attention* — amber/red LED, "`N` need attention", the offline/degraded chips promoted (colored number, not `--faint`, §9).
  - *loading* — LED pulses neutral, headline "Checking services…", chips show skeleton bars, meter ticks are neutral placeholders.
  - *empty* (no services / fresh install) — "No services yet", sub "Add your first service", meter hidden.
  - *stale* (data old) — freshness label turns `--down`/amber "updated 6m ago", LED unchanged but a small "stale" note.
- **Hierarchy:** the 30px headline is the single loudest thing on the page. Chips are secondary; the meter is tertiary texture. Exactly one verdict per view.
- **Aggregate rule:** any `down` → red "need attention"; else any `degraded` → amber; else all-clear → green. `idle`/`unknown` never trigger red.

### 4.3 Service tile (`.tile`, radius 18) — reskin + **fold v14 features back**
Mockup tile = icon chip + status dot (top row) + name + meta. v15 tile must additionally carry the v14 tile's:
**uptime sparkline** (toggleable), optional **description** line, **favorite + remove "⋯" menu**, **drag grip in arrange mode**, and the **5 status states** (§3.8). Layout: icon (44×44, radius 12) top-left, status dot top-right; name + meta stack below; sparkline (when on) spans the bottom.
- **Icon:** mono monogram (2 chars) OR service SVG. Dark = tinted glass (`--tint-bg`/`--tint-br`); light = **solid** category color (`--tint-solid`) with white glyph — mockup already branches this, keep.
- **States:** `up`/`down`/`degraded`/`unknown`/`idle` (§3.8); `:hover` translateY(-2px) + edge → category hue; `:focus-visible` 2px `--accent-3`; **arrange mode** shows grip + remove; `favorite` pinned first (v14).
- **Idle:** **do not** use `opacity:.52` on the whole tile (it destroys text contrast → §9). Instead dim via name=`--muted`, meta=`--faint`-but-AA, icon at reduced tint. Dashed status ring.
- **Spacing:** pad 16, inner gap 16. **Tile is the primary tap target — huge (≥162×126), good.** Icon exactly 44×44 ✓.
- **Motion:** `rise` on mount (staggered, capped §3.9); down dot pulses.
- **Grid:** `repeat(auto-fill, minmax(162px, 1fr))`, gap 12; ≤720px `minmax(144px,1fr)`.

### 4.4 Chips · meter · legend (in health panel)
- **Chip** (`.chip`, radius 14): big mono number + uppercase label; variants `up`(green n)/`idle`(txt n)/`down`(**n must be red/amber when >0, not `--faint`** §9). Pad `12 16`, gap 12. **If chips stay interactive (v14 quick-peek popover), height ≥44 ✓ (measured 49).**
- **Meter** (`.ticks`): flex row, one `.tick` per service, `min-width:2px`, height 26, gap 3; `up`/`idle`/`down` colors. Purely decorative (`aria-hidden`) — the chips carry the accessible numbers.
- **Legend:** mono 11px swatches + labels + right-aligned "updated Xs ago".

### 4.5 Command palette ⌘K (reskin of v14 `CommandLauncher`, v8 — NOT new)
Restyle the existing palette to v15 glass: a centered `.glass` modal (radius 24), a search row (mono ⌘K badge), grouped-by-category results with per-row status dot + category tint, Favorites pinned, full keyboard nav (`aria-activedescendant`) — all of which v14 already has. **States:** typing/filtered, empty ("No services match 'x'"), browse (grouped). Motion: modal fade+scale-in from 0.98, backdrop blur; reduced-motion → instant.

### 4.6 Theme swatch picker (accent) — **UNDER PROFILE, restyled** (see §7)
The `.sw` swatch component itself: 44×44 hit target (visual disc may be ~24 but hit area ≥44), `role="radio"` in a `role="radiogroup"`, selected = ring `0 0 0 2px --sep, 0 0 0 4px --c` + `aria-checked`, `:focus-visible` 2px `--accent-3`. Restyle to v15; **placement = the profile menu's Appearance section, not the topbar.**

### 4.7 Mode control (System / Light / Dark) — preserve v14, don't downgrade
v14 `ThemeControl` is a **3-segment** System/Light/Dark switch backed by `themePref` (PATCH /api/me). The mockup's top-bar sun/moon is a **binary** toggle that would **drop the "System" option** and the server persistence. **Decision (§10):** keep the 3-way control (in the profile Appearance section alongside the accent picker); a top-level quick sun/moon toggle is optional *only if* it preserves System (e.g. cycles system→light→dark) and writes `themePref`. Default recommendation: one mode control, under profile, 3-way.

### 4.8 Section header (`.section-head`)
Group name (16/600) · flexible hairline rule (`--rule` → transparent) · right-aligned mono count with a status swatch (e.g. "3/3 up", "5 idle", "1 offline"). Count swatch color = worst status in the group. Margin bottom 16.

---

## 5. Responsive

| Viewport | Behavior |
|---|---|
| **desktop** 1440 | 7-col tile grid (182px cols), health panel 2-col. |
| **iPad portrait** 768 | tile grid reflows (auto-fill), health still 2-col until 720. Primary target device. |
| **≤720** | health panel → 1 col (gap 22→**24**), grid `minmax(144px,1fr)`. |
| **phone** 390 | 2-col tiles (165px). **Topbar wraps** — see finding below. |

**Finding — topbar wrap on phone (`phone-dark-blue.png`):** at 390px the topbar wraps to **three rows** (brand+swatches+mode / avatar / full-width search). The swatch row is the main culprit consuming a whole row. **Relocating the accent picker under the profile (§7) also fixes this** — the topbar collapses to brand · spacer · ⌘K · mode · avatar, which fits far better. Verify the wrapped topbar at 390/360 after relocation.

---

## 6. Accessibility — measured off the live DOM

WCAG AA: body text ≥4.5:1, large text (≥24px, or ≥18.66px @600) ≥3:1, meaningful UI ≥3:1. All ratios below are
computed from `getComputedStyle` foreground composited over the resolved opaque background (glass alpha accounted for),
at desktop 1440. Reads taken ≥400ms after mode flip (the `.4s` crossfade otherwise poisons the sample).

### 6.1 Text contrast — PASS set (representative, dark & light, blue/purple/green)
| Element | dark | light | need | verdict |
|---|---|---|---|---|
| health headline (30/600) | 15.4 | 13.5 | 3 | ✅ |
| brand wordmark (19/600) | 15.4 | 13.5 | 3 | ✅ |
| section name (16/600) | 16.9 | 12.2 | 4.5 | ✅ |
| tile name — active (14.5/600) | 15.4 | 13.4 | 4.5 | ✅ |
| tile meta — online (11) | 9.1 | 3.2 | 3 | ✅ |
| chip online number (23/600) | 7.7 | 3.3 | 3 | ✅ |
| chip label (11) | 5.5 | 4.6 | 3 | ✅ |
| search input (typed) | 13.6 | 13.9 | 4.5 | ✅ |
| status-LED "OPERATIONAL" (11/500) | 9.1 | **3.2** | 4.5 | ⚠️ light fails (§9) |
| section count (12) | 6.1 | 4.3 | 3 | ✅ |
| kbd ⌘K (11) | 5.5 | 4.6 | 3 | ✅ |

Across 3 accents × 2 modes the passing ratios move <0.6 — confirms §2 (accent-proof legibility).

### 6.2 Contrast — **FAIL set** (the corrections, §9)
| Element | dark | light | need | note |
|---|---|---|---|---|
| **idle tile meta** ("not monitored") | **1.80** | **1.60** | 4.5 | worst; caused by `opacity:.52` on the tile |
| **idle tile name** | 4.98 | **3.13** | 4.5 | light fails; dark barely passes — both from the .52 opacity |
| **search placeholder** ("Search services…") | **3.26** | **2.69** | 4.5 | `--faint` as real text |
| **offline chip number** when >0 | 3.24 | **2.70** | 3 | `--faint` on a large number; also hierarchy |
| down-tile meta (11px, light) | 6.46 | **3.93** | 4.5 | passes 3 but not 4.5 as small text |

### 6.3 Touch targets (measured `getBoundingClientRect`, ≥44×44 rule — iPad/phone-first)
| Control | rendered | verdict |
|---|---|---|
| tile | 182×126 | ✅ |
| tile icon | 44×44 | ✅ (exactly) |
| count chip | 119×49 | ✅ |
| **mode toggle** | 38×38 | ❌ → 44 |
| **avatar (opens profile)** | 38×38 | ❌ → 44 |
| **search pill** | 261×**37** | ❌ height → 44 |
| **accent swatch** `.sw` | **19×19** | ❌ in topbar → but relocated to profile @ ≥44 (§7) |
| status dot | 9×9 | n/a (not interactive; has `title`) |

### 6.4 Grid / spacing
Off-4pt values found: `11, 13, 14, 15, 18, 26, 30px` → normalized in §3.2. Radii `24/18/12` ✅ on system.

---

## 7. HARD CONSTRAINT — accent color picker stays under the User Profile

**Caleb's directive, authoritative:** the theme/accent **color** picker stays under the User Profile menu
exactly as it is in v14 today — **not** a top-level surface control.

- **v14 reality:** the accent picker already lives there — `src/UserMenu.tsx` → Appearance section →
  `<AccentControl>` (`src/AccentControl.tsx`), persisted to `localStorage['homepad.accent']` (`src/accent.ts`).
  So this constraint is **"keep the v14 placement, restyle the swatches only"** — no relocation of real code, only
  a decision *not* to adopt the mockup's topbar swatch row.
- **The mockup diverges:** `design/v15-example.html` renders the 8 swatches as a `role="radiogroup"` **in the
  topbar** (`.theme.ctl`). That is a **mockup-only** presentation for showing all 8 accents at once. **Do not ship it
  in the topbar.**
- **v15 target:** swatch row moves into the profile menu's **Appearance** section (with the mode control, §4.7),
  restyled to v15 glass, swatches at **≥44px** hit targets (the topbar mockup's 19px would fail — the profile
  version fixes it). Persistence unchanged (`homepad.accent`, client-side), with the 7→8 migration in §3.6.
- **Bonus:** removing the swatch row from the topbar **also fixes the phone topbar-wrap** (§5).

Everything else from the mockup topbar (⌘K search, mode toggle, avatar) stays top-level.

---

## 8. Reskin vs rebuild map (for Stitch)

| Surface | v14 today | v15 action | Preserve |
|---|---|---|---|
| Glass / backdrop-filter system | "Glass v2" exists (`index.css`) | **restyle** — new token set (§3.4) | reduced-motion no-blur fallback |
| Topbar / header | `AppHeader.tsx` | **restyle** + remove swatch row | gear/edit menu, alert bell, LastUpdated, LauncherTrigger |
| ⌘K command palette | `CommandLauncher.tsx` (v8) | **restyle** to v15 glass | ranked search, grouped browse, keyboard a11y, favorites |
| Accent color picker | `AccentControl.tsx` under profile | **restyle swatches**, keep placement (§7) | localStorage persist; migrate 7→8 |
| Mode control | `ThemeControl.tsx` 3-seg, `themePref` | **restyle**, keep 3-way (§4.7) | System option + server persist |
| Status summary | `StatusBar.tsx` count strip | **rebuild as health panel** (§4.2) | derives counts from ServicesContext; quick-peek |
| Service tile | `Catalog.tsx` ServiceTile | **restyle** + keep features | 5 status states, sparkline, description, favorite/remove ⋯, arrange grip |
| Avatar / profile menu | `UserMenu.tsx` | **restyle** | Appearance section now hosts accent + mode |
| "All systems operational" headline | — (none) | **NEW** (§4.2) | — |
| Design-token file | none (scattered) | **NEW** — codify §3 as the token source of truth | — |

**Net:** ~80% restyle/extend of existing components, one new surface (health headline), one new artifact (token file). Low rebuild risk; the data model, routing, and behavior are untouched.

---

## 9. Corrections to apply in the build (actionable — Stitch)

Each is a measured miss in the reference mockup; the spec value is the fix.

1. **Idle tiles: replace `opacity:.52` with token-level dimming.** Blanket opacity drops idle *meta* to
   **1.60–1.80:1** and idle *name* to **3.13:1 (light)** — both fail AA. Fix: keep the tile at full opacity; dim
   via `name:--muted`, `meta:` an AA-passing muted (≥4.5), reduced icon tint, dashed ring. *(major)*
2. **Search placeholder** uses `--faint` → **2.69–3.26:1**. Use `--muted` (≥4.5) for placeholder text. *(major)*
3. **Offline chip number** uses `--faint` → **2.70:1 light**, and reads un-urgent. When count >0, color the number
   `--down`/amber (matching severity) and ≥3:1; the "0" idle case may stay muted. *(major → also hierarchy)*
4. **Topbar controls ≥44px:** mode toggle & avatar are 38×38, search pill 37px tall. Expand hit areas to ≥44
   (visual disc can stay 38 with padded target). *(major — iPad/phone-first)*
5. **Relocate accent swatches to the profile** (§7) at ≥44px — the mockup's 19px topbar swatches are sub-target
   and violate the hard constraint. *(major)*
6. **status-LED label** ("OPERATIONAL") is **3.2:1 in light** (11px) — bump the light `--up` used for that label to
   ≥4.5, or enlarge/weight it. *(minor — headline carries the message redundantly)*
7. **Normalize spacing to the 4pt scale** (§3.2) — no `13/15/18/26/30px` one-offs. *(minor)*
8. **Add DEGRADED + UNKNOWN states** (§3.8) — the mockup only has 3 of v14's 5. *(functional — required)*
9. **Cap the tile mount stagger ≤300ms** so a 47-tile board doesn't take ~0.85s to settle. *(minor)*

---

## 10. Open decisions for Walt / Caleb

1. **Mode toggle placement (§4.7):** single 3-way control under profile (recommended, preserves System) vs. an
   additional top-level quick sun/moon. Default: under profile only.
2. **Accent migration (§3.6):** confirm `indigo`+`violet` → `purple` (vs. `indigo`→`blue`). Cosmetic; affects
   existing users' saved accent.
3. **Health headline copy:** "All systems operational" / "N need attention" / thresholds for stale + degraded
   wording — product copy, Walt's call.
4. **Sparkline on tiles by default** (v14 toggle) — keep off-by-default in the denser v15 grid?

---

## 11. Co-sign

- [ ] **Walt** — product go (folds §4 states + §10 copy into the v15 product scope)
- [ ] **Kare** — design go (this spec; conditional on §9 corrections being in the build acceptance)
- [ ] **Caleb** — approves the token set + the color-under-profile handling (§7)

*A UI-bearing spec ships to Stitch only with Walt's product go AND Kare's design go recorded here.*
