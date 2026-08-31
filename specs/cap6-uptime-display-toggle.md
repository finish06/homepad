# Spec: Uptime Display Toggle — Capability #6

**Version:** 1.0.0
**Created:** 2026-07-04
**Author:** Walt (product lead)
**Status:** Spec approved — Walt product sign-off 2026-07-04, Kare design sign-off 2026-07-04
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

## 9. Design (Kare)

This section is the design contract for the one new interactive surface: a writable
boolean toggle row added to the admin-only System settings section, which is read-only
today. It answers Walt's four questions, specifies the control's five visual states,
gives the updated note copy, and provides CSS-class guidance that respects (and minimally
extends) the existing `.settings-kv` / `.settings-env-badge` patterns.

All values are grounded in the homelab design system (`Code/design-system/DESIGN-SYSTEM.md`):
8pt spacing grid, indigo primary `#4F46E5` (measured 6.29:1 non-text on white), radius ramp
`8/12/16/20/full`, motion `120–200ms ease-out`, `prefers-reduced-motion` honored, and the
**≥44×44px touch-target rule** (this is an iPad-first homelab; the panel is used on an iPad).

### 9.0 Answers to Walt's questions (decisions)

| Q | Walt's recommendation | Kare's decision |
|---|-----------------------|-----------------|
| **1. Control type** | Pill/switch | **Confirmed — pill switch** (`<button role="switch">`). A switch is the correct signifier for a boolean that takes effect immediately; a checkbox reads as "part of a form you submit," and a select is overkill for two states. See D-CTRL below. |
| **2. Save model** | Auto-save + inline "Saved" | **Confirmed — auto-save on toggle**, with a `saving → saved` inline confirmation and an error-revert path. No Save button (nothing else in the section is form-like). See §9.2 states. |
| **3. Placement** | Above the read-only rows | **Confirmed — above.** The one writable, badge-less row sits first; a hairline divider separates it from the `[env]` read-only block below, so "you can change this / these are env-driven" is a visible grouping, not a guess. |
| **4. Note copy** | (deferred to Kare) | See §9.3. The paragraph stops claiming the whole section is read-only; the per-row `[env]` badges carry the read-only signal (this is exactly the v12 §4.2/D5 intent — the badge, not the note, marks read-only). |
| **5. OFF / saved visuals** | (deferred to Kare) | Label stays **full-strength** in both states (see §9.4); only the track/thumb reflect on/off. Saved-success is a brief inline `Saved ✓` pill in the value cell (see §9.2). |

### 9.1 The toggle row — control spec (D-CTRL)

Rendered inside the existing `<dl className="settings-kv">`, as the **first** row, using the
same `dt` (label, left) / `dd` (control, right) rhythm as the env rows so it aligns with them.

```tsx
<div className="settings-kv-row settings-kv-row--control">
  <dt id="uptime-toggle-label">Show uptime display</dt>
  <dd>
    <span
      className="settings-save-flag"
      role="status"
      aria-live="polite"
      data-state={saveState}      /* 'idle' | 'saving' | 'saved' | 'error' */
    >
      {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : ''}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={showUptimeDisplay}
      aria-labelledby="uptime-toggle-label"
      aria-busy={saveState === 'saving'}
      disabled={saveState === 'saving'}
      className="settings-switch"
      data-testid="settings-switch-uptime"
      onClick={() => onSaveSettings({ showUptimeDisplay: !showUptimeDisplay })}
    >
      <span className="settings-switch-thumb" aria-hidden="true" />
    </button>
  </dd>
</div>
```

**Geometry (measured targets Stitch must hit — I verify these on the built PR):**

