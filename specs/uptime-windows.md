# Spec: Long-Window Uptime Metrics on Homepad Tiles

**Version:** 0.1.0 (DRAFT — awaiting Walt ratification)
**Created:** 2026-07-02
**Author:** Stitch (implementer draft; Walt owns product sign-off)
**Status:** Draft — building on staging behind board vote
**Repos:** `Code/homepad` (frontend) · `Code/homepad-api` (backend)
**Builds on:** `specs/uptime-sparkline.md` (shipped PR #46/#47/#51)

---

## 1. Overview

The shipped **uptime sparkline** (`uptime-sparkline.md`) shows a strip of the last
≤20 Gatus check results plus a rolling `XX% / N checks` label. That is a *very short*
window — in practice Gatus checks run ~every 60s, so ~20–50 results cover well under
an hour. It answers "is it flapping right now?" but not "how reliable has this service
been this week?".

This spec adds **long-window availability percentages** — **24h / 7d / 30d** — surfaced
per monitored tile. These come straight from Gatus's own computed uptime, so homepad
never recomputes availability from raw history.

### Why these three windows

Gatus exposes uptime over exactly **four** durations: `1h`, `24h`, `7d`, `30d`
(confirmed live against `gatus.gatus.svc.cluster.local:8080` on 2026-07-02 — any other
duration returns HTTP 400 `Durations supported: 30d, 7d, 24h, 1h`). We surface
**24h / 7d / 30d**. `1h` is dropped: it overlaps the sparkline's own short window and
adds noise without new information.

### Data source — read Gatus's computed uptime, don't recompute

The poller's existing `/api/v1/endpoints/statuses` call does **not** include computed
uptime, and its `results[]` history is too short to derive 24h/7d/30d locally
(verified: 50 results span ~49 min). Gatus instead exposes each window as a bare
fraction via:

```
GET /api/v1/endpoints/{key}/uptimes/{window}   ->  "0.945815"   (text/plain float, 0..1)
```

(`404 endpoint not found` for an unknown key; `400` for an unsupported window.)

So, unlike the sparkline, this feature **does** require additional Gatus calls — the
data is genuinely not in the current poll cycle. The poller adds one small GET per
monitored endpoint per window, best-effort, in its existing poll loop. No new external
dependency, secret, env var, or DB migration.

### User story

As a homelab user scanning my dashboard, I want to see each monitored service's
availability over the last day / week / month, so I can tell a rock-solid service from
one that's been quietly degrading — without opening Gatus.

---

## 2. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-U01 | `GET /api/services` is **additive**: each service object gains an `uptimeWindows` object mapping window key → availability fraction (0..1), e.g. `{"24h":0.999,"7d":1,"30d":0.998}`. Existing fields and clients are unaffected. | Must |
| AC-U02 | A service with **no `gatus_key`** (unmonitored) gets `uptimeWindows: {}` — never null. | Must |
| AC-U03 | A `gatus_key` with **no Gatus uptime data** (Gatus down, endpoint not yet checked) gets `uptimeWindows: {}`. A window Gatus can't answer is **omitted** from the map rather than sent as 0. | Must |
| AC-U04 | The windows surfaced are exactly **`24h`, `7d`, `30d`** (Gatus's own durations), fractions in `[0,1]`, read from Gatus's uptime API — homepad does **not** recompute availability from raw history. | Must |
| AC-U05 | Fetching uptime is **best-effort**: a failed/again-404 uptime call omits that one window and never fails the poll, changes a status badge, or 5xxes `/api/services` (same resilience as the sparkline / A9). | Must |
| AC-U06 | The tile shows the three percentages **only for monitored services** with ≥1 available window. A tile with `uptimeWindows: {}` renders **no** uptime UI and its **height is unchanged** — identical parity rule to the sparkline (AC-005/AC-012). | Must |
| AC-U07 | Percentages are formatted to a stable, glanceable precision: `100%`, `99.9%`, `94.6%` (one decimal, trailing `.0` dropped for exactly 100%). Rounding is nearest, not truncating. | Should |
| AC-U08 | The uptime figures match the tile's visual language (small, muted, contained within the tile) and never overflow the tile on supported viewports (≥390px mobile, ≥1024px desktop). | Must |
| AC-U09 | Dark mode: the uptime figures use existing muted-text tokens that already have dark counterparts. No new dark-mode tokens. | Must |

---

## 3. Data Model

### homepad-api: `EndpointStatus` (internal/gatus/poller.go)

**New field:**

| Field | Type | Description |
|-------|------|-------------|
| Uptime | map[string]float64 | window key (`"24h"`/`"7d"`/`"30d"`) → availability fraction 0..1. Only windows Gatus answered are present. Empty/nil when none. |

### homepad-api: `serviceView` (internal/api/services.go)

**New field (additive):**

| Field | Type | JSON | Description |
|-------|------|------|-------------|
| UptimeWindows | map[string]float64 | `uptimeWindows` | Always present; `{}` when unmonitored or no data. |

### homepad (frontend): `Service` (src/api.ts)

**New field (additive, optional):**

| Field | Type | Description |
|-------|------|-------------|
| uptimeWindows | Record<string, number> \| undefined | Optional; absent/empty = no long-window UI. |

---

## 4. API Contract

`GET /api/services` — additive. Example (monitored service):

```json
{
  "id": "abc123",
  "slug": "gitea",
  "status": "UP",
  "uptimeChecks": [ { "success": true, "timestamp": "..." } ],
  "uptimeWindows": { "24h": 1, "7d": 0.9458, "30d": 0.9981 }
}
```

Unmonitored / no data:
```json
"uptimeWindows": {}
```

Windows are fractions in `[0,1]` (the frontend multiplies by 100 for display). A
window Gatus could not answer is **absent from the object**, not `0`.

---

## 5. Poller behavior

Each poll (existing 30s cadence):

1. `FetchAll()` returns the statuses snapshot exactly as today (status + `results[]`
   sparkline history — unchanged).
2. For each endpoint key discovered, the poller additionally fetches
   `/uptimes/{window}` for `24h`, `7d`, `30d` (bounded concurrency), parsing the bare
   float. Failures/404s omit that window. Results are attached to
   `EndpointStatus.Uptime`.

The uptime GETs are in-cluster and cheap; they run inside the existing poll goroutine
and never block or fail the status snapshot. (Future optimization, out of scope: a
slower, independent cadence for uptime since long windows move slowly.)

---

## 6. UI Behavior

**Reality note (open question for Walt/Gracie):** the live dashboard renders `AppGrid`
(compact icon + name tiles); the sparkline component still lives in the now-dead
`Catalog.tsx` and is **not** shown on the current tile. So this feature does **not**
sit literally "next to the sparkline" — there is no sparkline on the live tile. It is
rendered as a small, contained uptime line on the AppGrid tile for monitored services.

- Placement: a compact muted line under the tile name, e.g. `24h 100% · 7d 94.6% · 30d 99.8%`.
- Only rendered when `uptimeWindows` has ≥1 entry (monitored + data). Unmonitored tiles
  render nothing extra — **no height change** (AC-U06).
- Styling reuses the sparkline label tokens: `text-xs`, `text-neutral-400
  dark:text-neutral-500`. Contained within the tile; wraps rather than overflows.
- The line is a visible text node (accessible by default); no extra ARIA needed.

---

## 7. Out of Scope (deferred)

- The `1h` window (overlaps the sparkline).
- Restoring the sparkline itself onto AppGrid tiles (separate decision — see §6 note).
- Historical uptime graph / trend, hover breakdown, per-window color thresholds.
- A slower independent poll cadence for uptime (optimization only).
- Persisting uptime (it flows through the in-memory snapshot, like the sparkline).

---

## 8. Dependencies

- **homepad-api ships first** (frontend reads `uptimeWindows`; absent field → no UI,
  zero regression).
- Gatus must be running and reachable. Unmonitored services show nothing regardless.
- No new env vars, secrets, DB migrations, or infra.

---

## 9. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-02 | 0.1.0 | Stitch | Initial draft — grounded in live Gatus API probe + current AppGrid/Catalog reality. Awaiting Walt ratification. |
