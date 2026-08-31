# Spec: Version Badge + Changelog Overlay

**Version:** 0.1.0
**Created:** 2026-06-26
**Author:** Walt (product lead)
**Status:** Shipped — v12.0.0 (2026-06-26, PR #152)
**Repo:** `Code/homepad` (frontend only; `vite.config.ts` gains two build-time defines — no backend changes)
**Based on:** fleet-feed's Option B+ changelog design, adapted to homepad's Tailwind design language

---

## 1. Overview

Today, a homepad user (or operator) has no way to tell at a glance which version is deployed, or what
shipped in that version. After a deploy, the natural question is "did the thing I asked for actually make
it in?" — and there's no answer in the UI.

This feature adds:

1. **A version badge in the page footer** — `homepad v{N} ({sha})`, always visible below the main content.
   Quiet and muted: it answers "which build is this?" without competing with the dashboard tiles.

2. **A changelog overlay** — clicking the footer version badge opens a dialog listing all releases (and
   what shipped in each), so the operator can confirm what the build contains. Modeled on fleet-feed's
   well-received design (Caleb's reference point: "good UI design that resonates").

The implementation is **frontend-only**. Version and SHA are injected at Vite build time from
`package.json` + `git rev-parse --short HEAD`. Changelog content lives in a static
`src/changelog.json` committed to the repo — no API call, no backend route.

### User story

As a homelab operator, I want to see at a glance which version of homepad is running and be able to
read what shipped in it — without leaving the dashboard or opening a terminal.

---

## 2. Architecture notes

- **`vite.config.ts`** — add two Vite `define` constants:
  - `__APP_VERSION__`: pulled from `JSON.parse(readFileSync('package.json','utf8')).version` at build time.
  - `__GIT_SHA__`: result of `execSync('git rev-parse --short HEAD').toString().trim()`, wrapped in a
    try/catch that falls back to `'dev'` (clean Docker layer, shallow clone, or CI without git history).
  - Both must be declared in `vite-env.d.ts` (or a local `.d.ts`) as `declare const __APP_VERSION__: string`
    and `declare const __GIT_SHA__: string` so TypeScript is satisfied.

- **`src/changelog.json`** — static JSON data file committed to the repo. Stitch populates it from the
  existing `CHANGELOG.md` at implementation time. Format:

  ```jsonc
  {
    "pending": [
      { "type": "feature", "text": "Description of what's coming" }
    ],
    "versions": [
      {
        "version": "15.0.0",
        "date": "2026-06-26",
        "changes": [
          { "type": "feature", "text": "Version badge + changelog overlay" }
        ]
      }
    ]
  }
  ```

  `pending` is the unreleased/upcoming bucket (may be empty array `[]`).
  `versions` lists released versions, newest-first.
  Valid `type` values: `"feature"`, `"enhancement"`, `"bug-fix"`, `"security"`.

- **`src/ChangelogOverlay.tsx`** — new component. Renders as a `<dialog>` or focus-trapped
  `<div role="dialog" aria-modal="true">`. Accepts `open: boolean` and `onClose: () => void` props.
  Statically imports `changelog.json`. The version list on the left and the change detail on the right.

- **`src/App.tsx`** — the `Home` component gains a `<footer>` rendered below the closing `</main>`
  (natural page flow, not sticky). It renders the version badge button and owns
  `changelogOpen` state.

- **Chip colors** — translated from fleet-feed's rgba tokens to inline styles (or co-located CSS in
  `index.css`) since homepad mixes Tailwind with custom CSS classes:

  | type | bg (light+dark via rgba) | text |
  |---|---|---|
  | `feature` | `rgba(34,197,94,0.14)` | `#16a34a` / dark: `#4ade80` |
  | `enhancement` | `rgba(58,142,232,0.15)` | `#2563eb` / dark: `#60a5fa` |
  | `bug-fix` | `rgba(217,164,65,0.15)` | `#b45309` / dark: `#fbbf24` |
  | `security` | `rgba(248,113,113,0.14)` | `#dc2626` / dark: `#f87171` |
  | _(unknown)_ | `rgba(138,143,152,0.15)` | neutral/muted |

  Semi-transparent backgrounds read against both white (light) and `neutral-900` (dark) surfaces without
  separate dark-mode overrides — the same property fleet-feed leverages.

- **B+ grid layout** — every change row uses `display: grid; grid-template-columns: 88px 1fr; gap: 8px`.
  The chip cell uses `display: flex; justify-content: flex-end` so any chip label right-aligns to the
  gutter edge. All description text therefore starts at a consistent x = 96 px from the panel edge.

---

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A `<footer data-testid="app-footer">` element appears at the natural bottom of page flow (not fixed, not sticky) in the `Home` view. It is always present regardless of admin/user role, theme, or tab scroll position. | Must |
| AC-002 | The footer displays the string `homepad v{N} ({sha})` where `{N}` is `__APP_VERSION__` and `{sha}` is `__GIT_SHA__`. Both appear on one line. | Must |
| AC-003 | `__APP_VERSION__` is sourced from `package.json`'s `version` field, read at Vite build time and injected via `define`. Bumping `package.json` version automatically updates the footer on next build with no other change. | Must |
| AC-004 | `__GIT_SHA__` is produced by `git rev-parse --short HEAD` at Vite build time. When the command fails (no git, shallow clone, Docker without git context), it falls back to the string `'dev'`. The build must **not** fail when git is unavailable. | Must |
| AC-005 | The footer version string is rendered as a `<button>` (not a plain `<span>`). It has `aria-label="Open changelog"`. Clicking it opens the changelog overlay. It does not navigate away or reload the page. | Must |
| AC-006 | The footer button is styled to be **quiet and muted**: `text-xs`, `text-neutral-400 dark:text-neutral-500`, no border, no background. On hover: `text-neutral-700 dark:text-neutral-300` + `underline`. It does not compete with the dashboard tiles. | Must |
| AC-007 | The footer has a top border (`border-t border-neutral-100 dark:border-neutral-800`) and comfortable padding (`py-3 text-center`). It adds no visual weight beyond a quiet separator + label. | Should |
| AC-008 | Clicking the footer button opens a changelog overlay (`ChangelogOverlay`) with `role="dialog" aria-modal="true"`. The overlay has a visible close button (✕) and a title "Changelog". | Must |
| AC-009 | The overlay closes on: Escape key, close button click, backdrop click (if a backdrop is rendered). On close, focus returns to the footer button (the trigger). | Must |
| AC-010 | The overlay is **two-panel on desktop (≥640 px)**: a version list panel on the left and a change detail panel on the right. On mobile (<640 px) the panels stack vertically — version pills on top, detail below — and the overlay is near-full-screen. | Must |
| AC-011 | The version list (left panel) shows version buttons newest-first with "Pending next release" at the top. Clicking a version button selects it and shows its changes in the detail panel. The selected button is visually distinguished (background or border accent) and carries `aria-current="true"`. | Must |
| AC-012 | **Default selection on open**: "Pending next release" if `pending` has ≥ 1 entry; otherwise the version matching `__APP_VERSION__`. Re-opens at the same default on each open (not the last selected). | Must |
| AC-013 | **Pending bucket**: when `pending` is empty, the detail panel shows "Nothing queued yet." in muted small text. When `pending` has entries, they render in the B+ grid with chips and descriptions. | Must |
| AC-014 | Each released version's detail panel begins with a version header: bold version string (`v{N}`) followed by the date formatted as `Jun 26, 2026`, then a hairline divider below the header row. The version string uses an indigo/purple accent (matching the wordmark palette — e.g. `text-indigo-600 dark:text-indigo-400`). | Must |
| AC-015 | **B+ grid**: every change row in the detail panel uses `grid-template-columns: 88px 1fr; gap: 8px`. The chip cell uses `justify-content: flex-end`. The shortest chip (`feature`, ~54 px) and the longest chip (`enhancement`, ~78 px) in the same panel produce the same gap between chip right edge and description text. No chip wraps or overflows its 88 px cell. | Must |
| AC-016 | Four chip types render with the correct colors (see §2 table). An unknown `type` value falls back to a neutral muted chip without crashing or hiding the entry. | Must |
| AC-017 | The overlay dialog has `max-height: clamp(400px, 85vh, 680px)`. The change detail panel scrolls internally if content overflows; the version list and dialog header stay fixed. | Should |
| AC-018 | On mobile (<640 px), the overlay is near-full-screen (no horizontal overflow at 390 px viewport). Version pills are a horizontally scrollable or wrapping row. No content is cut off. | Must |
| AC-019 | In light mode, chip semi-transparent backgrounds (`rgba(...)`) read against the white dialog surface without extra overrides. The dialog surface uses `bg-white dark:bg-neutral-900`. | Must |
| AC-020 | `src/changelog.json` is committed to the repo, bundled statically, and contains all releases from the existing `CHANGELOG.md` (v7 through v14/cap5, newest first), plus an entry for this feature itself in `pending`. Every entry has a valid `type`. | Must |
| AC-021 | `npm test` passes. New Vitest tests cover: (a) `ChangelogOverlay` renders without crash when `open=true`, (b) correct chip class/style for each of the four canonical types, (c) `pending` empty → "Nothing queued yet.", (d) `pending` with entries → they render, (e) footer renders with `data-testid="app-footer"`. TDD: red test committed first, then implementation. | Must |

---

## 4. User test cases

### TC-001: Version badge is visible and quiet

**Precondition:** User is logged in on the homepad dashboard.

**Steps:**
1. Scroll to the bottom of the page.
2. Observe the footer area.

**Expected:** A muted single line reads `homepad v{N} ({sha})` in small neutral text. It does not draw the eye away from the dashboard tiles.

**Maps to:** AC-001, AC-002, AC-006

---

### TC-002: Clicking version badge opens changelog

**Precondition:** User is on the dashboard (any role).

**Steps:**
1. Click the footer version string.

**Expected:** A dialog opens titled "Changelog." The version list shows "Pending next release" at the top, followed by version numbers newest-first. The detail panel shows the changes for the default selected version.

**Maps to:** AC-008, AC-011, AC-012

---

### TC-003: Close on Escape, focus returns

**Precondition:** Changelog overlay is open.

**Steps:**
1. Press Escape.

**Expected:** The overlay closes. Focus returns to the footer version button.

**Maps to:** AC-009

---

### TC-004: B+ grid alignment — chip column constant

**Precondition:** Changelog overlay is open on a version that has both `feature` and `enhancement` entries.

**Steps:**
1. Observe the change rows.

**Expected:** The description text of the `feature` row and the `enhancement` row start at the same horizontal position. The `enhancement` chip (longer) does not push its description further right than the `feature` chip (shorter).

**Maps to:** AC-015

---

### TC-005: Pending bucket empty state

**Precondition:** `changelog.json` has `"pending": []`.

**Steps:**
1. Open the changelog overlay (default selection → current version, since pending is empty).
2. Manually click "Pending next release" in the version list.

**Expected:** The detail panel shows "Nothing queued yet." in muted text.

**Maps to:** AC-013

---

### TC-006: Git SHA fallback

**Precondition:** Build produced in an environment with no git history (e.g., Docker layer without git context — `__GIT_SHA__` falls back to `'dev'`).

**Steps:**
1. Load the page. Scroll to footer.

**Expected:** Footer reads `homepad v{N} (dev)`. No build error, no crash, no empty string.

**Maps to:** AC-004

---

## 5. Out of scope

- Fetching changelog from a `/api/version` endpoint or any backend call. Static JSON only.
- Auto-deriving `changelog.json` from `CHANGELOG.md` at build time (deferred — manual sync acceptable for v1).
- Markdown formatting within change descriptions (plain text only).
- Per-entry detail expansion or external links from the overlay.
- A sticky or fixed footer (natural page flow only — not a persistent chrome element).
- Showing the version badge in the auth/login screen (Home view only).
- Any light/dark chip color treatment beyond semi-transparent rgba backgrounds.

---

## 6. Implementation guidance

### `vite.config.ts`

```ts
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const appVersion: string = pkg.version;
let gitSha: string;
try {
  gitSha = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  gitSha = 'dev';
}

export default defineConfig({
  // ...existing config...
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __GIT_SHA__: JSON.stringify(gitSha),
  },
});
```

Add to `vite-env.d.ts` (or a co-located `global.d.ts`):
```ts
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
```

### `src/changelog.json`

Schema (see §2). Stitch populates from `CHANGELOG.md`. The `pending` array holds this feature
itself as `{ "type": "feature", "text": "Version badge + changelog overlay" }` until the next
release is cut. After the PR merges, move the pending entry into the new version block.

### `src/ChangelogOverlay.tsx`

- Two sub-components: `VersionList` (left panel) and `ChangeDetail` (right panel).
- State: `selectedVersion: string | null` (null = "Pending").
- On open, set default per AC-012.
- Chip colors: implement as a helper `chipStyle(type)` that returns `{ background, color }` inline
  styles (avoids Tailwind purging arbitrary rgba values). CSS classes in `index.css` are equally
  acceptable — Stitch's call.
- B+ grid: CSS Grid (`display: grid; grid-template-columns: 88px 1fr; gap: 8px`) on each change row,
  chip cell with `display: flex; justify-content: flex-end; align-items: center`.
- Dialog shell: `bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700
  rounded-2xl shadow-2xl overflow-hidden`. Panel: `max-height: clamp(400px, 85vh, 680px)`.
- Focus trap: use a lightweight custom hook or the native `<dialog>` element's built-in trap.
  If `<dialog>` is used, open with `.showModal()`.
- Close: call `onClose` on Escape (via `onKeyDown` or `<dialog>` native behavior), backdrop click,
  and the ✕ button.

### `src/App.tsx` — `Home` component

Add at the end of the returned JSX, after `</main>`:

```tsx
<footer data-testid="app-footer" className="border-t border-neutral-100 dark:border-neutral-800 py-3 text-center">
  <button
    aria-label="Open changelog"
    onClick={() => setChangelogOpen(true)}
    className="text-xs text-neutral-400 hover:text-neutral-700 hover:underline
               dark:text-neutral-500 dark:hover:text-neutral-300
               bg-transparent border-none cursor-pointer"
  >
    homepad v{__APP_VERSION__} ({__GIT_SHA__})
  </button>
</footer>
<ChangelogOverlay open={changelogOpen} onClose={() => setChangelogOpen(false)} />
```

Add `const [changelogOpen, setChangelogOpen] = useState(false)` to `Home`'s state.

---

## 7. Success metric

After this ships, a homelab operator can deploy a new homepad build and confirm — without opening a
terminal, checking Gitea, or asking the team — exactly what version is running and what it shipped.
"What's in this build?" is answered in two clicks from anywhere on the dashboard.
