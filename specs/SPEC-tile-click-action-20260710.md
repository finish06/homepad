# homepad v23 — Per-Tile Click Action

**Spec ID:** SPEC-tile-click-action-20260710
**Created:** 2026-07-10
**Author:** Walt (product lead)
**Status:** Draft — awaiting Kare §8 design section
**Repos:** `Code/homepad` (UI) + `Code/homepad-api` (data model + API)
**Estimate:** ~5–8 hours Stitch
**Target version:** v13.12.0 (feature = minor; v21 → v13.10.0, v22 → v13.11.0)
**Closes issues:** n/a — new feature (file Gitea issues for any gaps during build)

**Prerequisites:**
- **v21 (SPEC v21-tile-edit-modal)** must land first — v23 adds a new field inside
  `TileEditModal`, the component that v21 introduces. Cannot build v23 without
  `TileEditModal` in the codebase.
- **SPEC-245-224** (admin gate on service writes) must also land — required by v21,
  so it's transitively required here.

---

## 1. Problem

Every tile on the homepad dashboard opens its service in a **new browser tab** — the
behavior is hardcoded (`target="_blank"` at `AppGrid.tsx:713`). There is no choice.

Caleb's request: **"When in edit-tile mode, add ability to specify the click action:
(1) open in new tab, (2) open in existing tab, (3) open within an overlay iframe."**

Some services open fine in a tab but are better embedded (e.g., a local monitoring
dashboard kept visible alongside the homepad). Others are navigated to and replaced.
A blanket "always new tab" fits no one perfectly; a per-tile setting lets each
service behave the way that makes sense for it.

---

## 2. Scope

**In scope:**
- New `click_action` column on the `services` table (`new_tab | same_tab | iframe`).
- Runtime routing in `ToolLink` for all three behaviors.
- New `IframeOverlay` modal component (backdrop, close button, Esc, loading state,
  service title in header, graceful fallback for blocked embeds).
- Click-action selector in `TileEditModal` (the v21 component); admin-only, edit mode.
- Backend: migration, `serviceView` wire field, accept on create/update.

**Out of scope:**
- Per-user click-action override (all users see the admin's choice — shared catalog
  model, same as v21 rationale §2).
- Detecting X-Frame-Options / CSP preemptively at admin-config time (browser
  limitation; spec a graceful runtime fallback instead — see §5).
- Click-action on Library items (library is an admin browse/add tool, not a navigable
  tile).

---

## 3. Data Model

### 3.1 New column — `services.click_action`

```sql
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS click_action TEXT NOT NULL DEFAULT 'new_tab'
  CHECK (click_action IN ('new_tab', 'same_tab', 'iframe'));
```

**Default `'new_tab'`** — existing rows are unchanged in behavior after migration.
No backfill pass required; the DEFAULT handles all pre-existing services atomically.

**Migration file:** `homepad-api/migrations/0008_click_action.up.sql` (+ matching
`.down.sql` that drops the column).

**Multi-tenant alignment:**
The `services` table is admin-managed and shared (SPEC-245-224 / Caleb directive
2026-07-02). `click_action` is an admin-set property of the shared service entry. All
users see the same click behavior for a given tile. There is no per-user override
layer for this field (out of scope; see §2). Per-user state (favorites, collapsed
categories, layout) is unchanged.

### 3.2 Backend struct changes (homepad-api)

`internal/storage/storage.go` — `Service` struct:
```go
ClickAction string  // 'new_tab' | 'same_tab' | 'iframe'; always populated (DB default 'new_tab')
```

`ServiceUpdate` partial-patch struct:
```go
ClickAction *string // nil = leave unchanged
```

`internal/api/services.go` — `serviceView` wire type:
```go
ClickAction string `json:"clickAction"` // always present on the wire
```

Mapping in `handleListServices`, `handleCreateService`, `handleUpdateService`: read
`click_action` from the DB row and write it to `serviceView.ClickAction`. Accept
`clickAction` on create/update, validate it is one of the three enum values (400 Bad
Request if not).

