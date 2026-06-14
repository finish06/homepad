# Spec: Uptime Sparkline on Homepad Tiles

**Version:** 0.1.0
**Created:** 2026-06-14
**Author:** Walt (product lead)
**Status:** Draft — awaiting implementation
**Repos:** `Code/homepad` (frontend) · `Code/homepad-api` (backend)

---

## 1. Overview

Each Homepad service tile will gain a compact **uptime sparkline**: a horizontal strip
of colored dots representing the last ≤20 Gatus check results (oldest left, newest
right), plus a rolling uptime percentage and check count (e.g. "98% / 20 checks").

This makes the status badge far more informative at a glance. A single green dot at
top-right tells you the service is up *right now*. The sparkline tells you whether
it's been rock-solid for hours or just recovered from a prolonged outage. A user
scanning their dashboard can immediately tell the difference between a momentary blip
and a real problem — without clicking anything.

### Why this is free

`homepad-api/internal/gatus/poller.go::FetchAll()` already receives Gatus's full
`results[]` array (~20 historical checks per endpoint) in every poll cycle. Currently
only `e.Results[n-1]` (the last entry) is read to derive the status string; the rest
of the slice is silently discarded. Surfacing this history costs **zero additional
network calls** — the data is already in memory every poll tick.

### User story

As a homelab user scanning my dashboard, I want to see a quick visual history of each
service's recent availability so that I can tell at a glance whether a service is
reliably healthy or has been flapping, without navigating to Gatus.

---

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A tile whose service has a configured `gatus_key` and ≥1 historical check result shows a horizontal dot-strip below the service description. | Must |
| AC-002 | The strip displays up to 20 dots, one per historical check result, ordered **oldest → newest** (left to right). | Must |
| AC-003 | Each dot is **green** (success = true) or **red** (success = false). There is no amber/gray state within the strip — every result is definitively pass or fail. | Must |
| AC-004 | Immediately to the right of the strip, a text label shows **"XX% / N checks"** where XX is `round(successes/total * 100)` and N is the total check count shown. | Must |
| AC-005 | A tile with **no `gatus_key`** (monitoring not configured) shows **no sparkline** — the tile looks exactly as it does today. | Must |
| AC-006 | A tile whose `gatus_key` maps to a Gatus endpoint with **0 results** (Gatus has not yet run a check) shows **no sparkline**. | Must |
| AC-007 | The existing **status dot** (the colored circle at top-right of each tile) is **unchanged** in position, size, and behavior. The sparkline is additive information, not a replacement. | Must |
| AC-008 | The sparkline area is **visually contained** within the tile — dots never overflow the tile boundary on any supported viewport (mobile ≥ 390px, desktop ≥ 1024px). | Must |
| AC-009 | `GET /api/services` response is **additive**: each service object gains an `uptimeChecks` array field. Services with no `gatus_key` receive `uptimeChecks: []`. Clients that ignore unknown fields are unaffected. | Must |
| AC-010 | `uptimeChecks` entries preserve the **timestamp** of each check result so future features (tooltip, hover detail) can use it without a new API change. | Should |
| AC-011 | When fewer than 20 results are available (1–19), the strip shows exactly as many dots as results — **no padding or placeholder dots**. The "N checks" count reflects the actual count shown. | Must |
| AC-012 | The sparkline is **hidden** (not rendered) for tiles that have no monitoring, rather than shown as an empty strip, so the tile height does not change for unmonitored services. | Must |
| AC-013 | Uptime % rounds to the **nearest integer** (not truncated). 19/20 = 95%, 18/20 = 90%, 1/1 = 100%. | Should |

---

## 3. User Test Cases

### TC-001: Healthy service sparkline renders correctly

**Precondition:** User is logged in. The dashboard has ≥1 tile whose service has a
`gatus_key` configured. Gatus has returned 20 consecutive successful checks for that
endpoint.

**Steps:**
1. Navigate to the Homepad dashboard.
2. Locate the tile for the monitored service.
3. Observe the area below the service's description text.

