# Spec: Uptime Display Toggle — Capability #6

**Version:** 2.4.0
**Created:** 2026-07-04
**Author:** Walt (product lead)
**Status:** v1 SHIPPED (prod v13.5.0, global admin setting). **v2 DRAFT — the setting moves to per-user.** Caleb 2026-09-16. OQ-1 resolved. v2 product/design sign-off waived 2026-09-20 under the owner standing rule; AC-028 copy accepted. No outstanding gates.
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

## 2. Decision — SUPERSEDED 2026-09-16: the setting becomes per-user

> ## ⚠️ v1's decision is reversed
>
> **Decided 2026-09-16 by Caleb.** "Show uptime display" moves out of the admin System
> panel and into **My settings**, as a per-user preference — the same shape as
> `themePref` (v3), `densityPref` (SPEC-tile-density) and `showHealthBar`
> (SPEC-health-bar-visibility-toggle).
>
> **Why the original reasoning does not hold.** §2 below argued that a per-user toggle
> would be "incoherent UX" because Gatus is shared homelab infrastructure. That
> conflates two different questions:
>
> 1. *Is uptime monitoring meaningful for this homelab?* — infrastructure. The admin's
>    call, and still is: it is governed by `GATUS_BASE_URL` and per-service `gatus_key`,
>    not by this toggle.
> 2. *Do I want sparklines on my tiles?* — display. The viewer's call.
>
> **D2 already settled this without noticing.** The toggle is a frontend render gate, not
> data suppression: the API keeps returning `uptimeChecks` in both states. So nothing
> about a per-user choice touches the shared poller, the shared Gatus instance, or what
> data exists — exactly as nothing about per-user tile density does.
>
> "User A sees sparklines, User B does not" is no more incoherent than "User A uses
> Compact density, User B uses List". homepad already ships three per-user preferences
> that render shared state differently per person; this becomes the fourth.
>
> **What survives:** everything in §3 except D1, and all of the §9 design work — the
> control itself is unchanged, only its home and its scope move.

### Original v1 decision (for the record)

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
| ~~D1~~ | ~~Global admin setting, not per-user~~ | **SUPERSEDED 2026-09-16 — see §2.** Replaced by D1b. |
| D1b | Per-user preference on `users`, surfaced in My settings | The toggle is a display gate (D2), not an infrastructure decision. Same shape as `themePref` / `densityPref` / `showHealthBar`. |
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
| ~~AC-002~~ | ~~When the toggle is **OFF**, no uptime block appears on any tile for any user~~ — **REVISED by AC-016**: "for any user" becomes "for that user". | v1 |
| AC-003 | When the toggle is **OFF**, no empty gap or layout shift appears in the tile where the uptime block was. The tile's height and layout adapt cleanly. | Must |
| ~~AC-004~~ | ~~An admin user opening the System settings panel sees the toggle~~ — **REVISED by AC-017**: the control moves to My settings and every user sees it. | v1 |
| AC-005 | Toggling and saving persists immediately to the database (no redeploy required). | Must |
| ~~AC-006~~ | ~~After saving, ANY user sees the updated state~~ — **REVISED by AC-019**: the change applies to the saving user only. | v1 |
| ~~AC-007~~ | ~~The toggle is visible only to admin users~~ — **INVERTED by AC-017**: every user gets it, because it is now their own setting. | v1 |
| AC-008 | `GET /api/system/config` returns `{"showUptimeDisplay": true}` when no `system_settings` row exists (the default-ON safe case). | Must |
| AC-009 | `GET /api/system/config` returns `{"showUptimeDisplay": false}` after an admin saves OFF. | Must |
| AC-010 | `GET /api/system/config` requires no authentication — it is accessible before login. | Must |
| AC-011 | `PATCH /api/admin/settings` with `{"showUptimeDisplay": false}` returns 200 and the updated config for an authenticated admin. | Must |
| AC-012 | `PATCH /api/admin/settings` returns 403 for a non-admin authenticated user. | Must |
| AC-013 | `PATCH /api/admin/settings` returns 401 for an unauthenticated request. | Must |
| AC-014 | Status badges (the UP/DOWN/UNKNOWN colored dot on each tile) are unaffected by the toggle in either state. | Must |
| AC-015 | The status bar (service count chips) is unaffected by the toggle in either state. | Must |