### 3.3 Frontend type changes

`src/api.ts` — `Service` type:
```ts
clickAction: 'new_tab' | 'same_tab' | 'iframe';
```

`ServiceInput` type:
```ts
click_action?: 'new_tab' | 'same_tab' | 'iframe';
```

Old `Service` payloads from a pre-migration server will omit `clickAction`. The
`ToolLink` component must treat absent/undefined as `'new_tab'` (safe default,
matches the hardcoded prior behavior).

---

## 4. Edit UI — Click Action Selector in TileEditModal

The `TileEditModal` component (introduced in v21) gains a **"Click action"** field,
visible to admins in edit mode only (non-admins don't see the modal at all — per v21
§5 + §2).

### 4.1 Field placement

Insert **after the URL field and before Description** in `TileEditModal`'s form
body. The click action is URL-adjacent because it controls how the URL is navigated.

### 4.2 Control type and copy

A **segmented control** (three-button toggle; or a `<select>` if the design system
makes a segmented control costly — defer the choice to Kare §8):

| Value | Label | Sub-label / hint |
|---|---|---|
| `new_tab` | **New tab** | Opens in a new browser tab *(default)* |
| `same_tab` | **Same tab** | Navigates this tab to the service |
| `iframe` | **Inline overlay** | Embeds the service in an overlay panel |

The hint copy is shown as a small line below or inside the control — exact layout
per Kare §8.

The "Inline overlay" option should carry a brief caveat inline: *"Some sites block
embedding — a fallback link appears if that happens."* (one short sentence; do not
hide this.)

### 4.3 Default state

When the modal opens for an existing service, the control reflects the saved
`click_action`. For a service that pre-dates migration (or a server returning no
`clickAction`), treat it as `'new_tab'` and leave the control on New tab.

On **save**, include `click_action` in the PATCH payload only when the value has
changed (same pattern as `categoryId` in `ServiceForm.tsx`). No-op patches are
avoided.

---

## 5. Runtime Click Behavior

`ToolLink` in `AppGrid.tsx` currently always renders an `<a>` with
`target="_blank"`. With this spec, it branches on `service.clickAction`:

### 5.1 `new_tab` (default)

Unchanged from today:

```html
<a href={service.url} target="_blank" rel="noreferrer noopener" …>
```

`rel="noreferrer noopener"` is required — do not remove it for new-tab links.

### 5.2 `same_tab`

```html
<a href={service.url} …>  <!-- no target attribute -->
```

The browser navigates the current tab to `service.url`. No `rel` restrictions needed
(same-origin navigation does not leak referrer context through `noopener`). If the
URL is external, standard browser behavior applies.

### 5.3 `iframe` — Inline Overlay

Clicking the tile **intercepts navigation** and opens `IframeOverlay`:

```tsx
<a
  href={service.url}
  onClick={(e) => { e.preventDefault(); openIframeOverlay(service); }}
  …
>
```

`href` remains set so right-click → "Open link in new tab" still works (the
accessible name + `href` must be present even when the click is overridden).

The `IframeOverlay` component is described in §5.4.

### 5.4 `IframeOverlay` component

A full-screen (or near-full-screen) backdrop modal. Structure:

```
┌──────────────────────────────────────────────────────────┐
│  [←]  <Service Name>                          [✕ Close] │  ← header bar
│──────────────────────────────────────────────────────────│
│                                                          │
│               <iframe src={url} …/>                      │  ← content
│          (or: loading spinner / error panel)             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Header:** Service name (tile title) + a close button (`✕` or an ✕ icon) in the
top-right corner. The header must have sufficient height and contrast (Kare §8
governs exact values).

**iframe attributes:**
```html
<iframe
  src={service.url}
  title={service.name}
  loading="lazy"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
