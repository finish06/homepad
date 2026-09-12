# Homepad — Modularity & Maintainability Review

Scope: `src/` of the React 18 + Vite + TypeScript SPA at `/Users/calebdunn/Documents/projects/homepad`. Reviewed: Catalog.tsx, AppGrid.tsx, api.ts, App.tsx, SettingsPanel.tsx, services.tsx, recently-opened.ts, tsconfig, vite/tailwind configs, and the test suite layout. No files were edited.

## Executive summary

The codebase is in better shape than its file sizes suggest: TypeScript is strict with essentially zero `any` (none in app code, none in tests), optimistic-update-with-rollback is applied consistently, pure logic already lives in small testable modules (`appGrid.ts`, `catLayout.ts`, `category-ranker.ts`, `recently-opened.ts`), and API mocking is uniform (`vi.mock('./api')` in 19 test files). The dominant structural problems are: **(1) Catalog.tsx is dead code** — 2,006 lines plus ~3,500+ lines of tests exercising a component nothing in the app renders; **(2) a flat 100+-file `src/` with no directory structure; (3) a broken `lint` script (no ESLint installed or configured); (4) ~16 vitest files that assert on raw source text of CSS/Dockerfile/configs**, which is brittle by design and mixes infra guards into the component suite. Fixing #1 alone removes roughly a quarter of the source tree.

---

## P1 — Structural moves that pay off most

### P1.1 Catalog.tsx is retired but still shipped in the tree (with its whole test estate)

**Evidence:** `src/App.tsx:14` imports `AppGrid`, never `Catalog`; the only mentions of "Catalog" in app code are comments ("the old Catalog", "the retired Catalog" — `src/AppGrid.tsx:84`, `src/App.tsx:120,197`). `src/Catalog.tsx` (2,006 lines) is imported exclusively by 10 test files: `Catalog.test.tsx` (1,609 lines), `Catalog.dnd.test.tsx` (486), `settings-gear-arrange`, `category-order`, `v13-live-status`, `floating-panel-layout`, `not-monitored`, `v7-visual`, `dark-category-manager`, `recently-opened-row`. Git history (`4c7dce2 Revert #271 — restore App Grid on main`) confirms AppGrid is the live layout.

**Impact:** ~2,000 lines of component code and roughly 3,500–4,000 lines of tests are maintained, type-checked, and run on every CI pass for a UI users never see. Worse, features duplicated between the two (status pulse, favorite toggle, drag-reorder, uptime display) must be understood twice by every new contributor, and behavior drift between the "same" features is already visible (see P2.3).

**Recommendation:** Decide Catalog's fate explicitly. If AppGrid is the layout going forward, delete `Catalog.tsx` and its 10 test files in one commit (git preserves it if the revert saga ever reopens). Before deleting, port any test coverage that actually guards live behavior — `v13-live-status.test.tsx` and `not-monitored.test.tsx` test features that also exist in AppGrid and should be re-pointed at AppGrid, not dropped. If Catalog is deliberately kept as a fallback layout, that intent must be written down (CLAUDE.md / STATUS.md) and the duplicated hooks extracted (P2.3) so the two can't drift. Estimated deletion: **−2,000 LOC app code, −3,500 LOC tests, meaningfully faster CI.**

### P1.2 Flat `src/` with 60+ modules and 55 co-located test files

**Evidence:** every component, hook, pure-logic module, and test sits directly in `src/` (~110 entries). Components (`AppGrid.tsx`), logic (`appGrid.ts`), and their tests (`AppGrid.test.tsx`, `appGrid.test.ts`) are distinguished only by casing — genuinely confusing on a case-insensitive macOS filesystem, where `import './appGrid'` vs `./AppGrid` resolve by luck.

**Recommendation:** Introduce a shallow feature-first structure; imports are all relative one-directory paths today, so this is nearly mechanical:

```
src/
  api/            api.ts (split per P2.4), types.ts
  app/            App.tsx, AppHeader.tsx, StatusBar.tsx, main.tsx
  grid/           AppGrid.tsx (+ extracted subcomponents), appGrid.ts, layout.ts
  launcher/       CommandLauncher.tsx, launcher.tsx, LauncherTrigger.tsx
  library/        LibraryBrowse.tsx, ServiceForm.tsx, SettingsPanel.tsx
  alerts/         alerts.tsx, AlertHistoryPanel.tsx, Toasts.tsx
  theme/          theme.tsx, ThemeControl.tsx, accent.ts, AccentControl.tsx
  lib/            recently-opened.ts, category-ranker.ts, ranker.ts, icons.ts,
                  initials.ts, categoryColor.ts, catLayout.ts
  ui/             shared Modal/Menu primitives (per P2.2)
  test/           setup.ts
```

