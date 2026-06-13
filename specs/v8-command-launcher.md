# homepad v8 — Command-K Quick Launcher Spec

**Version:** 1.0  **Date:** 2026-06-13  **Status:** Draft, awaiting Caleb sign-off
**Audience:** Frontend developer implementing in the homepad codebase
**App:** homepad (custom service dashboard) — React + Vite + **Tailwind CSS**, Go backend. Light + Dark themes.
**Methodology:** ADD (getadd.dev) — POC→Production dial. RED→GREEN→REFACTOR per AC.

---

## 1. Summary

The dashboard now renders **39 services** across categories (v4) with favorites
pinning (v1/A5) and a refreshed surface (v7). At ~40 tiles the grid is pretty,
but reaching a service means *scanning* — eyes scan a grid, hands leave the
keyboard. v8 turns the dashboard into a **fast tool**: a keyboard-first **command
launcher** that opens over the grid, fuzzy-matches as you type, and launches the
highlighted service in a new tab on `Enter`.

It is the "Cmd-K search palette" that v1 explicitly deferred ("Out of scope
(deferred) → Cmd-K search palette — v2"). It finally lands here as v8.

**Headline interaction**

```
            ⌘K / Ctrl+K   or   /   (when not typing in a field)
                              │
                              ▼
        ┌──────────────────────────────────────────────┐
        │  🔎  jelly|                                   │   ← auto-focused input
        ├──────────────────────────────────────────────┤
        │ ▣  Jellyfin            MEDIA          ⏎       │   ← highlighted (1st)
        │ ▣  Jellyseerr          MEDIA                  │
        │ ▣  Gitea               DEV                    │
        └──────────────────────────────────────────────┘
                   Esc to close · ↑↓ to move · ⏎ to open
```

### Design principles
- **Keyboard-first, mouse-friendly.** Everything works from the keyboard; the
  same surface is fully clickable for touch/mouse.
- **Zero-latency.** No network on the critical path. The launcher filters data
  the page **already has** — typing must feel instant (see §3, the architecture
  note).
- **Restraint, reused.** No new visual language. Reuse the v7 indigo→violet
  accent, radii, shadows, and motion tokens (§2). The launcher should read as
  the same product, one keystroke deeper.
- **Familiar grammar.** Mirror the Spotlight / Linear / Raycast / VS Code Cmd-K
  conventions users already know (centered overlay, fuzzy match, ↑↓ + ⏎).

---

## 2. Design tokens (reuse v7 — no new palette)

The launcher introduces **no new color tokens**. It reuses the v7 tokens
verbatim (`specs/v7-ux-redesign.md §2`); values below are referenced, not
redefined.

| Concern | Reused v7 token / value | Use in launcher |
|---|---|---|
| Accent gradient | `--accent-from #4f46e5` → `--accent-to #a855f7` | selected-row tint, the `⏎` hint chip, input caret/focus ring |
| Title text | `--text-strong #0f172a` | result service name |
| Muted text | `--text-muted #475069` | result category label |
| Faint text | `--text-faint #9aa3b8` | placeholder, footer hint, "no results" copy |
| Hairline | `--hairline rgba(15,23,42,.06–.08)` | input underline, row separators (if any) |
| Icon plate | v7 `.tile-icon` plate gradient `linear-gradient(135deg,#f2f4fc,#e9edf9)` | result-row icon plate (smaller: 28×28) |

### New surfaces (built from existing tokens)
- **Overlay/scrim:** `rgba(15,23,42,.45)` light · `rgba(2,4,10,.6)` dark, with a
  light `backdrop-blur(2px)` (matches the sticky-header blur language).
- **Modal panel:** `background:#fff` (dark: `#0e1117`), `border:1px solid var(--hairline)`,
  **radius 14px** (the v7 *menu* radius, not the 18px tile radius — this is a
  menu-class surface), v7 **Menu shadow** token
  (`0 18px 40px -12px rgba(16,24,40,.28), 0 0 0 1px rgba(15,23,42,.03)`).
- **Selected result row:** `border-radius:9px` (v7 menu-item radius), background a
  faint accent wash `rgba(99,102,241,.10)` (dark: `rgba(99,102,241,.18)`) + a
  2px leading accent bar (`linear-gradient(135deg,#4f46e5,#a855f7)`). Selection
  is **never** signalled by color alone — see §8.
- **`⏎` open-hint chip** on the selected row: the v7 active-button gradient
  `linear-gradient(135deg,#4f46e5,#6366f1)`, white glyph, `border-radius:6px`.

### Motion (reuse v7 Motion tokens)
- **Open:** `opacity .14s ease, transform .14s ease`, from `translateY(-6px) scale(.98)`
  → `translateY(0) scale(1)` (identical to the v7 menu-open curve).
- **Scrim fade:** `opacity .14s ease`.
- **`prefers-reduced-motion`:** disable transform/translate/scale; keep opacity
  fades only. (Same rule as v7 §2.)

---

## 3. Architecture / non-goals (read first)

**The launcher is CLIENT-SIDE ONLY.** It is a pure view over the service list the
catalog **already fetched** from `GET /api/services` on load (the v1 contract,
39 items today). There is **no search endpoint, no query param, no new request,
and no backend change of any kind.**

- **No new API.** The launcher takes the in-memory `Service[]` (the same array
  the grid renders — `id, slug, name, description, url, icon, status, favorite,
  categoryName, …`) as a prop / from shared state and filters it locally.
- **No round-trip per keystroke.** Filtering + ranking is synchronous JS over an
  array of ~40 objects. There is nothing to debounce for network reasons.
- **No persistence.** Opening a service is a navigation, not a write. v8 stores
  **no** new per-user state on the server (see the recents Decision in §10).
- **Status, favorites, categories, icons** are whatever the already-loaded list
  says; the launcher never re-derives them. If the list refreshes (existing
  polling), the launcher reflects the new array on its next render.

> **Non-goal:** anything that touches `homepad-api`. If an idea needs a server
> change (server-side search, global recents, telemetry), it is **out of scope
> for v8** and belongs in a later spec. This constraint is a hard requirement,
> not a preference — keep the PR entirely within `Code/homepad`.

Out of scope for v8 (deferred): command actions beyond "open a service" (e.g.
"toggle theme", "open settings", "favorite this"); searching anything other than
the service catalog; server-side or cross-device recents; pinned/aliased search
shortcuts.

---

## 4. Trigger & open/close

### 4.1 Keyboard open
- **`⌘K` (macOS) / `Ctrl+K` (Win/Linux)** opens the launcher from anywhere in the
  app. `preventDefault()` so the browser's own Cmd/Ctrl-K (focus address bar /
  search) does not fire.
