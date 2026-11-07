# Implementation Plan: Status Widgets (Phase 1)

**Spec:** [`specs/SPEC-status-widgets.md`](../../specs/SPEC-status-widgets.md) v0.1.0 (APPROVED 2026-11-07, Q1–Q12 = a)
**UX:** [`specs/ux/status-widgets-ux.md`](../../specs/ux/status-widgets-ux.md) (APPROVED 2026-11-07, W-1…W-4 as proposed)
**Created:** 2026-11-07
**Team:** Solo + agent team (one agent per repo, worktrees)
**Estimated effort:** ~38h of task time across two repos, about 5 working days solo (the spec says 4–5)
**Target:** the next 17.x minor (additive: one migration, new routes, no breaking change). No version bump in the feature PRs.
**Maturity:** GA — all gates blocking, strict TDD, 90% coverage on `src`

---

## Overview

Phase 1 adds three things, all fetched or configured on the server:

1. **Service widgets** on tiles: Jellyfin, Sonarr and Radarr. An admin attaches one to a tile, gives an address and a key, and picks up to three numbers.
2. **Info widgets** in a slim glance strip: a clock (browser only) and the weather (Open-Meteo, fetched by the server, with the CC BY 4.0 credit).
3. **Web search** as the last row of ⌘K (DuckDuckGo by default).

It lands as two PRs: `homepad-api` first (the contract), then `homepad` (the frontend, the PRD edit, the docs and the compose lines). Phase 2 (Pi-hole, qBittorrent, Proxmox VE) is not in this build.

The same build also closes **homepad-api #90**: the favicon fetcher moves onto the new guarded client. The spec (§8.2, §12) recorded that as a follow-up; it is pulled in here because the guarded client exists in this PR and #90 asks for exactly it.

## Findings from reading the code (gitea/main 2026-11-07: api `32f3200`, web `9c7ce48`)

