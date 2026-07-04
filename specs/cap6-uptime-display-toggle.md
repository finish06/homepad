# Spec: Uptime Display Toggle — Capability #6

**Version:** 1.0.0
**Created:** 2026-07-04
**Author:** Walt (product lead)
**Status:** Draft — pending Kare design section
**Repo:** `Code/homepad` (frontend) + `Code/homepad-api` (Go backend)
**Estimate:** ~2–3 hours (migration + two API endpoints + frontend prop thread + settings UI)
**Depends on:** uptime-sparkline (shipped PR #46–#47), v12-settings-boundary-clarity (shipped PR #77)
**Target version:** 12.8.0 (minor — new feature)

---

## 1. Overview

The uptime sparkline (cap was `uptime-sparkline.md`, shipped PR #46–#47) displays per-tile
Gatus health history on every tile that has `gatus_key` configured. There is no way to
suppress this display without removing Gatus monitoring entirely.

Caleb wants a **System setting** — a boolean admin toggle — that lets the admin turn off
the uptime block across the entire app grid without touching the monitoring infrastructure.
Default: **ON** (existing behavior preserved, opt-out model).

This is a **display-only toggle**. Gatus polling, `uptimeChecks` data in the API, and
status badges (the UP/DOWN/UNKNOWN dot) are completely unaffected.

### User story

As a homelab admin, I want to be able to turn off the per-tile uptime display across the
entire dashboard so that I can keep the app grid clean and uncluttered when I don't want
metrics visible — without stopping health monitoring.

---

## 2. Decision: Global Admin System Setting (not per-user)

**Verdict: global admin setting, applied to all users.**

**Justification against the multi-tenant model:**

homepad v9+ (migration `0007_per_user_dashboards`) scopes services and categories per
`user_id`. However, the uptime data source — Gatus — is a **shared homelab instance**
(single `GATUS_BASE_URL` env var, one `gatus.Poller`, `internal/gatus/poller.go`). Uptime
monitoring is system infrastructure, not user data.

A per-user toggle would produce incoherent UX: User A sees sparklines, User B doesn't —
for the same underlying system state driven by the same Gatus instance. The uptime display
is meaningful for this homelab or it isn't; the admin is the right actor to decide that.

This aligns with the existing System settings framing in `SettingsPanel.tsx` (lines
113–116): *"These settings apply globally to all accounts."*

Caleb's framing ("System setting") is architecturally correct for this feature.

---

## 3. Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | Global admin setting, not per-user | Gatus is shared homelab infrastructure; see §2 |
| D2 | Frontend-side render gate, not API-side data suppression | API continues including `uptimeChecks` in `GET /api/services`. Frontend reads the toggle and decides not to render `<UptimeSparkline />`. No data loss; faster toggle-on recovery; simpler API contract (callers always see uptime data regardless of display preference). |
| D3 | New `system_settings` DB table (singleton row, upsert pattern) | Runtime-writable without a redeploy. Env vars require cluster access + redeploy — wrong UX for a UI toggle. Singleton-row config table is the simplest extensible pattern; future system settings can add columns rather than new tables. |
| D4 | New public `GET /api/system/config` endpoint (no auth required) | Extends the `GET /api/auth/config` unauthenticated-config pattern without polluting auth config with display concerns. Public so the frontend can read it consistently regardless of session state. |
| D5 | New `PATCH /api/admin/settings` endpoint (admin-only) for writes | Follows `requireAdmin()` from `internal/api/library.go`. Accepts a partial body so future settings can be added as independent fields without a new endpoint. |
| D6 | System settings panel note updated | The section currently reads "Read-only — set via environment variables and redeploy." With one writable toggle, this note must change. OIDC and self-registration rows keep their `[env]` badges (still env-driven). The toggle row is new, interactive, and labeled. Kare owns the exact updated copy (see §8). |
| D7 | Default = ON, safe-from-absent | If no `system_settings` row exists (fresh install, no admin action), the API returns `showUptimeDisplay: true`. No migration data is required to preserve existing behavior. |

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | When the toggle is **ON** (default), `UptimeSparkline` renders on tiles that have `uptimeChecks` data — behavior identical to today. | Must |
| AC-002 | When the toggle is **OFF**, no uptime block appears on any tile for any user, regardless of whether `uptimeChecks` data is present. The tile renders as if `uptimeChecks` were absent. | Must |
| AC-003 | When the toggle is **OFF**, no empty gap or layout shift appears in the tile where the uptime block was. The tile's height and layout adapt cleanly. | Must |
| AC-004 | An admin user opening the System settings panel sees a labeled toggle for "Show uptime display" reflecting the current persisted value. | Must |
| AC-005 | Toggling and saving persists immediately to the database (no redeploy required). | Must |
| AC-006 | After saving, any user who loads or reloads the page sees the updated toggle state applied to the app grid. | Must |
| AC-007 | The toggle control is visible and interactive only to admin users. Non-admin users do not see the toggle (their System section view is unchanged). | Must |
| AC-008 | `GET /api/system/config` returns `{"showUptimeDisplay": true}` when no `system_settings` row exists (the default-ON safe case). | Must |
| AC-009 | `GET /api/system/config` returns `{"showUptimeDisplay": false}` after an admin saves OFF. | Must |
| AC-010 | `GET /api/system/config` requires no authentication — it is accessible before login. | Must |
| AC-011 | `PATCH /api/admin/settings` with `{"showUptimeDisplay": false}` returns 200 and the updated config for an authenticated admin. | Must |
| AC-012 | `PATCH /api/admin/settings` returns 403 for a non-admin authenticated user. | Must |
| AC-013 | `PATCH /api/admin/settings` returns 401 for an unauthenticated request. | Must |
| AC-014 | Status badges (the UP/DOWN/UNKNOWN colored dot on each tile) are unaffected by the toggle in either state. | Must |
| AC-015 | The status bar (service count chips) is unaffected by the toggle in either state. | Must |

---

## 5. User Test Cases

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| UTC-1 | Default state | Open app grid as any user on a fresh install with no prior settings change | Uptime sparklines appear on tiles that have Gatus monitoring configured |
| UTC-2 | Admin turns OFF | 1. Log in as admin. 2. Open Admin Panel → System. 3. Toggle "Show uptime display" to OFF. 4. Save. 5. Reload app. | No uptime block on any tile. Tile is clean, no gap. Status badges unchanged. |
| UTC-3 | Non-admin cannot see toggle | Log in as a non-admin user. Open UserMenu. | No Admin Panel entry. System settings section is not accessible. |
| UTC-4 | Persists across reloads | Admin sets toggle to OFF, closes panel, reloads page, reopens System settings. | Toggle shows OFF. App grid shows no uptime blocks. |
| UTC-5 | Re-enable | With toggle OFF, admin turns it back ON and saves. Reload. | Uptime blocks reappear on tiles that have Gatus data. |
| UTC-6 | Other users affected | Admin sets OFF. Another user (non-admin) reloads their session. | Non-admin user sees no uptime blocks (global change). |
| UTC-7 | API auth guards | Make `PATCH /api/admin/settings` as a non-admin, then unauthenticated. | 403, then 401. |

---

## 6. Data Model

### Migration: `0008_system_settings.up.sql`

```sql
CREATE TABLE system_settings (
    id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    show_uptime_display BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The `CHECK (id = 1)` constraint enforces exactly one row (singleton table pattern). The Go
layer uses `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` (upsert) on every write. A
missing row (fresh install) is treated as all-defaults: `showUptimeDisplay = true`.

### Down migration: `0008_system_settings.down.sql`

```sql
DROP TABLE IF EXISTS system_settings;
```

---

## 7. API Contract

### GET /api/system/config

| Field | Value |
|-------|-------|
| Auth | None (public) |
| Method | `GET` |
| Path | `/api/system/config` |
| Response 200 | `{"showUptimeDisplay": true}` |

**Behavior:** If no `system_settings` row exists, returns `{"showUptimeDisplay": true}`
(AC-008). Register alongside `GET /api/auth/config` in `server.go` — these are the two
unauthenticated config endpoints.

### PATCH /api/admin/settings

| Field | Value |
|-------|-------|
| Auth | Admin session required — uses `requireAdmin()` |
| Method | `PATCH` |
| Path | `/api/admin/settings` |
| Request body | `{"showUptimeDisplay": false}` |
| Response 200 | Updated config: `{"showUptimeDisplay": false}` |
| Response 401 | No session |
| Response 403 | Non-admin session |

**Behavior:** Upserts the `system_settings` row. Accepts a partial body — only named
fields are updated. Response echoes the full current state of system settings after write.

---

## 8. Frontend Implementation

### `src/api.ts`

Add type and fetch function:

```ts
export type SystemConfig = { showUptimeDisplay: boolean };

export async function systemConfig(): Promise<SystemConfig> {
  // same defensive pattern as authConfig()
  try {
    const r = await fetch('/api/system/config');
    if (!r.ok) return { showUptimeDisplay: true };
    return r.json();
  } catch {
    return { showUptimeDisplay: true };
  }
}
```

### `src/App.tsx`

Fetch `systemConfig()` at startup alongside `authConfig()`. Store in
`useState<SystemConfig>({ showUptimeDisplay: true })`. Thread `showUptimeDisplay`
through `Catalog` props to `ServiceTile`.

### `src/Catalog.tsx`

`ServiceTile` receives a `showUptimeDisplay: boolean` prop. Wrap the existing
`<UptimeSparkline>` invocation (currently line 1412):

```tsx
{showUptimeDisplay && <UptimeSparkline checks={service.uptimeChecks} />}
```

`UptimeSparkline` itself is unchanged.

### `src/SettingsPanel.tsx`

`SystemSettings` receives two new props:
- `showUptimeDisplay: boolean` — current persisted value
- `onSaveSettings: (patch: Partial<SystemConfig>) => void` — callback to PATCH and
  refresh the local state in App.tsx

Admin-only: render a toggle row for "Show uptime display" above the existing OIDC and
self-registration read-only rows. The section note (D6) is updated — Kare specifies the
exact copy and toggle control design in §9 below.

Non-admins: no change to their view.

---

## 9. Design (Kare — pending)

*This spec has UI surface: one new interactive toggle row in the System settings panel
(admin-only). This section must be completed by Kare before the spec is finalized and
dispatched to Stitch.*

**Surface in scope for Kare:**
- The toggle row: label ("Show uptime display"), control type (pill toggle vs. checkbox),
  placement within the `settings-kv` list (above or below the read-only rows?), and
  save/feedback pattern (auto-save on toggle, or explicit Save button?).
- Updated section note copy (D6): the current "Read-only — set via environment variables
  and redeploy" no longer applies globally — the new note must distinguish the writable
  row from the env-driven rows while keeping the `[env]` badges on OIDC and
  self-registration.
- Visual treatment when the toggle is OFF — does the "Show uptime display" label grey out,
  or stay full-strength? What does the saved-success state look like?

**Questions for Kare:**
1. Toggle control type: pill/switch (feels most natural for a boolean display preference)
   or a select? The `settings-kv` rows currently have no interactive controls — this is
   the first writable row in the section.
2. Auto-save on toggle vs. explicit Save button? Auto-save is simpler (no button state to
   manage); explicit Save feels more deliberate for an admin-level change. Recommend:
   auto-save with a brief inline confirmation ("Saved"), consistent with how OIDC
   settings behave elsewhere in the homelab fleet.
3. Placement: above or below the read-only OIDC/registration rows? Recommend: above, so
   the writable control is encountered first and the read-only rows are clearly a separate
   env-driven block.
4. Updated note copy for D6.

*Kare's design section and co-sign will be added here before the spec advances to Stitch.*

---

## 10. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | Pending (UI design section incomplete) |
| Design / UX | Kare | Pending |

*This spec is not finalized until both sign-offs are recorded here. It does NOT go to
Stitch until both are present.*

---

## 11. Out of Scope

- Per-user uptime toggle (see §2 for justification).
- Hiding or toggling the UP/DOWN/UNKNOWN status badge on tiles.
- Pausing or disabling Gatus polling from homepad.
- Real-time propagation to active sessions (change takes effect on next page load).
- Any visual redesign of the uptime sparkline itself.
- Exposing additional system settings through these new endpoints (future work).
- Controlling uptime display per-category or per-tile (global toggle only).

---

## 12. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-04 | 1.0.0 | Walt | Initial draft — pending Kare design section (§9) |