Keep unit tests co-located next to the file they test inside each folder (current convention, just moved with the module) — the vitest include `src/**/*.test.{ts,tsx}` in `vite.config.ts` covers that unchanged. Import-graph implication: today's graph is wide and flat (everything imports `./api`); after the split, cross-feature imports funnel through `api/` and `lib/`, making ownership visible and accidental cross-feature coupling show up as an ugly `../grid/...` path in review. Do this move *after* P1.1 so you don't relocate 5,500 lines you're about to delete.

### P1.3 `npm run lint` is broken — ESLint isn't installed or configured

**Evidence:** `package.json` defines `"lint": "eslint . --ext .ts,.tsx"`, but `eslint` appears nowhere in `devDependencies`, and no `.eslintrc*` / `eslint.config.*` exists (`npx eslint` downloaded a fresh eslint@10 just to answer `--version`). `--ext` is also a removed flag in flat-config-era ESLint, so even installing it would fail on this script.

**Impact:** whatever CI or contributor runs `npm run lint` either fails or exercises nothing; rules like `react-hooks/exhaustive-deps` are unchecked (real candidates exist: `Catalog.tsx:291` and `:314` have effects with incomplete dependency arrays).

**Recommendation:** add `eslint` + `typescript-eslint` + `eslint-plugin-react-hooks` with a flat config, fix the script, wire it into CI next to `typecheck`. Half-day task, outsized payoff in a hook-heavy codebase.

### P1.4 Infra assertions and source-text greps live inside the component vitest suite

**Evidence:** 16 of 55 test files use `readFileSync` to assert on raw file text: `dockerfile-cachebust.test.ts` and `version-sha-buildarg.test.ts` grep the Dockerfile; `playwright-chrome148-floor.test.ts` asserts package.json version floors; `pwa-icons.test.ts`; and ~10 more (`library-chip-contrast.test.ts`, `dashboard-a11y.test.ts`, `dark-tile-shadow`, `mobile-*`, `design-align-188-191`, `tile-name-suffix-195`) regex-match `src/index.css` for specific rules and values (e.g. `library-chip-contrast.test.ts:24` asserts an HSL lightness ≥70% via regex on the stylesheet).

**Impact:** (a) *Location:* the Dockerfile/Playwright/package.json guards are build-pipeline invariants, not frontend behavior — a frontend contributor's "unit tests" run Docker cache-bust archaeology. (b) *Brittleness:* the CSS-grep tests are coupled to the *textual form* of `index.css`; a harmless refactor (splitting the file, reordering declarations, changing `hsl()` syntax) breaks them without any behavior change — and they will actively resist the CSS split proposed in P3.2.

**Recommendation:** move the infra guards to `tests/infra/` with their own vitest project/environment (`// @vitest-environment node` is already used in `version-sha-buildarg.test.ts:1`), run as a separate CI step. For the CSS-grep tests: their own comments say they exist because "jsdom can't compute contrast" — the honest fix is migrating the contrast/layout assertions into the existing real-Chromium Playwright gate (`playwright.gate.config.ts`, `tests/browser-gate/` already exists for exactly this), keeping only those with no runtime-observable proxy. At minimum, isolate them in one `css-contract/` folder so a stylesheet refactor knows exactly which suite it must update.

---

## P2 — High-value extractions and consistency fixes

### P2.1 Catalog.tsx / AppGrid.tsx internal seams (concrete extraction plan)

Both files interleave four responsibilities: **data/mutation orchestration** (fetch, optimistic update, rollback), **dnd-kit wiring** (sensors, announcements, sortable wrappers), **presentational subcomponents**, and **micro-hooks**. Natural seams, already delimited by comments:

For **AppGrid.tsx** (862 lines, the live one):
- `grid/useBoxMutations.ts` — `onToggleFavorite`, `changeWidth`, `onDragEnd`, `onRenameBox`, `onDeleteBox`, `onCreate` (`AppGrid.tsx:131–240`, ~110 lines). All the same optimistic/rollback idiom; a hook returning them makes AppGrid a ~120-line composition root.
- `grid/BoxCard.tsx` — `BoxCard` + `SortableBox` + `WidthSelector` (`AppGrid.tsx:328–594, 743–781`, ~330 lines). BoxCard tangles three sub-states (renaming, delete-confirm, width) that could each be a tiny child.
- `grid/ToolLink.tsx` — `ToolLink` + `UptimeWindowsLine` + `fmtUptime` + `statusLabel` (`AppGrid.tsx:596–735`, ~140 lines).
- `grid/AddBoxModal.tsx` (`AppGrid.tsx:786–862`, ~75 lines).
- `hooks/useStatusPulse.ts`, `hooks/useViewportWidth.ts` — currently file-private (`AppGrid.tsx:57–65, 616–628`); both are duplicated in Catalog (P2.3).

