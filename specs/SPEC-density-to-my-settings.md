# Spec: Tile density moves to My settings · gear "Edit dashboard" becomes "Arrange apps"

**Status:** BUILT 2026-09-23 — all three open questions resolved (§3, §7). Kare §9 not authored; OQ-1 stands as a product call over a design placement.
**Version:** 0.1.0
**Created:** 2026-09-23
**Author:** Claude (Opus 5), from Caleb's direction
**Repo:** `Code/homepad` (frontend only — no API, no migration)
**Target version:** 16.6.0 (two user-visible moves = minor)
**Depends on:** `SPEC-tile-density.md` (shipped v16.1.0), `v18-gear-edit-menu.md` (shipped v12.5.0), `v12-settings-boundary-clarity.md` (shipped)

---

## 1. Problem

Two unrelated bits of the interface have drifted from what they now mean.

**The density switch is on the dashboard, not in settings.** `TileDensityToggle`
renders inside `.dashboard-toolbar` (`src/app/App.tsx`), permanently visible above
the grid next to a "Your dashboard" label. It is a **preference**, not a dashboard
action: it is per-user, it persists through `/api/me` (`densityPref`), and people
set it roughly once. Every other per-user preference of the same shape —
`themePref`, `showHealthBar`, `showUptimeDisplay` — lives in **My settings**. Density
is the odd one out, occupying permanent dashboard real estate for a control nobody
touches twice.

**The gear says "Edit dashboard" for something narrower.** The item toggles an
admin, client-ephemeral mode whose actual effect is drag-to-reorder plus the
per-tile pencil. It does not edit "the dashboard" in any broader sense — settings,
categories and the catalog are all elsewhere. "Edit dashboard" oversells it, and
sits oddly next to "Add apps", which is the thing people are usually doing
immediately before or after arranging.

### Correction to the framing this spec was requested under

The request described the density toggle as living "in the gear menu's Edit
Dashboard area". It does not, and never has — it is on the dashboard toolbar
(`App.tsx:273`), outside the gear entirely, and visible to every user including
non-admins. The intent (get it into My settings) is unaffected, but the starting
point is different from the one described, and §2 records what is actually there.

---

## 2. Current state (code-confirmed 2026-09-23)

### 2.1 Density

```
src/app/App.tsx:273        <div className="dashboard-toolbar" data-testid="dashboard-toolbar">
                             <span className="dashboard-toolbar-label">Your dashboard</span>
                             <TileDensityToggle density={density} onChange={setDensity} />
                           </div>
src/app/App.tsx:116        const [density, setDensity] = useTileDensity(user.densityPref);
src/grid/TileDensityToggle.tsx    the control itself (Large / Compact / List)
src/grid/tileDensity.ts:20        DEFAULT_DENSITY = 'compact'
```

Visible to **all** users. `SPEC-tile-density` OQ-9 put it here deliberately,
"matching the v16 artboard" — so this spec reverses a design placement, not an
oversight. See OQ-1.

### 2.2 My settings

`PersonalSettings` in `src/library/SettingsPanel.tsx`, opened from My Dashboard →
"My settings" by every role (`scope='personal'`). Currently two rows, both
`<dt>` + `role="switch"`:

| Row | testid |
|---|---|
| Show status bar | `setting-health-bar` |
| Show uptime display | `setting-uptime-display` |

Density is a **three-way** choice, so it is the first row here that is not a switch.

### 2.3 The gear menu

`GearMenu`, `src/app/AppHeader.tsx:196`. Current order:

```
My Dashboard            (section label)
  Add apps              gear-add-apps            all users
Admin editing           (section label, admins only)
  Add custom app        gear-add-custom-app      admin
  Edit dashboard        gear-edit-dashboard      admin, role=menuitemcheckbox
```

Both the container's `aria-label` **and the gear trigger's** (`settings-gear`,
`AppHeader.tsx:112`) are also `"Edit dashboard"`. Three separate things carry that
one name today; a screen-reader user hears it for the button, the menu, and the
item. All three need resolving together or the menu's accessible name will
contradict its contents (AC-009).

---

## 3. Decisions (Caleb, 2026-09-23)

| # | Question | Decision |
|---|---|---|
| D-1 | Does density stay on the dashboard as well? | **No — move it outright.** One home per preference. |
| D-2 | What does "Edit dashboard" become? | **"Arrange apps"**, placed under "Add apps". |

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | The density control renders inside **My settings**, below the two existing preference rows. | Must |
| AC-002 | The density control is **removed** from the dashboard toolbar. No residual control, and no reserved gap where it was. | Must |
| AC-003 | Changing density in My settings takes effect on the grid **immediately**, without closing the panel and without a reload. | Must |
| AC-004 | Density continues to persist per user via `PATCH /api/me` (`densityPref`), with the localStorage cache still serving first paint. No change to the persistence model. | Must |
| AC-005 | The density row is reachable and operable by keyboard, and its group carries an accessible name ("Tile density"). It is a three-way choice, so it is a radio group — not a switch. | Must |
| AC-006 | With the control gone, the dashboard toolbar either disappears entirely or keeps only its "Your dashboard" label — whichever leaves no empty row. See OQ-2. | Must |
| AC-007 | The gear item reads **"Arrange apps"** and sits directly under "Add apps" in reading order. | Must |
| AC-008 | The gear item keeps its existing behaviour exactly: `role="menuitemcheckbox"`, `aria-checked` tracking the mode, trailing ✓ when on, admin-only. Only the label and position change. | Must |
| AC-009 | **Three** places say "Edit dashboard" and all three must be resolved: the menu container's `aria-label` (`AppHeader.tsx:196`), the gear *trigger* button's `aria-label` (`AppHeader.tsx:112`, `data-testid="settings-gear"`), and the item label itself. A screen-reader user currently hears "Edit dashboard" three times for three different things. | Must |
| AC-010 | Nothing else in the gear menu changes — "Add apps" and "Add custom app" keep their labels, testids, order relative to each other, and role gating. | Must |
| AC-011 | The edit-mode banner and its "Done" button (`exit-edit-mode`, SPEC-149) are untouched. | Must |
| AC-012 | Existing users see no change in their *effective* density on upgrade — this is a relocation, not a reset. | Must |
| AC-013 | `data-testid="gear-edit-dashboard"` is **retained** as-is, despite the label change. Renaming it would churn every test that drives edit mode for no user-visible gain; the testid is an internal handle, not copy. | Should |

