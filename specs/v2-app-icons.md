# homepad v2 — Custom App Icons (Edit Mode) — Spec

**Status:** Draft, awaiting sign-off
**Authors:** Stitch (Claude Code) + Caleb Dunn
**Last updated:** 2026-06-10
**Methodology:** ADD (getadd.dev), POC maturity dial
**Builds on:** [`specs/v1-launcher.md`](./v1-launcher.md)

---

## Problem

Today a tile's icon is a single text field (`services.icon`) holding a
[selfh.st](https://selfh.st/icons/) slug, rendered as a CDN URL:

```tsx
const icon = `https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${service.icon || 'cog'}.svg`;
```

Three problems with that:

1. **No custom icons.** Caleb runs homelab services that aren't in the
   selfh.st set (one-offs, internal tools, things with bespoke branding).
   He can only pick from the catalog or live with `cog`.
2. **Not theme-aware in practice.** selfh.st *has* `-light`/`-dark` variants
   but the single `icon` field can only name one, so a logo tuned for a dark
   surface looks wrong on the light theme and vice-versa.
3. **Broken-image fallback.** `service.icon || 'cog'` builds a CDN URL even
   for the fallback. If the slug is wrong, `cog.svg` is ever renamed, or
   jsDelivr is unreachable on the LAN, the `<img>` has **no `onError`
   handling** → the browser renders its broken-image glyph. A dashboard
   should never show a broken picture.

## v2 Goal

An admin-gated **edit mode** in which, per service tile, the admin can upload
**two PNGs** — a **light-mode** icon and a **dark-mode** icon — stored
server-side and served back by homepad-api. The catalog renders the variant
that matches the **active theme**. This **augments** the existing `icon` text
field (it stays as a fallback), and we **fix the broken-image fallback** so a
tile always renders *something*.

## In scope (v2)

- An admin-only **edit mode** toggle in the web UI.
- Per-service **light + dark PNG** upload, replace, and delete (admin only).
- Server-side storage of the PNG bytes + a `GET …/icon/{light|dark}` serving
  endpoint with ETag/caching.
- **Theme-aware tile rendering** (light icon on light theme, dark on dark),
  with a deterministic precedence/fallback chain.
- A **bundled local default** so no tile ever shows a broken image.
- Validation: **PNG-only**, max dimensions, max byte size.
- Additive DB migration + back-compat with the seeded 39-app catalog and the
  existing `icon` field.

## Out of scope (deferred)

- SVG/WebP/AVIF uploads — PNG-only for v2 (keeps validation + rendering
  simple). Revisit if a real need shows up.
- Auto-fetching favicons from each service URL — v3 idea, not now.
- Per-user custom icons — icons are a property of the **shared catalog**, so
  they're admin-managed, same as name/url/description.
- Icon cropping/resizing/editing in-browser — we validate + reject, we don't
  transform. (NEEDS JOE if Caleb wants auto-downscale instead of reject.)
- Animated PNG handling — treated as a normal PNG; first frame is whatever the
  browser renders. No special-casing.

## Stack delta

No new stack. Backend stays Go (`homepad-api`), persistence stays the single
Postgres, frontend stays React + Vite + TS + Tailwind. The only new moving
parts are one DB table, four endpoints, and one edit-mode UI surface —
**no PVC, no object-store, no new infra** (see Storage tradeoffs below).

---

## Edit mode

### Entering / exiting

- A single **"Edit" toggle** in the catalog header, rendered **only** when
  `me().role === 'admin'`. Clicking it flips the catalog into edit mode;
  clicking again (or "Done") exits. State is **client-side only and
  ephemeral** — a page reload returns to view mode. (No need to persist a
  per-user "last mode"; it's a transient editing affordance.)
- Non-admins never see the toggle, and even if the button were forged, every
  mutating endpoint is independently gated server-side (below), so edit mode
  is a *convenience surface*, not the security boundary.

### Admin-only gating

- **UI gate:** the toggle and all edit affordances render only for admins.
- **Server gate (authoritative):** the icon write endpoints check
  `user.Role == "admin"` and return **403** otherwise — identical to the
  existing catalog CRUD pattern in `internal/api/services.go`
  (`handleCreateService`/`handleUpdateService`/`handleDeleteService`).
- "Admin" is whatever v1 already grants: first-registered local user, or an
  OIDC user in `OIDC_ADMIN_GROUP`. v2 adds no new role concept.

### What edit mode changes in the UI

In edit mode each tile gains, in addition to its normal content:

- A **Light icon** slot: drop-zone / file-picker (`accept="image/png"`),
  live preview if one is set, and a **×** to delete that variant.
- A **Dark icon** slot: same, for the dark variant.
- The slots preview against the surface they target (the light slot on a light
  swatch, the dark slot on a dark swatch) so the admin sees the real result.

Status badges, favorite stars, and reorder arrows **do not change** — and
reorder/favorites are *personalization*, available in view mode regardless of
role (unchanged from v1).

### Does edit mode gate anything else?

**Recommendation:** fold the **existing catalog CRUD** (add service / edit
fields / delete service from v1's A6) **into edit mode** so all
catalog-mutating affordances live behind one toggle and the default view stays
clean. The endpoints are already admin-gated; this is purely where the buttons
render.

> **NEEDS JOE:** confirm folding v1's add/edit/delete-service controls into the
> same edit-mode toggle (recommended), vs. keeping a separate "Settings →
> Catalog" surface for those and scoping edit mode to *icons only*. Either way
> the server gating is unchanged.

---

## Icon model

### Shape

Each service may have up to **two** uploaded icons, keyed by `variant ∈
{light, dark}`. Each stored icon carries its bytes plus derived metadata
(width, height, byte size, content hash for ETag). The `services.icon`
text (a **full URL** the admin provides — any image URL) is retained as a
lower-precedence fallback.

### Validation (enforced server-side; mirrored client-side as a courtesy)

| Rule | Value | On violation |
|---|---|---|
| Format | **PNG only**, verified by **magic-byte sniff** (`\x89PNG\r\n\x1a\n`), not by filename or client `Content-Type` | 415 Unsupported Media Type |
| Max dimensions | **512 × 512 px** | 422 Unprocessable Entity |
| Min dimensions | **16 × 16 px** (reject 1-px tracking junk) | 422 |
| Max byte size | **256 KB** per variant | 413 Payload Too Large |
| Square | **Recommended, not required** — non-square is accepted; the client warns ("works best square") and CSS renders `object-contain` so it never distorts | (warn only) |

Rationale for the caps: tiles render the icon at ~48px (v1 visual direction);
512px gives 2× headroom for hi-DPI and future larger renders, and 256 KB is
generous for a 512² PNG while keeping the DB row small (see Storage). These are
constants in one place so they're trivial to retune.

> **NEEDS JOE:** confirm 512px / 256 KB caps, or pick different numbers. Also:
> reject-oversized (recommended, simplest, predictable) vs. server-side
> auto-downscale to fit. Recommendation: **reject** for v2.

### Precedence / fallback (deterministic)

For a tile rendered under **active theme T ∈ {light, dark}**, the icon source
is the first of these that exists:

1. **Uploaded PNG for variant T** — `GET /api/services/{id}/icon/{T}`.
2. **Uploaded PNG for the *other* variant** — if only one was uploaded, use it
   for both themes (better than falling further back; an admin who set one icon
   meant it).
3. **`icon` text** — used **verbatim as a full URL** (the admin supplies any
   image URL); the `<img src>` is the field value with no template or
   string-building.
4. **Bundled local default** — a neutral monochrome placeholder shipped *in the
   web bundle* (served by nginx, no network), used when nothing above resolves
   **and** as the `onError` target for steps 1–3 so a failed load never shows a
   broken glyph.

This is the fix for problem #3: the `<img>` always has an `onError` that
collapses to the bundled default, and the default is local — never a CDN URL
that can 404 or be offline on the LAN.

> The bundled default replaces the implicit `cog` CDN fallback. `cog` is *not*
> special-cased anymore — a service with an empty `icon` and no uploads renders
> the local placeholder, not a remote `cog.svg`.

---

## Storage + serving

### Where the bytes live — tradeoffs

| Option | Pros | Cons |
|---|---|---|
| **Postgres `bytea`** (recommended) | Single source of truth; backed up + restored atomically with the catalog; transactional with the row; **keeps homepad-api stateless** (preserves v1's "Persistent storage: None" deployment contract); zero new infra | Bloats the DB if data were large — but here it's tiny (≤ 256 KB × 39 apps × 2 = **< 20 MB** worst case); large blobs would need streaming care (not at this size) |
| **PVC (filesystem)** | Cheap reads; no DB bloat | **Breaks the stateless contract** — backend now needs an RWO/RWX volume, pins scheduling, and adds a separate backup path out-of-sync with the DB; orphan/cleanup logic on delete; one more failure mode |
| **Object storage (MinIO/S3)** | Scales to huge media; CDN-friendly | **No object store exists in this homelab**; standing up MinIO + creds + lifecycle for a few MB of icons is wildly disproportionate; adds egress + a new secret |

### Recommendation: **Postgres `bytea`**

For a single-Postgres homelab deploy with kilobyte-scale assets, `bytea` is the
right call: the data is small, it rides the existing Postgres backups, it stays
transactional with the catalog row, and it **keeps the backend pod stateless**
so v1's deployment contract (no persistent storage, 1 replica, all state in
Postgres) holds unchanged.

### Schema (additive migration `0002_app_icons.up.sql`)

```sql
CREATE TABLE IF NOT EXISTS service_icons (
    service_id  UUID    NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    variant     TEXT    NOT NULL CHECK (variant IN ('light', 'dark')),
    bytes       BYTEA   NOT NULL,
    byte_size   INTEGER NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    etag        TEXT    NOT NULL,            -- hex SHA-256 of bytes
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (service_id, variant)
);
```

`ON DELETE CASCADE` means deleting a service drops its icons automatically —
no orphan handling. A separate table (rather than two `bytea` columns on
`services`) keeps the hot `GET /api/services` list query from ever pulling
blob bytes, and models "0, 1, or 2 icons" naturally.

### Serving

- **`GET /api/services/{id}/icon/{light|dark}`**
  - 200 `Content-Type: image/png` with the bytes when that variant exists.
  - `ETag: "<sha256>"` + `Cache-Control: private, max-age=300` so browsers and
    the tile re-render cheaply.
  - Honors `If-None-Match` → **304 Not Modified** when the ETag matches.
  - **404** when that variant has no upload (the client uses 404 to walk the
    precedence chain client-side — but see the list-endpoint flags below so it
    usually doesn't have to probe).
  - **Session-gated**, same as the rest of `/api/*` — the catalog is behind
    auth and `<img>` requests carry the same-site `homepad_session` cookie, so
    no separate auth model is needed. (Gatus boundary from v1 is untouched;
    icons never involve Gatus.)

To avoid the client blind-probing two URLs per tile, **`GET /api/services`**
gains two booleans per entry so the client knows what exists up front:

```jsonc
{
  "id": "…", "name": "Gitea", "url": "…", "icon": "gitea",
  "status": "UP", "favorite": false,
  "iconLight": true,        // an uploaded light PNG exists
  "iconDark":  false        // no uploaded dark PNG
}
```

(The blob bytes are **never** in this list response — only the flags.)

---

## API surface

All four icon endpoints are **admin-only (403 otherwise)** except the `GET`,
which is session-gated like the rest of the catalog.

| Method | Path | Body | Result |
|---|---|---|---|
| `GET`    | `/api/services/{id}/icon/{variant}` | — | 200 PNG + ETag / 304 / 404 |
| `PUT`    | `/api/services/{id}/icon/{variant}` | **raw PNG bytes**, `Content-Type: image/png` | 204 (created or replaced) |
| `DELETE` | `/api/services/{id}/icon/{variant}` | — | 204 (idempotent; 204 even if none existed) |

`{variant}` is `light` or `dark`; anything else → 400.

### Upload transport: raw bytes vs. multipart vs. base64

**Recommendation: raw PNG body on `PUT`** (`Content-Type: image/png`, the bytes
*are* the body). It's the simplest possible contract — no multipart parsing, no
base64 33% inflation, the variant is already in the path so there's no second
form field to carry. `PUT` makes upload and replace the **same idempotent
operation** (upsert on `(service_id, variant)`).

- *multipart/form-data* would matter if we accepted multiple files or extra
  fields per request — we don't (one variant per call, variant in the path),
  so it's needless ceremony.
- *base64-in-JSON* inflates payloads and forces decode-then-validate; no upside
  here.

### Interaction with create / edit service (v1 A6)

- **Create** (`POST /api/services`) is **unchanged** — it still takes the
  `icon` text field and returns the new id. Icons are uploaded *after* creation
  (they need the service id). Flow: create tile → it appears with its
  text/`cog`→now-default fallback → admin uploads PNGs in edit mode.
- **Edit** (`PATCH /api/services/{id}`) is **unchanged** and does **not** touch
  uploaded icons; the `icon` text field remains separately editable (it's the
  fallback). Icon bytes are managed only via the icon endpoints.
- **Delete service** (`DELETE /api/services/{id}`) cascades to
  `service_icons` (FK `ON DELETE CASCADE`) — no extra cleanup code.

---

## Frontend

### Edit-mode UI (per tile)

When edit mode is on, each tile renders two upload controls beneath the icon:

- **Light** and **Dark** slots, each a click-or-drop target
  (`<input type="file" accept="image/png">`).
- **Client-side pre-check** before upload: confirm PNG magic bytes, decode via
  an offscreen `Image`/`createImageBitmap` to read dimensions, and check size —
  reject with an inline message *before* hitting the network (the server
  re-validates authoritatively; the client check is just fast feedback).
- **Preview** the chosen PNG against the matching surface swatch.
- **× / "Remove"** per slot → `DELETE …/icon/{variant}` → tile falls back per
  the precedence chain.
- On successful `PUT`, refresh that tile's `iconLight`/`iconDark` flag and
  bust the `<img>` cache (append the new ETag/`updated_at` as a query param so
  the browser refetches the replaced bytes).

Optimistic-with-rollback, matching the favorites/reorder pattern already in
`Catalog.tsx`.

### Theme-aware rendering (view mode)

- The catalog resolves the **active theme** (`light`/`dark`) from v1's
  theme model — system-aware default + per-user override — and picks the icon
  source via the precedence chain above.
- Concretely, for theme `T`: if `icon{T}` flag is true, `src =
  /api/services/{id}/icon/{T}?v={etag}`; else if the other flag is true, use
  that; else if `icon` text is set, use it verbatim as the full URL; the `<img>` always
  carries `onError` → swap to the **bundled local default**.
- **Switching theme re-points the `src`** to the other variant with no reload
  (a derived value off the theme state), so toggling light↔dark swaps icons
  live.
- Tiles keep `object-contain` so non-square uploads never stretch.

---

## Acceptance criteria (v2 icons — testable)

These are the v2 feature's ACs; v1's A1–A11 still hold unchanged.

| # | Criterion | How verified |
|---|---|---|
| A1 | An admin sees an "Edit" toggle in the catalog header; a non-admin does not | Component test with `me()` mocked admin vs. user; assert toggle presence/absence |
| A2 | In edit mode, each tile shows a Light slot and a Dark slot with upload + remove controls | Component test: enter edit mode, assert two `accept="image/png"` inputs + remove buttons per tile |
| A3 | Admin can `PUT` a light and a dark PNG for a service; `GET …/icon/{light\|dark}` then returns each with `Content-Type: image/png` | API integration: PUT both → GET both 200 with correct bytes |
| A4 | Non-admin gets **403** on `PUT`/`DELETE` of any icon variant | API integration: user-role token → 403 on both verbs |
| A5 | Non-PNG (e.g. JPEG/SVG/garbage) is rejected by magic-byte sniff with **415**, even with a spoofed `Content-Type: image/png` | API integration: POST JPEG bytes labeled png → 415; no row written |
| A6 | A PNG over 512×512 → **422**; over 256 KB → **413**; a valid ≤512²/≤256 KB PNG → **204** | API integration: boundary cases each side of the limits |
| A7 | The catalog renders the **light** icon under the light theme and the **dark** icon under the dark theme; toggling theme swaps the `src` with no reload | Component test: mock both flags true, flip theme, assert `src` switches between `/icon/light` and `/icon/dark` |
| A8 | Precedence holds: only-one-variant-uploaded uses it for both themes; no upload + `icon` text set → selfh.st URL; nothing set → **bundled local default** | Component test over all four chain states; assert resolved `src` per state |
| A9 | A tile **never** shows a broken image — a failed icon load (`onError`) falls back to the bundled local default | Component test: simulate `<img>` error, assert `src` becomes the bundled asset (and the asset is local, not a CDN URL) |
| A10 | `GET …/icon/{variant}` sets an `ETag`; a conditional re-request with matching `If-None-Match` returns **304** | API integration: GET → capture ETag → re-GET with `If-None-Match` → 304 |
| A11 | `DELETE …/icon/{variant}` is idempotent (204 whether or not bytes existed) and the tile reverts to the next fallback | API integration: DELETE existing → 204 → GET 404; DELETE again → 204 |
| A12 | Deleting a service cascades: its `service_icons` rows are gone (no orphans) | API integration: upload icons → DELETE service → assert no `service_icons` rows for that id |
| A13 | `GET /api/services` returns `iconLight`/`iconDark` booleans and **never** the blob bytes | API integration: assert flags present, response size unaffected by icon size |
| A14 | All icon state is in Postgres (`service_icons.bytea`); backend needs **no** persistent volume (v1 deploy contract holds) | Smoke: fresh Postgres + migrations → upload → restart pod (no PVC) → icon still served |

---

## Migration / back-compat

- **Additive migration only** (`0002_app_icons.up.sql` / `.down.sql`): create
  `service_icons`. **No change to `services`** — the `icon` text column and all
  39 seeded rows are untouched.
- **Zero data migration.** Every existing app keeps rendering exactly as today
  via precedence step 3 (legacy `icon` text) until an admin uploads PNGs. The
  *only* visible change with no uploads is the **fallback**: an empty `icon`
  now resolves to the bundled local default instead of the remote `cog.svg`
  (strictly an improvement — kills the broken-image case).
- **API back-compat:** `GET /api/services` only *adds* `iconLight`/`iconDark`;
  the existing `icon` field and all other fields are unchanged, so any
  older/cached client keeps working and simply ignores the new flags.
- **Rollback:** `0002…down.sql` drops `service_icons`; because nothing else
  references it and `icon` text was never removed, the app reverts cleanly to
  v1 icon behavior.

---

## Deployment contract delta (for Joe)

Almost nothing changes from v1:

| Concern | v2 delta |
|---|---|
| Persistent storage | **Still none** — icons live in Postgres `bytea` (this was the whole point of choosing `bytea`) |
| New env vars | None required. *Optional:* `HOMEPAD_MAX_ICON_BYTES` to override the 256 KB cap without a rebuild (defaults to 256 KB) |
| New endpoints | `GET/PUT/DELETE /api/services/{id}/icon/{light\|dark}` — all under the existing `/api/*` route + same session/admin model; no new Ingress/Pangolin rules |
| DB | One additive migration (`0002`); run before/at rollout like any other |
| Replicas | Still 1 (unchanged); bytea + stateless backend means scaling later stays trivial |

---

## Open decisions (NEEDS JOE)

| # | Question | Stitch's lean |
|---|---|---|
| Q1 | Fold v1's add/edit/delete-service controls into the new edit-mode toggle, or keep them in a separate Settings surface and scope edit mode to icons only? | **Fold in** — one edit toggle, cleaner default view |
| Q2 | Validation caps: 512×512 / 256 KB — keep or retune? | Keep as sane defaults |
| Q3 | Oversized uploads: **reject** (422/413) vs. server-side auto-downscale to fit? | **Reject** for v2; downscale is a v3 nicety |
| Q4 | PNG-only, or also accept SVG/WebP in v2? | **PNG-only** — simplest correct validation; widen later if needed |

---

**Next ADD phase after sign-off:** test-writer → failing tests for A1–A14
(API integration in `homepad-api`, component tests in `homepad`) →
RED→GREEN→REFACTOR→VERIFY. Backend slice (`homepad-api`: migration `0002`,
`service_icons` store methods, 4 handlers, `iconLight/iconDark` on the list)
lands first so the web edit-mode UI has real endpoints to drive.