For **Catalog.tsx**, if it survives P1.1: `useCatalogData` (state + mutations, lines 195–575, ~380 lines), `ServiceTile.tsx` + `TileMenu` (1297–1639, ~340 lines), `CategoryManager.tsx` + `CategoryRow` + `CategorySelect` (1815–2006, ~190 lines), `IconControls.tsx` + `IconSlot` (1664–1809, ~145 lines), `Section`/`SortableSection` (1056–1222, ~165 lines), `UptimeSparkline.tsx` (1230–1295), `RecentlyOpenedRow.tsx` (958–1033). None share module-level state beyond small constants.

### P2.2 The modal/overlay pattern is re-implemented eight times

**Evidence:** `role="dialog" aria-modal="true"` inside a `.launcher-overlay` scrim, with hand-rolled Escape handling, scrim-click-to-close, focus-on-open, and focus-restore, appears in `SettingsPanel.tsx:48–63`, `LibraryBrowse.tsx:113–122`, `ServiceForm.tsx:130–139`, `AlertHistoryPanel.tsx:100–110`, `CommandLauncher.tsx:195–207`, `ChangelogOverlay.tsx:139–140`, `AppGrid.tsx:816–823` (AddBoxModal), plus a second inner modal at `SettingsPanel.tsx:406–413`. Escape handlers exist in 9 components. Each copy differs subtly: AddBoxModal uses `onMouseDown` on the scrim, SettingsPanel uses `onClick`; some restore opener focus (`SettingsPanel.tsx:30–39`), some don't; only SettingsPanel locks body scroll.