/>
```

`sandbox` is permissive enough for most self-hosted apps while preventing
top-navigation and plugins. Adjust if specific apps require additional permissions
(that is a runtime concern for the admin, not a spec decision).

**Close affordances:**
- Close button in header (always visible).
- Click / tap the backdrop outside the panel.
- Keyboard `Esc` closes (attach a `keydown` listener on mount, remove on unmount).

**Loading state:** Show a spinner centered in the iframe area from the moment
the overlay opens until the iframe's `onLoad` fires (or the fallback timeout
triggers — see §5.5). Do not show a blank white rectangle.

**Responsive sizing:** On desktop, the overlay panel should fill ≥90% of the
viewport width and ≥90% of viewport height, giving the embedded service maximum
real estate. On mobile (≤640px), it should fill the full viewport width and an
appropriate viewport height. Exact values and scrollbehavior per Kare §8.

### 5.5 Iframe Fallback — Blocked Embeds

Many services block embedding via `X-Frame-Options: DENY/SAMEORIGIN` or
`Content-Security-Policy: frame-ancestors 'self'`. The browser silently renders a
blank iframe; there is no reliable cross-browser event that fires on block.
`onLoad` fires even when the frame is blocked (the browser loads an internal error
page into the frame, not the service).

The spec must handle this honestly:

**Fallback trigger:** Start a 5-second countdown when the overlay opens. If the
iframe's `onLoad` does NOT fire within 5 seconds, show the fallback panel (the
iframe may be blocked or the service may be slow). If `onLoad` fires within 5
seconds, clear the countdown and hide the spinner — content is assumed to have
loaded.

**Fallback panel (replaces the iframe area):**

> **This site can't be embedded**
> Some sites block display in an embedded frame.
>
> [Open in new tab ↗]

The "Open in new tab" button opens `service.url` with `target="_blank"`. The panel
does NOT auto-close the overlay — the user may dismiss it manually or click through.

**Why 5 seconds?** Self-hosted services on LAN should load well within 5 seconds.
A block manifests as an indefinitely blank frame; 5 seconds is short enough to
surface the fallback promptly without false-positiving on a slow-loading legitimate
embed.

**Admin guidance (shown in TileEditModal, §4.2):** *"Some sites block embedding — a
fallback link appears if that happens."* This is the only user-visible documentation
needed; a separate settings page or warning on save is out of scope.

---

## 6. Acceptance Criteria

### AC-001 — Default: new_tab for all existing tiles
All services that existed before migration 0008 run have `click_action = 'new_tab'`
after the migration. Their tiles open in a new tab exactly as before. No visual
change, no behavior change for migrated rows.

### AC-002 — Default on new services
A service created without specifying `click_action` (via the API or TileEditModal)
defaults to `new_tab`. The edit form shows "New tab" as the selected option.

### AC-003 — `new_tab` behavior
Clicking a tile whose `click_action = 'new_tab'` opens the service URL in a new
browser tab. The current tab is not navigated. The link carries
`rel="noreferrer noopener"`.

### AC-004 — `same_tab` behavior
Clicking a tile whose `click_action = 'same_tab'` navigates the current browser tab
to the service URL. The homepad app is replaced by the service in the same tab.

### AC-005 — `iframe` behavior: overlay opens
Clicking a tile whose `click_action = 'iframe'` opens the `IframeOverlay` modal.
The modal contains:
- A header with the service's tile title and a close button.
- A loading spinner while the iframe loads.
- The service rendered in an `<iframe>` once loaded.

The current page (homepad grid) is visible behind the backdrop and does not scroll
or navigate.

### AC-006 — `iframe` behavior: close affordances work
The overlay closes on: (a) clicking the close button; (b) pressing `Esc`;
(c) clicking/tapping the backdrop outside the panel.

### AC-007 — `iframe` behavior: right-click still works
Right-clicking (or long-pressing on mobile) a tile with `click_action = 'iframe'`
offers "Open link in new tab" (or equivalent) via the native browser context menu,
because the `<a href={url}>` is still present in the DOM.

### AC-008 — Iframe fallback: blocked site
When the iframe's `onLoad` does not fire within 5 seconds of the overlay opening,
the iframe area is replaced by the fallback panel: a message ("This site can't be
embedded") and an "Open in new tab" button that opens `service.url` in a new tab.

### AC-009 — Iframe fallback: successful load clears timeout
When the iframe's `onLoad` fires within 5 seconds, the spinner is hidden, the
fallback timeout is cleared, and no fallback panel is shown.

### AC-010 — Edit form: selector visible and functional
In admin edit mode, opening the TileEditModal for any tile shows a "Click action"
control with three options: "New tab", "Same tab", "Inline overlay". The currently
saved `click_action` is reflected in the control on open.

### AC-011 — Edit form: change persists
Changing the click action in TileEditModal and saving causes the tile to use the new
behavior immediately (without a full page reload). A subsequent modal open reflects
the saved value.

### AC-012 — Edit form: non-admins do not see the selector
Non-admin users cannot open TileEditModal (per v21 §5 — pencil affordance is
admin + edit mode only). The `click_action` field is never shown to non-admins.

### AC-013 — Multi-tenant: shared catalog
`click_action` is stored on the shared service row (not per-user). After an admin
changes a tile's click action, ALL logged-in users see the new behavior on their
next tile click (or after the next services poll refresh).

### AC-014 — Backwards compatibility: old API clients
A `Service` object returned by a pre-migration server (no `clickAction` field) is
treated as `'new_tab'` by the frontend. No crash or blank screen.

---

## 7. Out-of-Scope Decisions (explicit)

- **Per-user click-action preference.** If a user wants iframe but the admin set new
  tab, that user cannot override it in v23. A future per-user override spec (requires
  a `service_overrides` table) could address this.
- **Pre-load iframe-compatibility check.** Detecting whether a URL will embed
  successfully before the user opens the overlay is not reliably possible in the
  browser. The fallback (§5.5) is the correct approach.
- **`sandbox` attribute fine-tuning per service.** If a specific service needs
  `allow-top-navigation` or similar, that is a future config field.
- **Mobile-app-like "back" button.** The overlay's `[←]` in the wireframe is
  cosmetic copy only (close behavior is identical to `✕`). A real browsing-history
  back stack inside the overlay is out of scope.

---

## 8. §8 — Design Section (Kare — REQUIRED before build)

> **[AWAITING KARE §8]**
>
> This spec has two UI surfaces requiring design sign-off before Stitch builds:
>
> 1. **Click-action selector in TileEditModal** — segmented control vs. dropdown,
>    exact label/hint copy, spacing, keyboard/touch interaction, and how the inline
>    caveat ("some sites block embedding") is styled.
> 2. **IframeOverlay component** — header bar layout (service name + close button),
>    overlay dimensions (desktop vs. mobile), backdrop opacity, loading spinner
>    treatment, fallback panel copy and button placement, Esc focus-trap behavior,
>    responsive breakpoints, and animation (open/close transition or none per
>    prefers-reduced-motion).
>
> Kare: please read `Code/design-system` and produce a §8 design section covering
> both surfaces. The iframe overlay is a net-new modal pattern — it should feel
> consistent with the launcher/library modal family (same chrome as `launcher-panel`
> if possible) while being clearly a "host" container for an embedded service, not a
> navigation step.

---

## 9. Product Sign-Off

**Walt (product lead):** _awaiting Kare §8_

Spec is **not cleared for build** until both sign-offs are recorded here.

---

## 10. Stitch Build Checklist

### homepad-api

- [ ] **Migration** `migrations/0008_click_action.up.sql` — `ALTER TABLE services ADD COLUMN click_action TEXT NOT NULL DEFAULT 'new_tab' CHECK (...)`.
- [ ] **Migration down** `migrations/0008_click_action.down.sql` — `ALTER TABLE services DROP COLUMN click_action`.
- [ ] **`storage.Service` struct** — add `ClickAction string` field.
- [ ] **`storage.ServiceUpdate` struct** — add `ClickAction *string` field.
- [ ] **`ListServices` query** — `SELECT` + `Scan` include `click_action`.
- [ ] **`CreateService`** — accept + insert `click_action`; default `'new_tab'` if not provided.
- [ ] **`UpdateService`** — accept + apply `ClickAction` in the COALESCE patch.
- [ ] **`serviceView` struct** — add `ClickAction string \`json:"clickAction"\``.
- [ ] **`handleListServices`** — map `sv.ClickAction` to `serviceView.ClickAction`.
- [ ] **`handleCreateService` / `handleUpdateService`** — parse `clickAction` from JSON body; validate enum (`new_tab | same_tab | iframe`), return 400 if invalid.
- [ ] **Tests** — `TestListServices` asserts `clickAction` is present; `TestUpdateService` asserts change persists; invalid enum returns 400.

