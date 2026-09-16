# Spec: Health Bar Visibility Toggle — per-user

**Version:** 0.1.1
**Created:** 2026-09-15
**Author:** Caleb Dunn (via /add:spec)
**Status:** Draft — BLOCKED on OQ-1 (see §3). Awaiting Walt product sign-off and Kare §9 design section.
**Repo:** `Code/homepad` (frontend) + `Code/homepad-api` (Go backend)
**Estimate:** ~2–3 hours (migration + `/api/me` field + settings UI + tests)
**Depends on:** SPEC-v24-health-meter-banding (shipped v15.1.0), v12-settings-boundary-clarity (shipped PR #77), the health-panel redesign (one proportional bar replacing chips + meter + legend)
**Target version:** 16.3.0 (minor — new feature)

---

## 1. Overview

The health panel (`StatusBar.tsx`, `<div className="health glass">`) always renders. It
carries two distinct things: a **verdict** (LED + headline + subline — "All systems
operational", "3 services need attention") and a **distribution bar** (the proportional
up / not-monitored / down element that replaced the chips, meter and legend).

Some users want the verdict without the distribution. The verdict answers "is anything
wrong?" in one line; the bar answers "how is the fleet split?", which is not information
every user needs on every page load.

This spec adds a **per-user boolean** that hides the bar and keeps the verdict. Default
**ON** (visible), so no existing user sees a change on deploy.

This is a **display-only toggle**. Gatus polling, the status payload, the `data-stale`
treatment, per-tile badges and the verdict line are all unaffected.

### User story

As a homepad user, I want to hide the fleet distribution bar from my own dashboard so
that the health panel stays to a single line of verdict text, without changing what
anyone else sees.

---

## 2. Decision: per-user preference (not a System setting)

cap6 (`cap6-uptime-display-toggle.md`) made the analogous uptime toggle a **global admin
System setting** — one switch, whole install. This spec goes the other way deliberately.

| | cap6 uptime display | This spec |
|---|---|---|
| Scope | Global, admin-only | Per-user |
| Storage | `system_settings` table | `users` column |
| Read | `GET /api/system/config` | `GET /api/me` |
| Write | `PATCH /api/admin/settings` | `PATCH /api/me` |
| Non-admin can change | No | Yes — it is their own setting |

The precedent for a per-user display preference is `themePref` (v3) and `densityPref`
(SPEC-tile-density): both are columns on the user, both read from `GET /api/me`, both
written with `PATCH /api/me`, both session-gated so a user can only set their own.
This follows that pattern exactly.

---

## 3. Open Questions

### OQ-1 — SettingsPanel is admin-only today (BLOCKING)

The chosen home for the control is `SettingsPanel`. As built, `SettingsPanel` is reachable
**only** via the `menu-admin-settings` button in `UserMenu.tsx`, which is inside
`{isAdmin && (...)}`. It is also titled "Admin Panel" (`SettingsPanel.tsx:67`).

A per-user preference placed there is unreachable for every non-admin user — which is
most of the people the setting exists for. This must be resolved before implementation.

Three ways out, in the author's order of preference:

- **(a)** Add a **"My settings"** entry to the `My Dashboard` section of `UserMenu`
  (non-admin reachable) that opens `SettingsPanel` in a personal mode showing only
  per-user sections. Preserves the v12 §4.1 admin/personal boundary: the Administration
  shield keeps meaning "global state" exactly as D3/D4 require.
- **(b)** Put the toggle in `UserMenu` beside `ThemeControl` and `AccentControl`, where
  the other two per-user display preferences already live. Cheapest; no new route.
- **(c)** Ungate `SettingsPanel` and hide admin sections per-role. Largest blast radius —
  it reopens the confusion v11 and v12 were written to close.

**Until OQ-1 is resolved this spec is not implementable as written.**

### OQ-2 — first-paint flash *(RESOLVED)*

Storage is server-side only, with no `localStorage` cache. `densityPref` deliberately
keeps a per-device cache so the first paint does not flash the default before `/api/me`
answers (see `tileDensity.ts` header comment). Without one, a user who has hidden the bar
will see it render and then disappear on every cold load.

**Resolved 2026-09-15 — Caleb.** Mirror the `densityPref` model: `/api/me` is the source
of truth and wins on every resolve, `localStorage` is a first-paint cache only. AC-011 is
**Must**, so the cache is a requirement rather than an optimisation — an implementation
that reads only `/api/me` does not satisfy this spec.

### OQ-3 — does hiding the bar hide the freshness stamp?

In the redesign the "42s ago" stamp sits on the verdict line (placement P4), not in the
bar, so it survives when the bar is hidden. Confirm that is wanted. If the stamp were
ever moved back under the bar, this AC set would need revisiting.

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | A user with no stored preference sees the bar. Default is visible; no existing user's dashboard changes on deploy. | Must |
| AC-002 | The control is a single boolean, labelled for what it does ("Show status bar"), with the on state meaning visible. | Must |
| AC-003 | Toggling off hides **only** the distribution bar. The LED, headline, subline and freshness stamp all remain. | Must |
| AC-004 | With the bar hidden, the panel collapses to its single-row height; no empty gap is left where the bar was. | Must |
| AC-005 | The preference persists across logout/login and is visible on a second device for the same user. | Must |
| AC-006 | The preference is per-user: changing it does not alter any other user's dashboard. | Must |
| AC-007 | A non-admin user can reach and change the control. *(Depends on OQ-1.)* | Must |
| AC-008 | The write is session-gated server-side — a user can set only their own preference; no cross-user write is possible. | Must |
| AC-009 | An invalid value is rejected `400` and the UI keeps the prior state. | Must |
| AC-010 | When the save fails, the toggle rolls back to the persisted value and says so — same optimistic/rollback shape as `setFavorite`/`setLayout`. | Must |
| AC-011 | On a cold load the panel does not flash the bar before `/api/me` resolves. *(See OQ-2.)* | Must |
| AC-012 | An older backend with no such field (400) degrades without reverting the user's choice for the session. | Should |
| AC-013 | Hiding the bar does not affect Gatus polling, the status payload, per-tile badges, or the v13 refresh cycle. | Must |
| AC-014 | The toggle has a ≥44×44px hit target and an accessible name, per v19. | Must |
| AC-015 | The hidden state is not announced as an error or empty state to assistive tech — the panel simply has no distribution region. | Must |
| AC-016 | With the bar hidden, the counts it carried (online / not monitored / down) remain available in the subline text, so no information is lost outright. | Should |

---

## 5. User Test Cases

### TC-001: Hide the bar
**Precondition:** Logged in, bar visible, 26 services.
1. Open the settings surface (see OQ-1).
2. Toggle "Show status bar" off.
**Expected:** The bar disappears immediately. The verdict line, LED and "42s ago" stamp stay. The panel shrinks to one row with no leftover gap.
**Screenshot checkpoint:** `tests/screenshots/health-bar-toggle/hidden.png`
**Maps to:** TBD

### TC-002: Persists across sessions and devices
**Precondition:** Bar hidden per TC-001.
1. Log out and back in. 2. Open the dashboard on a second device as the same user.
**Expected:** Bar hidden in both.
**Maps to:** TBD

### TC-003: Per-user isolation
**Precondition:** User A hid the bar.
1. Log in as user B.
**Expected:** User B still sees the bar.
**Maps to:** TBD

### TC-004: Save failure rolls back
**Precondition:** Bar visible; API patched to fail the write.
1. Toggle off.
**Expected:** Toggle returns to on, the bar stays visible, and the failure is surfaced.
**Maps to:** TBD

### TC-005: Incident with the bar hidden
**Precondition:** Bar hidden; three services DOWN.
1. Load the dashboard.
**Expected:** The verdict still reads "3 services need attention" with the red LED. The outage is not concealed by the preference.
**Screenshot checkpoint:** `tests/screenshots/health-bar-toggle/hidden-incident.png`
**Maps to:** TBD

### TC-006: Non-admin can reach it
**Precondition:** Logged in as a non-admin.
1. Open the settings surface.
**Expected:** The control is present and operable. *(Blocked by OQ-1.)*
**Maps to:** TBD

---

## 6. Data Model

One nullable boolean column on the user, defaulting to visible.

```sql
-- homepad-api/migrations/NNNN_health_bar_pref.up.sql
ALTER TABLE users ADD COLUMN show_health_bar BOOLEAN NOT NULL DEFAULT TRUE;
```

```sql
-- NNNN_health_bar_pref.down.sql
ALTER TABLE users DROP COLUMN show_health_bar;
```

`NOT NULL DEFAULT TRUE` makes AC-001 a property of the schema rather than of client code:
every existing row is visible-by-default at migration time.

---

## 7. API Contract

Extends the two endpoints that already carry `themePref` and `densityPref`. No new routes.

**`GET /api/me`** — add to the existing response:

```json
{ "id": "...", "email": "...", "role": "user",
  "themePref": "system", "densityPref": "compact",
  "showHealthBar": true }
```

**`PATCH /api/me`** — accepts the field alone or alongside the existing prefs:

```json
{ "showHealthBar": false }
```

- `200` with the updated user on success
- `400` for a non-boolean value
- `401` when unauthenticated
- Session-gated: the server derives the user from the session and never accepts a target user id (AC-008)

### Frontend

```ts
// src/api.ts — beside setThemePref / setDensityPref
export type User = {
  // ...existing
  showHealthBar?: boolean;   // optional: an older backend omits it
};

export async function setHealthBarPref(show: boolean): Promise<boolean> {
  return boolRequest('/api/me', 200, { method: 'PATCH', json: { showHealthBar: show } });
}
```

Optional so an older API that omits the field type-checks and falls back to the default
(AC-012), matching how `densityPref` is declared.

---

## 8. Frontend Implementation

- `StatusBar.tsx` reads the preference and renders the bar conditionally. The existing
  `showMetrics` guard is the natural seam — the new condition ANDs with it.
- Hiding must remove the element, not merely visually hide it: the bar is a real
  focusable group in the redesign, so `display: none` / unmounting is required, not
  `opacity` or `visibility` (AC-015).
- The panel's row layout already sizes to content, so removing the bar collapses the row
  with no CSS change needed — assert it (AC-004) rather than assume it.
- The counts must remain in the subline when the bar is hidden (AC-016).
- **A `localStorage` first-paint cache is required (AC-011, Must).** Follow
  `tileDensity.ts`: read the cache synchronously for the first paint, let the
  `/api/me` value win on every resolve, and write through on every change. A
  storage throw (private mode) must fall back to the default without breaking the
  toggle for the session.

---

## 9. Design (Kare)

*Not yet authored. Required before implementation — house convention (v19, v21, v22 all
waited on a §9/§8 design section). Needs: the control's visual treatment in whichever
surface OQ-1 settles on, the collapsed panel at all three widths (390 / 1024 / 1440), and
confirmation that the verdict line alone still reads as a deliberate panel rather than a
stranded sentence.*

---

## 10. Out of Scope

- Any admin/global override of this preference
- Hiding the verdict, LED or freshness stamp
- Changing what the bar shows when it is visible
- Per-category or per-tile visibility
- Resolving the retired `layoutWidthPct` / `saveCategoryLayout` question (tracked in `docs/prd.md` §9)

---

## 11. Sign-offs

| Role | Who | Status |
|------|-----|--------|
| Product | Walt | Pending |
| Design | Kare | Pending — §9 not authored |
| Implementation | Stitch | Blocked on OQ-1 |

---

## 12. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-15 | 0.1.0 | Caleb Dunn | Initial draft via /add:spec |
| 2026-09-15 | 0.1.1 | Caleb Dunn | AC-011 raised Should → Must; OQ-2 resolved (localStorage first-paint cache now required) |