### v2 — per-user (2026-09-16)

AC-008 through AC-013 (the `/api/system/config` and `/api/admin/settings` contracts) stay
as written **only** insofar as OQ-2 keeps the admin default; if OQ-2 retires it, they are
superseded with the column.

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-016 | Turning the toggle off hides the uptime block **for that user only**. Another user's dashboard is unaffected. | Must |
| AC-017 | The control lives in **My settings** (`SettingsPanel` `scope="personal"`), reachable by every role via UserMenu → My Dashboard → My settings. It is no longer in the admin System panel. | Must |
| AC-018 | The preference is stored per user, read from `GET /api/me` and written with `PATCH /api/me` — the `themePref` / `densityPref` / `showHealthBar` contract. Session-gated: a user can set only their own. | Must |
| AC-019 | The preference follows the account across devices and survives logout/login. | Must |
| AC-020 | **On migration, nobody's view changes.** Every existing user's new column is seeded from the current global `system_settings.show_uptime_display`. An admin who had it OFF does not find it silently back ON for everyone. | Must |
| AC-020a | AC-020 is tested with the global set to the **non-default** value (i.e. OFF). With it ON, "everyone ends up ON" is also what a completely broken seed produces, so the test cannot fail. Confirmed in practice: prod's global was OFF and staging's was ON, and only the prod check was discriminating. | Must |
| AC-021 | The seeding in AC-020 runs **exactly once**. `Migrate` re-runs every migration on every boot, so an unguarded `UPDATE users SET ...` would reset every user's choice on every restart. The migration must be guarded on its own effect, per the `0013` precedent. | Must |
| AC-022 | A failed write rolls back to the persisted value, matching `setFavorite` / `setLayout` and the `showHealthBar` control. | Must |
| AC-023 | On a cold load the sparklines do not flash before `/api/me` resolves — `localStorage` first-paint cache, `/api/me` wins on every resolve. Same model as `healthBarPref`. | Should |
| AC-024 | The control keeps its v9 design: `role="switch"`, `aria-labelledby`, `.settings-switch`, ≥44×44px. It sits alongside "Show status bar" in the Dashboard section of My settings. | Must |
| AC-025 | Status badges and the health panel remain unaffected in either state (AC-014/AC-015 continue to hold per-user). | Must |
| AC-026 | A **newly created account** inherits `system_settings.show_uptime_display` as its starting value, read at creation time. | Must |
| AC-027 | Changing the admin default **does not alter any existing user's setting** — it applies only to accounts created afterwards. | Must |
| AC-027a | AC-026 and AC-027 are tested **in the direction that can fail**: set the admin default **OFF**, create an account, assert it comes up **OFF**. Testing with the default ON proves nothing — a stale column default alone would pass it. | Must |
| AC-028 | The System panel row is **relabelled** to say it is a default for new accounts, not a global switch. An admin must not be able to read that row as "turn sparklines off for everyone", because it no longer does that. Copy accepted 2026-09-20. | Must |
| AC-028a | The relabel is accompanied by **inline help text** stating the change applies to accounts created afterwards. The label alone is insufficient: an admin toggles the row, checks their own dashboard, sees nothing change, and concludes it is broken. The row must explain its own lack of visible effect. | Must |

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

### v2 — per-user column (2026-09-16)

`system_settings.show_uptime_display` is no longer what the app grid reads. The preference
moves to `users`, seeded once from the global value so nobody's view changes (AC-020).