**Recommendation:** one `ui/Modal.tsx` (~80 lines) owning scrim, `role`/`aria-modal`, Escape, scrim-dismiss, focus trap/restore, body-scroll lock — each call site shrinks 20–40 lines and a11y behavior stops varying by modal. Same at smaller scale for the popover-menu pattern (Catalog's `TileMenu` "mirrors UserMenu" per its own comment at line 1434; the `pointerup`/suppressed-click `fire()` dance at `Catalog.tsx:1500–1517` is hard-won behavior that should exist once).

### P2.3 Duplicated logic between Catalog and AppGrid is already drifting

**Evidence:** `useStatusPulse` exists twice with different timings — 900ms (`Catalog.tsx:120–132`) vs 700ms (`AppGrid.tsx:616–628`). `statusLabel` twice with different casing — `'Not monitored'` (`Catalog.tsx:109`) vs `'not monitored'` (`AppGrid.tsx:604`). `prefersReducedMotion()` twice. The icon-error fallback twice with different semantics — `handleIconError` clears `onerror` first (`Catalog.tsx:1655–1659`), AppGrid's `onIconError` guards by comparing `src` (`AppGrid.tsx:731–735`). The optimistic favorite toggle is line-for-line duplicated (`Catalog.tsx:349–358` vs `AppGrid.tsx:131–143`).

**Recommendation:** resolved automatically if P1.1 deletes Catalog; otherwise extract `hooks/useStatusPulse.ts`, `lib/status.ts`, `lib/iconFallback.ts` now. Either way `useViewportWidth`/`useFieldCols` (window-resize listeners built three times) belong in one hook.

### P2.4 api.ts — solid layer, but the fetch/result boilerplate is 30 copies of one idea

**Evidence:** `api.ts` (542 lines) is good where it counts: fully typed responses, no `any`, deliberate documented failure semantics per endpoint, a uniform `Result` shape. But all 30 functions hand-write the same `fetch(..., { credentials: 'include', headers: jsonHeaders })` + status-switch. Three response conventions coexist — `boolean`, `Result & { entity }`, and swallow-to-default (`categories`, `listLibrary`) — and only some functions catch network throws (`authConfig:134`, `servicesWithStatus:181`, `getCollapsedCategories:406` do; `setFavorite:197`, `setLayout:434`, and most mutations do NOT — a network drop mid-mutation *rejects* instead of returning `false`, so every caller's optimistic rollback path silently never runs).

**Recommendation:** an internal `request(path, init)` helper that always sets credentials/headers and catches network errors into `{ status: 0 }`, plus adapters for the three conventions. Removes ~150 lines and fixes the unhandled-rejection hole in every optimistic mutation for free. Then split by resource (`api/auth.ts`, `api/services.ts`, `api/categories.ts`, `api/library.ts`, `api/prefs.ts`) with an index re-export — callers don't change.

### P2.5 State management — mostly sane, three smells

Context design is good: `ServicesProvider` owns the single shared `Service[]` with a well-engineered reference-preserving merge-on-poll (`services.tsx:72–96`), and the "nullable context, component self-fetches without a provider" convention aids testability. Smells:

- **Dual-ownership open-state:** Catalog's `browseOpen`/`localBrowseOpen` "both paths coexist" merge (`Catalog.tsx:186–216`) — dies with P1.1, but ban the pattern going forward: one owner per piece of open-state.
- **Prop-drilling through the sortable wrapper:** `SortableBox` exists only to forward 9 identical props to `BoxCard` (`AppGrid.tsx:557–594`). Pass a single `boxActions` object (P2.1's hook return) if box capabilities keep growing.
- **Categories fetched in three places** — App (`App.tsx:115`), AppGrid (`AppGrid.tsx:93`), Catalog (`Catalog.tsx:283`) each do their own `categories()` fetch with no shared cache: double load per page view, and App's `cats` for ServiceForm goes stale after AppGrid renames a box. A `CategoriesProvider` mirroring ServicesProvider (or folding categories into it) closes both.

---

## P3 — Worth doing, lower urgency

### P3.1 TypeScript hygiene: already strong — protect it

`strict: true` + `noUnusedLocals`/`noUnusedParameters` (`tsconfig.json:8–10`); zero `any` in app code and tests. Soft spots: non-null assertions on a `Partial<Category>` in `categories()` (`api.ts:287–292` — a malformed payload becomes `undefined` typed as `string`), and the `listeners: Record<string, unknown>` cast at the dnd boundary (`AppGrid.tsx:319,420` — dnd-kit's `SyntheticListenerMap` would do). Consider `noUncheckedIndexedAccess`.

### P3.2 CSS: a 2,637-line index.css with two competing styling idioms

`index.css` is the largest file in `src/`, nearly section-comment-free (4 headers across 2,637 lines: 5, 898, 1081, 1965). Components split between semantic classes defined there (AppGrid: `.app-grid-box`…) and long inline Tailwind strings (Catalog, App, modals — e.g. the 3-line className at `Catalog.tsx:1549`); `tailwind.config.ts` is barely extended (fonts only). The per-component choice looks historical, not intentional. After the Catalog deletion trims the utility-string usage, split index.css by feature (`styles/app-grid.css`, `styles/launcher.css`, `styles/overlays.css`) — coordinating with the CSS-grep tests (P1.4) which hardcode the `src/index.css` path — and state the rule ("layout system in stylesheet classes, one-off spacing/type in utilities") in CLAUDE.md.

### P3.3 Test suite consistency

Strengths: uniform `vi.mock('./api')` (19 files), single minimal `src/test/setup.ts`, only one file touching global fetch. Weaknesses beyond P1.4: naming mixes component-named (`AppGrid.test.tsx`), issue-named (`design-align-188-191.test.ts`, `tile-name-suffix-195.test.ts`), and version-named (`v7-visual`, `v13-live-status`) files — issue/version names are meaningless without the tracker ("where are the uptime tests?" has three answers). When files move per P1.2, fold issue-named suites into the feature suite they guard, keeping the issue reference in the `describe` string. `Catalog.test.tsx` at 1,609 lines is itself a maintainability problem that P1.1 deletes.

---

## Suggested sequencing

1. **Decide and execute the Catalog question** (P1.1) — everything else gets cheaper after it.
2. **Fix lint** (P1.3) — trivially small, guards the rest.
3. **Quarantine infra/CSS-text tests** (P1.4) into their own suite so refactors stop tripping them.
4. **Directory restructure** (P1.2) as a pure-move commit, tests co-located.
5. **Extract shared Modal + AppGrid seams + api.ts request helper** (P2.1/P2.2/P2.4) incrementally, one PR each.

The codebase's discipline (comments-as-spec, consistent optimistic-update idiom, strict TS) means these are low-risk mechanical refactors — the main thing missing is structure, not quality.
