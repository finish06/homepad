# Spec: UI quick wins from the 2026-11-24 review

**Spec ID:** SPEC-ui-quick-wins
**Version:** 0.2.0
**Created:** 2026-11-25
**Author:** Claude (Caleb asked 2026-11-25 to write up M10)
**Status:** Approved — 2026-11-25 (Caleb's answers are in §7). Not built. Kare checks the DOWN and DEGRADED shapes on a real screen during the build
**Supersedes (members only):** `v18-gear-edit-menu.md` A2 and D4, which show "Add apps" to every user. Since 18.0.0 adding is admin-only on the server, so members lose the item (AC-017). `v29-favorite-star-arrange-only.md` AC-005 ("Arrange apps" for everyone) is unchanged.
**Repo:** `Code/homepad` (web app at the root; no `api/` changes)
**Issues:** #725
**Target version:** 18.7.0
**Milestone:** M10

---

## 1. Overview

Seven small UI items from the 2026-11-24 review. Each can ship on its own. None adds a new screen and none needs an API change.

1. Browser chrome follows the theme: `theme-color` and `color-scheme`.
2. "Updated Xs ago" in the header refreshes status when you click it.
3. Toasts pause on hover or focus, can be dismissed, and status toasts get a "View" action.
4. The Gear menu gets the same arrow-key model as the user menu.
5. DOWN and DEGRADED tile pips differ by shape, not only by colour.
6. The App Library groups offers by category and gets an Added filter.
7. Sign-in polish: show/hide password, a Caps Lock hint, and errors that re-announce.

## 2. Checked against the code (main at `f32a4b0`)

| Issue claim | What the code says | Effect on this spec |
|---|---|---|
| 1. `index.html:20` hardcodes `theme-color` `#6366F1`; no `color-scheme` | True. `#6366F1` is the retired v14 indigo; the default accent is blue (`src/theme/accent.ts`). `public/manifest.webmanifest` has the same `theme_color`. No `color-scheme` anywhere in `src/` or `index.html`. | Kept. The manifest is static and is only the install-time colour; left alone (§6). |
| 1. Inline theme script | Its sha256 is in `script-src` in `nginx-security-headers.conf` and in the homelab ConfigMap line (SPEC-cleanup-18.6.0 §7). `tests/infra/frame-headers.test.ts` fails if any inline script's hash is missing from the policy, and if the §7 line differs from the snippet. The hash covers the script body only, so the `<meta>` tags can change without moving it. | AC-003. All new code is in bundled files. |
| 2. `ServicesProvider.refresh()` exists, only the STALE panel uses it | True (`src/services.tsx` `refresh`, `src/app/StatusBar.tsx` `retryNow`). `refresh()` does **not** de-dupe: two calls send two `POST /api/status/refresh`. Only `StatusBar` guards itself with its own `retrying` flag. | Kept. The de-dupe goes in the provider (AC-005), so the header and the panel share one call. |
| 2. Label is in the header | True, but it is `hidden sm:inline` (not shown on phones) and the kid header does not render it at all. `POST /api/status/refresh` is kid-forbidden. | Phones keep the health panel's "Retry now". Kids are unaffected. |
| 3. Toasts auto-dismiss after 4s, no close button (`Toasts.tsx:62-68`) | True; the timer is at `Toasts.tsx` lines 62–68. cap5 §"Out of scope" listed "click to navigate" as out. Toasts never render for kids (`App.tsx`: `!isKid && <ToastContainer />`). | Kept. This spec supersedes that one cap5 out-of-scope line. 4s stays (cap5 AC-006). |
| 4. GearMenu only focuses the first item | Partly wrong. GearMenu already has Escape-closes-and-returns-focus (`AppHeader.tsx` `GearMenu`). It lacks arrow keys. UserMenu's arrow handler only walks `role="menuitem"`, and Gear's "Arrange apps" is `role="menuitemcheckbox"`, so a straight copy would skip it. | Kept, narrowed to arrows, Home/End and the checkbox item. |
| 5. Large is colour + glow only; CSS at `index.css:3438-3464` | Line numbers drifted: the pip is `.app-grid-tool-status` at about `index.css:4062-4125`. DOWN also breathes (off under reduced motion), and DOWN/DEGRADED tiles get a left bar, which is colour again. Compact and List show a status word; Large does not. | Kept. The pip is one element at every density, so the shape applies everywhere. |
| 6. Library is a flat list with category chips | True. The chips are per-row labels, not filters. Also found: `POST /api/library/{id}/add` and `POST /api/services` are `classCatalogWrite` (admin only since 18.0.0), but the Gear's "Add apps" opens the Library for members too. A member's Add click gets 403 and the UI shows nothing. | Kept. Decided (§7 Q3): members lose "Add apps" in the Gear (AC-017, Must). |
| 7. Add `role="alert"` on the sign-in error | Already done. Both error lines in `src/app/AuthForm.tsx` (SSO error and form error) have `role="alert"`. The gap is different: a second failure with the same text leaves the same node in place, so many screen readers stay silent. | Replaced by AC-020 (re-announce). |

## 3. Design notes

### 3.1 Browser chrome (item 1)

- `color-scheme` goes in `src/index.css`: `:root { color-scheme: light }` and `.dark { color-scheme: dark }`. It follows the `dark` class, which the inline script sets before paint and `ThemeProvider` keeps in sync. No new JS is needed for it.
- `theme-color` is set from a new `src/theme/browserChrome.ts`. It reads the resolved page background (`--bg-1` on `<html>`) and writes it to the existing `<meta name="theme-color">`. `ThemeProvider` calls it after it toggles `dark`, and `applyAccent` calls it after it sets `data-theme` (the field colour depends on both).
- The `<meta>` in `index.html` stays as the pre-JS value. Editing a `<meta>` does not move the script hash, but nothing here needs to.

### 3.2 Freshness label (item 2)

- For admins and members the label becomes a `<button>`. Visible text stays "Updated Xs ago". Accessible name: "Updated Xs ago. Refresh status".
- While a refresh runs it shows "Refreshing…", has `aria-busy="true"` and is disabled.
- The outcome goes to a polite live region: "Status refreshed", "Couldn't reach the status source", or "Checked — nothing newer yet". These map to `refreshed`, `unreachable`, `still-stale`.
- `refresh()` in the provider keeps one in-flight promise and hands it to every caller until it settles.

### 3.3 Toasts (item 3)

- Hovering or focusing a toast pauses its timer. Leaving resumes it with the time that was left.
- Each toast gets a dismiss button ("Dismiss", 24×24 minimum).
- Status-change toasts (all toasts today) get a "View" button that opens the alert history panel and closes the toast (decided, §7 Q2). The panel's open state lives in `App.tsx` (`alertOpen`), so `ToastContainer` gets an `onView` prop from `App.tsx`.
- If a focused toast closes, focus goes to the next toast's dismiss button, or else to the alert bell.

### 3.4 Gear menu (item 4)

- Move the arrow logic out of `UserMenu.tsx` into a shared hook, `src/ui/useMenuKeys.ts`. It walks `[role="menuitem"], [role="menuitemcheckbox"]`, wraps at the ends, and handles Home and End.
- UserMenu keeps its theme group out of the arrow order (it is a `role="group"` reached by Tab).

### 3.5 Status pip shape (item 5)

- UP and UNKNOWN stay solid circles. NOT_MONITORED stays the only hollow, dashed shape (SPEC-242 AC-017, D-5).
- DOWN becomes a diamond (the 9px box rotated 45°, small radius). DEGRADED becomes a rounded square. Both keep the box-shadow ring and glow, so no `clip-path` (it would clip the shadow).
- Fill colours, the 1px definition ring and the glow keep the values pinned by SPEC-242 D-2/D-3. The shared `.status-dot` (⌘K rows, alert history; SPEC-ui-cleanup-18.3.0 AC-001/002) is not touched.
- Tile icon hue is not touched (#352, `DECISIONS.md` 2026-11-24).
- The shape pair is decided (§7 Q4). Kare checks it on a real screen during the build.

### 3.6 App Library (item 6)

Who sees what, under the 18.0.0 roles:

| Role | Library today | After this spec |
|---|---|---|
| admin | Opens from Gear "Add apps" and the empty-dashboard button. Can add, add again, add a custom app, manage the library. | Same, plus groups and the filter. From an empty box the Library opens with that box as its target (SPEC-dashboard-empty-loading §3.3). |
| member | Opens from Gear "Add apps". `GET /api/library` works. Add and "+ Add a custom app" are admin-only server-side and fail silently. | No "Add apps" in the Gear and no other way into the Library (AC-017, decided §7 Q3). Empty boxes and the empty dashboard tell a member to ask an admin (SPEC-dashboard-empty-loading AC-009, AC-012). |
| kid | No Library, no Gear (SPEC-kid-accounts AC-008). `GET /api/library` is 403. | Unchanged. |

- Offers are grouped under a heading per `suggestedCategory`, with a count: "Media (4)". Offers with no category go in "Other", last.
- Groups come in the order of each group's first offer in the admin's library order. Inside a group, library order holds.
- "Added" means the offer is on the household dashboard (SPEC-household-catalog-owner AC-014).
- A filter row above the list: **All · Not added · Added**, a radio group. It combines with the text filter. Groups with no match are hidden, and counts show what is visible.
- Group headings keep the category hue from the row chips (#90). Rows keep their chips.
- The groups only sort the list; they never pick where an app lands. SPEC-dashboard-empty-loading §3.3 adds an optional target box and the heading "Add to {title}". With a target, every Add goes to that box whatever group the offer is under; without one, adds go to Uncategorized as today. Both specs change `src/library/LibraryBrowse.tsx`; the milestone file plan says who builds first.

### 3.7 Sign-in (item 7)

- The password field gets a "Show password" / "Hide password" button (`type="button"`, `aria-pressed`, 44×44). The value, caret and focus stay in the field.
- The button sits outside the `<label>`. Today the label wraps the input; the label gets `htmlFor` and the input an `id`, so the button's text does not join the field's name.
- A "Caps Lock is on" hint shows under the field while the field has focus and `getModifierState('CapsLock')` is true. It is linked by `aria-describedby` and is in a polite live region.
- Applies to `AuthForm` (sign-in, register, setup). The glass styling and 44px targets stay.

## 4. Acceptance criteria

| ID | Item | Criterion | Priority |
|----|------|-----------|----------|
| AC-001 | 1 | `<meta name="theme-color">` holds the resolved page background, and it changes when the theme pref, the OS theme (pref = system) or the accent changes. | Must |
| AC-002 | 1 | The computed `color-scheme` of `<html>` is `dark` when it has the `dark` class and `light` otherwise, from the first paint (before React mounts). | Must |
| AC-003 | 1 | The inline script in `index.html` is byte-for-byte unchanged. `tests/infra/frame-headers.test.ts` ("every inline script in the BUILT index.html is hash-listed", "the source index.html hashes the same", "the homelab ConfigMap block in the spec carries the same line (§7)") passes with no edit to `nginx-security-headers.conf`, the other nginx configs or SPEC-cleanup-18.6.0 §7. | Must |
| AC-004 | 2 | For admins and members, the header "Updated Xs ago" is a button. Clicking it, or Enter/Space, calls `refresh()`. | Must |
| AC-005 | 2 | While a refresh is in flight, more `refresh()` calls (from the header or the health panel) send no second `POST /api/status/refresh` and resolve to the same outcome. | Must |
| AC-006 | 2 | While in flight the label shows "Refreshing…", is disabled and `aria-busy`. The outcome is announced politely in words for each of `refreshed`, `unreachable`, `still-stale`. The freshness rules of SPEC-v24 §12.3 hold (no counter reset unless refreshed). | Must |
| AC-007 | 3 | A toast's timer pauses while it is hovered or has focus inside it, and resumes with the time left when both end. A toast never closes while hovered or focused. | Must |
| AC-008 | 3 | Every toast has a labelled dismiss button of at least 24×24px that closes it at once. If focus was in the toast, it moves to the next toast's dismiss button, or else to the alert bell. | Must |
| AC-009 | 3 | Status-change toasts have a "View" button that opens the alert history panel and closes the toast. | Should |
| AC-010 | 4 | In both the Gear menu and the user menu, ArrowDown/ArrowUp move focus through every item (including `menuitemcheckbox`) and wrap; Home/End go to the first/last item; Escape closes and returns focus to the trigger. Both menus use one shared hook. | Must |
| AC-011 | 4 | The user menu's theme group stays out of the arrow order, and every existing `UserMenu.test.tsx`, `gear-menu.test.tsx` and `gear-arrange-apps.test.tsx` case passes unchanged, except the two member "Add apps" cases that AC-017 reverses: `gear-menu.test.tsx` "non-admin also sees Add apps" and `gear-arrange-apps.test.tsx` TC-006. | Must |
| AC-012 | 5 | The tile pip draws DOWN and DEGRADED as two shapes distinct from each other and from the UP/UNKNOWN circle. All are solid; NOT_MONITORED stays the only hollow shape. The pip box (9px, top-left 8/8), fills, ring and glow values from SPEC-242 D-2/D-3 are unchanged, so `app-grid-status-dot.spec.ts` and `status-dot-shared-262-263.spec.ts` pass. | Must |
| AC-013 | 5 | The pip's `role="img"` and `aria-label` ("status: …") are unchanged, the DOWN breathe still stops under reduced motion, and no tile moves or changes size at any density. | Must |
| AC-014 | 6 | Library offers are grouped under a heading per suggested category with a visible count; uncategorized offers are in "Other", last; group and row order follow §3.6. | Must |
| AC-015 | 6 | An All / Not added / Added radio group filters the list together with the text filter. Empty groups are hidden and counts match what is shown. Adding an offer under "Not added" moves it out of that view and announces "… added" as today. | Must |
| AC-016 | 6 | Tab order follows the visual order (filter, then groups top to bottom), the dialog focus trap still works, and jest-axe finds no violations. | Should |
| AC-017 | 6 | A member never sees an add control that the server refuses: no "Add apps" in a member's Gear menu (decided, §7 Q3), and no other entry point to the Library's Add buttons. A member still sees "Arrange apps" (SPEC-v29 AC-005 stands). This supersedes v18-gear-edit-menu A2 and D4 for members only; admins are unchanged. | Must |
| AC-018 | 7 | The show/hide button switches the password field between `password` and `text` without clearing it, keeps focus and caret in the field, and is not part of the field's accessible name. | Must |
| AC-019 | 7 | While the password field has focus and Caps Lock is on, "Caps Lock is on" shows, is linked by `aria-describedby`, and is announced; it goes away when Caps Lock goes off or the field loses focus. | Should |
| AC-020 | 7 | A second failed sign-in with the same error text is announced again (the alert node is replaced, not reused). | Should |

## 5. Test plan

Each AC with code has a test that fails before its change.

| AC | Test file |
|---|---|
| AC-001 | `src/theme/browserChrome.test.ts` (new; pref, OS flip, accent change). `tests/browser-gate/ui-quick-wins-725.spec.ts` reads the meta in a real browser for light and dark. |
| AC-002 | `tests/browser-gate/ui-quick-wins-725.spec.ts`: computed `color-scheme` with `colorScheme: 'dark'` and `'light'`, checked before and after the app mounts. |
| AC-003 | `tests/infra/frame-headers.test.ts` (existing cases, unchanged). |
| AC-004, AC-006 | `src/app/v13-live-status.test.tsx` (button, busy, three outcomes). |
| AC-005 | `src/services.refresh.test.tsx` (two concurrent calls, one POST). |
| AC-007, AC-008, AC-009 | `src/alerts/Toasts.test.tsx` (fake timers for pause and resume; dismiss; View calls `onView` and closes the toast). `src/app/App.overlay-wiring.test.tsx` (View opens the alert history panel). `tests/browser-gate/ui-quick-wins-725.spec.ts` for real hover and focus return. |
| AC-010 | `src/app/gear-menu.test.tsx` and `src/app/UserMenu.test.tsx`. `tests/browser-gate/ui-quick-wins-725.spec.ts` for real focus movement. |
| AC-011 | `src/app/UserMenu.test.tsx`, `src/app/gear-menu.test.tsx`, `src/app/gear-arrange-apps.test.tsx` (existing cases, unchanged except the two AC-017 reversals). |
| AC-012, AC-013 | `tests/browser-gate/ui-quick-wins-725.spec.ts` (computed `transform`/`border-radius` per state, box size, tile rects at Large, Compact, List). Existing `tests/browser-gate/app-grid-status-dot.spec.ts` and `status-dot-shared-262-263.spec.ts` must pass unchanged. |
| AC-014, AC-015, AC-016 | `src/library/LibraryBrowse.test.tsx` (grouping and filter, with and without a target box). |
| AC-017 | `src/app/gear-menu.test.tsx`: the case "non-admin also sees Add apps" is rewritten to assert a member sees no `gear-add-apps`, and an admin case keeps it. `src/app/gear-arrange-apps.test.tsx`: TC-006 is rewritten to assert a member sees Arrange apps and not Add apps, with a comment naming this spec as the reversal, the same way it already names v29. |
| AC-018, AC-019, AC-020 | `src/app/AuthForm.test.tsx`. `tests/browser-gate/ui-quick-wins-725.spec.ts` for caret and focus on toggle. |

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`.

## 6. Out of scope

- Any edit to the inline script in `index.html`, the CSP, or the homelab ConfigMap.
- `public/manifest.webmanifest` `theme_color` (static, install-time only).
- Showing the freshness label on phones.
- Changing the 4s toast time, the 3-toast cap, or adding non-status toasts.
- The shared `.status-dot` (⌘K rows, alert history), tile left bars, and tile icon hue (#352).
- A status word on Large tiles (it would change tile height).
- Password fields outside `AuthForm` (`JoinScreen`, `ResetPasswordScreen`, `ChangePassword`).
- Any API change, including letting members add from the Library.

## 7. Open questions — decided

Decided by Caleb on 2026-11-25 (`specs/DECISIONS.md`). The ACs use these answers.

1. **What colour does `theme-color` take?** Decided: the page background (`--bg-1`), so the browser bar blends with the page. Not the accent.
2. **Where does a toast's "View" go?** Decided: it opens the alert history panel. It always works, even when the tile is filtered out or off screen. It does not scroll to the tile.
3. **What does a member get from the Library?** Today a member can open it but every add fails without a message. Decided: a member's Gear menu has no "Add apps", as kids are already kept from controls that 403 (AC-017). No read-only Library for members.
4. **Which shapes for DOWN and DEGRADED?** Decided: DOWN a diamond, DEGRADED a rounded square, both in the same 9px box so ring and glow stay intact. Kare checks them on a real screen during the build.