**Expected Result:** A horizontal strip of 20 green dots appears, left to right. To
the right of the strip reads "100% / 20 checks". The status dot (top-right corner of
the tile) remains green (UP).

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc001-all-green.png`
**Maps to:** TBD

---

### TC-002: Mixed history shows accurate split and correct dot colors

**Precondition:** User is logged in. One tile's Gatus endpoint has 20 results: 18
successes and 2 failures (the failures at positions 3 and 17 in the history).

**Steps:**
1. Navigate to the dashboard.
2. Locate the tile.
3. Observe the sparkline strip.

**Expected Result:** 20 dots are rendered, 18 green and 2 red, with red dots at the
3rd and 17th positions (oldest-first ordering). The label reads "90% / 20 checks".

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc002-mixed-history.png`
**Maps to:** TBD

---

### TC-003: Service with no gatus_key shows no sparkline

**Precondition:** User is logged in. One tile's service has no `gatus_key` (no Gatus
monitoring configured — `status` field is "UNKNOWN").

**Steps:**
1. Navigate to the dashboard.
2. Locate the tile for the unmonitored service.
3. Observe the tile layout below the description.

**Expected Result:** No dot strip and no "X% / N checks" label appear. The tile looks
identical to its current appearance. Tile height is unchanged.

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc003-no-gatus-key.png`
**Maps to:** TBD

---

### TC-004: Partial history (fewer than 20 checks)

**Precondition:** A freshly-configured Gatus endpoint has only 5 check results so far
(all successful).

**Steps:**
1. Navigate to the dashboard.
2. Locate the tile.
3. Observe the sparkline.

**Expected Result:** Exactly 5 green dots appear — no padding, no empty slots. The
label reads "100% / 5 checks". The strip is visually shorter than a 20-dot strip.

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc004-partial-history.png`
**Maps to:** TBD

---

### TC-005: Currently DOWN service — sparkline shows recent failure

**Precondition:** A service is currently DOWN. Gatus has 20 results; the last 3 are
failures.

**Steps:**
1. Navigate to the dashboard.
2. Locate the tile (status dot shows red / DOWN).
3. Observe the sparkline.

