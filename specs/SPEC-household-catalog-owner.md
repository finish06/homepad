# Spec: The catalog belongs to the household

**Spec ID:** SPEC-household-catalog-owner
**Version:** 0.1.2
**Created:** 2026-11-19
**Author:** Claude (spec step for Caleb's 18.0.0 theme, "a household you can manage")
**Status:** Approved — Caleb, 2026-11-20: every §0 question decided.
**Repo:** `Code/homepad-api` (migration, storage, handlers) + `Code/homepad` (CHANGELOG, docs; no UI change)
**Estimate:** ~3 days (migration runner, migration 0021, storage and handler rewrite off the owner id, transfer, tests, upgrade rehearsal on a copy of a real database)
**Depends on:** SPEC-household-basics (17.1.0: shared catalog writes, account lock), SPEC-backup-import, SPEC-status-widgets. All three are merged on `homepad-api` `gitea/main`; the web halves (#565, #566, #568) are not on `homepad` main yet.
**Target version:** 18.0.0 (major: a one-way database migration, see §10)
**UX:** not needed (no UI change)
**Blocks:** SPEC-household-manage-adults (an adult can't be removed safely until this ships)

---

## 0. Open questions — decisions for Caleb

All questions are decided.

**Decided (Caleb, 2026-11-19):** the 18.0.0 theme is household management. This spec is its breaking change.

**Decided — Q2, the rows nobody can see (Caleb, 2026-11-19: "yes").** [AC-005, AC-006] Catalog rows owned by anyone other than the first admin (per-user copies from the v9 era and #87 leftovers) are copied into a `catalog_archive` table (JSON snapshot, with the former owner's id and email), then deleted. Nothing reads the archive. The release notes say how to look at it with `psql`. A later major release drops it.

**Decided — Q3, making a one-way migration run once (Caleb, 2026-11-19: "yes").** [AC-007, AC-008] The runner (`storage.Migrate`) gains a `schema_migrations` table. A file runs once and is recorded. The first 18.0.0 boot re-runs 0001–0020 one last time (they are idempotent, as today), runs 0021, and records all of them. Without it, re-running `0007_per_user_dashboards` after 0021 would add `user_id` back and hand the catalog to the first admin again (§1a).

**Decided — Q1, drop the owner column (Caleb, 2026-11-20): A.** [§6, AC-001…AC-004] `services.user_id` and `categories.user_id` are dropped. Slugs and section names become unique across the table.

**Decided — Q4, catalog rows and no admin (Caleb, 2026-11-20): A.** [AC-009] 0021 stops the boot with a clear message: make one account an admin, then restart.

**Decided — Q5, backup `schemaVersion` (Caleb, 2026-11-20): B, bump to 2.** [AC-012] 18.0.0 exports write `schemaVersion: 2`. The keys are the same as v1. The API gains a 1→2 upgrader that changes nothing but the number, so 17.1.0 files still restore (SPEC-backup-import AC-017). A 17.1.0 server rejects a v2 file with the "newer Homepad" message (SPEC-backup-import AC-016), and the release notes say so.

---

## 1. Overview

The catalog (sections, apps, their icons and widgets) is stored as rows owned by one user, the first admin. Every reader resolves that user and reads their rows. If that user is deleted, Postgres deletes the catalog with them. If that user stops being an admin, a different admin becomes "the owner", and a different, mostly empty set of rows becomes the catalog.

This spec makes the catalog belong to the install. No user owns it. That is what lets SPEC-household-manage-adults remove an adult or change a role safely.

### 1a. What exists today (checked in the code, `homepad-api` `gitea/main` at `79e3b03`, `homepad` `gitea/main` at `6eb8a35`)

- **The cascade is real.** `migrations/0007_per_user_dashboards.up.sql` adds `services.user_id` and `categories.user_id` as `REFERENCES users(id) ON DELETE CASCADE`, then makes both `NOT NULL`. Deleting the owner deletes every app and section. `service_icons`, `service_widgets` (0020), `favorites`, `user_layout`, `user_collapsed_categories` and `kid_allowed_services` all cascade from `services` or `categories`, so they go too.
- **The owner is computed, not stored.** `SharedCatalogOwnerID` (`internal/storage/storage.go`) is `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at, id LIMIT 1`. The same query is inlined as `sharedOwnerSQL` in `internal/storage/kids.go` and as a CTE in `NonOwnerAdminCatalogRows` (`internal/storage/accounts.go`). If the first admin were demoted, the owner would silently become the next admin, whose rows are the #87 leftovers. No route changes a role today, so this can't happen yet.
- **Every catalog path takes the owner id.** Reads: `handleListServices`, `handleListCategories`, the collapse read, `handleListLibrary` (the `added` hint), `catalogOwner` in `icons.go`. Writes: `requireCatalogAdmin` (`internal/api/library.go`) returns the owner for every `classCatalogWrite` route. Transfer: `handleExport` and `restore` (`internal/api/transfer.go`) pass the owner to `LoadTransferState` and `TransferTx.DeleteCatalog`/`CreateApp`/`CreateSection`. Widgets: `widgetService` (`internal/api/widgets.go`) checks the service against the owner. In storage, 41 SQL sites filter on a `user_id` (`internal/storage/*.go`, not counting tests).
- **No admin means no catalog.** `catalogOwner` answers 404 "no catalog yet" when there is no admin; `handleListLibrary` uses an empty owner.
- **Invisible rows are counted, then left alone.** At startup, `main.go` logs `NonOwnerAdminCatalogRows` (SPEC-household-basics AC-026). Rows of plain users from the v9 per-user era are not counted, and nothing reads them.
- **The runner re-runs everything.** `Store.Migrate` (`internal/storage/storage.go`) runs every embedded `*.up.sql` in lexical order, in one transaction, on every boot, and keeps no version table. 0007 is written to be re-run: `ADD COLUMN IF NOT EXISTS user_id`, `UPDATE … SET user_id = <first admin> WHERE user_id IS NULL`, `SET NOT NULL`, then `CREATE UNIQUE INDEX IF NOT EXISTS services_user_slug_key ON services (user_id, slug)`. After a migration that drops `user_id`, the next boot would bring it back.
- **The backup file has no owner.** `transfer.BuildFile` (`internal/transfer/backup.go`) copies an explicit allow-list of fields. It holds no database ids: apps are referenced by slug, sections by name, adults by email, kids by name. `SchemaVersion = 1`, and the `upgraders` map is empty.
- **Widgets don't depend on the owner directly.** `service_widgets` is keyed by `service_id`. The widget manager loads every enabled widget joined to `services` with no owner filter (`internal/storage/widgets.go`). The clock, weather and search settings sit on the `system_settings` singleton. `users.show_widgets` is per user.
- **Per-user data never pointed at the owner.** `favorites`, `user_layout`, `user_collapsed_categories` and `kid_allowed_services` are keyed by the viewer's own id plus a service or category id. `SetKidServices` validates ids against the owner's rows (`sharedOwnerSQL`).

### 1b. Decisions

- Caleb, 2026-11-19: 18.0.0 is "a household you can manage", and this is its breaking change.
- Caleb, 2026-11-19: archive the hidden rows into `catalog_archive`, then delete them (Q2, "yes").
- Caleb, 2026-11-19: add the `schema_migrations` table (Q3, "yes").
- Caleb, 2026-11-20: Q1 A (drop the owner columns), Q4 A (stop the boot), Q5 B (backups move to `schemaVersion` 2).

---

## 2. Model

### 2.1 One catalog per install

- Sections and apps have no owner. Every adult reads the same catalog, and every admin writes it, as today.
- A catalog can exist with no accounts at all. On a fresh install it is empty until an admin adds apps, as today.
- Per-user things stay per user: favorites, app order, folded sections, appearance prefs, the widgets switch. A kid's allow-list stays per kid.

### 2.2 What maps where

| Data | Today | After 0021 |
|---|---|---|
| Sections (`categories`) | `user_id` = first admin | No owner column. Name unique across the table. |
| Apps (`services`) | `user_id` = first admin | No owner column. Slug unique across the table. |
| Uploaded icons (`service_icons`) | By `service_id` | Unchanged. |
| Widget config (`service_widgets`) | By `service_id` | Unchanged. |
| Clock, weather, search (`system_settings`) | Singleton | Unchanged. |
| Favorites, app order, folded sections | By viewer id + service/category id | Unchanged. |
| Kid allow-list (`kid_allowed_services`) | By kid id + service id, validated against the owner | Unchanged rows. Validated against the catalog. |
| Appearance prefs, `show_widgets` | Columns on `users` | Unchanged. |
| App Library (`library_apps`) | Already has no owner | Unchanged. The `added` hint checks the catalog. |
| Rows owned by anyone but the first admin | Kept, never read | Archived, then deleted (Q2, decided). |
| Backup file | No ids, `schemaVersion` 1 | Same keys, `schemaVersion` 2 (Q5, decided). |

### 2.3 Backup and import

- **Export** writes `schemaVersion: 2` with the same keys as 17.1.0. No field is added or removed by this spec. A 1→2 upgrader changes only the number (Q5).
- **Restore of a file made by 17.1.0** works unchanged: it never named an owner. Merge matches sections by name and apps by slug, as before. Replace deletes the whole catalog instead of "the owner's rows".
- **Restore of an 18.0.0 file on 17.1.0** is refused with the "newer Homepad" message (SPEC-backup-import AC-016), because the file says `schemaVersion: 2` (Q5).
- **Homepage import** writes into the catalog, as before.
- The `upgraders` map gains 1→2, which changes only the number. AC-017 of SPEC-backup-import (every released schema restores in CI) keeps its v1 fixture and adds a v2 one.

### 2.4 Code that goes away

`SharedCatalogOwnerID`, `sharedOwnerSQL`, `catalogOwner`, `NonOwnerAdminCatalogRows` and its startup log line. `requireCatalogAdmin` becomes a plain admin check. Storage methods drop their `userID`/`ownerID` catalog parameter. `classCatalogWrite` stays, and so does the second-admin suite (`second_admin_test.go`). It now guards against a regression instead of a known bug.

---

## 3. Security notes

- **No privilege change.** Who can read and write the catalog is unchanged: every signed-in adult reads it, kids read their allow-list, admins write it. The route classes in `server.go` don't change.
- **The archive holds old app URLs and names.** It is reachable only with database access. It holds no password hashes, tokens or widget keys: the snapshot is `to_jsonb` of `services` and `categories` rows only, and widget rows are not copied (their keys are encrypted with `HOMEPAD_SECRET_KEY`, and they can't exist on non-owner rows anyway, because `widgetService` checks the owner).
- **Kid filtering is unchanged.** `VisibleServiceIDs` reads only `kid_allowed_services`. The leak test from SPEC-kid-accounts keeps passing unmodified.
- **The migration runs under the existing migrate advisory lock**, so two API replicas booting together can't both run it.

---

## 4. Acceptance Criteria

### Schema

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | After 0021, `services` and `categories` have no `user_id` column and no foreign key to `users`. Deleting any user row deletes no app, section, icon or widget. | Must |
| AC-002 | `services.slug` is unique across the table, and `categories.name` is unique across the table. | Must |
| AC-003 | Every catalog read and write works with no admin account present (tested by deleting the admin row directly in a test database). `GET /api/services` for a signed-in member returns the catalog. | Must |
| AC-004 | No Go code outside `migrations/` refers to a catalog owner: `SharedCatalogOwnerID`, `sharedOwnerSQL` and `catalogOwner` are gone, and a test greps `internal/` for `user_id` on `services` and `categories` queries. | Must |

### Migration

| ID | Criterion | Priority |
|---|---|---|
| AC-005 | Rows owned by anyone other than the first admin are copied to `catalog_archive` (Q2, decided) with their former owner's id and email, then deleted. Their icons, favorites, order rows and collapse rows go with them. The API logs one line with the counts. | Must |
| AC-006 | The first admin's rows survive with the same ids. Every favorite, order row, folded section and kid allow-list entry that pointed at them still does. A fixture database taken from 17.1.0 proves it: per-user counts before and after match, excluding archived rows. | Must |
| AC-007 | The runner records each migration in `schema_migrations` and runs it only once (Q3, decided). The first 18.0.0 boot on a 17.1.0 database runs 0001–0021 and records all of them. A second boot runs none. | Must |
| AC-008 | After two boots, `services` still has no `user_id` column (the 0007 re-run trap, §1a). | Must |
| AC-009 | A database with catalog rows and no admin stops at boot with: "migration 0021: the catalog has apps but no admin account exists. Make one account an admin, then restart." Nothing is changed (Q4). | Must |
| AC-010 | A fresh, empty database migrates cleanly and ends in the same schema as an upgraded one (a schema-diff test comparing `information_schema` columns, `pg_indexes` and `pg_constraint`). | Must |

### Behavior

| ID | Criterion | Priority |
|---|---|---|
| AC-011 | Every existing API test passes, apart from tests that asserted owner behavior, which are rewritten to assert the household behavior. The second-admin suite passes unmodified. | Must |
| AC-012 | Export writes `schemaVersion: 2` with the same keys as 17.1.0 (Q5). A 17.1.0 (v1) export restores on 18.0.0 in both modes, through the 1→2 upgrader, with the same plan it would get on 17.1.0. A v1 fixture stays in the CI restore test. | Must |
| AC-013 | Replace mode deletes every app and section and the App Library, then loads the file, as before. | Must |
| AC-014 | The `added` hint in `GET /api/library` is true when any app has that offer as `source_library_id`. | Must |
| AC-015 | `PUT /api/admin/kids/{id}/services` accepts any catalog app id and rejects any other id with 400, as before. | Must |
| AC-016 | The CHANGELOG entry says the migration is one way, tells admins to take a database dump first, and gives the `psql` line to look at the archive (§10). | Must |

---

## 5. User Test Cases

**TC-001 — Upgrade a real household.** *Precondition:* a copy of a 17.1.0 database with two admins, a member, two kids, favorites, a folded section, two widgets and uploaded icons. Run 18.0.0 against it.
*Expected:* every account's dashboard looks the same as before, tile for tile. The kids see the same apps. Widgets still update. The log has one archive line.

**TC-002 — Delete the first admin (database only).** On the TC-001 copy, delete the first admin's `users` row by hand. *Expected:* the catalog is untouched; the other admin and the member see every app.

**TC-003 — Restart twice.** Restart the API twice after TC-001. *Expected:* no new log lines from 0021; `\d services` shows no `user_id`.

**TC-004 — Old backup.** Restore a backup made on 17.1.0, in Merge and then in Replace. *Expected:* both previews and results match what 17.1.0 produces for the same file.

**TC-005 — Fresh install.** Empty database. *Expected:* boots, setup screen, the admin adds apps from the Library, all as on 17.1.0.

**TC-006 — The guard.** On a copy, set every admin to `user` by hand and boot. *Expected:* the API stops with the AC-009 message and the database is unchanged.

---

## 6. Data Model and Migration

### 6.1 Runner (Q3, decided)

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    name        TEXT        PRIMARY KEY,   -- e.g. '0021_household_catalog.up.sql'
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`Store.Migrate` creates this table first, inside the same transaction and advisory lock it already uses. For each file in lexical order it skips names already recorded, runs the rest, and records each one. Existing files keep their `IF NOT EXISTS` style, so a database from before the table existed just re-runs them once.

### 6.2 Migration `0021_household_catalog`

One way. In order, in the migrate transaction:

1. Find the owner: `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at, id LIMIT 1` (the same rule as today).
2. If there is no owner and `services` or `categories` has rows, `RAISE EXCEPTION` with the AC-009 text (Q4).
3. Create the archive:
   ```sql
   CREATE TABLE IF NOT EXISTS catalog_archive (
       id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
       kind                TEXT        NOT NULL CHECK (kind IN ('service', 'category')),
       former_owner_id     UUID,       -- no FK: the user may be deleted later
       former_owner_email  TEXT,
       row                 JSONB       NOT NULL,
       archived_at         TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
4. Copy every `services` and `categories` row whose `user_id` isn't the owner into `catalog_archive` (`to_jsonb(row)`, plus the owner's email from `users`). Then delete those rows. The FK cascades remove their icons, widgets, favorites, order, collapse and allow-list rows. None of these were visible.
5. Drop `services_user_slug_key`, `services_by_user_idx`, `categories_user_name_key`, `categories_by_user_idx`.
6. `ALTER TABLE services DROP COLUMN user_id; ALTER TABLE categories DROP COLUMN user_id;` (this drops the FKs).
7. `CREATE UNIQUE INDEX services_slug_unique ON services (slug); CREATE UNIQUE INDEX categories_name_unique ON categories (name); CREATE INDEX categories_sort_idx ON categories (sort_index);`. The new names don't collide with the `services_slug_key` / `categories_name_key` constraints that 0001 and 0004 create and 0007 drops.

Step 7 can't fail on duplicates: after step 4 only the owner's rows remain, and they were already unique per owner.

Step 4's counts are written with `RAISE NOTICE`; the Go side also logs `catalog: archived <n> services and <m> sections that no dashboard showed (catalog_archive)` once, after the migration, when `catalog_archive` has rows newer than the boot.

### 6.3 Down migration

There isn't a working one. `0021_household_catalog.down.sql` contains only a comment saying so and pointing at the CHANGELOG. To go back, restore the database dump taken before the upgrade.

---

## 7. API Contract

No route is added or removed. No request or response body changes.

| Route | Change |
|---|---|
| Every catalog read | Reads the catalog, not an owner's rows. With no admin present, answers the catalog instead of 404 "no catalog yet". |
| Every `classCatalogWrite` route | Admin check only; no owner lookup. Status codes unchanged. |
| `GET /api/library` | `added` checks the catalog (AC-014). |
| `GET /api/admin/export`, restore, import | No owner lookup. File format unchanged (AC-012). |
| Widget admin routes | Check the service exists in the catalog. |

---

## 8. Frontend Implementation

None. The web app never saw the owner id.

## 9. Design (Kare)

Not needed: nothing on screen changes. Kare signs off on the CHANGELOG wording only.

---

## 10. Upgrade and Compatibility

| Install | What happens on 18.0.0 |
|---|---|
| One admin (most installs) | Nothing visible. The log may show an archive line for v9-era copies. |
| Two or more admins | Nothing visible. #87 leftovers are archived. |
| A copy of a 17.1.0 database with catalog rows and no admin | Boot stops with the AC-009 message. |
| Fresh install | Same as 17.1.0. |
| Going back to 17.x after 18.0.0 | Not supported. Restore the dump taken before the upgrade. |

Release-note lines (plain copy, for the CHANGELOG):

- "The app list now belongs to the household. Every admin edits the same list, and it stays when an account is removed. This is why the version is 18.0.0."
- "The upgrade changes the database in a way that can't be undone. Take a backup of the database before you upgrade."
- "Some old, hidden copies of apps are moved out of the way. Nobody could see them. To look at them: `docker compose exec postgres psql -U homepad -c "select kind, former_owner_email, row->>'name' from catalog_archive"`."
- "You can't go back to 17.x after this upgrade. To go back, restore the database backup."

## 11. Out of Scope

- Removing an adult and changing roles (SPEC-household-manage-adults).
- More than one household per install (PRD §4).
- A UI for the archive, or restoring archived rows.
- Changing the backup file format.
- Removing `catalog_archive` (a later major).

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Approved 2026-11-20: all §0 questions decided |
| Product | Walt | Pending |
| Design | Kare | Pending (CHANGELOG wording only; no UX artifact) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-19 | 0.1.0 | Draft for 18.0.0, checked against `homepad-api` `79e3b03` and `homepad` `6eb8a35`. |
| 2026-11-19 | 0.1.1 | Caleb decided Q2 and Q3 ("yes"). |
| 2026-11-20 | 0.1.2 | Caleb decided Q1, Q4 (defaults) and Q5 (B, `schemaVersion` 2). §2.3 follows Q5. AC-010 names the real schema comparison. Release-note copy and the `psql` quoting fixed, from the build (homepad-api #101). |