### homepad (frontend)

- [ ] **`src/api.ts` — `Service` type** — add `clickAction: 'new_tab' | 'same_tab' | 'iframe'`.
- [ ] **`src/api.ts` — `ServiceInput` type** — add `click_action?: 'new_tab' | 'same_tab' | 'iframe'`.
- [ ] **`src/api.ts` — `updateService`** — include `click_action` in the PATCH payload when provided.
- [ ] **`AppGrid.tsx` — `ToolLink`** — replace unconditional `target="_blank"` with a branch:
  - `new_tab` (or absent): current `<a target="_blank" rel="noreferrer noopener">`.
  - `same_tab`: `<a>` with no `target`.
  - `iframe`: `<a href={url} onClick={(e) => { e.preventDefault(); openOverlay(); }}>`.
- [ ] **New `IframeOverlay` component** (`src/IframeOverlay.tsx`):
  - Props: `service: Service`, `onClose: () => void`.
  - Header bar: title + close button.
  - `<iframe>` with `title`, `loading="lazy"`, `sandbox` attributes.
  - Loading spinner until `onLoad` or 5s timeout.
  - Fallback panel on timeout (copy: §5.5).
  - Esc keydown listener + backdrop onClick to close.
  - Focus trap while open (per design-system a11y pattern).
  - prefers-reduced-motion aware (per Kare §8).