---

## 5. User Test Cases

### TC-001: Move density and see it apply
**Precondition:** Logged in, grid showing tiles at Compact.
1. Open the avatar menu → **My settings**.
2. Find **Tile density** and choose **Large**.
**Expected:** The grid behind the panel redraws at Large immediately. Closing and
reopening the panel shows Large still selected.

### TC-002: Density is gone from the dashboard
1. Look at the row above the grid.
**Expected:** No density switch. No empty band where it used to be.

### TC-003: Density survives a reload
1. Set List in My settings, reload the page.
**Expected:** The grid paints at List on first paint — no flash of another density.

### TC-004: The gear reads "Arrange apps"
**Precondition:** Logged in as an admin.
1. Open the gear.
**Expected:** "Add apps" then "Arrange apps". No item says "Edit dashboard".

### TC-005: Arrange still arranges
1. Click **Arrange apps**.
**Expected:** Edit mode turns on exactly as before — tiles draggable, pencils
visible, ✓ against the item, banner with **Done** at the top.

### TC-006: Non-admin sees no arrange item
**Precondition:** Logged in as a non-admin.
1. Open the gear.
**Expected:** "Add apps" only. No "Arrange apps".

---

## 6. Out of Scope

- Changing what density *does*, or its three options
- The admin System settings panel
- Moving any other preference
- Changing edit mode's behaviour, drag mechanics, or the pencil
- `DEFAULT_DENSITY` — stays `compact` (but see §8)

---

## 7. Open Questions

**OQ-1 — Kare's §9.** `SPEC-tile-density` OQ-9 placed the switch on the dashboard
"matching the v16 artboard". This spec reverses that placement, so it is a design
decision being overridden by a product one. Caleb's call stands and the build
should not wait on it, but Kare should be told rather than discovering it shipped.

**OQ-2 — what happens to the toolbar row (AC-006).** Removing the switch leaves
`.dashboard-toolbar` holding only "Your dashboard". Two readings:
  - **(a)** Drop the row entirely — the label is redundant with the page itself, and
    the grid gains vertical space. *Recommended.*
  - **(b)** Keep the label as a section heading for the grid.

Either satisfies AC-006. (a) unless Kare or Caleb says otherwise.

**OQ-3 — RESOLVED by Caleb, 2026-09-23: the boundary does not hold.**
"Arrange apps" sits **directly under "Add apps"**, in the My Dashboard section,
with no section header between them — grouped by the task rather than by the
permission. It remains admin-only (AC-008, TC-006): the v12 personal/admin split
still governs who *sees* it, just not where it sits. The recommendation below was
not taken, and is kept for the record.

**OQ-2 — RESOLVED as (a):** the toolbar row is gone entirely.

**OQ-3 original text — where exactly "under Add apps" puts it.** "Add apps" is in the **My
Dashboard** section; "Arrange apps" is admin-only and lives in **Admin editing**.
`v12-settings-boundary-clarity` drew that personal/admin line deliberately, so
moving the item across it would undo a shipped decision. Recommended reading —
keep the section boundary and make "Arrange apps" the **first** item in Admin
editing, so it sits directly under "Add apps" in reading order:

```
My Dashboard
  Add apps
Admin editing
  Arrange apps          ← moved above Add custom app
  Add custom app
```

If the intent was literally adjacent with no section header between them, that
requires either moving an admin action into the personal section or dissolving the
boundary — both bigger changes than this spec, and both should be their own
decision.

---

## 8. Note for the builder — check the density defaults against #476

`DEFAULT_DENSITY` is `compact`, and #476 records that the compact/list densities
`display: none` the long-window uptime line — which made v16.4.0's uptime
preference a no-op for every default user. Density and that preference now sit in
the **same panel, adjacent rows**. A user who sets "Show uptime display" on and
sees nothing change, with the density control right beneath it, is going to read
that as the new setting being broken.

This spec does not fix #476 and should not try to. But whoever builds this should
look at the two rows together and say whether they read coherently — and if they
do not, that is worth reporting before it ships, not after.

---

## 9. Design sign-off (Kare)

*Not authored.* See OQ-1 and OQ-2 — both are placement questions Kare would
normally own.

## 10. Product sign-off (Walt)

*Not authored.* Caleb gave direction directly (§3); recording that here rather
than implying a sign-off nobody gave.

---

## 11. Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-09-23 | 0.1.0 | Claude (Opus 5) | Initial spec from Caleb's direction. §1 corrects the premise the request was made under — the density toggle is on the dashboard toolbar, not in the gear menu. |
