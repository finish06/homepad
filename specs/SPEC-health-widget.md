# Spec: Health as a widget

**Spec ID:** SPEC-health-widget
**Version:** 0.2.0
**Created:** 2026-11-27
**Author:** Claude (Caleb asked 2026-11-27: "The health bar is another widget. How can we migrate the health bar to be like another widget?")
**Status:** Approved — Caleb approved the design and took every recommended answer in §12 on 2026-11-27. Kare's sign-off on the look (§4.5, OQ-3) is still to do.
**Repo:** `Code/homepad` (web app at the root and the API in `api/`)
**Issues:** #745 (health panel grows on load and moves the page). #720 (health panel as a triage surface) is out of scope; §11 says how this spec leaves room for it.
**Target version:** 18.8.0 (minor: additive API, old fields kept until 19.0.0)
**Milestone:** none yet

---

## 1. Overview

Homepad has three things above the apps that tell you about right now: the clock, the weather and the health panel. Today they work in two different ways.

- **Clock and weather** are widgets. An admin turns each on or off for the household in Settings → Widgets. Each person can hide both at once with one switch, "Show widgets", which also hides the numbers on tiles.
- **Health** is not a widget. It always shows for adults. Each person can hide only its counts and meter ("Show status bar"); the verdict line always stays. Kids get no health panel unless their account says otherwise.

