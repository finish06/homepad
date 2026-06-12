# homepad — UX / UI Redesign Spec

**Version:** 1.0  **Date:** 2026-06-11  **Status:** Ready for implementation
**Audience:** Frontend developer implementing in the homepad codebase
**App:** homepad (custom service dashboard) — React + Vite + **Tailwind CSS**, Go backend. Light + Dark themes.

---

## 1. Summary

Two coordinated changes:

1. **Visual refresh** of the dashboard surface — background, service tiles, icons, category headers, status indicators, wordmark. Goal: from a flat/generic look to a crisp, modern "linear/vercel-grade" dashboard.
2. **Top-bar declutter** — collapse six separate header controls into a wordmark + a single **User Menu** (avatar dropdown). Theme switch and Edit move *into* the menu; identity, role, settings, and logout consolidate there too.

The redesign was prototyped live against production DOM and signed off visually. This spec encodes the exact values from that prototype.

### Reference screenshots
See `./screenshots/`:
- `01-before-full.png` — current production design (flat cards, cluttered six-control header).
- `02-after-cards-full.png` — redesigned tiles / icon plates / category headers / status dots. *(Header in this shot predates the declutter — see the next two for the final bar.)*
- `03-after-topbar-clean.png` — final decluttered top bar (wordmark + avatar only).
- `04-after-usermenu-open.png` — the avatar **User Menu** open (identity, role, Appearance theme control, Edit dashboard, Personal settings, Log out).