- **The migration runner has no version table.** `storage.Migrate` globs `*.up.sql`, sorts them lexically, and runs every file on every boot in one transaction under an advisory lock. Every migration is idempotent (`IF NOT EXISTS`). So a gap in the numbering (0020 present, 0019 not yet merged) changes nothing: nothing records "applied up to N", and nothing checks that numbers are contiguous. When household-basics' 0019 lands later, it simply runs before 0020 on the next boot. The one rule this imposes: 0020 must not depend on anything 0019 creates, and 0019 must not depend on 0020. Neither does.
- `GET /api/services` is built in `handleListServices` from the Gatus snapshot; it never blocks on Gatus. The widget snapshot slots in the same way.
- `GET /api/system/config` is **public** and shares `systemConfigView` with the admin `PATCH /api/admin/settings` response. The new settings hold the household's coordinates, so they must **not** join the public view. The PATCH response gains a separate `widgets` block (admin-only route), and the public GET is unchanged.
- There is no admin GET for settings: the admin panel reads the public config. For the new settings the admin panel reads `GET /api/widgets/info` (session, catalog-free), which for an admin session also carries `search.kids` (the kid web-search switch). See Contract notes.
- `icons.go` builds two bare `http.Client{Timeout: 5s}` clients: they follow up to 10 redirects and dial any address, including `169.254.169.254` (#90).
- `routes_test.go` already holds an independent class table and a kid probe of every route. The new routes join both, and the probe gains "no kid response contains a `"widget"` key".
- Web: entry JS is **100,958 B** gzip (budget 105,000, headroom 4,042) and entry CSS **19,430 B** (budget 20,500, headroom 1,070), measured on `9c7ce48`. JS headroom is the tighter one, so the glance strip's JS (clock, weather, icons) is lazy-loaded, and every admin-only call lives in a module only the lazy chunks import.
- `mergeStatuses` copies only `status` and `uptimeChecks`; a new per-tile field is dropped on every live poll unless it is changed with it (AC-011).
- The Compact/List status line is `.app-grid-tool-statusline`, rendered from `tileStatusLine()`. Only its text changes for a widget tile.

## Contract notes (decisions inside the spec's answers)

These pin down details the spec leaves open. Both PRs follow them.

- **Field order** is the provider's order (W-2). The server normalises `fields` to that order on PUT, so the tile line, the editor chips and the stored array always agree.
- **`GET /api/widgets/info`**: as spec §7.3. For an admin session `search` also carries `kids: bool` (the kid web-search switch), so the Admin Panel can show its current value; other sessions never see it. `weather.place` is the stored place name; coordinates are never returned.
- **`PATCH /api/admin/settings`** accepts the spec's new fields and returns the existing `systemConfigView` plus `widgets: {clockEnabled, clockHour12, weatherEnabled, weatherPlace, weatherUnits, webSearchEnabled, webSearchUrl, kidWebSearch}`. `weatherEnabled: true` is refused (422) until a place is set. `clockHour12` takes `true`, `false` or `null`.
- **Web search providers:** the server names the provider from its URL (DuckDuckGo, Google, Bing, Kagi, Startpage); any other https URL with `{query}` is "Custom" and is named by its host.
- **HTTP status mapping in the guarded client:** 401/403 → `auth`; any 3xx → `redirect`; any other non-2xx → `bad_response`; a body over the cap → `bad_response`; dial refused by the guard → `blocked_address`.
- **Show widgets off** is a render gate in the browser, like the uptime display: the data still rides on `/api/services`, and the strip is not rendered.
- **One Save never half-applies** (UX §6.2): the editor runs every check the server makes for a 422 before it sends anything, then sends the widget PUT before the tile PATCH. A transport failure between the two can still split them; that is recorded as a known limit.

---

## Phase 1 — Server (homepad-api) · AC-001…AC-006, AC-013…AC-023, AC-026…AC-029, AC-031 (API half)

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-101 | RED → GREEN: `internal/widgets/client.go`, the guarded client. http/https only; 5s per request; 1 MiB body cap; no redirects; TLS verified unless `InsecureTLS`. A dialer that resolves the host itself, refuses `169.254.0.0/16`, `fe80::/10` and `fd00:ec2::254`, and dials only the checked IP; a `Control` hook re-checks the connected address. Tests: httptest fakes for each error code; a resolver fake that rebinds a hostname to `169.254.169.254` is refused before any connection; loopback and private addresses are allowed. | 4h | — |
| TASK-102 | RED → GREEN: `secrets.go`. AES-256-GCM, 12-byte random nonce per seal, the service id as additional data. `HOMEPAD_SECRET_KEY` is 64 hex chars; anything else is treated as unset and logged without the value. Tests: round trip, fresh nonce per seal, wrong AAD and wrong key fail, malformed keys. | 1.5h | — |
| TASK-103 | RED → GREEN: `provider.go` (interface, field specs, error codes) and `providers/` (Jellyfin; Sonarr and Radarr in `arr.go`). httptest fakes of each upstream's endpoints (spec §6.5). Tests: values, missing fields absent, 401 → `auth`, junk JSON → `bad_response`, auth headers sent. **Source test:** no file under `providers/` builds an `http.Client` or calls `http.Get` / `http.DefaultClient`. | 4h | 101 |
| TASK-104 | RED → GREEN: `manager.go`. Load enabled widgets, fetch each once (4 at a time), then each on its own interval; one in-flight fetch per widget; a 10s budget per refresh; backoff after 2 failures (2×, doubling, max 15 min); `Reload(serviceID)` resets it. Snapshot states `loading` / `ok` / `stale` / `error` with the 2×-interval and 30-min rules. A fake clock drives the tests. | 4h | 103 |
| TASK-105 | RED → GREEN: `weather.go`. Open-Meteo forecast and geocoding through the guarded client (base URLs injectable for httptest), WMO code → 7 conditions, every 15 min while weather is on. | 2h | 101 |
| TASK-106 | Migration `0020_widgets` (spec §9) plus its down file. Storage: widget CRUD, settings columns, `users.show_widgets`. Tests: idempotent re-run, FK cascade on service delete, the CHECKs, and no plaintext key in the row. | 2h | — |
| TASK-107 | API routes (spec §7.1) with their classes: kinds, widget GET/PUT/DELETE, test (2s per-admin limit), geocode, `GET /api/widgets/info`. `widget` on `GET /api/services` for adults only (AC-014). Settings PATCH and `/api/me` `showWidgets`. Changing kind or origin clears the key (AC-023). | 4h | 102–106 |
| TASK-108 | **Security tests:** a written key never appears in any response (admin included), in captured logs, or in the row; a changed server key → `secret_unreadable` and nothing else breaks; kid and adult non-admin get 403 on every admin route; the kid probe finds no `"widget"` key; tiles carry no error code or address (AC-013). | 2h | 107 |
| TASK-109 | **#90:** `fetchFavicon` uses the guarded client (no redirects, the address guard, the size cap). Tests: a redirect is not followed, a metadata address is refused with nothing sent, a loopback favicon still works. | 1.5h | 101 |
| TASK-110 | `main.go` wiring (manager and weather `Run`, `HOMEPAD_SECRET_KEY`), README API table rows. `HOMEPAD_SECRET_KEY` stays off the env-config allow-list. | 1h | 107 |

**Gate:** `gofmt -l .`, `go vet ./...`, `go test ./... -count=1 -p 1` against a throwaway `homepad_test` Postgres, and `go test -race ./internal/widgets/...`.

## Phase 2 — Frontend (homepad) · AC-007…AC-012, AC-024, AC-025, AC-026 (UI), AC-027, AC-030…AC-035

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-201 | `api.ts`: `Service.widget`, `WidgetsInfo`, `widgetsInfo()`, `showWidgets` on `User` and its setter. Admin calls (kinds, widget CRUD, test, geocode, settings) in `src/widgets/widgetAdminApi.ts`, imported only by lazy chunks. | 1.5h | Phase 1 contract |
| TASK-202 | RED → GREEN: `mergeStatuses` carries `widget` (AC-011): a changed value re-renders exactly that tile; an unchanged poll returns the same array. | 1h | 201 |
| TASK-203 | RED → GREEN: `src/widgets/format.ts` (Intl counts, compact above 10,000, percent, ratio, bytes/s, prefix labels) and the line rules: max fields per density, ◷ for stale, the description text. | 1.5h | 201 |
| TASK-204 | RED → GREEN: `ToolLink` widget line. Compact/List reuse `.app-grid-tool-statusline` (text only); Large adds `.app-grid-tool-widget`, reserved on widget tiles in every state; DOWN, `loading` and `error` fall back (AC-007, AC-008); `aria-describedby` (AC-010); Show widgets off = no line. | 2.5h | 203 |
| TASK-205 | RED → GREEN: glance strip. A small entry hook reads `/api/widgets/info` on load and every 5 min while visible; the strip itself (clock, weather, 7 inline SVG icons, the Open-Meteo credit) is a lazy chunk, rendered only when the clock or weather is on and Show widgets is on. The clock updates on the minute, never a live region (AC-027). Styles in the entry (`index.css`). | 3h | 201 |
| TASK-206 | RED → GREEN: ⌘K web search row (AC-030): last row with a non-empty query, the only row (selected) when nothing matches, opens a new tab with the query encoded, hidden for kids unless the server says on. The pill reads "Search apps and the web" while it is on. | 1.5h | 205 |
| TASK-207 | RED → GREEN: tile editor Widget section (UX §6): Type with "Suggested" (AC-025), Address, key states (empty, Key saved with Replace/Remove, no server key), Show chips (max 3, "3 of 3"), Refresh, Allow self-signed (https only), Test connection with the fixed copy per code, Remove widget, last error line. Save order per Contract notes. | 4h | 201 |
| TASK-208 | RED → GREEN: Admin Panel → Widgets after System (W-3): Clock, Weather with place search, Web search provider/custom URL, Kids can search the web. My settings → Show widgets (adults only, AC-031). | 3h | 201 |
| TASK-209 | `src/widgets/widget-admin.css`, imported by the two lazy modules. `bundle-budget.test.ts`: `index-*.css` has no `.widget-config`, a lazy CSS chunk does (AC-032); entry JS within budget (AC-033). Re-measure and record the numbers in the test's comment block. | 1h | 207, 208 |
| TASK-210 | Browser gate: the widget line in Large, Compact and List at 1440 and 390; the strip at 1440, 820 and 390; a kid board with the strip and no numbers. e2e `no-widget-leak.spec.ts` (spec §8.4): no non-admin response carries the address, username or key, and `dist/` holds none of them. | 2.5h | 204–208 |
| TASK-211 | `docs/widgets.md` (AC-034), README link, `HOMEPAD_SECRET_KEY` in `.env.example`, `compose.yaml` and `compose.build.yaml`. PRD §4 amendment (Q1). | 1h | — |

**Gate:** `npm run lint && npm run typecheck && npm run build && npx vitest run --coverage` (≥90%), then `npm run test:gate` and `npm run test:e2e`.

---

## Order and parallelism

```
TASK-101..110 (api PR) ─────────────────────────────►
TASK-201..211 (web PR, against the contract above and mocks) ─►  web PR merges after the api PR reaches staging
```

- Two agents: one per repo. File ownership doesn't overlap.
- Sibling builds (household-basics, backup/import) touch `server.go`, `routes_test.go`, the Admin Panel and settings. Each PR rebases on `gitea/main` right before it opens.

## Effort summary

| Phase | Hours |
|---|---|
| 1 Server | 26 |
| 2 Frontend | 22.5 |
| **Total** | **~38h** (with overlap from two agents) |

## Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| A key reaches a browser or a log | L | H | Write-only field, no response struct can carry it; TASK-108 scans every response, the log and the row. |
| The server is used to probe the network | M | M | Admin-only, typed output only, no redirects, deny-list on the dialled IP, 2s test limit (TASK-101, 107). |
| Entry JS crosses 105,000 B | M | M | Glance strip lazy; admin API module lazy-only; measured before and after (TASK-209). |
| Entry CSS crosses 20,500 B | L | M | Admin styles in a lazy chunk; tile line reuses the status line; budget test asserts the split. |
| A live poll drops widget data | M | M | `mergeStatuses` test (TASK-202). |
| Migration numbering gap with household-basics' 0019 | L | L | The runner has no version table; files run in lexical order every boot (Findings). |
| Upstream apps change their API | M | L | Typed errors (`bad_response`) and the tile falls back to its status line. |

## Next step

TASK-101 in `homepad-api` on `feat/status-widgets`, and TASK-201 in `homepad` on `feat/status-widgets-web`.

## Plan history

- 2026-11-07: Initial plan, from the approved spec and UX.