- **`/`** also opens it — but **only when the user is not typing**. Suppress the
  `/` trigger when the active element is an `<input>`, `<textarea>`, `<select>`,
  or any `contenteditable` host (so `/` types a slash in the admin service form,
  the login fields, etc.). `⌘K`/`Ctrl+K` is **not** suppressed in fields (it is
  an explicit chord, unlikely to collide) — a power user can summon it mid-form.
- If the launcher is already open, the trigger keys are a no-op (do not toggle
  closed on a second `⌘K`; `Esc` is the close affordance — keeps the mental
  model simple).

### 4.2 On-screen trigger (`data-testid="launcher-trigger"`)
A visible affordance is required so touch/mouse users (no physical keyboard) can
open the launcher. Add a **search button** to the top bar (`AppHeader`, v7 §6.1),
placed **between the wordmark and the avatar**:
- Desktop (`≥640px`): a pill button — search glyph + faint placeholder
  "Search…" + a keyboard-hint chip showing **`⌘K`** (or `Ctrl K`; detect
  platform, default `Ctrl K` when unknown). Styled from existing tokens:
  `border:1px solid var(--hairline); border-radius:9999px;` faint text; hover
  raises the hairline + a subtle accent tint.
- Mobile (`<640px`): collapses to an **icon-only** circular search button (same
  footprint as the avatar) — no inline placeholder/hint text.
