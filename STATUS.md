# homepad (web) — STATUS

_Newest on top. `NEEDS JOE:` marks a blocker or decision for Joe._

## 2026-06-10 — A6 admin ADD / EDIT app UI (test-first)

Closes the v1 **A6** gap: the web could only *delete* a service; now an admin can
**create** and **edit** catalog entries in the browser. Branched `feat/a6-admin-ui`
off latest `main`. Backend CRUD (`POST /api/services`, `PATCH /api/services/{id}`)
was already complete + tested — this is web-only.

**Shipped**
- **`api.ts`** — `createService(input)` → `POST /api/services` (201 → created
  service); `updateService(id, patch)` → `PATCH /api/services/{id}` (200 →
  updated service). Both return `Result & { service? }` (like `login`), surfacing
  the server's message inline on failure (403 forbidden / 409 slug collision /
  400 missing-required — the backend returns **400, not 422**, for empty
  required fields; the inline path handles any non-success status's body either
  way). New `ServiceInput` type keys the wire fields incl. snake_case `gatus_key`.
- **`ServiceForm.tsx`** (new) — one form for both add and edit (passing a
  `service` = edit, prefilled). Fields: name, slug, url, description, icon (full
  URL), gatus_key. Client-side required-field validation (name/slug/url) shows an
  inline error before any request; server errors render inline too. Reuses the
  AuthForm card/label/input idiom.
- **`Catalog.tsx`** — admin **+ Add app** affordance (edit mode) above the grid
  (also shown on the empty-state so the first app can be added); per-tile **Edit
  app** button alongside Delete. On success the list reflects the change with no
  refetch — create appends, edit replaces in place.

**Two correctness traps handled (and why):**
- The create/update response serializes `favorite/iconLight/iconDark` as their
  zero values (the server only populates those on the *list* endpoint). So an
  edit **merges** — it keeps the existing favorite star + icon flags rather than
  letting the response's `false` clobber them. Covered by a test.
- The API **never returns `gatus_key`** (it stays server-side, resolved into
  `status`). So the edit form can't prefill it: it starts blank and a blank key
  is **omitted** from the PATCH (the existing key is preserved). Typing a value
  sets/changes it. **Limitation:** the UI can't *clear* an existing gatus_key or
  show its current value — acceptable for v1; flag if Joe wants a clear control.

**Tests (vitest, all green):**
- `api.test.ts` — createService (success body+payload, 409, 403) and
  updateService (success, 409). +5 cases.
- `Catalog.test.tsx` — add (success → POST payload incl. gatus_key + tile
  appended; 409 collision inline; required-field validation blocks submit) and
  edit (prefill → PATCH omits blank gatus_key + favorite preserved; gatus_key
  included only when typed). +5 cases.

**Build/test state:** `npm run build` clean (tsc + vite) · `vitest run`
**85/85** green · A11 intact — the no-gatus-leak sentinel URL
(`gatus.10.17.2.213.nip.io`) is absent from `dist/`. (The new `gatus_key` field
name + "Gatus key" label are API/UI text, not the monitoring URL.)

A6 is now **UI-complete + tested**: create / edit / delete all in the browser.

## 2026-06-10 — icon field is now a FULL URL (was selfh.st slug)

Design change: the service `icon` text field holds a **full URL** (any image
URL the admin provides), not a selfh.st slug. Branched `feat/icon-url` off
latest `main`. Backend needed **no** change (`services.icon` is already free
text); this is web + spec only. Test-first.

**Shipped**
- **`icons.ts` `iconSrc`** — precedence chain **unchanged** (uploaded
  light/dark variant → `service.icon` → `DEFAULT_ICON`), but the `service.icon`
  step now returns the field **verbatim as the `<img src>` URL** — no selfh.st
  CDN template, no string-building. The existing `<img> onError → DEFAULT_ICON`
  handler (`Catalog.tsx`) still degrades a broken/invalid/unreachable URL to the
  bundled local default, so a bad URL never shows a broken glyph.
- **Tests updated** (`icons.test.ts`, `Catalog.test.tsx`): the precedence step-3
  case now asserts `iconSrc` returns the raw full URL when `icon` is set; still
  prefers uploaded variants; still falls back to `DEFAULT_ICON` when empty.
