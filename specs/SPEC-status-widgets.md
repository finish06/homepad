# Spec: Status Widgets — a few useful numbers on tiles, fetched by the server

**Version:** 0.1.0
**Created:** 2026-11-07
**Author:** Caleb Dunn (via /add:spec — the interview is replaced by §0, Open questions)
**Status:** Draft — awaiting Caleb's answers to §0 and UX sign-off
**Repo:** `Code/homepad` (frontend) + `Code/homepad-api` (Go backend)
**Estimate:** Phase 1 ~4–5 days (widget manager, secret store, address guard, 3 service providers, clock, weather, web search, admin UI, tests). Phase 2 ~2–3 days (3 more providers).
**Depends on:** shared catalog model (SPEC-245-224), kid accounts route classes (SPEC-kid-accounts §7), tile density (SPEC-tile-density), live status refresh (v13), admin settings (`system_settings`, cap6)
**Target version:** Phase 1 → the next 17.x minor (additive: one migration, new routes, no breaking change). Phase 2 → the minor after it. The exact numbers are set when the plan is cut, alongside the other next-work specs.
**UX:** [`specs/ux/status-widgets-ux.md`](./ux/status-widgets-ux.md) (Draft)

---

## 0. Open questions — decisions for Caleb

These replace the ADD interview. Each has a recommended default. Answering "all at the defaults" is a complete answer.

**Q1. PRD scope.** PRD §4 lists "per-service metrics dashboards" as out of scope ("homepad links out; it is a launcher, not a monitoring UI").
- (a) Amend the PRD: one short line of numbers per tile and a clock/weather strip are in scope. Charts, lists, history and detail pages stay out.
- (b) Keep the PRD as is: only the clock/weather strip ships; no data on tiles.
- **Recommended: (a).**

**Q2. Where tile data shows.**
- (a) Compact and List: the widget values take the place of the status line while the app is not offline. When the app is offline, the status line shows "Offline · 6 min" as today. Large: one new line under the name. The status dot never changes.
- (b) A new extra line in every density (Compact grows 68 → ~84px, List 44 → ~60px).
- (c) Only on hover or long-press.
- **Recommended: (a).** It costs no tile height in the two horizontal densities, and an outage still wins the line.

**Q3. Kids.**
- (a) Kids see no widget data in v1. They do see the clock and weather strip, which carries no catalog data.
- (b) A per-widget "Kids can see this" switch, off by default, honoured only on apps the kid is allowed.
- (c) Kids see widget data on every app they are allowed.
- **Recommended: (a).** (b) is a clean follow-up once v1 has shipped.

**Q4. How keys are stored.**
- (a) Encrypted in Postgres (AES-256-GCM). The key comes from a new env var, `HOMEPAD_SECRET_KEY`. The quickstart adds one line to `.env`, the same way it makes `POSTGRES_PASSWORD`. Without it, widgets that need no key (clock, weather) still work, and the key fields explain how to turn it on.
- (b) Plain text in Postgres, protected only by database access.
- (c) No key storage: the admin names an env var, and the server reads the value from its environment.
- **Recommended: (a).**

**Q5. Which addresses the server may fetch.** Homelab apps live on private addresses, so blocking private ranges would break the feature.
- (a) Allow private and loopback addresses. Block link-local and cloud metadata addresses. Follow no redirects. Return only typed numbers, never a raw response.
- (b) (a), plus an optional env allow-list of networks (`HOMEPAD_WIDGET_ALLOWED_NETS`) for admins who want to fence it further.
- (c) Block all private ranges.
- **Recommended: (a) now, (b) as a follow-up if anyone asks.**

**Q6. Freshness.**
- (a) Widget data rides on `GET /api/services`, which the browser already polls every 60s. The server refreshes each widget every 1 min by default (5 and 15 min are offered).
- (b) A separate `GET /api/widgets` on its own 10–15s poll, so download speeds feel live.
- **Recommended: (a).** One poll, one kid filter, and numbers no more than ~2 min old. These are glance numbers.

**Q7. Where the clock and weather go.**
- (a) A slim strip at the top of the page, above the health bar: time and date on the left, weather on the right.
- (b) Inside the "Your dashboard" header row, next to the density switch.
- (c) As tiles inside the grid.
- **Recommended: (a).**

**Q8. Search.** Homepage's search widget is its most used info widget (§1c). Homepad already has a search pill in the header (⌘K), which searches apps.
- (a) ⌘K gains a last row, "Search the web for 'x'", using a provider the admin picks (DuckDuckGo by default). The pill's placeholder becomes "Search apps and the web".
- (b) A separate search box in the clock/weather strip.
- (c) No web search.
- **Recommended: (a).** It needs no new box and almost no new CSS.

**Q9. Weather source.**
- (a) Open-Meteo only: free, no key, fetched by the server. Its terms ask for credit (CC BY 4.0) and non-commercial use under 10,000 calls a day; Homepad uses 96 a day.
- (b) Open-Meteo, plus OpenWeatherMap for admins who bring a key.
- **Recommended: (a).** Public Homepage configs pick Open-Meteo about 5 to 1 (§1c).