- `aria-haspopup="dialog"`, `aria-expanded` reflects open state,
  `aria-keyshortcuts="Meta+K Control+K"`, accessible name `"Open quick launcher"`.

### 4.3 Close
- **`Esc`** closes and **restores focus to the element that was focused before
  open** (the trigger button if it opened the launcher; otherwise the prior
  active element). Esc must win over any row selection.
- **Click / tap outside** the modal panel (on the scrim) closes it.
- **Selecting a result** (Enter or click) opens the service in a new tab and
  closes the launcher (the original tab keeps the dashboard; see §6).
- Closing **clears the query and selection** — the launcher always reopens empty
  (predictable; cheap over 40 items). (See §10 Decision D5.)

---

## 5. Layout & states

### 5.1 The overlay (`data-testid="launcher-overlay"`)
Full-viewport fixed scrim (§2) that also serves as the click-outside target.
`z-index` must clear the v7 sticky header **and** the avatar UserMenu
(`z-index ≥ 60`; v7 menu used 50). Body scroll is locked while open.

### 5.2 The modal panel (`data-testid="launcher-modal"`, `role="dialog"`)
- **Centered horizontally**, anchored toward the **top third** of the viewport
  (offset ≈ `12vh` from top — Spotlight/Linear convention; keeps results in the
  reading zone and away from the on-screen keyboard on mobile).
- Width: `min(640px, calc(100vw - 32px))`. Max height: `min(60vh, 520px)`; the
  **results region scrolls**, the input stays pinned at the top.
- Panel = input row (top, fixed) + results region (scrolls) + footer hint row.

### 5.3 Input row (`data-testid="launcher-input"`)
- A single `<input type="text">`, **auto-focused on open**, `autocomplete="off"`,
  `spellcheck="false"`, `autocapitalize="off"`.
- Leading search glyph (`aria-hidden`). Placeholder: "Search services…" in
  `--text-faint`.
- Caret/selection use the accent; focus ring is the existing
  `ring-2 ring-indigo-500` language (the input is *the* focus owner — see §8, the
  combobox pattern).
- A trailing clear "✕" appears when the query is non-empty (`data-testid="launcher-clear"`,
  `aria-label="Clear search"`); clicking it empties the query and refocuses the
  input.

### 5.4 Results region (`data-testid="launcher-results"`, `role="listbox"`)
Three mutually-exclusive states:

1. **Empty query → default list.** See §7. Header label "FAVORITES" / "ALL
   SERVICES" (`--text-faint`, v7 group-label styling).
2. **Query with matches → ranked results.** See §6.
3. **Query with no matches → empty state** (`data-testid="launcher-no-results"`):
   centered, `--text-faint`, e.g. *"No services match "zzz"."* plus a faint hint
   *"Try a name, category, or keyword."* No row is selectable; `Enter` is a
   no-op.

### 5.5 Result row (`data-testid="launcher-result"`, `role="option"`)
Each row, left→right:
- **Icon plate** (28×28, v7 `.tile-icon` plate, smaller): the **same icon** the
  tile renders — reuse the existing icon-resolution precedence (uploaded
  light/dark → `icon` field → fallback). Theme-aware exactly like the tile.
- **Name** (`--text-strong`, `font-weight:650`, truncate single line).
- **Category** chip/label (`--text-muted`, uppercase, small — same treatment as
  the tile's category/description line; "Uncategorized" when none).
- **(optional) status dot** mirroring the tile's `status-badge` glow (UP green /
  non-UP rose), `title`/`aria-label` carried over — color is never the only
  signal.
- On the **selected** row only: the `⏎` open-hint chip, right-aligned (§2).