- **Spec** (`specs/v2-app-icons.md`): the data-model, precedence step 3, and
  view-mode rendering descriptions of the `icon` field now say "**full URL**"
  (used verbatim) instead of "selfh.st slug / CDN URL". (The historical
  "Problem" section still narrates the original v1 selfh.st design as the
  motivation for v2 — left as-is.)

**Form relabel — N/A (nothing to relabel).** The prompt asked to relabel the
admin create/edit-service form's icon input to "Icon URL". That **web form does
not exist**: edit mode only surfaces per-tile PNG upload/remove + delete-service
(see the 2026-06-10 edit-mode-UI entry below — the v1 A6 add/edit-service forms
were never built on the web side; only `homepad-api` has those endpoints). So
there is no slug-labelled input to change. When the add/edit-service web form is
eventually built, its icon input should be a full "Icon URL" field
(`placeholder="https://example.com/icon.png"`) — noted for that follow-up.

**Tests (test-first, all green):** `vitest run` **75/75**. `npm run build`
clean (tsc + vite). **dist has no Gatus URL** (and no `selfhst`/`jsdelivr`
substring either).

## 2026-06-10 — v2 app-icons: WEB edit-mode UI (A1/A2/A3/A7/A8/A9)

Built the **web edit-mode UI** for v2 custom app icons against the mocked API
(test-first). Branched off latest `main`. The backend slice (migration `0002`,
4 handlers, list `iconLight`/`iconDark` flags) already landed in
`homepad-api@feat/app-icons`; this run wires the UI to it.

**Shipped**
- **Admin edit-mode toggle** (`App.tsx`): an admin-only header toggle
  (`Edit`/`Done`, `aria-pressed`), gated on `/api/me` `role === 'admin'`.
  Client-ephemeral. Passes `isAdmin`+`editMode` into `Catalog`. Non-admins
  never see it; server stays the authoritative gate. **(A1)**
- **Per-tile icon controls** (`Catalog.tsx`, edit mode only): a **Light** and a
  **Dark** PNG slot (`accept="image/png"`) with **upload / replace / remove**,
  wired to `uploadIcon` (PUT raw bytes) / `deleteIcon`. **(A2, A3)**
- **Client-side validation** (`icons.ts` `validateIconFile`, mirrors backend
  Q2/Q3/Q4): PNG **magic-byte sniff** + **≤512×512** + **≤256 KB**, checked
  *before* upload; rejects render an **inline error** and never hit the
  network. Server-side rejections (e.g. 413) also surface inline.
- **Theme-aware rendering** (`useActiveTheme`): active variant derived from the
  **OS** via `prefers-color-scheme` (live `matchMedia` listener). Flipping the
  OS theme re-points the `<img>` `src` with no reload. v3's explicit
  System/Light/Dark toggle will override this later. **(A7)**
- **Precedence chain** (`iconSrc`): active-variant upload → other-variant
  upload → legacy `icon` text (selfh.st CDN) → **bundled local default**. **(A8)**
- **Broken-image fix** (done regardless): a **bundled local default** icon
  (in-bundle SVG data URI — zero network) + an `<img> onError` handler so a
  tile **never** renders a broken image. This replaces the old implicit remote
  `cog.svg` fallback that the seeded catalog shows today. **(A9)**

**Tests (test-first, all green):** 75 vitest passing —
`icons.test.ts` (validation caps + precedence + local default),
`api.test.ts` (`uploadIcon`/`deleteIcon`/`deleteService` URL+mapping),
`Catalog.test.tsx` (edit-mode slots, upload/replace/remove, client+server
reject, delete-service optimistic+rollback, theme swap, onError fallback),
`App.test.tsx` (admin toggle visible/hidden/flips). Existing view-mode tests
updated: the empty-icon case now asserts the **local default** (cog CDN is
gone, per spec). `npm run build` clean (tsc + vite); **dist has no Gatus URL**.