> Prototype screenshots show the avatar as `F` (it fell back to email's first letter during the live demo). **The shipped avatar must use real initials — see §6.2.**

### Design principles
- **One anchor, not six controls.** The bar carries the brand and a single account affordance. Everything secondary lives one click away.
- **Role-aware.** Admin-only actions (Edit dashboard) appear only for admins. Account/identity is identical for all roles.
- **Always authenticated.** There is no anonymous state; the avatar (identity + logout) is always present.
- **Restraint.** Subtle gradients, soft shadows, a single indigo→violet accent. No more than one accent hue.

---

## 2. Design tokens

Add these as Tailwind theme extensions / CSS variables. Values are the source of truth; Tailwind class equivalents are noted where they exist.

### Color
| Token | Light | Notes |
|---|---|---|
| `--accent-from` | `#4f46e5` (indigo-600) | gradient start (brand, active states) |
| `--accent-to` | `#a855f7` (purple-500) | gradient end |
| `--accent-mid` | `#6366f1` (indigo-500) | theme-active gradient end |
| `--text-strong` | `#0f172a` (slate-900) | tile/menu titles |
| `--text-muted` | `#475069` | category headers |
| `--text-faint` | `#9aa3b8` | tile description / labels |
| `--hairline` | `rgba(15,23,42,0.06–0.08)` | borders / separators |
| `--status-up` | `#10b981` (emerald-500) | |
| `--status-down` | `#f43f5e` (rose-500) | |
| `--danger` | `#e11d48` (rose-600) | logout text |

### Radius
- Tile: **18px** · Icon plate: **13px** · Menu: **14px** · Menu item: **9px** · Theme button: **8px** · Avatar: full.

### Shadow
- Tile rest: `0 1px 2px rgba(16,24,40,.04), 0 8px 20px -10px rgba(16,24,40,.12)`
- Tile hover: `0 1px 2px rgba(16,24,40,.04), 0 18px 34px -14px rgba(79,70,229,.30), 0 0 0 1px rgba(99,102,241,.12)`
- Menu: `0 18px 40px -12px rgba(16,24,40,.28), 0 0 0 1px rgba(15,23,42,.03)`
- Avatar ring: `0 0 0 2px #fff, 0 0 0 4px rgba(99,102,241,.35), 0 4px 10px -2px rgba(79,70,229,.5)`

### Motion
- Tile hover: `transform .18s ease, box-shadow .25s ease, border-color .25s ease`
- Menu open: `opacity .14s ease, transform .14s ease` (from `translateY(-6px) scale(.98)` → `translateY(0) scale(1)`)
- Respect `prefers-reduced-motion`: disable transform/translate, keep opacity.

---

## 3. Global surface

**Background** of the main scroll area (`<main>`), replacing flat `bg-neutral-50`:
```css
background:
  radial-gradient(1100px 560px at 12% -12%, rgba(99,102,241,.12), transparent 60%),
  radial-gradient(900px 520px at 102% -6%, rgba(168,85,247,.10), transparent 55%),
  linear-gradient(180deg, #f6f8fd 0%, #eceffa 100%);
```
**Dark mode:** keep the two radial accents at ~0.10 opacity over a `linear-gradient(180deg,#0b0d12,#0e1117)` base (mirror with existing `dark:` neutrals).

---

## 4. Service tile  (`data-testid="service-tile"`)

Preserve all existing `data-testid` hooks (tests depend on them): `service-tile`, `status-badge`, `service-tile-icon`, `service-tile-name`, `service-tile-description`.

**Container**
- `border-radius:18px; border:1px solid rgba(15,23,42,.06); padding:15px 15px 13px;`
- `background:linear-gradient(180deg,#fff,#fbfcff);`
- rest shadow (token), hover shadow (token).
- **Hover:** `transform:translateY(-3px); border-color:rgba(99,102,241,.45);` + hover shadow. Whole tile is the link (`<a target="_blank" rel="noreferrer noopener">`).
- Focus-visible: keep the existing `ring-2 ring-indigo-500` on the inner `<a>`.

**Icon** (`service-tile-icon`, the logo `<img>`)
- `46×46; padding:7px; border-radius:13px; object-fit:contain;`
- plate: `background:linear-gradient(135deg,#f2f4fc,#e9edf9); box-shadow:inset 0 0 0 1px rgba(15,23,42,.05);`
- on tile hover: `transform:scale(1.07)` (`transition:transform .2s ease`).
- The tinted plate is required so monochrome/transparent logos read as deliberate.

**Title** (`service-tile-name`): `margin-top:12px; font-weight:650; color:#0f172a; letter-spacing:-.01em;` (truncate, single line).

**Description** (`service-tile-description`, currently the category label): `margin-top:3px; color:#9aa3b8; font-size:.68rem; text-transform:uppercase; letter-spacing:.08em; font-weight:600;` (truncate).

**Status badge** (`status-badge`, absolute top-right `right:12px; top:12px; 9×9; border-radius:full`):
- `data-status="UP"` → `background:#10b981; box-shadow:0 0 0 3px rgba(16,185,129,.16), 0 0 9px rgba(16,185,129,.55);`
- any non-UP → `background:#f43f5e; box-shadow:0 0 0 3px rgba(244,63,94,.16), 0 0 9px rgba(244,63,94,.5);`
- Keep `title`/`aria-label` (e.g. "status: UP").

**Grid:** unchanged — `grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6`.

---

## 5. Category section header  (`h2`, currently `text-sm uppercase tracking-wide text-neutral-500`)

- `font-size:.82rem; letter-spacing:.13em; color:#475069; display:flex; align-items:center; gap:.6rem;`
- `padding-bottom:.7rem; margin-bottom:1rem; border-bottom:1px solid rgba(15,23,42,.07);`
- **Accent chip** via leading element/`::before`: `15×15; border-radius:5px; background:linear-gradient(135deg,#6366f1,#a855f7); box-shadow:0 3px 8px rgba(99,102,241,.45);`

---

## 6. Top bar  (the headline change)

### 6.1 Layout
```
┌───────────────────────────────────────────────────────────────┐
│  homepad                                          ( avatar ▾ )  │
└───────────────────────────────────────────────────────────────┘
```
- Sticky header retained (`sticky top-0 z-10 border-b backdrop-blur`), bar background `rgba(255,255,255,.72)` (dark: `rgba(17,24,28,.72)`).
- **Left — wordmark** "homepad": `font-weight:800; letter-spacing:-.02em;` gradient text `linear-gradient(135deg,#4f46e5,#a855f7)` via `background-clip:text; color:transparent`.
- **Right — User Menu only.** Everything previously in the bar (email text, `System|Light|Dark` segmented control, `admin` role pill, ⚙ settings, **Edit**, **Log out**) is **removed from the bar** and relocated into the menu.

### 6.2 Trigger — Avatar  (`data-testid="user-menu-trigger"`)
- `34×34` circle, `background:linear-gradient(135deg,#4f46e5,#a855f7)`, white, `font-weight:700; font-size:13px`.
- Content: **real user initials**, uppercased — e.g. *Caleb Dunn* → **`CD`**.
  - **Derivation rule:** from the user's display name, take the first letter of the first word + first letter of the last word (e.g. "Caleb Dunn" → `CD`). If only one name word, use its first two letters (e.g. "Caleb" → `CA`). If no name is available, fall back to the first letter of the email.
  - **Backend dependency:** `/api/me` currently returns `{id, email, role, themePref}` with **no name field**. Add a display-name (or first/last) field to the user record + `/api/me` so the avatar can render real initials. Until then the email fallback applies.
- Ring (token) signals authenticated state. Hover: `translateY(-1px)` + intensified ring.
- `aria-haspopup="menu"`, `aria-expanded` reflects open state.

### 6.3 Dropdown — `UserMenu`  (`data-testid="user-menu"`, `role="menu"`)
Width **248px**, right-aligned under the avatar (`top:46px; right:0`), `bg:#fff; border:1px solid rgba(15,23,42,.08); border-radius:14px;` menu shadow, `padding:6px`. Open/close animation per Motion tokens.

**Contents, in order:**

1. **Identity header** (`padding:10px 12px 11px`)
   - Email — `font-size:13px; font-weight:650; color:#0f172a; word-break:break-all`. (`data-testid="user-menu-email"`)
   - Role pill below — `inline-block; font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#4f46e5; background:#eef0fe; padding:2px 8px; border-radius:full`. Text = `admin` | `user`. (`data-testid="user-menu-role"`)
2. **Separator** (`height:1px; background:rgba(15,23,42,.07); margin:6px 4px`).
3. **Appearance** group
   - Label "APPEARANCE" — `font-size:10px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:#94a3b8; padding:8px 12px 3px`.
   - Segmented control, 3 equal buttons **System / Light / Dark** (`padding:0 8px 4px; gap:4px`): each `flex:1; padding:6px 0; border-radius:8px; border:1px solid rgba(15,23,42,.08); background:#fff; font-size:11px; font-weight:600; color:#475569`.
   - **Active** button: `background:linear-gradient(135deg,#4f46e5,#6366f1); color:#fff; border-color:transparent; box-shadow:0 2px 8px -2px rgba(79,70,229,.5)`. Active = current theme preference; updates immediately on select.
4. **Separator**.
5. **Edit dashboard** — *admin only* (render only when `role === 'admin'`). Menu item with pencil icon. Triggers the existing edit-mode toggle. (`data-testid="menu-edit"`)
6. **Personal settings** — gear icon; opens the existing settings panel. (`data-testid="menu-settings"`)
7. **Separator**.
8. **Log out** — *danger* style (`color:#e11d48; hover background:#fef2f3`), logout icon. (`data-testid="menu-logout"`)

**Menu item base:** `display:flex; align-items:center; gap:10px; width:100%; text-align:left; padding:9px 12px; border-radius:9px; font-size:13px; font-weight:550; color:#334155;` hover `background:#f4f5fb`; leading icon `16×16; opacity:.8`.

### 6.4 Behavior
- Click avatar → toggle menu. Click outside or `Esc` → close. Selecting any action closes the menu (except theme, which may stay open for quick A/B — optional; prototype closed on theme select except it refreshed active state).
- **Keyboard:** avatar focusable; `Enter/Space` opens; `Esc` closes and returns focus to avatar; arrow keys move between menu items (standard menu pattern); theme segmented control is a `role="group"` of buttons.
- **Theme:** the three buttons drive the same theme state as today (`themePref` on the user / `localStorage['homepad.theme']`, with the existing anti-flash boot script). Active reflects resolved preference.
- **Z-index:** menu above tiles (prototype used `z-index:50`); ensure it clears the sticky header stacking context.

### 6.5 Role & auth rules
- **Always authenticated:** unauthenticated users are redirected to login before this UI renders; the bar never shows a logged-out state. The avatar (identity + Log out) is therefore always present.
- **admin:** sees Edit dashboard in the menu (and any other admin tools). Non-admin: Edit dashboard is **omitted** (not disabled — not rendered). Theme, Personal settings, Log out are available to all roles.
- Role comes from `/api/me` (`role: "admin" | ...`).

---

## 7. Responsive
- The bar already collapses gracefully — avatar + wordmark fit any width. Drop the previously `hidden sm:inline` email entirely (it now lives in the menu).
- Menu: fixed 248px; on very small screens, right-align with an 8px viewport gutter; allow it to shift left to stay on-screen.
- Tiles/grid breakpoints unchanged.

## 8. Accessibility checklist
- Avatar button has an accessible name (e.g. `aria-label="Account menu"` + `title` = email).
- `aria-haspopup="menu"`, `aria-expanded` on trigger; `role="menu"` + `role="menuitem"` in dropdown.
- Focus trap within open menu; `Esc` restores focus to trigger.
- Color is never the only signal: status dot keeps `title`/`aria-label`; role shown as text pill.
- Contrast: muted text tokens meet AA on their backgrounds (verify `#9aa3b8` on white for ≥4.5:1 at the small sizes; bump to `#8a93a8` if needed).
- Honor `prefers-reduced-motion`.

## 9. Acceptance criteria
- [ ] Top bar shows **only** the wordmark and the avatar at all widths.
- [ ] Theme switch, Edit, settings, role, email, and logout are reachable **only** via the avatar menu.
- [ ] Admin account shows "Edit dashboard" in the menu; a non-admin account does **not**.
- [ ] Selecting System/Light/Dark changes the theme and persists, and the active state reflects the current preference.
- [ ] Personal settings and Log out perform the same actions as the previous bar buttons.
- [ ] Tiles use the new radius/shadow/icon-plate; hover lifts with indigo glow; status dot glows green (UP) / rose (down).
- [ ] Category headers show the gradient accent chip + hairline divider.
- [ ] All existing `data-testid` values on tiles/status/theme are preserved; new ones added per §6.
- [ ] Works in both light and dark themes; no layout shift / no anti-flash regression.
- [ ] Keyboard + screen-reader operable per §8.

## 10. Implementation notes
- Suggested components: `AppHeader` (wordmark + `UserMenu`), `UserMenu` (trigger + dropdown), reuse existing theme-control logic inside the menu rather than duplicating state.
- Most values map to Tailwind utilities; the gradients, glows, and icon plate are easiest as a small CSS module or `@layer components` classes (`.tile`, `.tile-icon`, `.cat-head`, `.user-menu`, `.menu-item`) to keep JSX readable.
- Keep the link semantics on tiles (`<a target="_blank" rel="noreferrer noopener">`).
- The current bar markup to replace lives in the header's right cluster (`header > div > .flex.items-center`).

## 11. Out of scope / open questions
- **Avatar initials — DECIDED:** use real initials (e.g. `CD`) per §6.2. Requires adding a display-name field to the user record / `/api/me` (backend task).
- Optional: a one-tap light/dark toggle on the bar in addition to the menu (deferred; default is menu-only per sign-off).
- Favorites/search/keyboard-launcher (not part of this pass).
