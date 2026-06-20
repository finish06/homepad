# Spec: Distinct "Not Monitored" Tile State

**Version:** 0.1.0
**Created:** 2026-06-15
**Author:** Walt (product lead)
**Status:** Shipped — prod (PR #48/#49/#50/#100, 2026-06-18)
**Repos:** `Code/homepad` (frontend) · `Code/homepad-api` (backend)

---

## 1. Overview

Today, two completely different situations produce the same gray dot on a Homepad tile:

1. **Service has no `gatus_key` set** — monitoring was never wired up. This is a
   configuration gap, not a failure.
2. **Service has a `gatus_key` but Gatus can't be reached** (poller returned an empty
   snapshot, or the key doesn't exist in Gatus yet) — this is a genuine monitoring
   failure.

Both are code path `gatus.StatusUnknown` ("UNKNOWN") in `statusFor()`, and both render
as `bg-neutral-300` in the frontend. A user staring at their dashboard cannot tell
whether a gray tile means "my monitoring is broken" or "I never set this up." That
distinction matters: one demands operational attention, the other is a prompt to
configure.

This feature introduces a **new `NOT_MONITORED` status** — a first-class value returned
by the API for any service whose `gatus_key` is empty — with a **distinct visual
treatment** in the tile: an outlined (unfilled) circle ring in the top-right position,
where monitored tiles show a solid colored dot.

The result: the launcher becomes an active guide to observability gaps. A user glancing
at their dashboard sees at a glance which tiles have no monitoring wired, prompting them
to add a Gatus key. The gray dot is reserved for the real operational signal: monitoring
configured but unreachable.

### Code-confirmed collapse point

`homepad-api/internal/api/services.go`, `statusFor()` (lines 274–282):

```go
func statusFor(snap gatus.Snapshot, gatusKey string) string {
    if gatusKey == "" {
        return gatus.StatusUnknown   // ← Case A: no gatus_key (unwired)
    }
    if st, ok := snap.Statuses[gatusKey]; ok {
        return st.Status
    }
    return gatus.StatusUnknown       // ← Case B: key set, not in snapshot (Gatus down)
}
```

Both branches return the same string. The fix is one line in Case A.

### User story

As a homelab user looking at my dashboard, I want tiles without Gatus monitoring to
look obviously different from tiles where monitoring is failing, so that I can tell
which services I simply haven't configured yet versus which are actively misbehaving.

---

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A service tile whose `gatus_key` is empty (no monitoring configured) shows an **outlined circle ring** in the top-right position — the same size and position as the status dot, but with no fill and a neutral border — instead of the solid gray dot. | Must |
| AC-002 | A service tile whose `gatus_key` is set but Gatus cannot be reached (or the key has no cached result) continues to show the **solid gray dot** (`bg-neutral-300`), unchanged from today. The UNKNOWN state is preserved as a monitoring failure indicator. | Must |
| AC-003 | The `GET /api/services` response returns `"status": "NOT_MONITORED"` for services with an empty `gatus_key`, and `"status": "UNKNOWN"` only for services with a `gatus_key` that yielded no result from Gatus. These two strings are never interchangeable. | Must |
| AC-004 | The `title` attribute and `aria-label` on the top-right indicator read **"Not monitored"** (human-readable) for `NOT_MONITORED` tiles, not the raw constant string. | Must |
| AC-005 | The Command Launcher (spotlight / keyboard search) applies the same visual distinction: `NOT_MONITORED` services show the outlined ring, not the solid gray dot, in the launcher row status slot. | Must |
| AC-006 | Tiles in the `NOT_MONITORED` state show **no uptime sparkline** — this is already the case (empty `uptimeChecks` → sparkline renders `null`). This spec does not change that behavior; it only makes the status indicator visually distinct. | Must |
| AC-007 | The three existing monitored states — UP (green), DOWN (red), DEGRADED (amber) — are visually and semantically unchanged. | Must |
| AC-008 | The outlined ring for `NOT_MONITORED` is visible in both **light mode and dark mode**. The border color adjusts so it doesn't disappear against the tile background. | Must |
| AC-009 | The `NOT_MONITORED` constant is defined in `internal/gatus/poller.go` alongside the existing `StatusUp`, `StatusDown`, `StatusDegraded`, `StatusUnknown` constants. | Must |
| AC-010 | `ServiceStatus` in `src/api.ts` is extended to include `'NOT_MONITORED'`. The `statusDot` lookup table in `Catalog.tsx` and `CommandLauncher.tsx` includes a `NOT_MONITORED` entry. The fallback `?? statusDot.UNKNOWN` remains as a safety net for unknown future values. | Must |
| AC-011 | The `data-status` attribute on the tile's status indicator element reflects the literal value `"NOT_MONITORED"` for unwired services — this is a testable attribute Gracie's integration tests can assert. | Should |

---

## 3. User Test Cases

### TC-001: Unwired tile shows outlined ring, not gray dot

**Precondition:** User is logged in. The dashboard includes at least one service with
no `gatus_key` set. A second service has a `gatus_key` configured and is currently UP.

**Steps:**
1. Navigate to the Homepad dashboard.
2. Locate the tile for the unwired service (no `gatus_key`).
3. Look at the top-right corner of that tile.
4. Compare it to the top-right corner of the UP-monitored tile next to it.

**Expected Result:** The unwired tile shows an **outlined (unfilled) circle ring** —
clearly not a solid dot. The monitored tile shows a solid green filled dot. They are
visually distinct. Hovering the outlined ring shows the tooltip "Not monitored".

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc001-outlined-ring-vs-dot.png`
**Maps to:** TBD

---

### TC-002: Monitoring failure (Gatus unreachable) still shows gray dot

**Precondition:** User is logged in. A service has a `gatus_key` set (e.g.
`"myapp-prod"`), but the Gatus poller snapshot is empty (Gatus is down or the poll
cycle has not completed). `status` returns "UNKNOWN" from the API.

**Steps:**
1. Navigate to the Homepad dashboard.
2. Locate the tile whose service has a `gatus_key` but no Gatus data.
3. Observe the top-right indicator.

**Expected Result:** The tile shows the **solid gray dot** (`bg-neutral-300`), same as
today. It does **not** show the outlined ring — this service has monitoring configured;
it's just temporarily unreachable. Hovering shows "UNKNOWN" (or a friendlier label
such as "Unknown" if Stitch prefers — but the shape is a solid circle, not a ring).

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc002-unknown-gray-dot.png`
**Maps to:** TBD

---

### TC-003: Dashboard with mixed states — all four states distinguishable

**Precondition:** User is logged in. The dashboard has:
- 1 tile: service UP (green dot)
- 1 tile: service DOWN (red dot)
- 1 tile: service UNKNOWN (gray dot, gatus_key set, Gatus unreachable)
- 1 tile: service NOT_MONITORED (no gatus_key)

**Steps:**
1. Navigate to the Homepad dashboard.
2. Look at all four tiles side by side.

**Expected Result:** All four tiles are visually distinguishable by their top-right
indicator. The NOT_MONITORED tile is the only one showing an outlined ring. A user can
identify which services need Gatus keys configured at a glance.

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc003-all-four-states.png`
**Maps to:** TBD

---

### TC-004: Adding a gatus_key transitions tile from ring to live status

**Precondition:** User is an admin in edit mode. A service currently has no `gatus_key`
and shows the outlined ring. Gatus is running and the intended Gatus endpoint key
(e.g. `"gitea"`) resolves to UP.

**Steps:**
1. Open the edit form for the NOT_MONITORED service.
2. Enter a valid `gatus_key` for the service.
3. Save.
4. Return to the dashboard tile.

**Expected Result:** The outlined ring is replaced by a **solid green dot** (UP). The
tile now shows the uptime sparkline if Gatus has recent check history. The service no
longer appears as a configuration gap.

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc004-add-key-transitions.png`
**Maps to:** TBD

---

### TC-005: Command Launcher — NOT_MONITORED shows outlined ring in row

**Precondition:** User is logged in. A service with no `gatus_key` exists.

**Steps:**
1. Open the Command Launcher (keyboard shortcut or search).
2. Search for or scroll to the unwired service.
3. Observe its status indicator in the launcher row.

**Expected Result:** The launcher row for the unwired service shows the outlined ring
in its status slot, matching the tile treatment. Monitored-but-unreachable services
show the gray dot.

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc005-launcher-ring.png`
**Maps to:** TBD

---

### TC-006: Dark mode — outlined ring remains visible

**Precondition:** User has dark mode enabled. Dashboard includes a NOT_MONITORED tile.

**Steps:**
1. Navigate to the Homepad dashboard in dark mode.
2. Locate the NOT_MONITORED tile.
3. Observe the outlined ring against the dark tile background.

**Expected Result:** The outlined ring is clearly visible — the border color contrasts
against the dark tile surface. It does not disappear or blend into the background.

**Screenshot Checkpoint:** `tests/screenshots/not-monitored/tc006-dark-mode-ring.png`
**Maps to:** TBD

---

## 4. Data Model

### homepad-api: gatus status constants (internal/gatus/poller.go)

Current constants:

```go
const (
    StatusUp       = "UP"
    StatusDown     = "DOWN"
    StatusDegraded = "DEGRADED"
    StatusUnknown  = "UNKNOWN"
)
```

**New constant added:**

```go
const (
    StatusUp           = "UP"
    StatusDown         = "DOWN"
    StatusDegraded     = "DEGRADED"
    StatusUnknown      = "UNKNOWN"
    StatusNotMonitored = "NOT_MONITORED"   // ← new
)
```

`StatusNotMonitored` is a first-class status value. It is never produced by Gatus
itself (Gatus only knows about endpoints it tracks) — it is homepad-api's own
sentinel for "this service has no gatus_key."

### homepad-api: statusFor() change (internal/api/services.go)

**Current (both cases → UNKNOWN):**
```go
func statusFor(snap gatus.Snapshot, gatusKey string) string {
    if gatusKey == "" {
        return gatus.StatusUnknown
    }
    if st, ok := snap.Statuses[gatusKey]; ok {
        return st.Status
    }
    return gatus.StatusUnknown
}
```

**New (empty key → NOT_MONITORED; Gatus-miss → UNKNOWN):**
```go
func statusFor(snap gatus.Snapshot, gatusKey string) string {
    if gatusKey == "" {
        return gatus.StatusNotMonitored
    }
    if st, ok := snap.Statuses[gatusKey]; ok {
        return st.Status
    }
    return gatus.StatusUnknown
}
```

This is a one-line change at line 276. The rest of `statusFor()` is unchanged.

### homepad (frontend): ServiceStatus type (src/api.ts)

**Current:**
```typescript
export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';
```

**New:**
```typescript
export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_MONITORED';
```

No other changes to the `Service` type or `UptimeCheck` type are needed — the
`uptimeChecks` field already handles the "no monitoring" case by being empty/absent.

---

## 5. API Contract

### GET /api/services (changed for unwired services only)

The change is a **new value** for the `status` string field. All other fields are
unchanged. The shape of the response object does not change.

**Before** (service with no `gatus_key`):
```json
{
  "id": "abc123",
  "slug": "proxmox",
  "name": "Proxmox",
  "status": "UNKNOWN",
  "uptimeChecks": []
}
```

**After** (service with no `gatus_key`):
```json
{
  "id": "abc123",
  "slug": "proxmox",
  "name": "Proxmox",
  "status": "NOT_MONITORED",
  "uptimeChecks": []
}
```

**Unchanged** (service with `gatus_key` set but Gatus not reachable):
```json
{
  "id": "def456",
  "slug": "gitea",
  "name": "Gitea",
  "status": "UNKNOWN",
  "uptimeChecks": []
}
```

### Backwards compatibility note

Clients that do not recognize `"NOT_MONITORED"` will fall through the `statusDot`
lookup to the `?? statusDot.UNKNOWN` fallback (the existing gray dot). This is
intentional and already present in the current codebase — no client regression from
the new string value.

### No change to GET /api/status

The `/api/status` endpoint (`{as_of, statuses: {[key]: string}}`) is keyed by
`gatus_key`. Services with no `gatus_key` are never present in that map — nothing
changes there.

---

## 6. UI Behavior

### Visual treatment for NOT_MONITORED — product call

The status dot is a filled circle in the top-right of each tile. For `NOT_MONITORED`,
this position is replaced by an **outlined (unfilled) circle ring** — same size and
position, no background fill, with a neutral dashed border.

**Why this treatment:**
- A filled circle of any color signals a health reading. An outlined ring signals "no
  reading" — the shape is familiar but the hollow interior communicates absence.
- It occupies the top-right slot so the UI is spatially consistent: users learn that
  the top-right corner always tells them something about monitoring.
- It is clearly distinct from the gray dot (`UNKNOWN`), which remains solid — users can
  learn "solid = health reading, ring = not configured."
- It is subtle enough not to alarm users; it's informational, not urgent.

### CSS implementation

The `statusDot` lookup table in `Catalog.tsx` and `CommandLauncher.tsx` gains a new
entry. The existing `status-dot` CSS class handles sizing and positioning via
`absolute right-3 top-3`; the new entry overrides only the color/fill:

```typescript
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-300 dark:border-neutral-600',
};
```

Light mode: `border-neutral-300` (same mid-gray as the UNKNOWN dot fill — visually
related but unmistakably different).
Dark mode: `dark:border-neutral-600` — slightly brighter to contrast against dark tile
backgrounds.

### Accessible label

The `title` and `aria-label` attributes on the status indicator already read from
`service.status` today. For `NOT_MONITORED`, those would render the raw string
`"NOT_MONITORED"` — which is not user-friendly.

Stitch should add a display-name map alongside `statusDot` for label resolution:

```typescript
const statusLabel: Record<ServiceStatus, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  DEGRADED: 'DEGRADED',
  UNKNOWN: 'UNKNOWN',
  NOT_MONITORED: 'Not monitored',
};
```

And update the `<span>` to use it:
```tsx
title={statusLabel[service.status] ?? service.status}
aria-label={`status: ${statusLabel[service.status] ?? service.status}`}
```

### Uptime sparkline — no change

`UptimeSparkline` already returns `null` when `uptimeChecks` is absent or empty. A
`NOT_MONITORED` service continues to have `uptimeChecks: []` from the API. The tile
shows no sparkline — same behavior as today for unwired services.

**This is the correct UX:** a sparkline on a tile that has never been connected to
monitoring would be confusing (there's no data to show). The outlined ring in the
top-right corner is the sole signal for this state.

### States table

| `status` value | Top-right indicator | Sparkline | Meaning |
|---|---|---|---|
| `UP` | Solid green dot | ≤20 green/red dots + % | Monitoring active, last check passed |
| `DOWN` | Solid red dot | ≤20 green/red dots + % | Monitoring active, last check failed |
| `DEGRADED` | Solid amber dot | ≤20 green/red dots + % | Monitoring active, partially failing |
| `UNKNOWN` | Solid gray dot | None (empty checks) | Monitoring wired, Gatus unreachable |
| `NOT_MONITORED` | Outlined dashed ring | None (empty checks) | No `gatus_key` — not wired to monitoring |

---

## 7. Edge Cases

| Case | Expected behavior |
|------|-------------------|
| Service created with no `gatus_key` | API returns `NOT_MONITORED`; tile shows ring immediately |
| Admin adds a `gatus_key` to an existing service | API returns the Gatus-derived status on the next request; tile transitions to dot |
| Admin removes a `gatus_key` from a monitored service | API returns `NOT_MONITORED`; tile transitions to ring |
| `gatus_key` is set to a key Gatus doesn't know about | Status is `UNKNOWN` (not `NOT_MONITORED`) — the key is configured, Gatus just has no data for it yet |
| Gatus is completely down; some services have `gatus_key` | Those tiles show `UNKNOWN` (gray dot), not `NOT_MONITORED`. Only truly unwired services show the ring. |
| Library-imported service (has `sourceLibraryId`) with no `gatus_key` | Same as any other unwired service: `NOT_MONITORED`, outlined ring |
| Old frontend receiving `"NOT_MONITORED"` from updated API | Falls through `statusDot` to `?? statusDot.UNKNOWN` — shows gray dot. Acceptable degradation. |
| New frontend receiving `"UNKNOWN"` from old API for unwired services | Shows gray dot (old behavior). Acceptable — the feature requires both repos updated to take effect. |

---

## 8. Out of Scope (deferred)

- **Tooltip with "Add a Gatus key" call to action** — the outlined ring tells users
  something is missing; a tooltip nudge ("Connect this to Gatus: add a gatus_key in
  settings") would be nice but is a follow-on feature, not required for v1.
- **Filter / "show unmonitored" view** — a dashboard filter to surface only
  `NOT_MONITORED` tiles would be useful at scale, but deferred.
- **Count badge** ("3 services not monitored") — a header-level observability gap
  counter is out of scope for this tile-level feature.
- **`UNKNOWN` human-friendly label** — the `statusLabel` map introduced here could
  also rename `"UNKNOWN"` to `"Unknown"` in the title/aria text. That is a cosmetic
  improvement to the existing state, not part of this feature; Stitch should leave it
  unchanged unless Joe approves bundling it.
- **Gatus "no results yet" as its own state** — a `gatus_key` set but Gatus has run
  zero checks is technically a third case (correctly wired, waiting for first result).
  Today this is `UNKNOWN` (Gatus returns the key with an empty `results[]`). Splitting
  this into its own state is deferred.

---

## 9. Dependencies

- **Both repos must be updated together** (or API first). The frontend can receive the
  new `"NOT_MONITORED"` string from an updated API and fall through to the gray dot
  (backwards compatible); but the ring treatment won't activate until both ship.
- **No DB migration required.** `gatus_key` already exists on the service row; this
  feature only changes how the API interprets an empty value of that existing field.
- **No new environment variables or secrets.**
- **No Gatus configuration changes.** This is entirely homepad-api's classification of
  services that have no `gatus_key` — Gatus itself is untouched.

### Infrastructure prerequisites

| Category | Requirement |
|----------|-------------|
| Database migrations | None |
| Environment variables | None |
| Gatus changes | None |
| Network changes | None |

---

## 10. Implementation guidance for Stitch

This section is product-to-implementer notes, not acceptance criteria.

### homepad-api (2 changes)

**1. `internal/gatus/poller.go`** — add constant (alongside existing constants, line 11):
```go
StatusNotMonitored = "NOT_MONITORED"
```

**2. `internal/api/services.go`** — change one line in `statusFor()` (line 276):
```go
// Before:
return gatus.StatusUnknown
// After:
return gatus.StatusNotMonitored
```

That is the complete backend change.

### homepad (3 changes)

**1. `src/api.ts`** — extend the union type (line 15):
```typescript
export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN' | 'NOT_MONITORED';
```

**2. `src/Catalog.tsx`** — update `statusDot` (line 75) and add `statusLabel`:
```typescript
const statusDot: Record<ServiceStatus, string> = {
  UP: 'bg-emerald-500',
  DOWN: 'bg-red-500',
  DEGRADED: 'bg-amber-400',
  UNKNOWN: 'bg-neutral-300',
  NOT_MONITORED: 'bg-transparent border-2 border-dashed border-neutral-300 dark:border-neutral-600',
};

const statusLabel: Record<ServiceStatus, string> = {
  UP: 'UP',
  DOWN: 'DOWN',
  DEGRADED: 'DEGRADED',
  UNKNOWN: 'UNKNOWN',
  NOT_MONITORED: 'Not monitored',
};
```

Update the `<span>` in `ServiceTile` (around line 834) to use `statusLabel` for
`title` and `aria-label`:
```tsx
title={statusLabel[service.status] ?? service.status}
aria-label={`status: ${statusLabel[service.status] ?? service.status}`}
```

**3. `src/CommandLauncher.tsx`** — update `statusDot` (line 20) with the same
`NOT_MONITORED` entry. The launcher renders a status dot in the row; it needs the same
outlined-ring treatment.

### Test note

The existing `data-testid="status-badge"` and `data-status={service.status}` attributes
are already in place. Gracie's tests can assert `data-status="NOT_MONITORED"` for
unwired services and `data-status="UNKNOWN"` for wired-but-no-Gatus services —
distinguishable by attribute value, not visual style.

---

## 11. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-06-15 | 0.1.0 | Walt | Initial spec — grounded in code review of services.go, poller.go, api.ts, Catalog.tsx, CommandLauncher.tsx |