Row data hooks: `data-service-id="{id}"`, `data-selected="true|false"`,
`data-rank="{n}"` (0-based, for test assertions on ordering). Each row's DOM `id`
is `launcher-option-{id}` (referenced by `aria-activedescendant`, §8).

---

## 6. Matching, ranking & launch

### 6.1 Fuzzy match
Matching is **fuzzy subsequence** (Cmd-K convention), case-insensitive,
whitespace-trimmed — not substring-only. The query characters must appear in
order within the candidate field, with a contiguity/edge bonus so tighter and
prefix matches rank above scattered ones. Examples (query → matches):
- `jly` → **Jellyfin** (subsequence j-l-y), `jf` → **Jellyfin**.
- `git` → **Gitea**, **Gitea Actions** (prefix beats mid-string).
- `med` → matches services whose **category** is "Media" (lower weight, §6.2).

### 6.2 Fields & weights
A service is scored against three fields; its score is the **best-weighted**
field hit (a service matched on multiple fields takes its strongest):

| Field | Weight | Rationale |
|---|---|---|
| **Service name** | **1.0** (primary) | what users almost always type |
| **Category name** | **0.6** | "show me Media" style queries |
| **Description** | **0.4** (lowest) | catch-all keywords |

A service is a **result** if it matches **any** field. Non-matching services are
excluded.

### 6.3 Ranking (deterministic)
Order results by, in priority:
1. **Field weight** (name hit > category hit > description hit).
2. **Match quality** within that field — prefix/exact > contiguous > scattered;
   earlier match position wins.
3. **Favorite** services break ties ahead of non-favorites.
4. **Alphabetical by name** as the final stable tie-break.

Ranking must be **stable and deterministic** (same query → same order every
render) so it is unit-testable. **The first result (rank 0) is selected by
default** on every query change.

### 6.4 Keyboard within the open launcher
- **↓ / ↑** move the selection down/up through the **visible result order**;
  selection **wraps** (down past the last → first; up past the first → last).
  Moving keeps the selected row scrolled into view.
- **Enter** opens the **currently selected** result (no-op if there are no
  results).
- **Home / End** (nice-to-have): jump to first / last result.
- **Esc** closes (§4.3). **Tab** is trapped within the dialog (§8).
- Typing edits the query and **re-selects rank 0**.

### 6.5 Launching a service
Opening a result must use the **exact same link semantics as a dashboard tile**
(`Catalog.tsx`: `<a href={url} target="_blank" rel="noreferrer noopener">`):
- **New tab, severed opener:** `target="_blank"` + `rel="noreferrer noopener"`.
- **Implementation:** render each result row as an **`<a>`** with those
  attributes (so click, middle-click, and ⌘/Ctrl-click behave like the tile and
  get the browser's native new-tab handling). `Enter` on the selected row
  programmatically activates that same anchor (or `window.open(url, '_blank',
  'noopener,noreferrer')`) — never a same-tab `location` change.
- After a successful open, **close** the launcher (the dashboard stays put in the
  original tab).

---

## 7. Empty-query (default) state — DECIDED

When the query is empty, show a curated default so the launcher is useful before
a single keystroke (Decision D1):

1. **Favorites first** — the user's favorited services (the existing `favorite`
   flag on the loaded list), under a "FAVORITES" label, in the user's existing
   pinned order. Omit the section entirely if the user has no favorites.