**Scope call (Stitch's, since the question couldn't be put to Joe live):** the
prompt's "edit mode surfaces BOTH the v1 add/edit/delete-service controls AND
icon controls" assumes a v1 service-CRUD **web** surface that **does not exist
yet** — only `homepad-api` has those endpoints; the web only ever shipped
render/favorites/reorder. To keep this one focused, well-tested increment
(Simplicity First), edit mode surfaces the **full v2 icon controls + a
delete-service** button (its endpoint exists, trivial). **NEEDS JOE:** confirm
whether **add-service / edit-service-fields forms** should be a follow-up web
slice (recommended — they're really v1 A6 web work, distinct from v2 icons),
or folded in next. `api.ts` already exposes `deleteService`; create/patch
client fns are not added yet.

**Deferred (not this run):** explicit theme toggle (v3); icon preview-against-
swatch is implicit via the slot styling, not a live render of the picked file.

## 2026-06-10 — v2 spec: custom app icons via edit mode (SPEC ONLY)

Wrote **`specs/v2-app-icons.md`** — an ADD-methodology spec (same style as
`specs/v1-launcher.md`) for the next feature. **No app code, tests, or
implementation** this run; spec doc only.

**What the feature is:** an admin-gated **edit mode** where, per service tile,
the admin uploads **two PNGs** — a light-mode and a dark-mode icon — stored
server-side; the catalog renders the variant matching the active theme. It
augments (doesn't remove) the existing `services.icon` text field, which stays
as a fallback.

**Decisions captured in the spec**
- **Edit mode:** admin-only toggle in the catalog header (client-ephemeral),
  with every mutating endpoint independently 403-gated server-side (same
  pattern as v1 catalog CRUD). Recommends folding v1's add/edit/delete-service
  controls into the same toggle (Q1, NEEDS JOE).
- **Icon model:** light + dark PNG per service; **PNG-only** via magic-byte
  sniff, ≤ 512×512, ≤ 256 KB, square recommended-not-required. Deterministic
  precedence: variant-T upload → other-variant upload → legacy `icon` text →
  **bundled local default**. The local default + an `<img> onError` handler
  **fixes today's broken-image fallback** (the remote `cog.svg`).
- **Storage:** laid out bytea vs PVC vs object-store; **recommends Postgres
  `bytea`** — kilobyte-scale data (< 20 MB worst case), rides existing
  backups, keeps the backend **stateless** (preserves v1's "no persistent
  storage" deploy contract). New additive table `service_icons` (migration
  `0002`).
- **Serving:** `GET /api/services/{id}/icon/{light|dark}` → `image/png` +
  ETag/304, session-gated; `GET /api/services` gains `iconLight`/`iconDark`
  booleans (never the blob bytes).
- **API:** `PUT`/`DELETE` icon endpoints, admin-only; **raw PNG body** on PUT
  (not multipart/base64) so upload == replace == idempotent upsert. Create/edit
  service unchanged; delete cascades to icons.
- **Frontend:** per-tile light+dark upload slots in edit mode (client pre-check
  + preview + remove); theme-aware rendering that re-points `src` on
  light↔dark switch with no reload.
- **Acceptance criteria:** A1–A14, testable (API integration + component).
- **Back-compat:** additive-only; the 39 seeded apps render unchanged; the only
  visible delta with no uploads is the improved local fallback.

**NEEDS JOE (open product calls):** Q1 fold-in vs separate Settings surface ·
Q2 validation caps · Q3 reject vs auto-downscale oversized · Q4 PNG-only vs
also SVG/WebP. (References `homepad-api` for all backend work — migration `0002`,
`service_icons` store, 4 handlers, list-endpoint flags.)

**Build/test state:** unchanged — no source touched.

## 2026-06-10 — README glow-up: banner, diagrams, badges, screenshot slots

Docs-only run (no app code touched). Made the README something you can actually
show off and that matches what's built.

**Done this run (`Code/homepad`, README + new assets only)**
- **`docs/banner.svg`** — clean hand-authored SVG logo/banner (2×2 launcher mark
  + live status dot, wordmark, tagline, UP/DEGRADED/DOWN/UNKNOWN legend),
  embedded at the very top of the README.
- **Shields.io badges** — Go 1.25, React+Vite, Tailwind, tests
  (70 passing · 26 Go + 44 Vitest), license.
- **Mermaid ARCHITECTURE diagram** — browser → web (nginx/SPA) → `/api` →
  homepad-api (Go) → Postgres; poller → Gatus (server-side only); PocketID OIDC.
  Renders as an image in Gitea markdown.
- **Mermaid AUTH-FLOW sequence** — both paths: local email/password, and the
  PocketID OIDC Authorization-Code + PKCE round trip (login → PocketID →
  callback → `homepad_session` cookie).
- **`## Screenshots`** — embeds `docs/screenshots/{login,catalog,mobile}.png`.
  Committed tiny wireframe placeholders (pure-stdlib PNG, 3–5 KB each) so the
  layout renders now. **NEEDS JOE:** swap these for real captures from the live
  deploy (same paths/filenames — no README edit needed).
- **Prose corrected to reality** — dropped the stale "scaffold / RED only" status;
  now documents local + PocketID login, shared catalog with live Gatus badges,
  per-user favorites, personal reorder (up/down, persisted), admin catalog CRUD,
  A1–A11.
- Also tidied the **`Code/homepad-api`** README the same way (badges, accurate
  alpha-complete status, endpoint list, layout incl. `internal/oidc`).

**Build/test state:** unchanged — no source touched. `vitest run` still 44/44.

## 2026-06-10 — PocketID web button shipped (test-first, additive)

The web half of the OIDC slice scoped below. Local email/password login is
untouched; the PocketID button sits beneath it, gated on the API config.

**Done this run**
- **api.ts — `authConfig()`.** `GET /api/auth/config` → `{oidcEnabled:bool}`.
  A non-200 or a thrown `fetch` both map to `{oidcEnabled:false}` so the button
  fails *closed* (hidden). 4 new mocked-`fetch` tests; URL assertion stays under
  `/api` (A11 unit half).
- **App.tsx — PocketID button.** `AuthForm` fetches `authConfig()` on mount and
  renders "Log in with PocketID" only when `oidcEnabled`. Activating it is a full
  navigation — `window.location.assign('/api/auth/oidc/login')`, **not** `fetch`
  — so the 302 to PocketID happens in the browser. After the callback the API
  sets `homepad_session` and 302s to `/`; the existing `me()` gate lands the user
  on the catalog, no extra web code.
- **3 new App tests:** button visible when `oidcEnabled:true` (local Sign in
  still present), hidden when `false`, and that activating it navigates to
  `/api/auth/oidc/login`.
- **A11 web half still PASS.** `npm run build` clean; `grep -ri gatus dist/`
  empty.

**Build/test state:** `npm run build` clean (tsc + vite) · `vitest run` 44/44
green · bundle 151 kB (49 kB gzip).

## 2026-06-10 — PocketID / OIDC: backend ready, web button is the next slice

New requirement: a "Log in with PocketID" option on the login screen, **additive**
to local login. This run I built the **backend** end of it in `homepad-api`
(OIDC login + callback + account-link, tests green on the test DB — see that
repo's STATUS). No web code changed yet; capturing the contract so the next web
run is a quick, test-first slice:

- **Gate the button:** `GET /api/auth/config` → `{"oidcEnabled":bool}`. Show
  "Log in with PocketID" only when `true`. (Endpoint already live.)
- **Start login:** the button navigates the browser to `/api/auth/oidc/login`
  (a full navigation, not `fetch` — it 302s to PocketID).
- **After callback:** homepad-api sets the same `homepad_session` cookie and
  302s to `/`, so the app lands logged-in on the catalog with no extra web work
  beyond the existing session handling.
- **Component tests to add:** button visible when `oidcEnabled:true`, hidden when
  `false`, and that it points at `/api/auth/oidc/login` — against a mocked api,
  same harness as the existing api.ts/Catalog tests.

No `NEEDS JOE` on the web side. (Backend has one: the real `OIDC_ADMIN_GROUP`
name — env-driven, set at deploy.)

## 2026-06-09 — A5 layout reorder wired in the web app (test-first)

The last foundational web slice. Personal tile order is now reorderable and
persists; mirrors the favorites optimistic+rollback pattern.

**Done this run**
- **api.ts — `setLayout(order)`.** `PUT /api/layout` with `{"order":[ids]}` →
  true on 204, false otherwise (incl. 404 unknown id). 2 new mocked-`fetch`
  tests; URL assertion stays under `/api` (A11 unit half).
- **Catalog.tsx — reorder UI.** Per-tile ↑/↓ buttons (`move-up`/`move-down`),
  disabled at the boundaries. `moveItem` swaps the tile one slot, sets state
  optimistically, persists the full id order via `setLayout`, and rolls back to
  the pre-move snapshot if the API rejects — snapshot captured up front so the
  rollback can't race a later render (same fix shape as the favorites bug).
- **Load order.** No client-side sort — tiles render in the exact order
  `services()` returns, so the order-aware `GET /api/services` drives it.
- **5 new Catalog tests:** load-order, move-down+persist, move-up+persist,
  rollback-on-reject, boundary-disable.
- **A11 (web half) still PASS.** `npm run build` clean; `grep -ri gatus dist/`
  empty.

**Build/test state:** `npm run build` clean (tsc + vite) · `vitest run` 37/37
green · bundle 150 kB (48 kB gzip).

## 2026-06-09 — Component-test harness + A2/A3 verified against a mocked API

Pivoted from the (alpha-complete) API to the web app. The browser talks only
to the same-domain `/api` proxy — never to Gatus.

**Done this run**
- Added a Vitest + React Testing Library + jsdom harness (no running API
  needed). `npm test` → `vitest run`; e2e (`tests/e2e`, Playwright) stays
  separate and is Joe's job to run live.
  - `src/test/setup.ts` (jest-dom matchers + auto-cleanup), `test` block in
    `vite.config.ts`, tsconfig `types` extended so `npm run build` stays clean.
- **api.ts (client) — 14 tests, mocked `fetch`.** me / login / register /
  logout / services / setFavorite: response mapping + that every call stays
  under `/api/*`. The URL assertions are the unit-level half of A11.
- **A2 — catalog tiles (Catalog.tsx) — mocked `./api`.** name, description,
  link-out URL (`rel=noopener`), icon URL incl. `cog` fallback, empty-state.
- **A3 — status badges.** UP→emerald / DOWN→red / DEGRADED→amber /
  UNKNOWN→neutral, driven by the API `status` field; `data-status` + aria-label.
- **Auth gate (App.tsx) — 7 tests, mocked `./api`.** unauth→login form;
  existing session→catalog; login success/failure; register→login;
  register-fail short-circuits; logout→back to login.
- **Favorites toggle** optimistic flip + rollback-on-reject, both tested.
- **Bug caught + fixed (Catalog.tsx `toggleFavorite`):** it read the toggled
  value out of the `setItems` updater closure, which runs on a *later* render —
  so the persist call `setFavorite(id, next)` raced and sent the *stale*
  pre-toggle value to the API while the UI showed the new one. Now `next` is
  derived from current state up front. (Latent since the favorites commit; no
  test had covered the persisted value.)
- **A11 (web half): PASS.** `npm run build` clean; `grep -ri gatus dist/`
  returns nothing — no Gatus URL (or even the substring) in the bundle.

**Build/test state:** `npm run build` clean · `vitest run` 30/30 green ·
bundle 149 kB (48 kB gzip).

**Remaining web checklist for alpha**
- [x] Layout reorder → `PUT /api/layout` with the new order (up/down buttons,
      optimistic + rollback). Wired in `api.ts` + `Catalog.tsx`, component-tested.
- [ ] A7 responsive — 390 / 1440, no horizontal scroll (Playwright e2e exists;
      needs a live run — Joe).
- [ ] A8 perf budgets — Lighthouse CI wired (`lighthouserc.cjs`); needs a CI/live
      run (Joe).
- [ ] Full e2e (catalog / status-badge / responsive / no-gatus-leak) against the
      deployed API+web — Joe runs the browser end-to-end verify.
- [x] A2 / A3 component-verified (mocked API).
- [x] Auth login/register/logout + session gate (component-verified).
- [x] Favorites toggle (component-verified, bug fixed).
- [x] A11 web half — no Gatus URL in `dist`.

_No blockers._

## Merge record — 2026-06-10

- PR #1 `feat/catalog-vertical-slice` → `main` **merged** via real merge commit `4ea0c71` (parents `59523bc18d` + `b1950a40d0`). CI (Web build/unit tests, pull_request) concluded **success** after Joe's ci.yml conflict fix; mergeable was true. Source branch deleted. — Stitch
