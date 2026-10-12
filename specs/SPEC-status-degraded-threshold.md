# Spec: "Slow" threshold — `statusDegradedMs`

**Status:** SHIPPED — v16.2.0 (PR #444). **Spec written retroactively 2026-10-11 (#449)**, from the
code on both sides, because the setting shipped with a test suite but no spec and QA kept having to
infer its contract from tests. Nothing here is new behaviour; every statement below is pinned to the
code that implements it.

## 1. What it is

A succeeded Gatus check that took longer than this many milliseconds reads **DEGRADED** ("Slow")
instead of UP. An admin sets it in the **System** panel (`SettingsPanel` `scope="admin"`, the
"Slow threshold" row). It is global — one value for every user.

## 2. The effective value — three sources, in this order

| Source | Where | When it applies |
|---|---|---|
| **Admin-set value** | `system_settings.status_degraded_ms` (migration 0014) | Whenever it is non-NULL |
| `GATUS_DEGRADED_MS` env var | `cmd/homepad-api/main.go` | Only while the admin value is NULL |
| Built-in default | `gatus.DefaultDegradedAfter` = **1000 ms** | Neither of the above set, or the env var is not a non-negative integer (logged, then ignored) |

`GET /api/system/config` returns the **effective** value as `statusDegradedMs` — the admin value if
set, otherwise whatever the poller is running with (`internal/api/system.go`, `toSystemConfigView`).

## 3. Acceptance criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | Valid values are **integers from 0 to 600000 ms** (10 minutes) inclusive. | Must |
| AC-002 | The range is enforced in **all three layers**: the client disables Save for anything else; `PATCH /api/admin/settings` returns **400** `statusDegradedMs must be between 0 and 600000`; and a DB `CHECK (status_degraded_ms IS NULL OR (… >= 0 AND … <= 600000))` backs both. | Must |
| AC-003 | **`0` turns DEGRADED derivation off**: a slow-but-successful check stays UP (`internal/gatus/poller.go`, the `degradedAfter() > 0` guard). | Must |
| AC-004 | Saving is **admin-only** (`requireAdmin` on `PATCH /api/admin/settings` — 401 without a session, 403 for a non-admin). Reading the effective value via `GET /api/system/config` is open to any authenticated user. | Must |
| AC-005 | The field saves on **explicit submit**, never per keystroke — a half-typed number must not PATCH. Save is enabled only when the draft is valid **and** differs from the persisted value. | Must |
| AC-006 | A successful save takes effect **immediately, without a restart**: the handler calls `poller.SetDegradedAfter(…)` with the saved value. | Must |
| AC-007 | On a failed save (non-2xx or network) the field **reverts to the last persisted value** and shows `Couldn't save — try again.` — the same contract as the uptime toggle's §9.2. A successful save shows a brief "Saved" acknowledgement (~1.6 s). | Must |
| AC-008 | Once an admin has set a value, it **overrides `GATUS_DEGRADED_MS`** for as long as it is set. | Must |

## 4. Where it is tested

- `src/library/SettingsPanel.test.tsx` — `describe('v16 — Slow threshold (statusDegradedMs)')`: shows the
  current value with Save disabled until it changes; saves via `onSaveSettings`; accepts `0` and rejects
  a negative or non-integer value; reverts and says so on a failed save (AC-001, AC-003, AC-005, AC-007).
- `homepad-api/internal/api` — the PATCH handler's range check and admin gate (AC-002, AC-004).

## 5. Open question

**OQ-1 — there is no way back to "unset".** The column is nullable and NULL means "use
`GATUS_DEGRADED_MS` / the default", but the UI can only write an integer. Once an admin saves any value
— including the one that matches the env var — the env var stops applying permanently, and the only way
back is a direct database write. Either add a "Reset to server default" action that PATCHes `null`, or
document that the admin value is one-way. Not decided here.