- [ ] **`TileEditModal.tsx` (v21 component)** — add click-action selector:
  - State: `clickAction` initialized from `service.clickAction ?? 'new_tab'`.
  - Segmented control (or `<select>` per Kare §8) with three values.
  - Inline caveat for `iframe` option.
  - Include `click_action` in the PATCH payload on save (only when changed).
- [ ] **Backwards compat** — treat `service.clickAction === undefined` as `'new_tab'` in `ToolLink` and `TileEditModal`.
- [ ] **Tests**:
  - `AppGrid.test.tsx` — tile with `new_tab` renders `target="_blank"`; `same_tab` renders no target; `iframe` click opens overlay (mock `IframeOverlay`).
  - `IframeOverlay.test.tsx` — renders header title; Esc closes; close button closes; backdrop closes; fallback panel appears after 5s timeout (fake timers); "Open in new tab" button in fallback has correct `href`.
  - `TileEditModal.test.tsx` (or `ServiceForm.test.tsx`) — selector visible; change + save PATCHes with correct `click_action`; non-admin does not see modal (per v21 tests).

---

## 11. Notes for Joe

- **Pipeline:** v21 → v22 → v23. Stitch cannot start v23 until v21 is cleared and
  built. Joe should dispatch Stitch for v23 only after `TileEditModal` is in `main`.
- **Kare dispatch:** I am dispatching Kare now (see §8) for the design section
  concurrently with this spec. Kare's task subject: `friend.kare.task.<task_id>`.
- **No new backend API endpoints.** `click_action` rides existing
  `GET/PATCH /api/services` — no new routes.
- **SemVer:** patch for migration-only = no, minor feature = yes. v13.12.0.