```sql
-- 0016_per_user_uptime_display.up.sql   (prod is at 0015; 0016 is the next free)
--
-- Idempotent AND once-only. Migrate re-runs EVERY migration on EVERY boot, so the
-- seeding UPDATE cannot sit at the top level: unguarded, it would reset every user's
-- choice back to the global value on every API restart (AC-021).
--
-- The guard predicate is the COLUMN — the vehicle this migration adds. Note this is
-- NOT the same predicate as 0013, which guards on pg_constraint, i.e. on its own
-- EFFECT, and adds grid_width_legacy unguarded at top level. Both are correct for
-- what they do; do not copy one to the other without re-deciding which you need.
--
-- table_schema is pinned to current_schema(): an unqualified information_schema
-- lookup would find a `users` in ANY schema, flip NOT EXISTS false, skip the whole
-- block, never create the column, and fail hard on the first query. 0013 sidesteps
-- this with ::regclass.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'users'
          AND column_name = 'show_uptime_display'
    ) THEN
        -- DEFAULT TRUE is required here so the column can be NOT NULL over existing
        -- rows. It is dropped again below — see the two-defaults note.
        ALTER TABLE users
            ADD COLUMN show_uptime_display BOOLEAN NOT NULL DEFAULT TRUE;

        -- AC-020 — inherit whatever the admin had set globally. COALESCE covers the
        -- fresh-install case where no system_settings row exists (D7: default ON).
        UPDATE users
           SET show_uptime_display = COALESCE(
                 (SELECT show_uptime_display FROM system_settings WHERE id = 1), TRUE);

        -- TWO SOURCES OF DEFAULT TRUTH — the AC-027 failure mode.
        -- Leaving DEFAULT TRUE in place means the column default and
        -- system_settings.show_uptime_display both claim to decide a new account's
        -- value. Any insert path that omits the field then silently gets TRUE and the
        -- row still LOOKS right. That is invisible while the admin default is ON, and
        -- surfaces only when an admin sets it OFF and a new account comes up ON.
        -- Dropping the default makes that a loud NOT NULL violation at insert time
        -- instead of a quiet wrong value, leaving system_settings as the single
        -- source of truth for new accounts (AC-026).
        ALTER TABLE users ALTER COLUMN show_uptime_display DROP DEFAULT;
    END IF;
END $$;
```

> ### ⚠️ Rollback hazard — verified
>
> Dropping the default means **rolling the API back to a pre-0016 image breaks account
> creation.** The older `CreateUser` does not supply `show_uptime_display`, and the
> column is `NOT NULL` with no default:
>
> ```
> ERROR: null value in column "show_uptime_display" violates not-null constraint
> ```
>
> Existing users and sign-in are unaffected — only new-account creation. Before
> swapping to a pre-0016 image, apply `0016_per_user_uptime_display.down.sql` or
> re-add the default with
> `ALTER TABLE users ALTER COLUMN show_uptime_display SET DEFAULT TRUE`.
>
> Same shape as the 0013 hazard, and it belongs in any rollback plan that crosses
> this migration. Reasoned from the migration, then **verified against staging** by
> reproducing the pre-0016 insert shape with a control insert that included the
> column succeeding — so the failure is specifically the missing column.

> **Consequence, stated plainly:** after this migration every insert into `users` must
> supply `show_uptime_display`. `storage.CreateUser` does (AC-026). Any other insert
> path — fixtures, seed helpers, test support — will fail loudly the first time it
> runs. That is the intent: a hard error in a test beats a wrong default in prod that
> nobody notices until an admin turns the setting off.

```sql
-- 0016_per_user_uptime_display.down.sql
ALTER TABLE users DROP COLUMN IF EXISTS show_uptime_display;
```

**`system_settings.show_uptime_display` is deliberately left in place** by this migration
— see OQ-2. Dropping it is a separate decision, and keeping it means the down migration
is a clean reversal rather than a data-losing one.

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

## 9b. v2 — API, UI and open questions (2026-09-16)

### API

No new endpoints. The preference joins the existing per-user contract:

**`GET /api/me`** gains `showUptimeDisplay` alongside `themePref`, `densityPref` and
`showHealthBar`.