2. **All services** — the full catalog under an "ALL SERVICES" label, in the
   catalog's existing display order (the same order the grid uses), with
   favorites **not** repeated in this section (they're already pinned above) to
   avoid duplicate rows in a flat keyboard list.

Selection still defaults to the **first row** (the first favorite if any, else
the first service). **No "recents"** ships in v8 — see Decision D2 (and Open
Question OQ1) for why and what it would take.

---

## 8. Accessibility

The launcher follows the **WAI-ARIA combobox-with-listbox (Cmd-K) pattern** —
the input keeps DOM focus the entire time; selection is *virtual* via
`aria-activedescendant`, not real focus moving to rows.

- **Dialog:** modal panel has `role="dialog"` + `aria-modal="true"` +
  `aria-label="Quick launcher"`.
- **Combobox input:** `role="combobox"`, `aria-expanded="true"` while results
  show, `aria-controls="launcher-results"`, `aria-activedescendant` = the
  selected row's id (`launcher-option-{id}`), updated on every ↑/↓ and query
  change. `aria-autocomplete="list"`.
- **Listbox:** results container `role="listbox"` (`id="launcher-results"`); each
  row `role="option"` with `aria-selected="true"` on the selected row only.
- **Screen-reader labels:** each option exposes a composed accessible name, e.g.
  *"Jellyfin, Media, status up"* (name + category + status), so a SR user hears
  the full row without seeing the icon. The result count is announced via an
  `aria-live="polite"` region, e.g. *"7 results"* / *"No services match."*
- **Focus trap:** while open, `Tab`/`Shift+Tab` cycle only within the dialog
  (input, clear button, and — for mouse parity — the anchors); focus cannot
  escape to the page behind the scrim.
- **Esc restores focus** to the pre-open element (§4.3) — the trigger button in
  the common case.
- **Color independence:** the selected row is signalled by the leading accent bar
  **and** `aria-selected` **and** the `⏎` chip — never by background tint alone.
  Status uses the dot + text label, as on tiles.
- **Contrast:** all text meets WCAG AA on its surface in both themes (re-verify
  `--text-faint #9aa3b8` on the panel at small sizes; bump to `#8a93a8` if it
  misses 4.5:1, per v7 §8).
- **Reduced motion:** honor `prefers-reduced-motion` (§2).
- **Target size:** result rows and the mobile trigger are ≥44px tall on touch.

---

## 9. Responsive / mobile

- **Trigger:** icon-only search button on `<640px` (§4.2); pill with hint on
  `≥640px`.
- **Modal:** `width: calc(100vw - 32px)` on phones (16px gutters), still anchored
  toward the top so the on-screen keyboard does not cover results; on `≥640px`,
  the fixed `640px` max width.
- **Auto-focus on mobile:** focusing the input on open raises the soft keyboard —
  this is the desired behavior (the user came to type). Results scroll under the
  pinned input.
- **Rows** are comfortably tappable (≥44px); the whole row is the `<a>` hit area.
- **No hover dependency:** selection/affordances never require hover (mirrors the
  v1 mobile reorder rule). The footer hint row (`↑↓ · ⏎ · Esc`) may be hidden on
  `<640px` to save height.
- Grid/tiles behind the scrim are unchanged (v7 breakpoints intact).

---

## 10. Decisions (made under delegated authority — Joe, 2026-06-13)

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Empty query → Favorites, then All services.** | Favorites are the user's own shortlist (already loaded, already ordered); "All" makes the launcher a complete index from keystroke zero. Matches the grid's Favorites-first mental model (v4). |
| **D2** | **No "recents" in v8.** | There is **no** recents tracking today. Server recents would breach the client-only constraint (§3). Client-only `localStorage` recents are *possible* but add new state, eviction, and privacy questions for marginal value over Favorites+fuzzy. Deferred — see OQ1. |
| **D3** | **Match fields = name (1.0) + category (0.6) + description (0.4); fuzzy subsequence.** | Name is what people type; category enables "show me Media"; description is a low-weight catch-all. Fuzzy subsequence is the Cmd-K convention users expect. |
| **D4** | **`/` opens the launcher only when not typing in a field; `⌘K`/`Ctrl+K` works everywhere.** | `/` is a beloved quick-search key (GitHub/Slack) but must not hijack text entry; the explicit chord is safe mid-form. |
| **D5** | **Closing clears query + selection; reopen is always empty.** | Predictable and trivially cheap over ~40 items; avoids "stale query" surprises. (A "remember last query" option is deferrable.) |
| **D6** | **One visible header trigger, placed between wordmark and avatar.** | Touch users need a non-keyboard entry; the top bar is where the avatar/menu already live (v7 §6). Keeps the bar to wordmark · search · avatar. |
| **D7** | **Result rows are real `<a target="_blank" rel="noreferrer noopener">`.** | Byte-for-byte the tile's launch semantics (§6.5) — new tab, severed opener, native middle/modifier-click — instead of a bespoke JS navigation. |
| **D8** | **No backend change; filters the already-loaded `/api/services` list.** | Hard architecture constraint (§3); keeps the PR inside `Code/homepad` and the interaction zero-latency. |

---

## 11. Acceptance criteria (testable)

Component/unit tests (vitest + Testing Library) drive A1–A12; the ranking core
(A6/A7) is a pure function with isolated unit tests. Each AC is implemented
**RED→GREEN** (failing test committed first, tagged with its AC id).

| # | Criterion | How verified |
|---|---|---|
| **A1** | `⌘K` and `Ctrl+K` open the launcher from the dashboard; the modal (`launcher-modal`, `role="dialog"`) appears and the input (`launcher-input`) is focused. | Component: fire keydown `{key:'k', metaKey:true}` and `{ctrlKey:true}`; assert dialog present and `document.activeElement` is the input. |
| **A2** | `/` opens the launcher when focus is on the page body, but does **not** open it (types a slash instead) when focus is in a text field. | Component: `/` on body → dialog opens; focus an `<input>`, press `/` → no dialog, value is "/". |
| **A3** | `Esc` closes the launcher and restores focus to the element focused before opening (the trigger). Click on the scrim (`launcher-overlay`) outside the panel also closes it. | Component: open via trigger, `Esc` → dialog gone, trigger refocused; reopen, click overlay → closed. |
| **A4** | The on-screen trigger (`launcher-trigger`) exists in the header, is keyboard-operable, has `aria-haspopup="dialog"` and an accessible name, and opens the launcher on click. | Component: query trigger by testid/role, click → dialog opens; assert aria attrs. |
| **A5** | Typing a query filters to fuzzy matches; each result row (`launcher-result`) shows the service **icon + name + category**. | Component: type `jelly` → rows include Jellyfin with its icon `img`, name text, category label. |
| **A6** | Matching is fuzzy subsequence over name (primary), category, and description (lower weight); a service matched only by category/description still appears, ranked below name matches. | Unit (pure ranker): assert `jly`→Jellyfin; a Media-category service surfaces for `media`; name hits outrank category/description hits. |
| **A7** | Ranking is deterministic and the **first result is selected by default**; the selected row has `aria-selected="true"` / `data-selected="true"`. | Unit: same query → identical ordered ids. Component: after typing, `data-rank="0"` row is the selected one. |
| **A8** | `ArrowDown`/`ArrowUp` move the selection (wrapping at the ends) and update `aria-activedescendant`; the selected row scrolls into view. | Component: type, press ↓ → selection index 1; ↑↑ from top wraps to last; assert `aria-activedescendant` = selected row id. |
| **A9** | `Enter` opens the **selected** service in a new tab with `target="_blank"` and `rel="noreferrer noopener"` (tile-equivalent), and closes the launcher. | Component: rows are `<a>` with those attributes; spy on the anchor's click / `window.open('…','_blank','noopener,noreferrer')`; assert called with selected url and dialog closes. |
| **A10** | Empty-query default shows **Favorites first, then All services** (D1); with no favorites, only "All services" shows; selection defaults to the first row. | Component: open with seeded favorites → FAVORITES section precedes ALL SERVICES, no dup rows; no favorites → only ALL SERVICES; first row selected. |
| **A11** | A query with no matches shows the no-results state (`launcher-no-results`) and `Enter` is a no-op (nothing opens, launcher stays open). | Component: type `zzzzz` → no-results node present, no `launcher-result` rows; `Enter` → `window.open` not called, dialog still open. |
| **A12** | **No network request is made by the launcher** — open, type, navigate all operate on the already-loaded list; `fetch` is not called by any launcher interaction. | Component: spy on `fetch`; open + type + arrow + (mock) enter → assert `fetch` never called by launcher code. |
| **A13** | a11y: dialog has `role="dialog"`/`aria-modal`; input is `role="combobox"` with `aria-expanded`/`aria-controls`/`aria-activedescendant`; results are `role="listbox"` of `role="option"`; focus is trapped; result count announced via `aria-live`. | Component + jest-axe: assert roles/aria wiring; Tab cycles within dialog; axe finds no violations open+empty and open+results. |
| **A14** | Works in **light and dark**; the launcher reuses v7 tokens (no new palette); selection is signalled by more than color (accent bar + `aria-selected` + `⏎` chip); honors `prefers-reduced-motion`. | Component: render under `.dark`; assert token classes/vars used; assert selected row carries non-color selection markers; reduced-motion media query disables transforms. |
| **A15** | Responsive: header trigger is icon-only `<640px` and a pill with the `⌘K`/`Ctrl K` hint `≥640px`; the modal is full-width (minus gutters) on phones, ≤640px on desktop. | Component at both widths: assert trigger variant and modal width class/behavior. |

> Playwright e2e (real keyboard, real new-tab) is **not** part of the CI gate in
> this container (no browser libs — see homepad's e2e note). A1–A15 are covered
> by vitest component/unit tests, which **is** the merge gate (build + vitest).

---

## 12. Implementation notes (non-binding)

- Suggested components: `CommandLauncher` (overlay + dialog + input + results,
  owns open-state, query, selection, key handling) and a small
  `LauncherTrigger` button in `AppHeader` (v7 §6.1, between wordmark and avatar).
  A `useGlobalHotkey` effect (mounted once, e.g. in `App`) handles `⌘K`/`Ctrl+K`/`/`.
- Keep the ranker a **pure function** — `rankServices(query, services): RankedResult[]`
  — so A6/A7 are unit-tested in isolation with no DOM.
- Feed it the **same `Service[]`** the catalog already holds; lift that list to a
  shared owner (or a tiny context) rather than refetching — **no new fetch**
  (§3, A12).
- Reuse the existing icon-resolution and status-dot logic from `ServiceTile`
  (extract a small shared `ServiceIcon`/status helper rather than duplicating the
  precedence chain) so result rows stay byte-identical to tiles.
- Most styling maps to Tailwind + the v7 `@layer components` classes; add a
  small `.launcher-*` set (`.launcher-panel`, `.launcher-row`, `.launcher-row[data-selected]`)
  mirroring the v7 `.user-menu` / `.menu-item` pattern to keep JSX readable.
- Lock body scroll while open; restore on close.

---

## 13. Open questions (need Caleb's sign-off)

- **OQ1 — Recents.** v8 ships **no** recents (Decision D2: Favorites + fuzzy
  cover the need, and a client-only history adds state/eviction/privacy
  surface). **Confirm** that's the right call, or greenlight a *small,
  client-only* `localStorage` "recently opened" section (still no backend) for a
  v8.1. *Stitch's lean: skip it for now.*
- **OQ2 — `/` as a global trigger.** `/` is a delightful quick-search key but
  it's an aggressive global capture. It's well-guarded (suppressed in any text
  field, §4.1) — but **confirm** you want `/` *and* `⌘K`, or `⌘K`/`Ctrl+K` only.
  *Stitch's lean: keep both; the guard is solid.*
- **OQ3 — Status dot on result rows.** Spec'd as optional (§5.5). Include the
  live status glow per row, or keep rows clean (name + category only)? *Stitch's
  lean: include it — it's free signal and consistent with the tiles.*

---

**Next ADD phase after sign-off:** test-writer → failing component/unit tests
for A1–A15 → RED→GREEN→REFACTOR→VERIFY, sliced to fit the ~15-min task cap
(ranker unit core first, then the dialog/keyboard shell, then the trigger +
a11y polish).