**Q10. CSS budget** (measurements in §11).
- (a) Ship the admin widget forms in a lazy CSS chunk that loads with the tile editor. The entry stays under the 20,500 B budget (measured prototype: 19,861 B). File a follow-up to move other overlay-only CSS out of the entry.
- (b) Keep everything in the entry and raise the budget to 21,500 B in the same PR (measured prototype: 20,210 B, which leaves 290 B under today's budget).
- (c) Do the overlay-CSS move first, as its own PR (about 4.5 kB gzip back, measured), then build widgets.
- **Recommended: (a).**

**Q11. A per-user switch.**
- (a) One "Show widgets" switch in My settings, on by default. It hides tile widget lines and the clock/weather strip for that user, like "Show health bar".
- (b) No per-user switch in v1.
- **Recommended: (a).**

**Q12. The Phase 1 set.**
- (a) Clock, weather, web search, Jellyfin, Sonarr, Radarr. Pi-hole, qBittorrent and Proxmox VE follow in Phase 2.
- (b) Swap Radarr for Pi-hole, so Phase 1 also proves the sign-in-session style of auth.
- **Recommended: (a).** Sonarr and Radarr share one API, so the second costs little. Phase 1 proves the framework, the key store and the address guard on the simplest auth; Phase 2 adds sessions and self-signed TLS.

---

## 1. Overview

From the next-work list (item 4): *a small set of status widgets (5–8), fetched on the server.*

"Widgets for app X" is the biggest request category for the dashboards Homepad is measured against. The goal is not to match a list of 100+ widgets. It is to answer the "no widgets?" objection with a few high-value ones, done Homepad's way: **the API server talks to the upstream app**, so credentials stay on the server and the browser never sees an internal hostname or an API key. That is the same rule Gatus status already follows (PRD §1, §3 "Gatus leak: zero").

### 1a. What exists today (grounded in the code, `gitea/main` 2026-11-07)

- **Status is fetched server-side by a poller.** `homepad-api/internal/gatus/poller.go`: `Poller.Run` polls every 30s (`cmd/homepad-api/main.go`), each poll bounded by a 10s timeout. It publishes a `Snapshot` under an `RWMutex`. `handleListServices` (`internal/api/services.go`) merges the snapshot into each `serviceView` and never proxies to Gatus, so it cannot 5xx when Gatus is down (A9).
- **Kid filtering is enforced by route class.** `internal/api/server.go` registers every route through `router.handle(pattern, class, h)` with one of `public`, `catalog-free`, `kid-filtered`, `kid-forbidden`, `admin-only`. `GET /api/services` is `kid-filtered` and reads through `visibleCatalog` → `storage.VisibleServiceIDs`. `internal/api/routes_test.go` holds an independent copy of every route's class and probes each with a kid session against a catalog with hidden apps.
- **The browser polls `GET /api/services` every 60s** (`src/services.tsx`, `POLL_MS = 60_000`). `mergeStatuses` copies **only `status` and `uptimeChecks`** onto existing tiles. Any new per-tile field is dropped on every live poll unless `mergeStatuses` is changed with it (see AC-011).
- **The server already fetches admin-supplied URLs.** `POST /api/services/{id}/fetch-icon` (`internal/api/icons.go`) GETs the tile URL with a 5s timeout. It follows redirects and has no address guard. That is acceptable for a favicon; it is not enough for a request that carries an API key (§8.2).
- **There is no secret storage.** The only credentials the API holds are env vars (`DATABASE_URL`, `OIDC_CLIENT_SECRET`), kept off the env-config allow-list (`internal/api/env_config.go`).
- **Tiles have three densities** (SPEC-tile-density): Large (190px wide, min-height 120px, name only), Compact (236×68px, name over a mono status line), List (44px rows, status line on the right). The status line element is `.app-grid-tool-statusline`, rendered only in Compact and List.
- **PRD §4 lists "per-service metrics dashboards" as out of scope.** Q1 resolves the overlap.

### 1b. What this spec adds

1. **Service widgets.** An admin can attach one widget to a catalog tile: pick the app type, give an address and a key, and choose up to three numbers to show. The server fetches them on a schedule and sends them with the tile.
2. **Info widgets.** A clock and the local weather, in a slim strip at the top of the dashboard.
3. **Web search** from the existing ⌘K search pill.

### 1c. Why these widgets — demand evidence (measured 2026-11-07)

Four signals, each with its method. None is a usage census; together they rank the candidates consistently.

- **Configs:** public GitHub files that configure each Homepage widget, from GitHub code search (`"type: <name>" filename:services.yaml`; info widgets `"- <name>:" filename:widgets.yaml`). GitHub reports these totals as approximate. For scale: ~1,700 public `services.yaml` files contain `href:`, and 1,152 contain `widget:`, so about two in three Homepage setups use at least one widget.
- **Requests:** Homepage's Feature Requests discussions (all 1,814, fetched via `gh api graphql`), counted where the title names the app, with summed upvotes. Homepage already has all of these widgets, so these are requests to extend them. 763 of the 1,814 titles contain "widget" (4,325 votes). The most-voted widget requests are for long-tail apps (Your Spotify 85, Actual Budget 65, SparkyFitness 62), which supports not chasing the list.
- **Pulls:** Docker Hub pull counts. They are inflated by auto-updaters, so they are an order-of-magnitude signal only.
- **Stars:** GitHub stars of the upstream project.

Every candidate below already exists in both Homepage and Homarr (checked: Homepage `docs/widgets/`, Homarr `packages/definitions/src/integration.ts`). They are the expected set.

| Widget | Configs | Requests / votes | Pulls | Stars | Pick |
|---|---:|---:|---:|---:|---|
| Search | 1,018 | 57 / 154 | — | — | **Phase 1** (as ⌘K web search, Q8) |
| Clock (`datetime`) | 838 | 1 / 4 | — | — | **Phase 1** |
| Weather (`openmeteo`) | 395 (`openweathermap`: 80) | 19 / 47 | — | 6.6k | **Phase 1** |
| Sonarr | 365 | 5 / 29 | 2.36B | 17.6k | **Phase 1** |
| Radarr | 360 | 5 / 22 | 2.37B | 14.7k | **Phase 1** |
| Jellyfin | 328 | 17 / 55 | 460M + 164M | 59.1k | **Phase 1** |
| qBittorrent | 286 | 15 / 67 | 348M | 41.4k | **Phase 2** |
| Proxmox VE | 271 | 11 / 66 | — | — | **Phase 2** |
| Pi-hole | 204 | 13 / 31 | 1.00B | 61.7k | **Phase 2** |
| Plex | 141 | 9 / 33 | 925M + 910M | — | Later |
| AdGuard Home | 132 | 5 / 18 | 203M | 38.2k | Later |
| Transmission | 44 | 2 / 2 | 538M | 15.4k | Later |

Not picked, with the reason:
- **Host resources** (`resources`, 1,118 configs): Homepage reads CPU and RAM of the machine it runs on. Homepad's API runs in a container, often in a cluster, so those numbers would describe a pod. Proxmox VE covers the "how is my server" case.
- **Plex:** half the configs of Jellyfin. It has an XML-first API and a plex.tv token flow. It's the first "Later" pick.
- **Pi-hole over AdGuard Home** for the DNS slot, by configs (204 vs 132). AdGuard is a small provider and the first candidate after Plex.
- Also seen, for a later spec: Prowlarr (272), Portainer (210), Immich (161), Home Assistant (144), Jellyseerr (113), Glances (110).

---

## 2. Model

### 2.1 Two kinds of widget

- **Service widget.** Attached to one catalog service (a tile), at most one per service. It is shared catalog data: an admin configures it once, and every adult who can see the tile sees its numbers. It shows up to three **fields** (typed values) chosen from what its provider offers.
- **Info widget.** Not tied to a tile: the clock and the weather. Admin-configured, global. They render in the **glance strip** (Q7), above the health bar.

Web search is a launcher setting, not a widget (Q8). It is configured in the same Admin Panel section.

### 2.2 Where widget data renders

| Surface | Large | Compact | List | Phone (<640px) |
|---|---|---|---|---|
| Tile widget line | New line under the name, up to 2 fields | Replaces the status line text while the app is not DOWN, up to 2 fields | Same rule, up to 3 fields | Same as the active density. One line, ellipsis. The first field always shows |
| Glance strip | Time, date, weather, place, high/low | same | same | Time and weather temperature only |

Rules that hold in every density:

- **An outage wins.** If Gatus reports the service DOWN, the line shows the status words ("Offline · 6 min"), not widget data.
- **The status dot never changes.** It is the status signal (SPEC-242); widgets add information and replace none of it.
- **No widget, no change.** A tile without a widget renders exactly as today.
- There is **no expanded tile or detail view** in v1. Lists (what's playing, which episodes) are out of scope (§12).

### 2.3 Who sees what

| Viewer | Tile widget data | Glance strip | Web search row | Widget config (address, user, key) |
|---|---|---|---|---|
| Admin | Yes | Yes | Yes | Address and user: yes, in the editor only. Key: **never**, only "saved" |
| Adult user | Yes | Yes | Yes | Never |
| Kid | **No** (Q3) | Yes | Off by default | Never |
| Signed out | No | No | No | Never |

A kid's view must not leak data from apps the kid can't see. With Q3 (a), kids receive no widget data at all, so there is nothing to leak. If Q3 (b) is chosen later, widget data follows the existing `VisibleServiceIDs` filter, because it rides on `GET /api/services` (§7), which is already `kid-filtered`. The route-coverage test then catches a widget field on a hidden app.

---

## 3. Phasing

| Phase | Ships | Proves |
|---|---|---|
| **1** | Widget manager, provider interface, key store, address guard, test connection. Service widgets: **Jellyfin, Sonarr, Radarr**. Info: **clock, weather**. **⌘K web search.** Admin UI, My settings switch. | The whole framework, on API-key auth |
| **2** | Service widgets: **Pi-hole (v6), qBittorrent, Proxmox VE** | Sign-in sessions (Pi-hole, qBittorrent), token auth and self-signed TLS (Proxmox) |
| Later (own spec) | Plex, AdGuard Home, Transmission, Emby; kid opt-in (Q3 b); network allow-list (Q5 b); detail popovers | — |

Every Phase 2 provider is just a new implementation of the §6 interface plus its field copy. No schema or API change is planned for Phase 2.

---

## 4. User stories

- **US-1.** As the admin, I attach a Jellyfin widget to my Jellyfin tile, paste an API key, press Test, and see "Connected", so everyone in the house sees what's playing without opening Jellyfin.
- **US-2.** As an adult user, I glance at the dashboard and see "3 this week · 1 in queue" on Sonarr, without having a Sonarr login.
- **US-3.** As the admin, I know my API keys never reach a browser, so a family member's laptop holds nothing an attacker could reuse.
- **US-4.** As anyone in the house, I see the time and today's weather at the top of the dashboard on the kitchen iPad.
- **US-5.** As a user, I type a question into ⌘K and press Enter on "Search the web" without leaving the dashboard.
- **US-6.** As the admin, when a widget breaks (key revoked, app moved), the editor tells me what's wrong in plain words, while the tile quietly falls back to its status line.
- **US-7.** As a parent, my kid's iPad shows the clock and weather but no numbers from my apps.

---

## 5. Acceptance criteria

Phase tags: **P1** ships in Phase 1; **P2** in Phase 2.

| ID | Criterion | Priority | Phase |
|---|---|---|---|
| AC-001 | An admin can attach at most one widget to a catalog service, choosing its type from the server's provider registry (P1: Jellyfin, Sonarr, Radarr; P2: Pi-hole, qBittorrent, Proxmox VE). | Must | P1 |
| AC-002 | Widget values are fetched only by the API server. The browser never contacts an upstream app. No widget address, username or key appears in any response to a non-admin, or anywhere in `dist/`. | Must | P1 |
| AC-003 | A widget key is write-only. No API response, log line or error message ever contains it, including admin responses. The editor shows "Key saved" with **Replace** and **Remove**. | Must | P1 |
| AC-004 | Keys are stored encrypted (AES-256-GCM, a random 12-byte nonce per write) with a key from `HOMEPAD_SECRET_KEY` (64 hex chars). Without it, the API refuses to store a key, and the editor disables the key field with a one-line explanation. Widgets that need no key keep working. | Must | P1 |
| AC-005 | If a stored key can't be decrypted (the server key changed or was lost), the widget is in state `error` with code `secret_unreadable`, and the editor asks for the key again. Nothing else fails. | Must | P1 |
| AC-006 | For an adult, `GET /api/services` carries `widget` on each service that has an enabled widget: kind, state, `asOf`, and the chosen fields as typed values (§7.2). The key is omitted when there is no widget. | Must | P1 |
| AC-007 | Compact and List: while the service is not DOWN and its widget state is `ok` or `stale`, the status line shows the widget fields. When the service is DOWN, or the widget is `loading` or `error`, the status line is exactly today's. The status dot is unchanged in every case. | Must | P1 |
| AC-008 | Large: a tile with a widget shows one widget line under the name. Tiles in the same grid row keep equal heights, and a row with no widget tile stays at today's 120px. | Must | P1 |
| AC-009 | The admin picks up to 3 fields. List shows up to 3; Compact and Large show up to 2. The line is a single line with an ellipsis, and the first field stays visible at a 320px viewport. | Must | P1 |
| AC-010 | The widget line is part of the tile's accessible description (`aria-describedby`), because the link's accessible name stays the service name. | Must | P1 |
| AC-011 | Widget values update on the live 60s poll with no reload: `mergeStatuses` carries `widget` changes. A poll where nothing changed still causes no render. | Must | P1 |
| AC-012 | **Stale:** when the last good value is older than 2× the widget's interval, or the latest fetch failed, the line shows the last values with a leading ◷ mark (not faded, so it stays AA), and its description says "Updated N min ago". After 30 min with no good value, the widget is `error` and the tile falls back to AC-007. | Must | P1 |
| AC-013 | Dashboard tiles never show upstream error text, codes, or addresses. Error detail appears only in the admin editor (AC-024). | Must | P1 |
| AC-014 | For a kid session, `GET /api/services` carries no `widget` key on any service (Q3 a). | Must | P1 |
| AC-015 | Every widget admin route (§7.3) is class `admin-only` and appears in `routes_test.go`. A kid and an adult non-admin both get 403. | Must | P1 |
| AC-016 | Widgets are fetched by a background manager beside the Gatus poller. `GET /api/services` reads its snapshot and never waits on, or fails because of, an upstream app. | Must | P1 |
| AC-017 | Every widget request goes through one guarded client: `http`/`https` only; 5s per request, 10s per widget refresh; response bodies capped at 1 MiB; **no redirects followed**; TLS verified unless the admin ticks "Allow self-signed certificate" on that widget. | Must | P1 |
| AC-018 | The guarded client refuses link-local and metadata addresses (`169.254.0.0/16`, `fe80::/10`, `fd00:ec2::254`), checked on the resolved IP at connect time, so DNS rebinding can't get around it. Private and loopback addresses are allowed (Q5 a). | Must | P1 |
| AC-019 | Only the provider's typed fields leave the widget package. Raw upstream bodies are never returned to a browser, stored or logged. Logs name the widget and the error code, never the full URL or a header. | Must | P1 |
| AC-020 | Refresh interval: 1 min by default; 1, 5 or 15 min. After repeated failures a widget backs off (doubling, up to 15 min); a successful fetch or a config change resets it. Test connection ignores the backoff. | Must | P1 |
| AC-021 | **Test connection** tests the form's unsaved values. A blank key field means "use the saved key". It returns either OK with a one-line summary (app version and one value), or one error code with fixed copy (UX §6.4). An admin can run at most one test every 2 seconds. | Must | P1 |
| AC-022 | Session-auth providers (Pi-hole, qBittorrent) keep their session between refreshes and sign in again only after a 401. A changed or removed widget ends its Pi-hole session (`DELETE /api/auth`). | Must | P2 |
| AC-023 | Deleting a service deletes its widget (FK cascade). Changing a widget's type or address clears its saved key, so a key is never sent to a host it wasn't entered for. | Must | P1 |
| AC-024 | The tile editor has a **Widget** section: Type, Address (blank = the tile's link), the credential fields for the type with "where to find it" help, Show (field checkboxes, max 3), Refresh, Allow self-signed certificate (https only), Test connection, Remove widget, and the last error in plain words. | Must | P1 |
| AC-025 | When the tile's name or library source matches a provider (e.g. "Jellyfin"), the Type select suggests it. The admin still chooses. | Should | P1 |
| AC-026 | **Admin Panel → Widgets** section: Clock (on/off; 12-hour, 24-hour or the device's choice), Weather (on/off; place found by name; °C/°F), Web search (provider or a custom URL with `{query}`). | Must | P1 |
| AC-027 | The clock renders in the browser in the viewer's time zone, updates once a minute on the minute, and makes no network request. | Must | P1 |
| AC-028 | Weather is fetched by the server from Open-Meteo every 15 min. The browser never calls Open-Meteo. Coordinates are stored rounded to 2 decimals. The strip shows an "Open-Meteo" credit link (CC BY 4.0). Place search goes through the server too (`GET /api/admin/geocode`). | Must | P1 |
| AC-029 | `GET /api/widgets/info` needs a session and is class `catalog-free`: kids may read it, and it is never public. | Must | P1 |
| AC-030 | With a non-empty ⌘K query, the last row is "Search the web for '<query>'". Enter or a click opens the provider in a new tab with the query URL-encoded. It's off for kid sessions unless the admin turns it on. | Must | P1 |
| AC-031 | My settings has **Show widgets** (on by default). Off hides the tile widget lines and the glance strip for that user only. Kids don't have it. | Should | P1 |
| AC-032 | Entry CSS stays within `ENTRY_CSS_GZIP_BUDGET` (20,500 B) under Q10 (a). The admin widget styles ship in a lazy CSS chunk, and `bundle-budget.test.ts` asserts that the admin widget selectors are absent from `index-*.css`. | Must | P1 |
| AC-033 | Entry JS stays within `ENTRY_JS_GZIP_BUDGET` (105,000 B). The widget editor code lives in the existing lazy `TileEditModal` and `SettingsPanel` chunks. | Must | P1 |
| AC-034 | `docs/widgets.md` explains each type: where to find its key, the least-privilege choice (a Proxmox token with the PVEAuditor role; a Pi-hole app password), the weather egress, and `HOMEPAD_SECRET_KEY` setup. `compose.yaml` and `.env.example` gain the `HOMEPAD_SECRET_KEY` line. Linked from the README. | Must | P1 |
| AC-035 | An install with no widgets configured looks and behaves exactly as today. The only additions are the Admin Panel "Widgets" section and the My settings switch. Clock and weather start **off**. | Must | P1 |

---

## 6. Server design (homepad-api)

### 6.1 Package layout

```
internal/widgets/
  manager.go      Manager: schedule, cache, backoff, Snapshot()   (beside internal/gatus, same shape)
  provider.go     Provider interface, registry, Field / Value types, error codes
  client.go       the guarded HTTP client (AC-017, AC-018) — the only HTTP client providers get
  secrets.go      AES-256-GCM seal/open with HOMEPAD_SECRET_KEY
  providers/
    jellyfin.go  arr.go (sonarr + radarr)  pihole.go  qbittorrent.go  proxmox.go
  weather.go      Open-Meteo forecast + geocoding (also through client.go)
```

It **sits beside** the Gatus poller and doesn't reuse it. The two share a pattern, not code: `Run(ctx)` started from `main.go`, an immutable snapshot behind an `RWMutex`, and handlers that merge the snapshot into responses without blocking. Gatus answers one bulk endpoint; widgets are N small, independent upstreams with their own intervals, auth and backoff, so they need their own scheduler.

### 6.2 Provider interface

```go
type AuthType string // "none" | "api_key" | "password" | "user_password" | "token"

type Unit string // "count" | "percent" | "bytes_per_sec" | "ratio" (running/total)

type FieldSpec struct {
    Key     string // stable id, e.g. "playing"
    Label   string // short copy, e.g. "playing" — UX §9
    Unit    Unit
    Default bool   // preselected for a new widget (at most 3)
}

type Config struct {
    BaseURL     *url.URL // the widget's address, or the tile URL when blank
    Username    string   // qBittorrent user, Proxmox token id; "" otherwise
    Secret      string   // decrypted just before Fetch; never logged
    InsecureTLS bool
}

type Value struct {
    Num   *float64 // counts, rates, percents
    Total *float64 // for Unit "ratio": running/total
}

type Result struct {
    Values  map[string]Value // keyed by FieldSpec.Key; a field the app didn't answer is absent
    Version string           // for the Test connection summary, "" if unknown
}

type Provider interface {
    Kind() string   // "jellyfin"
    Label() string  // "Jellyfin"
    Auth() AuthType
    Fields() []FieldSpec // every field it can return, in display order
    Match() []string     // name/slug hints for AC-025, e.g. {"jellyfin"}
    Fetch(ctx context.Context, c *Client, cfg Config, st *State) (Result, error)
}
```

- `State` is per-widget memory owned by the manager (a Pi-hole SID, a qBittorrent cookie). It's dropped when the config changes.
- Providers return typed errors: `ErrAuth`, `ErrBadResponse`, `ErrUnsupportedVersion`. The client maps transport failures to `unreachable`, `timeout`, `tls`, `redirect`, `blocked_address`. The full code list is in §7.4.
- **The registry is the source of truth for kinds.** The DB stores the kind as text and Go validates it against the registry, so a new provider needs no migration.
- A test fails if any file under `internal/widgets/providers/` constructs its own `http.Client` or calls `http.Get`/`http.DefaultClient`. The rule "every provider uses the guarded client" is enforced by a test, the same way `routes_test.go` enforces route classes.

### 6.3 Manager: scheduling, caching, rate limits

- On start it loads all enabled widgets and fetches each once (up to 4 at a time), then refreshes each one on its own interval.
- **At most one in-flight fetch per widget.** A test-connection run never overlaps the scheduled fetch of the same widget.
- Each refresh has a 10s budget; each HTTP request inside it has 5s (AC-017).
- **Backoff:** after 2 consecutive failures, the next attempt waits 2× the interval, doubling up to 15 min (AC-020).
- **The snapshot holds** state, `asOf` (last success), the last good `Result`, and the last error code for each widget. It lives in memory. A restart re-fetches, the same as Gatus.
- Config writes call `manager.Reload(serviceID)`. That drops the widget's `State` and schedules an immediate fetch.
- **Upstream load:** Phase 1 widgets at the 1 min default make 2–3 small GETs per minute per widget. Every endpoint chosen (§6.5) returns a count or a summary, never a full library list.
- Weather is one GET every 15 min (96/day, under Open-Meteo's 10,000/day). The weather fetch runs only while weather is on.

**States** (the dashboard reads these; AC-012):

| State | Meaning | Dashboard |
|---|---|---|
| `loading` | Configured, no fetch finished since start or since the config changed | As if no widget (Compact/List); an empty reserved line (Large) |
| `ok` | The last fetch succeeded, at most 2× interval ago | Values |
| `stale` | Have a good value under 30 min old, but the last fetch failed or is overdue | Values with a ◷ mark, "Updated N min ago" |
| `error` | No good value in 30 min | As if no widget |

### 6.4 Keys and secrets

- **The server key:** `HOMEPAD_SECRET_KEY`, 32 bytes as 64 hex chars. It's read once at start; a malformed value logs an error and is treated as unset.
  - It is **not** added to the env-config allow-list (`env_config.go`), because it's a credential.
  - The admin can still tell whether it's set. `GET /api/admin/widgets/kinds` returns `secretKeySet: true|false`.
- **At rest:** `secret_ciphertext` + `secret_nonce` in `service_widgets`. The GCM additional data is the service id, so a ciphertext copied onto another widget row won't decrypt.
- **Write-only:** `PUT` takes `secret`. Omitted means keep, `""` means clear, and any other value replaces it. No response has a field that could carry it; responses carry `hasSecret: bool`.
- **Address binding (AC-023):** changing `kind` or the address origin (scheme + host + port) clears the saved key. Without this, an admin could re-point a saved Sonarr key at a host that records request headers. The editor says so before saving (UX §6.3).
- **Key rotation** is out of scope. A changed server key makes every saved key `secret_unreadable` (AC-005), and the admin re-enters them.

### 6.5 Per-widget data contract

All paths are relative to the widget's address. "Default" marks the preselected fields. Counts never include titles or names (§12).

**Jellyfin** — auth `api_key`, sent as `Authorization: MediaBrowser Token="<key>"`. Key: Jellyfin Dashboard → API Keys.

| Field | Label | Unit | Source | Default |
|---|---|---|---|---|
| `playing` | playing | count | `GET /Sessions?activeWithinSeconds=960`, sessions with `NowPlayingItem` | ✓ |
| `movies` | movies | count | `GET /Items/Counts` → `MovieCount` | ✓ |
| `series` | shows | count | `GET /Items/Counts` → `SeriesCount` | ✓ |
| `episodes` | episodes | count | `GET /Items/Counts` → `EpisodeCount` | |
| `songs` | songs | count | `GET /Items/Counts` → `SongCount` | |
| `books` | books | count | `GET /Items/Counts` → `BookCount` | |

Version: `GET /System/Info/Public` → `Version`.

**Sonarr** and **Radarr** — one provider (`arr.go`), two kinds. Auth `api_key`, header `X-Api-Key`. Key: Settings → General → API Key. Endpoints checked against each project's current `openapi.json`.

| Field | Label | Unit | Source | Default |
|---|---|---|---|---|
| `upcoming` | this week | count | `GET /api/v3/calendar?start=<now>&end=<now+7d>` → array length | ✓ |
| `queued` | in queue | count | `GET /api/v3/queue/status` → `totalCount` | ✓ |
| `missing` | missing | count | `GET /api/v3/wanted/missing?pageSize=1&monitored=true` → `totalRecords` | ✓ |

Version: `GET /api/v3/system/status` → `version`. `/api/v3/series` and `/api/v3/movie` are deliberately not used: they return the whole library, which can run to several MB.

**Pi-hole (v6+)** — P2. Auth `password` (an app password is recommended; it skips 2FA).
- `POST /api/auth {"password": …}` → `session.sid`. Then send header `X-FTL-SID: <sid>`.
- The session lasts 30 min and each request extends it, so a 1-min refresh keeps one session alive (AC-022).

| Field | Label | Unit | Source | Default |
|---|---|---|---|---|
| `queries` | queries | count | `GET /api/stats/summary` → `queries.total` | ✓ |
| `blocked` | blocked | count | → `queries.blocked` | |
| `blocked_pct` | blocked | percent | → `queries.percent_blocked` | ✓ |
| `blocklist` | on blocklist | count | → `gravity.domains_being_blocked` | |
| `clients` | clients | count | → `clients.active` | ✓ |

Pi-hole v5 is detected by `/api/auth` returning 404 and reported as `unsupported_version`. Version: `GET /api/info/version`.

**qBittorrent** — P2. Auth `user_password`.
- `POST /api/v2/auth/login` (form `username`, `password`, with a `Referer` header set to the widget's origin, which qBittorrent's CSRF check expects). The server keeps whatever session cookie it sets.
- "Bypass authentication for clients on localhost / whitelisted IP subnets" works with blank fields.

| Field | Label | Unit | Source | Default |
|---|---|---|---|---|
| `down` | ↓ | bytes_per_sec | `GET /api/v2/transfer/info` → `dl_info_speed` | ✓ |
| `up` | ↑ | bytes_per_sec | → `up_info_speed` | ✓ |
| `downloading` | downloading | count | `GET /api/v2/torrents/info?filter=downloading`, array length counted while streaming | |
| `seeding` | seeding | count | `GET /api/v2/torrents/info?filter=seeding`, same | |

The two counts are counted while streaming, with an 8 MiB read cap (the one exception to 1 MiB). Past it the count shows as "many". Version: `GET /api/v2/app/version`.

**Proxmox VE** — P2. Auth `token`.
- Header `Authorization: PVEAPIToken=<user@realm!tokenid>=<secret>`.
- The Username field holds `user@realm!tokenid`; the key holds the token secret.
- Docs recommend a token with the PVEAuditor role. Self-signed TLS is the Proxmox default, so the editor suggests the "Allow self-signed certificate" box for port 8006.

| Field | Label | Unit | Source | Default |
|---|---|---|---|---|
| `vms` | VMs | ratio | `GET /api2/json/cluster/resources` → `type=qemu`, running / total | ✓ |
| `cts` | CTs | ratio | → `type=lxc`, running / total | ✓ |
| `cpu` | CPU | percent | → `type=node`, online nodes, Σ(cpu×maxcpu) / Σmaxcpu | ✓ |
| `ram` | RAM | percent | → nodes, Σmem / Σmaxmem | |
| `nodes` | nodes | ratio | → nodes, online / total | |

Version: `GET /api2/json/version`.

**Weather (Open-Meteo)** — info widget, no key.
- Forecast: `GET https://api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1[&temperature_unit=fahrenheit]`.
- Place search: `GET https://geocoding-api.open-meteo.com/v1/search?name=…&count=5`.
- Both were checked live on 2026-11-07.
- The server maps the WMO `weather_code` to one of 7 conditions (clear, partly cloudy, cloudy, fog, rain, snow, storm), plus day or night.

**Clock** — browser only, no server data beyond its settings.

### 6.6 Formatting

The server sends numbers; the browser formats them with `Intl`:
- Counts get digit grouping below 10,000 and compact form above ("48k").
- `bytes_per_sec` uses decimal units ("4.2 MB/s").
- Percent is a whole number ("12%"), and ratio is "5/7".
- The line joins fields with " · ".

---

## 7. API contract

### 7.1 Route classes (added to `server.go` and `routes_test.go`)

| Method | Path | Class |
|---|---|---|
| GET | `/api/widgets/info` | `catalog-free` |
| GET | `/api/admin/widgets/kinds` | `admin-only` |
| GET | `/api/services/{id}/widget` | `admin-only` |
| PUT | `/api/services/{id}/widget` | `admin-only` |
| DELETE | `/api/services/{id}/widget` | `admin-only` |
| POST | `/api/services/{id}/widget/test` | `admin-only` |
| GET | `/api/admin/geocode` | `admin-only` |

Changed: `GET /api/services` (`kid-filtered`) gains `widget`; `PATCH /api/admin/settings` and `GET`/`PATCH /api/me` gain fields (§7.3).

### 7.2 `GET /api/services` — the `widget` field

```json
"widget": {
  "kind": "sonarr",
  "state": "ok",
  "asOf": "2026-11-07T14:02:11Z",
  "fields": [
    {"key": "upcoming", "label": "this week", "unit": "count", "value": 3},
    {"key": "queued",   "label": "in queue",  "unit": "count", "value": 1}
  ]
}
```

- `fields` follows the admin's chosen order and holds only chosen fields the app answered.
- For a `ratio`, the field also carries `total`.
- `loading` and `error` carry `"fields": []` and no error code (AC-013).
- The key is **absent** when the service has no enabled widget, and always absent for kids (AC-014).
- It never contains the address, username or anything about the key.

### 7.3 Admin and settings

`GET /api/admin/widgets/kinds` → `{secretKeySet, kinds: [{kind, label, auth, fields: [FieldSpec], match: [...], help}]}`. `help` is the "where to find the key" copy.

`GET /api/services/{id}/widget` → 404 when none, otherwise:
```json
{"kind":"jellyfin","address":"http://jellyfin:8096","username":"","hasSecret":true,
 "fields":["playing","movies"],"intervalS":60,"insecureTls":false,"enabled":true,
 "state":"error","error":"auth","lastOkAt":"2026-11-07T13:40:00Z"}
```

`PUT /api/services/{id}/widget`:
- Body: `{kind, address, username?, secret?, fields, intervalS, insecureTls, enabled}`. It whole-replaces the config, except that `secret` follows §6.4.
- Returns 200 with the GET shape.
- 422 for: an unknown kind, more than 3 fields, an unknown field, an interval not in {60, 300, 900}, an address that isn't absolute http(s), or `secret` given while `secretKeySet` is false.

`DELETE /api/services/{id}/widget` → 204.

`POST /api/services/{id}/widget/test`:
- The body is the PUT body. A missing `secret` uses the saved one, unless kind or origin changed.
- Returns 200 `{ok: true, version, fields: [...]}` or 200 `{ok: false, error: "<code>"}`. A failed test is a successful API call, so the editor shows it inline.
- 429 if the same admin tests again within 2s.

`GET /api/admin/geocode?q=Rotterdam` → `[{name, region, country, lat, lon}]`, up to 5. 422 when `q` is under 2 characters.

`GET /api/widgets/info` →
```json
{"clock":{"enabled":true,"hour12":null},
 "weather":{"enabled":true,"state":"ok","asOf":"…","place":"Rotterdam","units":"c",
            "temp":7.7,"high":9.0,"low":2.8,"condition":"cloudy","isDay":false},
 "search":{"enabled":true,"name":"DuckDuckGo","url":"https://duckduckgo.com/?q={query}"}}
```
- `hour12: null` means "use the device's choice".
- For a kid session, `search.enabled` reflects `kidWebSearch`.
- Stored coordinates are never returned here.

`PATCH /api/admin/settings` gains `clockEnabled`, `clockHour12` (true / false / null), `weatherEnabled`, `weatherPlace`, `weatherLat`, `weatherLon`, `weatherUnits` ("c" or "f"), `webSearchEnabled`, `webSearchUrl` (must be https and contain `{query}`), and `kidWebSearch`.

`GET`/`PATCH /api/me` gains `showWidgets` (AC-031). A kid's `PATCH /api/me` still accepts only `themePref`.

### 7.4 Error codes (admin only)

`auth`, `unreachable`, `timeout`, `tls`, `redirect`, `blocked_address`, `bad_response`, `unsupported_version`, `secret_unreadable`, `no_secret_key`. The copy for each is in UX §6.4.

---

## 8. Security

### 8.1 Secrets
See §6.4. Tests:
- A key written through `PUT` never appears in any response body, in captured logs, or in the `service_widgets` row as plaintext.
- After the server key changes, the widget reads `secret_unreadable` and nothing else breaks.

### 8.2 SSRF — the server fetches admin-supplied addresses

**Threat model.**
- Only an admin can set an address, and an admin is trusted with the catalog already.
- The risks are a stolen admin session (or a CSRF on it) turning the server into a probe of the internal network, and a key being sent somewhere it shouldn't go.
- Reaching private addresses is the feature, so the controls bound *what comes back* and *where keys go*, not which private hosts are reachable.

**Controls.**
- **Admin-only writes and tests** (AC-015). The existing session cookie, SameSite and `requireAdmin` apply.
- **Typed output only** (AC-019). The server returns parsed numbers or an error code, never a body. That makes it useless as a general proxy for reading internal pages. Test connection reports "OK + numbers" or a code.
- **No redirects** (AC-017). This blocks a redirect to another host. It also matters because Go forwards custom headers such as `X-Api-Key` across redirects (it strips only `Authorization`, `Cookie` and `WWW-Authenticate` cross-domain). A redirect is usually an SSO login page, so it gets its own code and copy ("Use the app's internal address").
- **Address deny-list on the dialed IP** (AC-018): link-local `169.254.0.0/16` and `fe80::/10`, which covers the cloud metadata endpoints, plus `fd00:ec2::254`. Checked in the dialer's `Control` hook after DNS resolution, so a rebinding hostname can't get past it.
- **Keys bound to the origin they were entered for** (AC-023).
- **Size and time caps** (AC-017), so a slow or huge response can't tie up the server.
- **Test-connection rate limit** (AC-021), so the button isn't a fast port scanner.
- **Out of scope here, but recorded:** the favicon fetcher (`icons.go`) should move onto the same guarded client. That's a follow-up issue, so this spec doesn't change icon behaviour.

### 8.3 Kid filtering
- With Q3 (a), `widget` is dropped for kids in `handleListServices`.
- `routes_test.go`'s kid probe gains a check that no response body for a kid contains a `"widget"` key.
- If Q3 (b) is chosen later, the same probe asserts that no hidden app's widget appears. The widget data lives on the already-filtered `serviceView`, so no new filter path exists to forget.
- `/api/widgets/info` holds no catalog data: time settings, the weather for the household's place, and a search URL.

### 8.4 Leak test
`tests/e2e/no-widget-leak.spec.ts`, modelled on `no-gatus-leak.spec.ts`:
- With a widget configured against a mocked API, no response a non-admin receives contains the widget address, the username, or the key.
- `grep -r` over `dist/` finds neither.

---

## 9. Data model

Migration `0019_widgets` (or the next free number when built). Idempotent, like every migration here, because they re-run on boot.

```sql
CREATE TABLE IF NOT EXISTS service_widgets (
    service_id        UUID PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
    kind              TEXT        NOT NULL,             -- validated against the Go registry
    address           TEXT        NOT NULL DEFAULT '',  -- '' = use services.url
    username          TEXT        NOT NULL DEFAULT '',
    secret_ciphertext BYTEA,                            -- NULL = no key
    secret_nonce      BYTEA,
    fields            TEXT[]      NOT NULL DEFAULT '{}',
    interval_s        INTEGER     NOT NULL DEFAULT 60 CHECK (interval_s IN (60, 300, 900)),
    insecure_tls      BOOLEAN     NOT NULL DEFAULT FALSE,
    enabled           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((secret_ciphertext IS NULL) = (secret_nonce IS NULL)),
    CHECK (cardinality(fields) <= 3)
);

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS clock_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS clock_hour12       BOOLEAN,              -- NULL = device default
    ADD COLUMN IF NOT EXISTS weather_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS weather_place      TEXT    NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS weather_lat        NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS weather_lon        NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS weather_units      TEXT    NOT NULL DEFAULT 'c' CHECK (weather_units IN ('c','f')),
    ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS web_search_url     TEXT    NOT NULL DEFAULT 'https://duckduckgo.com/?q={query}',
    ADD COLUMN IF NOT EXISTS kid_web_search     BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users ADD COLUMN IF NOT EXISTS show_widgets BOOLEAN NOT NULL DEFAULT TRUE;
```

- The widget belongs to the service row, which belongs to the shared-catalog owner, so a widget is shared catalog data (SPEC-245-224).
- The down migration drops `service_widgets` and the added columns.

---

## 10. Frontend

- **`src/api.ts`**: `Service.widget?: TileWidget`, plus typed calls for §7.3.
- **`src/services.tsx`**: `mergeStatuses` compares and copies `widget` (AC-011), with a test that a changed widget value re-renders exactly one tile and an unchanged poll renders none.
- **`src/grid/AppGrid.tsx`**: `ToolLink` renders the widget line per §2.2.
  - In Compact and List it reuses the existing `.app-grid-tool-statusline` element. Only the text changes, so no new CSS is needed for those two densities.
  - In Large it adds `.app-grid-tool-widget`.
  - `aria-describedby` points at the line (AC-010).
- **`src/app/GlanceStrip.tsx`** (new, in the entry chunk): the clock and weather.
  - It reads `/api/widgets/info` on load and every 5 min while the tab is visible.
  - Weather icons are 7 small inline SVGs, so there are no image requests.
- **`src/launcher/`**: the web search row (AC-030), styled with the existing launcher row classes.
- **`src/grid/TileEditModal.tsx`** (lazy): the Widget section (UX §6). **`src/library/SettingsPanel.tsx`** (lazy): the Admin Panel "Widgets" section and the My settings switch. Their styles live in `src/widgets/widget-admin.css`, which both lazy modules import, so Vite emits it as a separate CSS chunk (Q10 a).

---

## 11. CSS budget plan (measured, not guessed)

### 11.1 Measurements (2026-11-07, `gitea/main` at `9c7ce48` = 17.0.0, `npm run build`, vite 5.4.21, gzip as in `bundle-budget.test.ts`)

**The entry CSS today: 19,430 B gzip** (101,356 B raw) against a 20,500 B budget, so **1,070 B of headroom.**

**Series.** Each tag was built in a clean worktree, and the v16.x rows match the test file's own table exactly (v16.6.0 = 18,165), which validates the method.

| Tag | Entry CSS gzip | Δ |
|---|---:|---:|
| v16.6.0 | 18,165 | — |
| v16.7.0 | 18,189 | +24 |
| v16.7.1 | 18,183 | −6 |
| v16.7.2 – v16.7.4 | 18,183 | 0 |
| v17.0.0 (kid accounts) | 19,430 | **+1,247** |

17.0.0 is the largest CSS release on record; the previous worst, v16.1.0, was +800. The test's "3× worst release" rule was set when the worst was +800.

**Per area.** Every top-level rule in the built CSS was assigned to an area by its first class. Tailwind utilities were identified exactly, by compiling `@tailwind utilities` against the same content globs. "Marginal" is total gzip minus the gzip of everything else: what removing the area would save. Areas share gzip context, so the marginals don't sum to the total. The measuring script (a ~70-line PostCSS pass over `dist/assets/index-*.css`) is not committed; it can go under `qa-kit/` if the series should be repeatable in CI.

| Area | Raw B | Marginal gzip B | Needed at first paint? |
|---|---:|---:|---|
| Tile + grid + densities | 18,125 | 2,908 | yes |
| Tailwind utilities | 13,262 | 2,366 | yes |
| Tokens (`:root`, theme, accent) | 5,528 | 1,372 | yes |
| Tile edit modal + service form | 8,205 | 1,305 | **no** (lazy JS chunk) |
| Admin settings panel | 7,268 | 1,209 | **no** (lazy) |
| Tailwind preflight | 4,448 | 1,004 | yes |
| Kid accounts (admin editor + kid shell) | 5,451 | 923 | mostly no |
| Health panel | 5,172 | 859 | yes |
| Header + menus | 5,783 | 843 | yes |
| Login | 3,765 | 673 | login only |
| Command launcher | 4,965 | 634 | on open |
| Changelog overlay | 3,625 | 556 | **no** (on open) |
| App library | 3,402 | 504 | **no** (lazy) |
| Iframe overlay | 2,959 | 434 | **no** (lazy) |
| Alerts + toasts | 2,606 | 302 | yes |
| Recently opened | 1,810 | 192 | yes |
| Keyframes | 1,185 | 171 | yes |

The finding: **about 4.5 kB gzip of entry CSS styles overlays that only load on demand** (tile editor, settings, kid editor, changelog, library, iframe). Every viewer downloads it on first paint. All CSS lives in one `src/index.css`, so Vite can't split it.

**What widgets would cost.** Prototype styles for the UX doc's surfaces were added to a scratch build, measured, and reverted. The prototype is conservative: it includes a loading shimmer the UX doc later dropped.

| Prototype | Entry CSS gzip | Δ vs today | Headroom left |
|---|---:|---:|---:|
| Today | 19,430 | — | 1,070 |
| + tile widget line (all densities, stale state) | 19,650 | +220 | 850 |
| + glance strip (clock, weather, phone rules) | 19,861 | +431 | 639 |
| + admin widget forms, **in the entry** | 20,210 | +780 | 290 |
| + admin widget forms, **as a lazy chunk** (Q10 a) | 19,861 entry + 650 in `TileEditModal-*.css` | +431 | 639 |

The lazy chunk was checked in the same scratch build. A `.css` import in the lazy `TileEditModal.tsx` produced a separate `TileEditModal-<hash>.css`, and the entry didn't change.

### 11.2 Plan

1. **Dashboard styles go in the entry** (+~430 B): the tile line and the glance strip render at first paint. In Compact and List the line reuses `.app-grid-tool-statusline`, so it costs nothing there.
2. **Admin styles go in a lazy CSS chunk** (Q10 a). `widget-admin.css` is imported by the lazy editor modules. It has to be plain CSS, not `@layer components`, because Tailwind 3 rejects `@layer` in a file without its `@tailwind` directive. A chunk that loads later also wins specificity ties, so it uses only new `widget-*` class names and never restyles shared classes.
3. **Reuse before adding.** Inputs, buttons, selects and error text reuse `.tile-edit-input`, `.tile-edit-btn*`, `.settings-error`, `.settings-row`. The weather icons are SVG in JS, not CSS.
4. **Guard it.** `bundle-budget.test.ts` gains assertions that:
   - `index-*.css` contains no `.widget-config` selector;
   - a lazy CSS chunk that has it exists (AC-032).
5. **The budget stays at 20,500 B** for Phase 1. Phase 2 adds providers, not styles. The implementing PR re-measures the real build and records the new number in the test's comment block, per the policy in that file.
6. **Follow-up, filed with this spec's approval:** move overlay-only CSS out of the entry (option c, about 4.5 kB back, measured). It's worth doing before the next design-heavy release, whether or not widgets need it.

---

## 12. Out of scope

- Lists and titles: what's playing, upcoming episode names, torrent names. Counts only in v1, which also keeps viewing habits off a shared screen.
- Detail popovers and expanded tiles; charts and history (PRD §4, Q1).
- More than one widget per service.
- Widgets for kids (Q3), and a per-widget kid opt-in (a later spec).
- A custom-API / JSON-path widget.
- Plex, AdGuard Home, Transmission, Emby and anything else not in §3.
- Pi-hole v5. Proxmox Backup Server.
- Host resource stats (`resources`) (§1c).
- Using a widget's success as evidence for the tile's status dot. Gatus stays the only status source.
- Rotating `HOMEPAD_SECRET_KEY`.
- Moving the favicon fetcher onto the guarded client (a follow-up issue, §8.2).

---

## 13. User test cases

**TC-001 — Attach Jellyfin (happy path).** *Precondition:* admin, `HOMEPAD_SECRET_KEY` set, a Jellyfin tile. Arrange → ✎ on Jellyfin → Widget → Type "Jellyfin", Address `http://jellyfin:8096`, paste the API key → **Test connection**. *Expected:* "Connected to Jellyfin 10.x · 0 playing · 1,204 movies". Save. Within 2 min the Compact tile reads "0 playing · 1,204 movies". *Screenshot:* tile in all three densities.

**TC-002 — Outage wins.** Stop Jellyfin (Gatus DOWN). *Expected:* the line reads "Offline · N min". The editor shows "Can't reach Jellyfin at this address." Restart it, and the numbers come back on the next poll.

**TC-003 — Wrong key.** Revoke the key in Jellyfin. *Expected:* within 3 min the tile shows the last numbers with a ◷ mark and "Updated N min ago" in its description. After 30 min it's back to "Online". The editor reads "Jellyfin didn't accept the API key."

**TC-004 — Keys don't leak.** As an adult non-admin, load the dashboard and save every `/api/*` response. *Expected:* no response contains the address, the username or the key. As admin, `GET /api/services/{id}/widget` has `hasSecret: true` and no key. Search the API logs for the key: not found.

**TC-005 — SSO address.** Set the address to the tile's public URL behind an SSO proxy. Test. *Expected:* "That address sends Homepad somewhere else, often a login page. Use the app's internal address."

**TC-006 — Metadata address.** Set the address to `http://169.254.169.254/`. Test. *Expected:* `blocked_address` copy; no request leaves the server (checked with a test listener).

**TC-007 — Kid.** Sign the iPad in as a kid allowed Jellyfin. *Expected:* the Jellyfin tile shows "Online" with no numbers. The glance strip shows the time and weather. No `/api/*` response the kid receives contains `"widget"`.

**TC-008 — Clock and weather.** Admin Panel → Widgets → turn Clock on and Weather on, search "Rotterdam", pick the first result, °C. *Expected:* the strip shows "14:32 · Sat 7 Nov" and the weather with "Open-Meteo" credit. The browser's network log shows no request to open-meteo.com.

**TC-009 — Web search.** ⌘K, type "jelly fin subtitles". *Expected:* Jellyfin first, "Search the web for 'jelly fin subtitles'" last. Enter on it opens DuckDuckGo with the query in a new tab.

**TC-010 — Server key changes.** Restart the API with a different `HOMEPAD_SECRET_KEY`. *Expected:* the widget becomes `error`, and the editor reads "Homepad can't read the saved key. Enter it again." Everything else works.

**TC-011 — Show widgets off.** An adult turns off My settings → Show widgets. *Expected:* no tile lines and no strip for them. Another user is unchanged.

**TC-012 — Phase 2 session reuse.** Pi-hole widget at the 1-min interval for 1 hour. *Expected:* Pi-hole's session list shows one Homepad session, not 60.

---

## 14. Design (Kare)

UX artifact: [`specs/ux/status-widgets-ux.md`](./ux/status-widgets-ux.md) (Draft). Surfaces:

1. the tile widget line in Large, Compact, List and on a phone, with ok, stale, loading, error and offline states;
2. the glance strip (desktop, iPad, phone);
3. the ⌘K web search row;
4. the Widget section of the tile editor, including test results, the saved-key state and the no-server-key state;
5. the Admin Panel "Widgets" section with the place search;
6. the My settings switch.

## 15. Sign-offs

| Role | Name | Status |
|---|---|---|
| Product | Caleb | Pending — §0 Q1…Q12 |
| Design | Kare | Pending — `specs/ux/status-widgets-ux.md` |

## 16. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1.0 | Draft from next-work item 4, with demand data (§1c), code grounding (§1a) and CSS measurements (§11). |