**`PATCH /api/me`** accepts `{"showUptimeDisplay": false}`, on its own or with the other
fields. Session-gated — the server derives the user from the session (AC-018). A
non-boolean fails `json.Decode` and 400s before anything is written.

> **Implementation note.** The empty-body guard in `auth.go` must list the new field.
> It rejects any body carrying none of the known fields, so a single-field write would
> 400 — and an optimistic client would roll back and look like a flaky server rather
> than a missing case. This exact bug was found and fixed for `showHealthBar`
> (homepad-api #68); do not reintroduce it.

`GET /api/system/config` and `PATCH /api/admin/settings` are **unchanged and retained**
(OQ-1 resolved). What changes is what the value *means*: it is the seed for new accounts,
no longer a live render gate. Nothing reads it per-request any more.

**`storage.CreateUser` must seed the new column** from `system_settings` in the same
statement that inserts the row (AC-026), and its `RETURNING` clause gains
`show_uptime_display` like the other two user SELECT sites.

Because §6 drops the column default, this is no longer belt-and-braces — it is the only
thing supplying the value. An omitted field is a `NOT NULL` violation, not a silent
`TRUE`. Every other insert path into `users` (fixtures, `internal/storage/seed`,
`testsupport`) must be updated in the same change and will fail loudly if missed.

### Frontend

Mirrors `showHealthBar` closely enough that it is largely a copy:

- `src/api.ts` — `showUptimeDisplay?: boolean` on `User` (optional, so an older backend
  degrades), plus `setUptimeDisplayPref`.
- A `useUptimeDisplayPref` hook on the `healthBarPref.ts` model: `/api/me` is the source
  of truth and wins on every resolve, `localStorage` is a first-paint cache only
  (AC-023), and a failed write **rolls back** (AC-022).
- `App` seeds it from `user.showUptimeDisplay` and passes it to `AppGrid`, replacing the
  current `sysConfig.showUptimeDisplay` thread.
- `SettingsPanel` `PersonalSettings` gains a second row beneath "Show status bar",
  reusing the same switch markup (AC-024).

The v9 design work is unchanged — the control looks and behaves as Kare specified; only
its container moves from the System section to the Dashboard section of My settings.

### Open questions

**OQ-1 — does the admin keep a global control? RESOLVED 2026-09-16 — Caleb: YES.**
The admin keeps it, **as a default for new accounts, not a live override.**

`system_settings.show_uptime_display` stays. Its *meaning* changes: it no longer gates
anybody's rendering, it seeds `users.show_uptime_display` at account creation. An admin
who removes Gatus can therefore stop sparklines appearing for every account created from
then on, without reaching into anyone's existing personal choice.

The consequence that needs care: **after this change, an admin toggling that row sees
nothing happen** — not on their own dashboard, not on anyone's. That is correct
behaviour and terrible UX if the row still reads like a global switch. AC-028 requires
the copy to change with it. This is precisely the class of confusion v11 and v12 were
written to eliminate, so it is not optional polish.

**OQ-2 — retiring the admin endpoints. CLOSED by OQ-1.** `system_settings`,
`GET /api/system/config` and `PATCH /api/admin/settings` all stay. (`GET
/api/system/config` also carries `statusDegradedMs` since v16.2.0, so it was never
going to be empty.)

**OQ-3 — a user created *after* migration. CLOSED by OQ-1.** Seeds from the admin
default at creation. See AC-026.

---

## 10. Sign-offs

| Role | Person | v1 (global admin setting) | v2 (per-user) |
|------|--------|---------------------------|---------------|
| Product | Walt | Approved — 2026-07-04 | **Not required** — waived 2026-09-20 under the owner standing rule |
| Design / UX | Kare | Approved — 2026-07-04 | **Not required** — waived 2026-09-20 under the owner standing rule |

*This spec is not finalized until both sign-offs are recorded here. It does NOT go to
Stitch until both are present.*

> **The v1 column does not satisfy the rule above for v2.** Those approvals are from
> 2026-07-04 and cover the global-admin design that §2 reverses. Read as a single
> "both present" the table would mark the gate satisfied while v2 is still a draft —
> which is what the Status field at the top of this spec actually says (homepad#464).
>
> v2 shipped in 16.4.0 ahead of these sign-offs, and the owner has since confirmed
> directly that code originating from the repo owner does not require Walt or Kare
> validation — those seats proxy for his intent, so on his own work the check is
> circular. Both v2 rows are therefore **waived**, not outstanding, and AC-028's copy
> is accepted as written.
>
> The rule covers product and design sign-off ONLY. Correctness gates — QA review,
> tests, e2e — still apply and are not waived by it.

---

## 11. Out of Scope

- ~~Per-user uptime toggle (see §2 for justification).~~ **REVERSED in v2.0.0 — this IS v2.** §2 now justifies the per-user model rather than arguing against it (homepad#463).
- Hiding or toggling the UP/DOWN/UNKNOWN status badge on tiles.
- Pausing or disabling Gatus polling from homepad.
- Real-time propagation to active sessions (change takes effect on next page load).
- Any visual redesign of the uptime sparkline itself.
- Exposing additional system settings through these new endpoints (future work).
- Controlling uptime display per-category or per-tile. (v1 read "global toggle only"; in v2 the scope is per-user, but per-category and per-tile remain out of scope.)

---

## 12. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-07-04 | 1.0.0 | Walt | Initial draft — pending Kare design section (§9) |
| 2026-07-04 | 1.1.0 | Kare | §9 Design section authored (control spec, 5 states, D6 note copy, CSS/a11y); design co-sign recorded in §10 |
| 2026-09-20 | 2.4.0 | Caleb | v2 product and design sign-off **waived** under the owner standing rule (owner-authored code does not require Walt/Kare validation). AC-028 copy accepted as written; placeholder markers removed from the spec and from SettingsPanel. The rule covers product/design sign-off only — QA, tests and e2e still apply. No outstanding gates on this spec. |
| 2026-09-19 | 2.3.1 | Caleb (QA: Ada) | Sweeps sections the v2 reversal invalidated but left untouched: §10 sign-offs split into v1/v2 columns so the "both present" gate cannot read as satisfied for v2 (homepad#464), and §11's out-of-scope bullets corrected — one pointed at §2 for a justification §2 no longer makes (homepad#463). |
| 2026-09-16 | 2.3.0 | Caleb (verified: Joe) | Records the **0016 rollback hazard** — dropping the column default breaks account creation on a pre-0016 image; verified against staging, remedy is 0016.down or re-adding the default. Adds **AC-020a**: the seed test must run with the global at its non-default value, or "everyone ends up ON" passes for a completely broken seed. |
| 2026-09-16 | 2.2.0 | Caleb (review: Joe) | Migration numbered **0016**; `information_schema` lookup pinned to `current_schema()`; the 0013 guard comparison corrected (0013 guards its *effect* via pg_constraint, this guards its *vehicle*, the column); **column default dropped after seeding** so `system_settings` is the single source of truth for new accounts; AC-027a (test in the failing direction — admin default OFF) and AC-028a (inline help text) added. |
| 2026-09-16 | 2.1.0 | Caleb | **OQ-1 resolved: admin keeps the global value as the default for new accounts, not an override.** OQ-2/OQ-3 closed by it. AC-026..AC-028 added — new accounts seed from the default, changing the default never touches existing users, and the System panel row must be relabelled so it cannot be misread as a global switch. |
| 2026-09-16 | 2.0.0 | Caleb | **Setting becomes per-user.** §2 decision reversed with reasoning (D2 already made it a display gate, not data suppression); D1 → D1b; AC-002/004/006/007 revised or inverted; AC-016..AC-025 added; per-user migration with a once-only seed guard; API moves to GET/PATCH /api/me. Admin default retained pending OQ-1. |