| Element | Spec | Rule it satisfies |
|---------|------|-------------------|
| Hit area (`.settings-switch` box) | **≥44×44px** (visible track centered inside via vertical padding) | Touch target ≥44×44 |
| Visible track | **44 × 24px**, `border-radius: 999px` (radius-full) | on-grid (24), full radius |
| Thumb | **20px** circle, **2px** inset top/bottom, travel **20px** (off: `left:2px` → on: `left:22px`) | on-grid |
| Track ↔ label gap | 16px (row's existing `gap`) | 8pt grid |

**Color / contrast (all ≥3:1 as meaningful UI graphics — measured off the token set):**

| State | Track fill | Track border | Thumb | Contrast basis |
|-------|-----------|--------------|-------|----------------|
| ON (light) | indigo `#4F46E5` | none | `#fff` + `0 1px 2px rgba(0,0,0,.35)` | indigo on white **6.29:1** ✅; white thumb on indigo **6.29:1** ✅ |
| OFF (light) | `#E4E7EE` | **1.5px `#767676`** | `#fff` + shadow | off-track boundary `#767676` on white **≈4.5:1** ✅ (>3:1); the border, not the pale fill, carries the boundary so OFF is never a sub-3:1 ghost |
| ON (dark) | indigo `#6366F1` | none | `#e6e9f2` | indigo-500 on dark canvas ≥3:1 ✅; matches `.dark` accent usage |
| OFF (dark) | `rgba(255,255,255,0.10)` | **1.5px `rgba(255,255,255,0.45)`** | `#e6e9f2` | border ≥3:1 on the dark panel ✅ |

> The OFF state deliberately uses a **bordered** track. A flat pale fill (e.g. `#E4E7EE` on
> white ≈1.4:1) would fail the 3:1 UI-component rule — the same class of miss as the #163/#164
> dark-contrast bugs. The 1.5px `#767676` border is the state's boundary and clears 3:1.

### 9.2 States (all five designed — principle #5)

| State | Trigger | Visual | A11y |
|-------|---------|--------|------|
| **default / ON** | persisted `true` | Track indigo, thumb right. Label full-strength. | `aria-checked="true"` |
| **default / OFF** | persisted `false` | Track bordered-grey, thumb left. Label full-strength. | `aria-checked="false"` |
| **saving** | click, PATCH in flight | Switch `disabled` + `aria-busy`; thumb animates to the new side immediately (optimistic); value cell shows muted `Saving…`. | `aria-busy="true"`; button non-interactive so no double-fire |
| **saved** | PATCH 200 | `Saving…` swaps to `Saved ✓` (indigo-tinted flag) for **~1.6s**, then fades out (150ms). Switch re-enabled in the new state. | `role="status" aria-live="polite"` announces "Saved" once |
| **error** | PATCH non-2xx / network | Switch **reverts** to the prior persisted state (optimistic thumb snaps back); value cell shows `.settings-error` copy: *"Couldn't save — try again."* | `role="status"` (polite); revert keeps `aria-checked` truthful to actual persisted state |

Motion: thumb slide + fill = **150ms ease-out** (in the doc's 120–200ms band). Under
`prefers-reduced-motion: reduce`, the thumb **jumps** (no slide) and the `Saved ✓` flag
appears/disappears without the fade — state change stays instant and legible.

### 9.3 Updated section note copy (D6)

The current note — *"Read-only — set via environment variables and redeploy. These settings
apply globally to all accounts."* — is false the moment a writable row exists. Replace with:

> **These settings apply globally to all accounts. Rows marked `[env]` are read-only — set
> via environment variables and redeploy.**

This keeps the global-scope framing, moves the read-only claim onto the `[env]`-badged rows
only (matching the badge's purpose), and leaves the new toggle row correctly reading as
writable (it carries no badge).

### 9.4 OFF-state & label treatment (answers Q5)

- **The label does not grey out.** "Show uptime display" names the *setting*, not its value;
  dimming it would signal a **disabled control**, which is the opposite of the truth (the
  control is fully interactive whether the feature is on or off). The label stays `dt`
  full-strength (`#475069` light / `#aab2c5` dark) in all states. Only the track/thumb encode
  on vs off.
- **Saved-success** is the transient `Saved ✓` flag described in §9.2 — small, indigo-tinted,
  right-aligned in the value cell just left of the switch, gone in ~1.6s. It is confirmation,
  not chrome; it never persists and never shifts layout (reserve its space so the switch
  doesn't jump when the flag appears/clears).

### 9.5 CSS-class guidance (respect + minimally extend `.settings-kv`)

Reuse `.settings-kv`, `.settings-kv-row`, `dt`, `dd` unchanged. Add three scoped classes and
one row modifier — no changes to existing selectors, so the env rows are untouched:

```css
/* First (writable) row: separate it from the [env] read-only block below with a hairline. */
.settings-kv-row--control {
  padding-bottom: 12px;                         /* 8pt grid */
  border-bottom: 1px solid rgba(15, 23, 42, 0.08);
  align-items: center;                          /* switch vertically centers on the label */
}
.dark .settings-kv-row--control { border-bottom-color: rgba(255, 255, 255, 0.10); }

/* dd holds [ save-flag ][ switch ] right-aligned, matching env-row value alignment. */
.settings-kv-row--control dd {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Pill switch — 44×44 hit area, 44×24 visible track centered inside. */
.settings-switch {
  position: relative;
  flex: none;
  width: 44px;
  height: 44px;                                 /* touch target ≥44 */
  padding: 10px 0;                              /* centers the 24px track */
  border: 0;
  background: none;
  cursor: pointer;
}
.settings-switch::before {                      /* the track */
  content: "";
  display: block;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: #E4E7EE;
  border: 1.5px solid #767676;                  /* OFF boundary ≥3:1 */
  transition: background 150ms ease-out, border-color 150ms ease-out;
}
.settings-switch-thumb {
  position: absolute;
  top: 12px; left: 2px;                         /* 2px inset within the centered track */
  width: 20px; height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
  transition: left 150ms ease-out;
}
.settings-switch[aria-checked="true"]::before { background: #4F46E5; border-color: transparent; }
.settings-switch[aria-checked="true"] .settings-switch-thumb { left: 22px; }
.settings-switch:focus-visible {                /* keyboard ring — non-text 6.29:1 */
  outline: 2px solid #4F46E5;
  outline-offset: 2px;
  border-radius: 999px;
}
.settings-switch[aria-busy="true"] { opacity: 0.7; cursor: progress; }

/* Transient "Saved ✓" / "Saving…" flag — reserve width so the switch never jumps. */
.settings-save-flag {
  min-width: 56px;
  text-align: right;
  font-size: 12px;
  font-weight: 600;
  color: #4F46E5;
  opacity: 0;
  transition: opacity 150ms ease-out;
}
.settings-save-flag[data-state="saving"] { color: #9aa3b8; opacity: 1; }
.settings-save-flag[data-state="saved"]  { opacity: 1; }

.dark .settings-switch::before { background: rgba(255, 255, 255, 0.10); border-color: rgba(255, 255, 255, 0.45); }
.dark .settings-switch[aria-checked="true"]::before { background: #6366F1; border-color: transparent; }
.dark .settings-switch-thumb { background: #e6e9f2; }
.dark .settings-save-flag { color: #a5b4fc; }

@media (prefers-reduced-motion: reduce) {
  .settings-switch::before,
  .settings-switch-thumb,
  .settings-save-flag { transition: none; }
}
```

(Implementation may fold the thumb into the markup shown in §9.1 rather than the `::before`
track — either is fine as long as the measured geometry and contrast above hold.)

### 9.6 A11y notes

- **Role/name/state:** `role="switch"` + `aria-checked` (true/false) + `aria-labelledby`
  pointing at the `dt` — a screen reader announces *"Show uptime display, switch, on/off."*
- **Keyboard:** natively focusable `<button>`; `Space`/`Enter` toggle; visible
  `:focus-visible` ring (2px indigo, 2px offset, ≥3:1). Tab order: this row is first, before
  the env rows.
- **Busy / no double-fire:** `aria-busy` + `disabled` during the PATCH; re-enabled on
  settle. The optimistic thumb move keeps the control feeling responsive without lying —
  `aria-checked` is corrected to the real persisted value on error (revert).
- **Live confirmation:** the `Saved ✓` / error copy lives in a `role="status"`
  `aria-live="polite"` region so the outcome is announced without stealing focus.
- **Admin-gating (AC-007):** the whole row renders only in the admin `SystemSettings`
  branch; non-admins never receive it in the DOM (not merely hidden).

### 9.7 Verification plan (at PR-review time)

This is a design co-sign at **spec** time — the control does not exist yet, so there is
nothing to render or screenshot now. When Stitch's PR lands I verify on the live staging DOM,
at phone / iPad-portrait / desktop, in light **and** dark: the 44×44 hit box
(`getBoundingClientRect`), the ON/OFF track contrast (`getComputedStyle` → ratio vs 3:1),
grid adherence, `axe-core` clean on the switch, keyboard focus ring, and the
saving→saved→error path. Any miss there is filed as a Gitea issue against the PR per the
standard flow.

---

## 10. Sign-offs

| Role | Person | Status |
|------|--------|--------|
| Product | Walt | Approved — 2026-07-04 |
| Design / UX | Kare | Approved — 2026-07-04 |

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
| 2026-07-04 | 1.1.0 | Kare | §9 Design section authored (control spec, 5 states, D6 note copy, CSS/a11y); design co-sign recorded in §10 |