They also sit in two places. The glance strip (clock and weather) is a slim row; the health panel is a glass card below it. The strip is a lazy chunk that pops in after a fetch, and the health panel grows when services arrive. Both move the page on load (#745).

This spec makes health the third widget:

1. **One list of widgets: clock, weather, health.** The household admin turns each on or off. Health is on by default, so no install changes on upgrade.
2. **Each person can hide any widget for themselves.** One per-user list of hidden widgets replaces the `showHealthBar` and `showWidgets` switches. Kids keep today's defaults and still can't change them.
3. **Nothing changes on upgrade.** A migration copies every existing choice into the new list. Old API fields keep working until 19.0.0.
4. **One widget area.** Clock, weather and health sit together, share one look, and keep their space while they load. This fixes #745.

The health widget keeps everything the health panel does today: the live verdict, the counts and meter, quick-peek, freshness, STALE with Retry, the not-monitored notice, and the kid rules.

## 2. Checked against the code

Checked at `63011f5` (gitea/main, 2026-11-27).

| Claim | What the code says |
|---|---|
| Clock and weather are household on/off | True. `system_settings.clock_enabled`, `weather_enabled` (migration `0020`, both default off). Admins change them with `PATCH /api/admin/settings` `clockEnabled` / `weatherEnabled` (`widgetSettingsPatch`, `api/internal/api/widgets.go:592-621`). Every signed-in user, kids too, reads them from `GET /api/widgets/info` (`handleWidgetsInfo`, `widgets.go:530-565`, class `catalog-free`). The web app reads that into `WidgetsInfo` (`src/widgets/widgetsInfo.ts:8-27`); the admin form is `src/widgets/WidgetsSettings.tsx` and reads the same endpoint. |
| Only health has a per-user hide | **Half true.** `showHealthBar` (migration `0015`) is per user, but it hides only the counts, meter and legend, not the panel (`showMetrics`, `src/app/StatusBar.tsx:242`). The verdict, LED and freshness stamp always render (`StatusBar.tsx:73-78`, SPEC-health-bar-visibility-toggle AC-003). There is **also** a per-user `showWidgets` (migration `0020`, SPEC-status-widgets AC-031): one switch that hides the clock, the weather **and** the numbers on tiles (`src/widgets/showWidgetsPref.ts`, `ShowWidgetsContext` in `App.tsx:444`). Its row in My settings reads "Numbers on tiles, and the clock and weather." (`src/library/SettingsPanel.tsx:333-352`). |
| `healthBarPref.ts` is a first-paint cache with rollback | True (`src/app/healthBarPref.ts:46-94`). `showWidgetsPref.ts` is the same shape. Both keys are per device, not per user. |
| Kids' health panel is off unless the account says otherwise | True. `App.tsx:488`: `(!isKid \|\| user.showHealthBar === true)`. `insertKid` creates every kid with `show_health_bar = FALSE` (`api/internal/storage/kids.go:114-121`), and a restored kid starts with it false too (`api/internal/transfer/plan.go:957`). A kid's `PATCH /api/me` may only send `themePref` (`api/internal/api/auth.go:282-293`), and no admin route changes a kid's `show_health_bar`, so in practice a kid never sees health. When it does show, `canRetry={!isKid}` drops Retry. |
| Kids ignore `showWidgets` | True. `showStrip = ... && (isKid \|\| showWidgetsPref)` (`App.tsx:252-253`); `ShowWidgetsContext` is `!isKid && showWidgetsPref`, so kids never get tile numbers (the API sends none either, SPEC-status-widgets AC-014). |
| The strip and health are in two places | True. `App.tsx:478-490`: the strip is a lazy `GlanceStrip` in a `ChunkErrorBoundary silent` with `fallback={null}`, then `StatusBar` below it, then the grid. The strip is a slim row with no card (`.glance-strip`, `src/index.css:4276-4283`, min-height 44px); health is a `.health.glass` card (`index.css:455-473`). |
| The page moves on load | True, twice. (1) `showStrip` is false until `/api/widgets/info` answers (`useWidgetsInfo` starts at `null`, `src/widgets/useWidgetsInfo.ts:10-11`), and the strip's chunk loads after that, so it pops in. (2) `StatusBar` renders "Checking services…" with no counts or meter, then grows about 20px (subline) plus about 68px (counts and meter) when services arrive (SPEC-dashboard-empty-loading §8.1). That spec measures adults' layout shift inside the grid only, and names the health fix as a follow-up. |
| A failed info read means "all off" | True for the strip (`fetchWidgetsInfo` returns `null`, `widgetsInfo.ts:50-56`). That rule can't carry over to health as is: health would vanish on one dropped request. §4.4. |
| Backups carry per-user prefs | True. `GET /api/admin/export` writes `prefs: {theme, density, showHealthBar, showUptimeDisplay}` per adult and kid (`api/internal/transfer/backup.go:113-118`, `227-228`), and restore applies them (`plan.go:808-828`). `showWidgets` is **not** in backups today. The v2 schema (`api/docs/schema/homepad-backup-v2.json:105-115`) has `additionalProperties: false` and requires `showHealthBar`. Unknown keys are counted and warned about, not refused (`backup.go:344`, `WarnUnknownFields`). Widget settings (clock, weather) are not in backups. |
| Migrations run once | True. `storage.Migrate` records each file in `schema_migrations` (`api/README.md`, "Migrations"). `0023_iframe_same_origin.up.sql` is the model for a backfill: it runs the `UPDATE` only in the batch that adds the column, so a re-run never undoes a later choice. The next free number is `0026`. |
| CSP and budgets | `style-src 'self'` and one hashed inline script (`nginx-security-headers.conf:21`, checked by `tests/infra/frame-headers.test.ts`). Entry budgets `ENTRY_JS_GZIP_BUDGET = 105_000`, `ENTRY_CSS_GZIP_BUDGET = 20_500` (`tests/infra/bundle-budget.test.ts:147-148`). `StatusBar` is in the entry chunk; `GlanceStrip` and `SettingsPanel` are lazy. |
| The header has its own refresh | True. SPEC-ui-quick-wins AC-004: "Updated Xs ago" in the header is a refresh button for adults (hidden on phones). It does not depend on the health panel. |

## 3. Scope

### In scope

- A household on/off for health, beside clock and weather.
- One per-user list of hidden widgets, replacing `showHealthBar` and `showWidgets` (with compatibility until 19.0.0).
- A migration that copies every existing choice into that list.
- One widget area holding clock, weather and health, with one shared look and reserved space while loading.
- Backups: export the list; import old and new files.

### Not in scope

- **#720** (health as a triage surface: a list of what is down, grouped, with actions). §11 says what this spec must not block.
- Phase 2 tile widgets (Pi-hole, qBittorrent, Proxmox VE), and any new widget.
- Letting kids, or admins on a kid's behalf, change which widgets a kid sees. Kids keep today's rules (§5.3).
- Status toasts, the alert bell, tile status dots and box-header status bars. They do not change, whatever the widget settings (OQ-1, OQ-4).
- Widget settings in backups. Clock and weather aren't backed up today; health's household switch follows them.
- Reordering widgets, or moving them elsewhere on the page.
- Changing the CSP or the bundle budgets.

## 4. Design

### 4.1 The widgets

| Key | What it is | Household switch | Can a person hide it? |
|---|---|---|---|
| `clock` | The clock (today's `Clock` in `GlanceStrip.tsx`) | `clockEnabled` (exists) | Yes (new on its own) |
| `weather` | The weather (today's `Weather`) | `weatherEnabled` (exists) | Yes (new on its own) |
| `health` | The health widget (today's `StatusBar`) | `healthEnabled` (new, default **on**) | Yes (new; OQ-1) |

Two more keys go in the same per-user list. They are parts of something, not widgets, and have no household switch:

| Key | What hiding it does | Replaces |
|---|---|---|
| `healthDetails` | Hides the health widget's counts, meter and legend. The verdict, LED and freshness stay, and the counts move into the subline (today's behaviour). | `showHealthBar: false` for an adult |
| `tiles` | Hides the widget numbers on tiles. | the tile half of `showWidgets: false` (OQ-2) |

A widget shows for a person when **the household has it on and the person has not hidden it**. Hiding never changes what anyone else sees. Turning a household switch off and on again keeps each person's choices.

### 4.2 Data model

Migration `api/migrations/0026_hidden_widgets.up.sql`, written like `0023`:

```sql
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users'
                      AND column_name = 'hidden_widgets') THEN
        ALTER TABLE users ADD COLUMN hidden_widgets TEXT[] NOT NULL DEFAULT '{}';
        -- Adults: carry both old switches over.
        UPDATE users SET hidden_widgets = array_remove(ARRAY[
                 CASE WHEN NOT show_health_bar THEN 'healthDetails' END,
                 CASE WHEN NOT show_widgets    THEN 'clock'   END,
                 CASE WHEN NOT show_widgets    THEN 'weather' END,
                 CASE WHEN NOT show_widgets    THEN 'tiles'   END], NULL)
         WHERE role <> 'kid';
        -- Kids: show_health_bar gated the whole panel; show_widgets was ignored.
        UPDATE users SET hidden_widgets = '{health}'
         WHERE role = 'kid' AND NOT show_health_bar;
    END IF;
END $$;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS health_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

- The column keeps the keys in a fixed order (`clock`, `weather`, `health`, `healthDetails`, `tiles`) and holds no duplicates. The Go side validates against one allowlist, `storage.WidgetKeys`, not a `CHECK`, the same way `0020` validates widget kinds, so a later key needs no migration.
- The mapping differs by role on purpose. For an adult, `show_health_bar = false` meant "verdict only", so it becomes `healthDetails`. For a kid it meant "no panel", so it becomes `health`. A kid's `show_widgets` was never read, so it is not copied.
- `insertKid` creates kids with `hidden_widgets = '{health}'` (and still `show_health_bar = FALSE`). New adults start with `'{}'`.
- **The old columns stay and are kept in step until 19.0.0.** Every write to `hidden_widgets` also writes `show_health_bar` and `show_widgets` from it (§4.3). So rolling back to an 18.7.x image, by digest, shows each person what they chose. 19.0.0 drops both columns.
- The down migration drops `hidden_widgets` and `health_enabled`. The old columns still hold the choices, so nothing is lost.

### 4.3 API contract

**`GET /api/me`** (and every response that returns the user view, `newUserView`, `auth.go:84-89`):

- New: `hiddenWidgets: string[]`, in the fixed key order.
- Kept until 19.0.0, worked out from the list:
  - `showHealthBar`: for an adult, `!("healthDetails" in list)`; for a kid, `!("health" in list)`.
  - `showWidgets`: `false` only when `clock`, `weather` and `tiles` are all in the list; otherwise `true`.

**`PATCH /api/me`:**

- New: `hiddenWidgets: string[]`. It replaces the whole list. Each entry must be a known key; an unknown key, a duplicate, a non-string or more than 16 entries is a 400 and nothing is written. Order in the request doesn't matter.
- Kept until 19.0.0: `showHealthBar` (adult: adds or removes `healthDetails`) and `showWidgets` (adds or removes all of `clock`, `weather`, `tiles`). A response to a request that used either carries `Warning: 299 - "showHealthBar and showWidgets are deprecated; use hiddenWidgets. They go away in 19.0.0."`, the same way the `user` role alias works (SPEC-decisions-18.4.0 #599).
- A body with `hiddenWidgets` and either old field is a 400 ("send hiddenWidgets or the old fields, not both"), so the result is never a guess.
- All fields still go in one `UPDATE` (#665). The store writes `hidden_widgets`, `show_health_bar` and `show_widgets` together.
- Kids: unchanged. A kid's body may hold only `themePref`; `hiddenWidgets` is a 403 like any other key.

**`GET /api/widgets/info`:** gains `health: { enabled: boolean }`. Kids get it too (they need it to know whether health exists).

**`PATCH /api/admin/settings`:** the widget half gains `healthEnabled` (boolean). The `widgets` block of the response gains `healthEnabled`. Admin-only, as today.

**Rollout order.** Web and API images ship from one tag, but promotion is by digest and may not be atomic. A new web app talking to an 18.7 API sees no `hiddenWidgets` and no `health` in info: it falls back to `showHealthBar` / `showWidgets` and treats health as on. An 18.7 web app talking to the new API reads the kept fields and works as today.

### 4.4 Web app state

- **`src/widgets/hiddenWidgetsPref.ts`** (new) replaces `healthBarPref.ts` and `showWidgetsPref.ts`. Same shape as both: the account's `hiddenWidgets` wins on every resolve; `localStorage` key `homepad:hidden-widgets` (`{ v: 1, user: "<id>", hidden: [...] }`) is the first-paint cache, read only when its user matches; a failed `PATCH` rolls back state and cache. With no cache yet, it seeds from the two old keys (`homepad:show-health-bar`, `homepad:show-widgets`) so the first paint after upgrade matches the last one, then removes them.
- **Household cache.** `useWidgetsInfo` writes the three household flags to `homepad:widgets-household` (`{ v: 1, clock, weather, health }`) after each good read, and starts from that cache instead of `null`. With no cache, it starts with clock and weather off and health on, which is today's first paint. A failed read keeps the last good value (today's rule). If the info has no `health` key (older API), health counts as on.
- **Health never depends on the info read alone.** Health shows unless the household flag is known to be `false` (from a good read or the cache). A dropped `/api/widgets/info` never hides it.
- One function, `visibleWidgets(info, hidden, role)`, returns which widgets show. `App.tsx`, the widget area and My settings all use it, so they can't disagree. Kids: `hidden` comes from the account; `tiles` is always hidden for a kid (today's `!isKid` rule).
- These caches are read in React state initializers, not in the inline script in `index.html`, so the CSP script hash does not change.

### 4.5 The widget area

`src/app/WidgetArea.tsx` (new, entry chunk) replaces the strip-then-panel block at `App.tsx:474-490`. It sits in `CONTENT_WIDTH`, above the grid section.

- **Order:** clock, weather, health. Each widget is a slot with the same frame (`.widget`, a glass card using the `.health` tokens) and its own `data-testid` (`widget-clock`, `widget-weather`, `widget-health`).
- **Layout (proposal for Kare, OQ-3):** at 1024px and wider, one row: clock and weather take their content width, health takes the rest. From 721 to 1023px, clock and weather share the first row and health is full width below. At 720px and below, the same, with today's narrow rules (short date, no place, no high/low). With health hidden or off, clock and weather share the row. With only health, it is full width. With nothing on, the area renders nothing and leaves no gap.
- **Clock and weather stay lazy.** `GlanceStrip.tsx` becomes the lazy module that exports the clock and weather bodies. Their slots are in the entry chunk with fixed minimum heights, so the slot is the right size before the chunk arrives. A failed chunk keeps the silent boundary, and the slot collapses only after the failure.
- **Health stays in the entry chunk.** `StatusBar` becomes the health widget's body. It keeps its `data-testid="status-bar"`, `role="status"`, every `health-*` test id, the quick-peek popover and its positioning. `canRetry={!isKid}` stays.
- **Reserved space (#745).** While services load, the health slot has the height of its loaded "operational" state for this person: with details if `healthDetails` is not hidden, without if it is. The "Checking services…" verdict draws inside that height, and the details area is held empty (no spinner, no shimmer). Weather's slot is reserved while its state is `loading`. States that add a row only when there is news (STALE with Retry, not monitored with "Connect a status source", "No services yet") may still grow; that is new information, not a load jump.
- **No second loading state for the grid.** The App Grid's one `loading` predicate (SPEC-dashboard-empty-loading §3.2) and its skeleton don't change. The widget area reserves its own space; it doesn't wait for, or hold, the grid.

### 4.6 Settings

**Admin → Widgets** (`WidgetsSettings.tsx`): a **Health** row first, a switch, on by default, with the help line "The status summary above your apps. Turning it off hides it for everyone." Then Clock, Weather and Web search as today. It saves on change like the other rows.

**My settings → Dashboard** (`SettingsPanel.tsx` `PersonalSettings`): the "Show status bar" and "Show widgets" rows are replaced by a **Widgets** group:

| Row | Switch on means | Test id |
|---|---|---|
| Clock | `clock` not hidden | `setting-widget-clock` |
| Weather | `weather` not hidden | `setting-widget-weather` |
| Health | `health` not hidden | `setting-widget-health` |
| ↳ Counts and meter | `healthDetails` not hidden | `setting-health-bar` (kept, so its tests carry over) |
| Numbers on tiles | `tiles` not hidden (OQ-2) | `setting-widget-tiles` |

- A widget the household has off still has its row, with the switch disabled and the help line "Off for everyone. An admin can turn it on." The person's choice is kept for when it comes back.
- "Counts and meter" is disabled while Health is off for this person or the household.
- Each switch saves the whole list through one `PATCH /api/me {hiddenWidgets}`, optimistic with rollback (today's AC-010 rule).
- Kids have no My settings for widgets, as today.

## 5. User stories

### 5.1 Admin

- **US-1.** As an admin, I turn Health on or off for the household in Settings → Widgets, next to Clock and Weather.
- **US-2.** As an admin, I can hide any widget on my own dashboard without changing anyone else's.

### 5.2 Member (any adult)

- **US-3.** As a member, I hide the clock but keep the weather and health.
- **US-4.** As a member who hid the status bar before the upgrade, I see the same verdict-only health panel after it.
- **US-5.** As a member, I can see that a widget is off for the household, and that it isn't something I turned off.

### 5.3 Kid

- **US-6.** As a parent, my kid's iPad shows the clock and weather the household has on, and no health panel, as today.
- **US-7.** As a kid, nothing about my screen changes on upgrade, and I have no widget settings.

## 6. UI states

| State | What shows |
|---|---|
| **First paint, cache present** | Slots for the widgets the caches say are on, each at its loaded size. Health shows "Checking services…" at its reserved height. |
| **First paint, no cache** (new device) | Health slot only (health on, clock and weather off is the no-cache default). If the household has clock or weather on, they appear once info arrives; this is the one case that may shift, and only once per device. |
| **Loaded** | Each visible widget in its slot. Health shows today's states: operational, attention, STALE (Retry for adults), not monitored (CTA, "Not now"), no services yet. |
| **Personal hide** | The widget is gone for this person only; the others close the gap (§4.5 layout). |
| **Household off** | The widget is gone for everyone. My settings shows its row disabled with "Off for everyone". |
| **All widgets off or hidden** | No widget area at all, no empty card, no gap above the grid. |
| **Health details hidden** | Today's verdict-only health panel: subline carries the counts, freshness on the verdict. |
| **Kid** | Household-on clock and weather; health only if the kid's list doesn't hide it (by default it does); no Retry; no tile numbers. |
| **Info read fails** | Last good household flags stay. Health never disappears because of it. |

## 7. Acceptance criteria

### Data and migration

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | Migration `0026` adds `users.hidden_widgets TEXT[] NOT NULL DEFAULT '{}'` and `system_settings.health_enabled BOOLEAN NOT NULL DEFAULT TRUE`. The backfill runs only in the batch that adds the column, so a re-run never changes a later choice. | Must |
| AC-002 | After `0026`, an adult with `show_health_bar = false` has `healthDetails`; an adult with `show_widgets = false` has `clock`, `weather` and `tiles`; a kid with `show_health_bar = false` has `health`; a kid's `show_widgets` is not copied; everyone else has `{}`. | Must |
| AC-003 | Nobody's dashboard changes on upgrade. For every combination of role × `show_health_bar` × `show_widgets` × household clock/weather on/off, the set of widgets, health details and tile numbers a person sees after `0026` equals what they saw before. | Must |
| AC-004 | A new kid is created with `hidden_widgets = {health}` (and `show_health_bar = false`); a new adult with `{}`. | Must |
| AC-005 | Every write to `hidden_widgets` writes `show_health_bar` and `show_widgets` to match (§4.3 rules) in the same `UPDATE`, until 19.0.0. | Must |

### API

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-006 | `GET /api/me` returns `hiddenWidgets` in the fixed key order, plus `showHealthBar` and `showWidgets` worked out from it (§4.3), for adults and kids. | Must |
| AC-007 | `PATCH /api/me {hiddenWidgets}` replaces the list. An unknown key, a duplicate, a non-string, a non-array or more than 16 entries is a 400 and writes nothing. | Must |
| AC-008 | `PATCH /api/me {showHealthBar}` and `{showWidgets}` still work for adults, change the list as §4.3 says, and the response carries the `Warning: 299` deprecation header. A body with `hiddenWidgets` and an old field is a 400. | Must |
| AC-009 | A kid's `PATCH /api/me` with `hiddenWidgets` (alone or with `themePref`) is a 403 and writes nothing. | Must |
| AC-010 | `GET /api/widgets/info` returns `health.enabled` to every session, kids included. `PATCH /api/admin/settings {healthEnabled}` is admin-only, saves it, and echoes it in `widgets`. A non-boolean is a 400. | Must |
| AC-011 | The route classes don't change; `routes_test.go` still passes with no new route. | Must |

### Backups

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-012 | An export writes `prefs.hiddenWidgets` for every adult and kid, and still writes `prefs.showHealthBar` worked out from it, so an 18.7 server can restore the file (it warns about one unknown field). `schemaVersion` stays 2; `homepad-backup-v2.json` gains `hiddenWidgets` as an optional property, the way `iframeSameOrigin` was added. | Must |
| AC-013 | Restoring a file with `hiddenWidgets` sets the list from it; unknown keys in it are dropped with a warning, not refused. A file without it (every 17.x and 18.0–18.7 file) maps `showHealthBar: false` as `0026` does (adult → `healthDetails`, kid → `health`) and leaves the person's clock, weather and tiles choices alone. | Must |
| AC-014 | A kid created by a restore whose file has neither field gets `{health}`, as today's `ShowHealthBar: false` base. Merge and Replace plans list a change to the list like any other pref change (`samePrefs`). | Must |

### Web app

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-015 | One function, `visibleWidgets(info, hidden, role)`, decides what shows. A widget shows when its household flag is on and the person hasn't hidden it. `App.tsx`, `WidgetArea` and My settings all call it. | Must |
| AC-016 | The account's `hiddenWidgets` wins on every resolve. `homepad:hidden-widgets` is a first-paint cache, read only when its `user` matches. With no new cache, the first paint uses the old `homepad:show-health-bar` / `homepad:show-widgets` keys, then removes them. A storage throw falls back to the defaults without error. | Must |
| AC-017 | A failed `PATCH /api/me` rolls the switch, the widget and the cache back to the stored list, as today's AC-010. | Must |
| AC-018 | `useWidgetsInfo` starts from `homepad:widgets-household` and writes it after each good read. With no cache: clock off, weather off, health on. Info with no `health` key counts as health on. A failed or malformed read never hides health. | Must |
| AC-019 | The health widget keeps all of today's behaviour and test ids: verdict states (loading, empty, operational, attention, STALE, not monitored), the counts and meter with SPEC-v24 banding, quick-peek with Escape and outside-click, the per-second freshness tick, Retry with its notes (#451 rule), "Connect a status source" and "Not now". Today's `StatusBar.test.tsx`, `HealthPanel.test.tsx`, `statusbar-kid.test.tsx` and `v13-live-status.test.tsx` pass with only import or wrapper changes. | Must |
| AC-020 | With `healthDetails` hidden, health is today's verdict-only panel: no chips, meter or legend in the a11y tree, counts in the subline, freshness on the verdict (SPEC-health-bar-visibility-toggle AC-003, AC-004, AC-015, AC-016). | Must |
| AC-021 | Kids: health shows only when the kid's list doesn't hide it, and then without Retry. Tile numbers never show. Clock and weather follow the household. A kid sees no widget settings. | Must |
| AC-022 | Hiding or turning off health does not change status toasts, the alert bell, tile status dots, box-header status bars, the header "Updated" button, or the status poll. | Must |

### Widget area and loading

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-023 | Clock, weather and health render in one `WidgetArea` in that order, each in a `.widget` frame with its own test id, laid out as §4.5 at 390, 800, 1440 and 1920px. With nothing visible the area renders no element. No horizontal scroll at any of those widths. | Must |
| AC-024 | (#745) With the caches matching the loaded state and a fleet that loads "operational" or "attention", the summed `layout-shift` from first paint to loaded is under 0.01 for an admin and a member, with and without `healthDetails` hidden, with clock and weather on and off, at 390, 1440 and 1920px. The window covers the services load, the info read and the clock/weather chunk. | Must |
| AC-025 | While services load, health draws "Checking services…" inside its reserved height. No spinner or shimmer is added anywhere in the widget area. The App Grid's `loading` predicate and skeleton are unchanged. | Must |
| AC-026 | With reduced motion, nothing in the widget area animates. With reduced transparency, the `.widget` frames (health included, which has no such rule today) go near-solid like `.app-grid-box` (`index.css:3163-3172`). jest-axe finds no violations in any §6 state. The clock is still not a live region; health keeps `role="status"`. | Must |

### Settings

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-027 | Admin → Widgets has a Health switch, on by default, that saves `healthEnabled` on change and reloads the widget info, like Clock. | Must |
| AC-028 | My settings has the §4.6 Widgets group. Each switch shows the person's own choice; a household-off widget's switch is disabled with "Off for everyone. An admin can turn it on."; "Counts and meter" is disabled while Health is hidden or off. Each change sends one `PATCH /api/me {hiddenWidgets}`. | Must |
| AC-029 | The old "Show status bar" and "Show widgets" rows are gone. Every switch has a 44×44px target and an accessible name (v19). | Must |

### Gates

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-030 | The entry budgets are not raised and pass (`ENTRY_JS_GZIP_BUDGET = 105_000`, `ENTRY_CSS_GZIP_BUDGET = 20_500`). `GlanceStrip` and `SettingsPanel` stay lazy chunks; health stays in the entry chunk. | Must |
| AC-031 | The CSP is unchanged and `tests/infra/frame-headers.test.ts` passes: no new inline `<script>` or `<style>`, no change to the inline script in `index.html`, no new origin. Health makes no new request. | Must |
| AC-032 | Existing browser-gate and e2e specs stay green with only the test-id and mock updates §9 lists: `health-bar-toggle.spec.ts`, `health-meter-banding-v24.spec.ts`, `status-widgets.spec.ts` (both), `no-widget-leak.spec.ts`, `kid-board-ipad.spec.ts`, `app-grid-skeleton.spec.ts`, `header-search-centered.spec.ts`, `app-grid-fixed-tiles.spec.ts`. | Must |

## 8. Risks

- **The migration runs before anyone can check it.** If the mapping is wrong, people see a different dashboard after upgrade with nothing to tell them. AC-003 tests every combination on a real Postgres, and the old columns stay so a rollback restores each choice.
- **Health could disappear on a bad read.** If health is treated like clock and weather ("null means off"), one dropped request hides the status panel. §4.4 and AC-018 make health default on and only a good read or the cache can turn it off.
- **Removing a safety rule.** SPEC-health-bar-visibility-toggle kept the verdict on for everyone so a display choice could never hide an outage. Letting a person hide health removes that (OQ-1). Toasts, tile dots and box-header bars still report status (AC-022).
- **The look changes.** Moving clock and weather into cards changes how the top of the page looks for every household with them on. That is the approved direction, but it is a visible change; Kare signs off the look (OQ-3).
- **Old clients.** A tab still running 18.7 after the upgrade reads `showHealthBar` / `showWidgets`, which stay correct, and writes them, which still work. The only loss: if it turns `showWidgets` on, it removes all of clock, weather and tiles from the list, even if the person had hidden only one. That lasts until the tab takes the update banner's refresh.
- **Layout shift with no cache.** A new device can't know the household's clock and weather before the first info read, so they may push the page once. Health, the big one, is reserved from the first paint.
- **Bundle budget.** `WidgetArea` and the slot CSS go in the entry. They must fit the existing budgets; the clock and weather bodies stay lazy.

## 9. Test plan

Each AC with code has a test that fails before its change.

| AC | Test | Kind |
|---|---|---|
| AC-001, AC-002, AC-003 | `api/internal/storage/migration_0026_test.go` (new, like `migration_0023_test.go`): seed adults and kids with every `show_health_bar` × `show_widgets` value, run `0026`, check each list; run it again after changing a list and check nothing moves. AC-003's "sees the same" table is checked against `visibleWidgets` in `src/widgets/visibleWidgets.test.ts` with the same rows. | Go, unit |
| AC-004 | `api/internal/storage/kids_test.go`, `adults_test.go`: new kid `{health}`, new adult `{}`. | Go |
| AC-005 | `api/internal/storage/user_prefs_test.go`: each list write leaves `show_health_bar` and `show_widgets` matching. | Go |
| AC-006 to AC-009 | `api/internal/api/hidden_widgets_test.go` (new): GET shape and order, PATCH replace, every 400 case with nothing written, old fields with `Warning: 299`, both together is 400, kid 403. `health_bar_test.go` keeps passing. | Go |
| AC-010 | `api/internal/api/widgets_test.go`: `health.enabled` for admin, member, kid; `healthEnabled` save and echo; member 403; non-boolean 400. | Go |
| AC-011 | `api/internal/api/routes_test.go` unchanged. | Go |
| AC-012 to AC-014 | `api/internal/transfer/backup_test.go`, `plan_restore_test.go`, `schema_v2_test.go`: export carries both fields and validates against v2; v1 and v2 fixtures without `hiddenWidgets` restore with the AC-013 mapping; unknown key warns; new kid gets `{health}`; a list change shows in the plan. | Go |
| AC-015 | `src/widgets/visibleWidgets.test.ts` (new): every household × hidden × role case. | Unit |
| AC-016, AC-017 | `src/widgets/hiddenWidgetsPref.test.ts` (new, replacing `healthBarPref.test.ts` and `showWidgetsPref.test.ts`): server wins, user-matched cache, seeding from the old keys then removing them, storage throws, rollback on false and on throw, no double PATCH under StrictMode. | Unit |
| AC-018 | `src/widgets/widgetsInfo.test.ts`: household cache read and write, no-cache defaults, missing `health`, failed read keeps health. | Unit |
| AC-019, AC-020 | Existing `src/app/StatusBar.test.tsx`, `HealthPanel.test.tsx`, `v13-live-status.test.tsx` run against the health widget. | Unit |
| AC-021 | `src/app/statusbar-kid.test.tsx`; `tests/browser-gate/kid-board-ipad.spec.ts`; `tests/e2e/no-widget-leak.spec.ts`. | Unit, gate, e2e |
| AC-022 | `src/app/WidgetArea.test.tsx` (new): with health hidden and off, `ToastContainer`, the bell and the header Updated button still render, and the services poll still runs. | Unit |
| AC-023 | `src/app/WidgetArea.test.tsx`: order, frames, test ids, nothing rendered when all off. `tests/browser-gate/widget-area.spec.ts` (new): layout at 390, 800, 1440, 1920; no horizontal scroll. | Unit, gate |
| AC-024, AC-025 | `tests/browser-gate/widget-area.spec.ts`: hold `/api/services` and `/api/widgets/info`, observe `layout-shift`, release, sum under 0.01 per the AC-024 matrix. `app-grid-skeleton.spec.ts`: the adult cases move from "inside the grid section" to the page-level sum (closing SPEC-dashboard-empty-loading §8.1). | Gate |
| AC-026 | `src/app/WidgetArea.test.tsx` jest-axe per §6 state; `widget-area.spec.ts` with `reducedMotion: 'reduce'` and reduced transparency. | Unit, gate |
| AC-027 | `src/widgets/WidgetsSettings.test.tsx`: Health switch default on, saves `healthEnabled`, calls `onChanged`. | Unit |
| AC-028, AC-029 | `src/library/SettingsPanel.test.tsx` and the personal-settings tests: rows, disabled household-off rows, disabled details row, one PATCH per change, 44px targets. `tests/browser-gate/health-bar-toggle.spec.ts` updated for the new group. | Unit, gate |
| AC-030 | `tests/infra/bundle-budget.test.ts` unchanged. | Unit (dist) |
| AC-031 | `tests/infra/frame-headers.test.ts` unchanged. | Unit (infra) |
| AC-032 | The named specs, with mocks updated in `tests/browser-gate/widgetMocks.ts`, `kidMocks.ts`, `householdMocks.ts`, `transferMocks.ts` to serve `hiddenWidgets` and `health`. | Gate, e2e |
| — | e2e: `tests/e2e/status-widgets.spec.ts` gains one journey: admin turns Health off → member's dashboard loses it → admin turns it on → member who hid Clock still has no clock. | e2e |

Gates: `npm run lint`, `npm run build`, `npx vitest run`, `npm run test:gate`, `npm run test:e2e`; from `api/`: `go vet ./...`, `make test-db`.

## 10. File plan

| File | Change |
|---|---|
| `api/migrations/0026_hidden_widgets.up.sql`, `.down.sql` | New (§4.2). |
| `api/internal/storage/storage.go` | `User.HiddenWidgets`; `userColumns` and `scanUser`; `UserPrefs.HiddenWidgets`; `SetUserPrefs` writes the list and both old columns; `WidgetKeys` allowlist and the old-field mapping helpers. |
| `api/internal/storage/kids.go` | `insertKid` sets `{health}`. |
| `api/internal/storage/widgets.go` | `WidgetSettings.HealthEnabled`; read and save it. |
| `api/internal/storage/transfer.go` | `TransferPerson` / `TransferPersonRow` carry the list; `set person` writes it. |
| `api/internal/api/auth.go` | User view `hiddenWidgets` plus the worked-out old fields; `handlePatchMe` validation, old-field mapping, `Warning: 299`. |
| `api/internal/api/widgets.go` | `health` in info; `healthEnabled` in the settings patch and view. |
| `api/internal/transfer/backup.go`, `plan.go` | `Prefs.HiddenWidgets`; export both; restore mapping; `prefsShape`; `samePrefs`. |
| `api/docs/schema/homepad-backup-v2.json` | Optional `hiddenWidgets` in `prefs`. |
| `api/README.md` | `/api/me`, `/api/widgets/info`, settings lines. |
| `src/api.ts` | `User.hiddenWidgets`; `showHealthBar` / `showWidgets` marked deprecated; `setHealthBarPref` removed. |
| `src/widgets/widgetsInfo.ts` | `WidgetsInfo.health`; `saveHiddenWidgets`; `saveShowWidgets` removed. |
| `src/widgets/useWidgetsInfo.ts` | Household cache. |
| `src/widgets/visibleWidgets.ts`, `hiddenWidgetsPref.ts` | New. |
| `src/app/healthBarPref.ts`, `src/widgets/showWidgetsPref.ts` | Removed (with their tests, replaced by §9's). |
| `src/widgets/context.ts` | `ShowWidgetsContext` reads `!hidden.includes('tiles')` for adults, `false` for kids. |
| `src/app/WidgetArea.tsx` | New, entry chunk. |
| `src/app/GlanceStrip.tsx` | Exports clock and weather bodies for the slots. |
| `src/app/StatusBar.tsx` | Becomes the health widget body; `showHealthBar` prop becomes `showDetails`; reserved-height loading. |
| `src/app/App.tsx` | `WidgetArea` replaces the strip and `StatusBar` block; one pref hook; new SettingsPanel props. |
| `src/library/SettingsPanel.tsx` | Widgets group replaces two rows. |
| `src/widgets/WidgetsSettings.tsx` | Health row. |
| `src/index.css` | `.widget-area`, `.widget` frame, slot min-heights per breakpoint; `.glance-strip` rules folded in. |
| `CHANGELOG.md`, `docs/` | At build time, not in this spec PR. |

## 11. Room for #720

#720 wants the health panel to become a place to triage: what is down, grouped, with actions. This spec keeps that open:

- Health stays its own component in the entry chunk, with its data from `ServicesContext`, not from `/api/widgets/info`.
- The `.widget` frame sets a minimum height only, never a maximum, so health can grow or expand.
- The quick-peek popover and its focus rules are kept as they are, so #720 can replace or extend them.
- The hidden list is a list of strings, so a later part (for example a triage list) can get its own key without a migration.

## 12. Open questions

All four answered: Caleb took every recommended answer on 2026-11-27 ("Yep. Go").

| # | Question | Answer (decided 2026-11-27) |
|---|---|---|
| OQ-1 | May a person hide Health completely? Today an adult can hide only its counts and meter, so a display choice can never hide an outage. | **Yes.** Caleb's "hide any widget" includes it. Status still reaches them through tile dots, box-header status bars, toasts and the alert bell, none of which change (AC-022). The "Counts and meter" switch stays for people who want the short version. |
| OQ-2 | The old "Show widgets" switch also hid the numbers on tiles. Do tile numbers become a fifth switch in the same list, so `showWidgets` can retire too? | **Yes,** as "Numbers on tiles" (`tiles`). Otherwise `showWidgets` has to stay just for tiles, and people who turned it off would need two switches to say what one said before. |
| OQ-3 | What is the shared look? Clock and weather are a slim row with no card today; health is a glass card. | **Give clock and weather the same card as health,** one row on wide screens (§4.5), Kare to sign off the look. Health needs a card for its counts, meter and notices, so it is the one to match. |
| OQ-4 | When an admin turns Health off for the household, do status toasts stop too? | **No.** Toasts are alerts, not a widget. Health off removes the panel only. A separate switch for toasts, if wanted, is its own spec. |

## 13. Sign-offs

| Role | Who | Status |
|------|-----|--------|
| Product | Caleb | Approved 2026-11-27 — took all §12 answers |
| Design | Kare | Pending — §4.5 layout and the `.widget` frame (OQ-3) |
| Implementation | — | Ready; §4.5 look waits on Kare |

## 14. Revision history

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2026-11-27 | 0.1.0 | Claude | First draft from Caleb's direction of 2026-11-27. |
| 2026-11-27 | 0.2.0 | Claude | Approved: Caleb took all four §12 answers. |