**Expected Result:** The rightmost 3 dots are red; the remaining 17 are green. The
label shows "85% / 20 checks". The current-status dot at top-right is red, consistent
with the sparkline's rightmost entry.

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc005-currently-down.png`
**Maps to:** TBD

---

### TC-006: Sparkline fits within tile on mobile (390px viewport)

**Precondition:** Viewport is 390px wide (iPhone SE / minimum supported). A monitored
service tile with 20 check results is visible.

**Steps:**
1. Resize the browser to 390px wide (or use mobile DevTools emulation).
2. Navigate to the dashboard.
3. Inspect the tile containing the sparkline.

**Expected Result:** The dot strip and label remain fully within the tile card. No
horizontal overflow, no clipped dots, no layout shift on neighboring tiles. The strip
may be visually narrower but all dots are present.

**Screenshot Checkpoint:** `tests/screenshots/sparkline/tc006-mobile-390.png`
**Maps to:** TBD

---

## 4. Data Model

### homepad-api: `EndpointStatus` (internal/gatus/poller.go)

Current:

| Field | Type | Description |
|-------|------|-------------|
| Key | string | Gatus endpoint key |
| Status | string | "UP" / "DOWN" / "DEGRADED" / "UNKNOWN" |
| LastResultAt | time.Time | Timestamp of the most recent check |

**New field added:**

| Field | Type | Description |
|-------|------|-------------|
| Results | []CheckResult | Ordered slice of historical check results, oldest first |

### homepad-api: `CheckResult` (new type, internal/gatus/poller.go)

| Field | Type | Description |
|-------|------|-------------|
| Success | bool | Whether the check passed |
| Timestamp | time.Time | When this check ran |

The `CheckResult` slice is populated from the raw Gatus `results[]` array that
`FetchAll()` already decodes. No additional HTTP request is needed — just stop
discarding the history.

### homepad (frontend): `Service` type (src/api.ts)

**New field added (additive):**

| Field | Type | Description |
|-------|------|-------------|
| uptimeChecks | UptimeCheck[] | Optional; absent/empty = no monitoring |

### homepad (frontend): `UptimeCheck` (new type, src/api.ts)

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether the check passed |
| timestamp | string | ISO 8601 UTC timestamp |

---

## 5. API Contract

### GET /api/services (changed)

The response is **additive** — the existing fields are unchanged. Each service object
gains one new optional field.

**Response (200) — before:**
```json
{
  "services": [
    {
      "id": "abc123",
      "slug": "gitea",
      "name": "Gitea",
      "description": "Self-hosted git",
      "url": "https://git.example.com",
      "icon": "gitea",
      "status": "UP",
      "favorite": false,
      "iconLight": false,
      "iconDark": false,
      "categoryId": "cat-1",
      "categoryName": "Dev Tools",
      "sourceLibraryId": null
    }
  ]
}
```

**Response (200) — after:**
```json
{
  "services": [
    {
      "id": "abc123",
      "slug": "gitea",
      "name": "Gitea",
      "description": "Self-hosted git",
      "url": "https://git.example.com",
      "icon": "gitea",
      "status": "UP",
      "favorite": false,
      "iconLight": false,
      "iconDark": false,
      "categoryId": "cat-1",
      "categoryName": "Dev Tools",
      "sourceLibraryId": null,
      "uptimeChecks": [
        { "success": true,  "timestamp": "2026-06-14T08:00:00Z" },
        { "success": true,  "timestamp": "2026-06-14T08:01:00Z" },
        { "success": false, "timestamp": "2026-06-14T08:02:00Z" },
        { "success": true,  "timestamp": "2026-06-14T08:03:00Z" }
      ]
    }
  ]
}
```

Services with no `gatus_key` (or a `gatus_key` that maps to no Gatus data):
```json
"uptimeChecks": []
```

**Ordering:** `uptimeChecks` is oldest-first (index 0 = earliest check). This matches
the left-to-right visual order on the tile. Stitch should confirm that Gatus's
`/api/v1/endpoints/statuses` returns results oldest-first; if not, sort by timestamp
before storing.

**Cap:** Surface at most 20 entries (Gatus's default retention per endpoint). If
Gatus returns more, take the last 20 (most recent). The frontend always renders what
it receives — there is no client-side truncation.

### No change to GET /api/status

The `/api/status` endpoint is used for staleness display (showing whether the poller
snapshot is fresh). It remains `{as_of: string, statuses: {[key]: string}}`. The
richer history travels only in `/api/services`.

---

## 6. UI Behavior

### Placement on the tile

The sparkline sits below the service description, at the **bottom of the tile's text
area**, above the drag-handle zone. Current tile structure (bottom to top):

```
[ drag grip ⠿ — absolute, bottom-right ]
[ description text (truncated, pr-14) ]
[ name text ]
[ icon ]
```

New tile structure adds one element:

```
[ drag grip ⠿ — absolute, bottom-right ]
[ sparkline strip + "XX% / N checks" label ]   ← new
[ description text (truncated, pr-14) ]
[ name text ]
[ icon ]
```

The sparkline strip is **not** absolutely positioned — it flows naturally in the tile's
flex column, keeping the tile height consistent across monitored services. For
unmonitored services (no sparkline), no height is added.

### Dot sizing and spacing

- Dot diameter: **6px** (CSS `w-1.5 h-1.5`)
- Gap between dots: **2px** (`gap-0.5` in Tailwind's gap scale)
- The dot row is `flex flex-wrap` so it reflows on very narrow tiles rather than
  overflowing. On a standard desktop tile width, 20 dots fit in a single row.

### Color tokens (reuse existing Tailwind classes)

| Dot state | Class | Matches existing badge |
|-----------|-------|----------------------|
| success | `bg-emerald-500` | Same green as UP status dot |
| failure | `bg-red-500` | Same red as DOWN status dot |

### Label format

`"XX% / N checks"` — monospace-adjacent, small text (`text-xs`), muted color
(`text-neutral-400 dark:text-neutral-500`) so it reads as supplementary data, not a
primary call to action.

### States

| State | What the user sees |
|-------|--------------------|
| Loading (services not yet fetched) | No sparkline (tile is not yet rendered) |
| `uptimeChecks: []` (no monitoring or Gatus has no data) | No sparkline — tile looks identical to today |
| `uptimeChecks` has 1–20 entries | Dot strip + label |
| `uptimeChecks` has all successes | All-green strip + "100% / N checks" |
| `uptimeChecks` has all failures | All-red strip + "0% / N checks" |

### Dark mode

Both the dot colors and the label already have dark-mode counterparts via existing
Tailwind classes. No new dark-mode tokens needed.

### Accessibility

The sparkline strip is decorative data; it carries `aria-hidden="true"` on the dot
container. The label ("98% / 20 checks") is a visible text node and is accessible by
default. Screen readers will read the label text; the colored dots carry no additional
semantic meaning.

---

## 7. Edge Cases

| Case | Expected Behavior |
|------|-------------------|
| `gatus_key` set but Gatus is down | Poller returns empty snapshot; `uptimeChecks: []`; no sparkline; `status: "UNKNOWN"` — same behavior as today |
| Gatus returns results in newest-first order | `FetchAll` reverses the slice so the frontend always receives oldest-first |
| Single check result available | 1 dot shown; label reads "100% / 1 check" (or "0% / 1 check") |
| 100 check results returned by Gatus | Capped at last 20; "XX% / 20 checks" |
| All 20 checks are failures | All-red strip; "0% / 20 checks"; status dot is also red |
| Tile width is very narrow (e.g. 1-column mobile) | `flex-wrap` on the dot row; strip wraps to multiple lines rather than overflowing |
| `uptimeChecks` absent from API response (older backend) | Frontend treats missing field as `[]` and shows no sparkline — zero regression |

---

## 8. Out of Scope (deferred)

- **Hover/click tooltip per dot** (timestamp, latency) — nice to have, v2
- **Animated strip refresh** when the poller updates — deferred
- **Configuring N** (the history window) — Gatus caps at ~20 anyway; no UI toggle
- **`GET /api/status` carrying history** — that endpoint is staleness-only; the richer data lives in `/api/services`
- **DEGRADED state in the strip** — Gatus's per-check `success` is boolean; DEGRADED is a homepad-api construct derived from partial success that doesn't map to the per-check level. Strip uses boolean green/red only.
- **Per-tile "last checked" timestamp** — already available from `LastResultAt` on the snapshot; a separate feature if Caleb wants it

---

## 9. Dependencies

- **homepad-api change must ship first (or together).** The frontend reads `uptimeChecks`
  from `/api/services`. If the field is absent (old backend), the frontend falls back
  gracefully to no sparkline — but the feature doesn't activate until the API is updated.
- **Gatus must be running and reachable** for any sparkline to appear. Services without
  Gatus monitoring show no sparkline regardless.
- No new environment variables, secrets, DB migrations, or infra changes required.

### Infrastructure prerequisites

| Category | Requirement |
|----------|-------------|
| Environment variables | None — no new env vars |
| Database migrations | None — sparkline data is not persisted; it flows through the in-memory poller snapshot |
| Network reachability | Existing Gatus connection used by the poller — no change |
| External secrets | None |
| CI status | N/A |

---

## 10. Implementation guidance for Stitch

This section is product-to-implementer notes, not acceptance criteria.

### homepad-api changes (internal/gatus/poller.go + internal/api/services.go)

1. Add `CheckResult struct { Success bool; Timestamp time.Time }` to `poller.go`.
2. Add `Results []CheckResult` to `EndpointStatus`.
3. In `FetchAll()`, populate `es.Results` from `e.Results` (after confirming or
   enforcing oldest-first order). Cap at 20 entries.
4. In `serviceView` (services.go), add `UptimeChecks []checkResultView \`json:"uptimeChecks"\``.
5. In `handleListServices`, populate `UptimeChecks` from the snapshot's `Results` slice
   for the matching `gatus_key`. Empty slice when no match.
6. JSON wire name `"uptimeChecks"` (camelCase, consistent with other view fields like
   `"iconLight"`, `"iconDark"`, `"categoryId"`).

### homepad changes (src/api.ts + src/Catalog.tsx)

1. Add `UptimeCheck` type and `uptimeChecks?: UptimeCheck[]` to the `Service` type in
   `api.ts`. Optional so older API payloads parse without error.
2. Add a `UptimeSparkline` component (or inline JSX in `ServiceTile`) that:
   - Returns `null` when `uptimeChecks` is absent or empty
   - Renders a `flex-wrap` row of dots + the label string
3. Place the sparkline below the `<span data-testid="service-tile-description">` and
   above the closing `</a>` of the tile link. It sits inside the tile's flex column
   after the description.

---

## 11. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-14 | 0.1.0 | Walt | Initial spec — grounded in code review of poller.go, services.go, api.ts, Catalog.tsx |
