# Implementation Plan: Backup, restore, and import from Homepage

**Spec:** [`specs/SPEC-backup-import.md`](../../specs/SPEC-backup-import.md) v0.1.0 (APPROVED 2026-11-07, all recommended defaults: OQ-1 c, OQ-2 a, OQ-3 a, OQ-4 b, OQ-5 c, OQ-6 a, OQ-7 a, OQ-8 a, OQ-9 b)
**UX:** [`specs/ux/backup-import-ux.md`](../../specs/ux/backup-import-ux.md) (APPROVED 2026-11-07, B-1…B-3 as proposed)
**Spec PR:** #557 (`spec/backup-import`, head 2dd07af). Both files land on `main` with that PR.
**Created:** 2026-11-07
**Team:** Solo + agent team (two agents: one on homepad-api, one on the frontend; file ownership doesn't overlap)
**Estimated effort:** ~34h of task time across two repos, about 4–5 working days
**Target:** next free minor after 17.0.0 (17.1.0 unless a sibling spec ships first). The version bump is a release task, not part of these PRs.
**Maturity:** GA — all gates blocking, strict TDD, 90% coverage on `src`

---

## Overview

Three admin actions in a new last section of the Admin Panel, **Backup and import**:

1. **Back up:** `GET /api/admin/export` returns one pretty-printed JSON file.
2. **Restore:** upload that file, preview the plan, then apply it (Merge, or Replace behind a typed `REPLACE`).
3. **Import from Homepage:** paste or upload `services.yaml` (plus optional `bookmarks.yaml` and `settings.yaml`), preview, then import.

Restore and import share one engine in the API: a pure `Plan(snapshot, input)` function used by both preview and apply, a `planHash` over the plan's canonical JSON, and an apply that re-plans inside one transaction under an advisory lock and refuses with 409 when the hash moved.

No migration. Everything maps onto existing tables (spec §7). Migration numbers 0019 and 0020 are reserved by sibling builds; if this build finds it needs one, it stops and reports instead.

## Findings from reading the code (2026-11-07, homepad-api `gitea/main` at `32f3200`, homepad `gitea/main` at `9c7ce48`)

- **Catalog writes must go through the owner.** `storage.SharedCatalogOwnerID` is the first admin. Every existing write path passes the acting admin's id (`Code/homepad-api#87`, being fixed by SPEC-household-basics in parallel). This build doesn't touch those paths: its own storage code takes the owner id explicitly, so AC-025 holds whatever #87's fix looks like.
- **The API doesn't know its own version.** Nothing in `cmd/` or `internal/` reads one. `homepadVersion` in the backup comes from a new `api.Version` string, set with `-ldflags -X` (the Dockerfile gets an `ARG VERSION=dev`). Nothing reads it back, per spec §2.3.
- **The Gatus snapshot is in memory.** `poller.Snapshot().Statuses` is keyed by Gatus key, so the §4.3 "does Gatus know this key" check is a map lookup, with no outbound call.
- **`gopkg.in/yaml.v3` is already in `go.sum`** (indirect via testify). Using it directly moves it to a direct requirement; no new module.
- **There is no JSON Schema library.** The AC-001 "matches the schema" test uses a small validator for the subset of JSON Schema the v1 schema uses (type, properties, required, additionalProperties, items, enum, pattern, minimum/maximum, `$ref` to `$defs`). That keeps `go.mod` free of a test-only dependency.
- **The schema file lives in homepad-api** at `docs/schema/homepad-backup-v1.json`, next to the test that checks exports against it. The web docs link to it.
- **Errors from the five new routes are JSON** (`{code, message, …}`), not plain text. The UI owns the words (spec §8 already says this for reasons and warnings), and a 409 has to carry the fresh plan (UX §3.4: "The new plan is already loaded"). 401 and 403 stay plain text from the shared `requireAdmin`.
- **Kid probes in `routes_test.go`** send no body. `requireAdmin` runs before any body read, so the five new routes 403 for a kid and a user, and 401 when signed out.
- **Homepage's default weight** is `(services already in the group + 1) × 100` (`src/utils/config/service-helpers.js`), so a stable sort by weight keeps file order for unweighted entries, as the spec says.
- **`settings.yaml` `layout`** is a map in Homepage (`Object.keys(layout)`); the list form also exists in the wild. The parser accepts both.
- **Entry CSS is at ~19.43 / 20.5 kB gzip**, and the widgets build will also add some. The Backup and import UI lives in a lazy chunk loaded with the Admin Panel, with its own CSS file and its own class names, so Tailwind's scan of `src/` adds nothing to the entry stylesheet. The bundle-budget test gets the new chunk in `LAZY_CHUNKS`.
- **The compose install caps uploads at 1 MB** (nginx default). `client_max_body_size 16m` goes on `/api/` in `compose.yaml`'s `nginx-config` and in `deploy/compose/nginx.conf` (AC-027). The production ingress limit lives in `Code/homelab` and has to be checked before release (leftover, not this build).

## API contract (fixed here so the two agents can work in parallel)

Routes (all `admin-only`; `requireNotKid` in front, `requireAdmin` in the handler):

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/admin/export?people=true\|false` | — | `200` the backup file; `Content-Disposition: attachment; filename="homepad-backup-YYYY-MM-DD.json"`; `Cache-Control: no-store` |
| POST | `/api/admin/restore/preview?mode=merge\|replace` | backup JSON, ≤16 MB | `200 Plan` |
| POST | `/api/admin/restore?mode=…&plan={planHash}` | same file | `200 Result`, or `409 {code:"plan_changed", plan}` |
| POST | `/api/admin/import/homepage/preview` | `{services, bookmarks?, settings?}` (strings, each ≤1 MB) | `200 Plan` |
| POST | `/api/admin/import/homepage?plan={planHash}` | same body | `200 Result`, or `409 {code:"plan_changed", plan}` |

`Plan`:

```ts
type Plan = {
  planHash: string;                       // absent on a Result
  mode: 'merge' | 'replace' | 'import';
  summary: {
    create: { sections: number; apps: number; icons: number; offers: number; kids: number };
    update: { sections: number; apps: number; icons: number; offers: number; people: number; settings: number };
    delete: { sections: number; apps: number; offers: number };
    unchanged: number;
    skipped: number;
  };
  items: PlanItem[];
  warnings: { code: string; count: number }[];   // plan-level: unknown_fields, ref_missing
  ignored: { fields: number; settings: string[]; dropped: ('widgets' | 'docker' | 'kubernetes')[] };
  gatusSnippet?: string;                  // Homepage import only, only when an app needs it
  otherAccounts: number;                  // accounts other than the caller, for the "A–Z" line
  applied?: true;                         // on a Result only
};
type PlanItem = {
  kind: 'section' | 'app' | 'icon' | 'offer' | 'settings' | 'adult' | 'kid';
  name: string;                           // section/app/offer name, adult email, kid name, icon's app name
  action: 'create' | 'update' | 'unchanged' | 'delete' | 'skip';
  section?: string | null;                // app: target section (null = Uncategorized)
  variant?: 'light' | 'dark';             // icon
  fields?: string[];                      // update: what changes
  reason?: string;                        // skip; or 'already_here' on an unchanged/update import row
  warnings?: string[];
  detail?: string;                        // e.g. the glyph name for icon_glyph
  icon?: string;                          // import: the resolved icon URL, for the thumbnail
};
```

Error body: `{ code, message, file?, line?, count?, limit?, things?, plan? }`.

Codes (copy in `src/library/importCopy.ts`, UX §6, plus the ones this plan adds):

- **Errors:** `not_a_backup`, `schema_newer`, `invalid_json`, `not_homepage_services`, `not_homepage_bookmarks`, `not_homepage_settings`, `yaml_syntax` (with `line`), `too_deep`, `too_large`, `too_many` (with `count`, `limit`, `things`), `plan_changed`, `bad_mode`, `plan_missing`.
- **Skip reasons:** `no_link`, `bad_scheme`, `href_uses_variable`, `already_here`, `duplicate`, `no_name`, `invalid_item`, `adult_no_account`, `icon_invalid`.
- **Warnings:** `widget_dropped`, `icon_local`, `icon_glyph` (with `detail`), `icon_unsupported`, `icon_invalid`, `description_variable`, `section_missing`, `kid_needs_device`, `status_on`, `ref_missing`, `unknown_fields`.

## Success Criteria

- All 28 Must ACs implemented and tested; the four Should ACs (AC-005, AC-018, AC-029, AC-030) too.
- Every AC maps to at least one named test; the map is in each PR body.
- homepad-api: `gofmt`, `go vet`, `go test ./... -count=1 -p 1` green in CI (DB-backed), `make test-unit` green locally.
- homepad: `npm run lint`, `typecheck`, `build`, `vitest --coverage` (≥90%), `test:gate` and `test:e2e` green. Entry CSS and entry JS stay inside their budgets with no raise.
- TC-001…TC-012 pass in staging (release task).

---

## Phase 1 — Engine and Homepage parser (homepad-api, pure, no DB) · AC-005, AC-007, AC-010…AC-013, AC-015…AC-024, AC-026, AC-028, AC-029

New package `internal/transfer`.

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-101 | RED: backup file types (v1), canonical encoder (fixed key order, two-space indent, no HTML escaping), decoder with `format`/`schemaVersion` checks, the upgrade chain (empty at v1), unknown-field counting, count limits. Fixture `testdata/backups/v1.json`. | 2h | — |
| TASK-102 | RED: Homepage parser over `yaml.Node`: the group/entry shape, nested groups (`Parent / Child`, depth ≤8), bookmarks, `settings.yaml` `layout` (map or list) and `target`, custom-tag refusal, an alias-expansion budget, wrong-shape errors with line numbers. Widget, `widgets` and `providers` values are dropped at parse time and never reach the parsed result. Realistic `services.yaml` / `bookmarks.yaml` / `settings.yaml` fixtures in `testdata/homepage/` (example.com and `*.home.arpa` hosts only). | 3h | — |
| TASK-103 | RED: the §4.1/§4.2 mapping table, one test per row: names, slugs and collisions, `href` rules, icons (URL, local path, Dashboard Icons, `sh-`, `mdi-`/`si-`), `target`, weight order, monitors and the Gatus key rule, ignored keys. | 2h | 102 |
| TASK-104 | RED: `Plan(snapshot, input)` for restore (Merge and Replace, people always merged) and for import (merge only; already-here by normalized link; the one gatus-key fill). Idempotency: plan, apply to the snapshot in memory, plan again → nothing to change. `planHash` is stable and changes when the snapshot does. | 3h | 101, 103 |
| TASK-105 | GREEN for 101–104. | 6h | 101–104 |

## Phase 2 — Storage, routes and apply (homepad-api) · AC-001…AC-004, AC-006, AC-008, AC-009, AC-014, AC-025, AC-030

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-201 | RED (DB-backed): `storage.LoadSnapshot` (catalog of the shared owner, icons, library, settings, people) and `storage.ApplyTransfer` (one transaction, `importLockKey` advisory lock, re-plan inside it, hash compare). | 2h | Phase 1 |
| TASK-202 | RED (DB-backed, `internal/api/transfer_test.go`): the five routes. Export from a fully populated DB matches the schema, holds every section, app, icon, offer and setting, and contains no password hash, session token or hash, OIDC secret, env value, Gatus URL or UUID; with `people=false` there is no `@`. Restore Merge/Replace/idempotent/fresh-install; stale 409; a failure part-way rolls back; concurrent applies serialize. Import TC-008/TC-009, widget key grep across DB, logs and responses. Everything run as a second admin too. Limits 413/422; 400s with line numbers; one log line per apply. | 4h | 201 |
| TASK-203 | Route classes: the five routes in `server.go` and in `expectedRouteClasses` as `admin-only`. `api.Version` and the Dockerfile `ARG VERSION`. | 0.5h | 202 |
| TASK-204 | GREEN for 201–203; `docs/schema/homepad-backup-v1.json`; README endpoint rows. | 4h | 201–203 |

**Gate:** one homepad-api PR. CI runs the DB-backed suite (`go test ./... -count=1 -p 1` against Postgres 17).

## Phase 3 — Frontend (homepad) · AC-001, AC-003, AC-006, AC-019, AC-027, AC-028, AC-031, AC-032, UX §2–§7

| Task | Description | Effort | Depends on |
|---|---|---|---|
| TASK-301 | `src/library/backup/transferApi.ts` (spec §10 says `src/api.ts`; see Plan history): `exportUrl(people)`, `downloadBackup(people)`, `previewRestore(file, mode)`, `applyRestore(file, mode, planHash)`, `previewHomepageImport(texts)`, `applyHomepageImport(texts, planHash)`, the `Plan` types, and a typed `TransferError` carrying `code`, `line`, `plan`. | 1h | contract above |
| TASK-302 | `src/library/importCopy.ts`: one map from every code to its words (UX §6), with `{n}`/`{line}`/`{icon}` filling. | 0.5h | 301 |
| TASK-303 | `BackupSection` (UX §2), last in the Admin Panel, admin only: Include people box and its two hints, Download backup with "Preparing…" and the inline error. | 1.5h | 301 |
| TASK-304 | `RestoreModal` (UX §3): Choose (file input + drop, `exportedAt` read in the browser, the not-JSON check), mode radios, Preview → plan groups with marks and words, collapsed Unchanged, "Show all" past 20 rows, Nothing to change, the Replace group and typed `REPLACE`, Done, 409 banner with the new plan, failure state. | 4h | 302 |
| TASK-305 | `HomepageImportModal` (UX §4): three files with Paste/Upload, the two optional ones collapsed, parse errors under the right textarea with the line selected, the dirty-close confirm, preview grouped by section with 24px thumbnails or initials, Skipped, Status checks with Copy and Download, the Not imported line, the counted primary button, Done with the conditional lines. | 4h | 302 |
| TASK-306 | B-2: the admin empty dashboard gets "Coming from Homepage? Import your services.yaml", opening the import modal. Users and kids see no change. After any apply, refetch services, categories and the library. | 1h | 305 |
| TASK-307 | Styles in `src/library/backup-import.css`, imported only by the lazy Backup and import code. `bundle-budget.test.ts` and `code-splitting.test.ts` list the new chunk. Entry CSS must not grow. | 1h | 303–305 |
| TASK-308 | jest-axe on both modals and the section; browser-gate spec with mocked API for both flows at 1440 and 820; e2e for download, restore and import against the built app. | 2.5h | 303–306 |
| TASK-309 | AC-027: `client_max_body_size 16m` in both compose nginx configs, with an infra test. AC-031: `docs/backup-import.md` (back up, restore, Homepage import, what doesn't carry over, `pg_dump` for scheduled backups), linked from the README. | 1h | — |

## Phase 4 — Verify and release (not this build)

| Task | Description | Effort |
|---|---|---|
| TASK-401 | TC-001…TC-012 in staging; the UX §8 screenshots. | 1.5h |
| TASK-402 | Check the production ingress body limit in `Code/homelab` allows 16 MB on `/api/`. | 0.5h |
| TASK-403 | QA dispatch via Joe for each PR. Read the review body, not just the approval. | — |
| TASK-404 | CHANGELOG entry and the version bump in the release PR. | 0.5h |

---

## Order and parallelism

```
Phase 1 (api, pure) ──► Phase 2 (api, DB) ──► api PR
        │
        └── contract fixed here ──► Phase 3 (web, against mocks) ──► web PR (merges after the api PR reaches staging)
```

## Effort summary

| Phase | Hours |
|---|---|
| 1 Engine and parser | 16 |
| 2 Storage, routes, apply | 10.5 |
| 3 Frontend | 16.5 |
| 4 Verify and release | 2.5 |
| **Total** | **~45h** |

## Risks

| Risk | P | I | Mitigation |
|---|---|---|---|
| A secret from a Homepage file (widget key, `providers`) lands in the DB, a log or a response | M | H | Dropped at parse time, before planning. AC-022 test greps the DB, captured logs and every response for the key. |
| A backup leaks a hash, a token or a new column | M | H | Export is built from an explicit allow-list of fields. AC-004 test greps a fully populated export. |
| A stale preview applies something the admin didn't see | M | M | Apply re-plans under the lock and compares `planHash`; 409 carries the new plan. |
| Replace wipes a catalog by mistake | L | H | Typed `REPLACE`, the Delete group shown first, and a Download backup button inside the confirm. |
| A crafted YAML exhausts memory (alias bomb, deep nesting) | L | M | 1 MB cap before parsing, an alias-expansion budget, depth ≤8, count caps. |
| The new UI grows the entry CSS past its budget | M | M | Lazy chunk with its own CSS file; the bundle-budget test stays unchanged. |
| #87's fix and this build both touch catalog writes | M | L | This build adds its own storage functions that take the owner id; it doesn't edit the existing write paths. |

## Next step

Phase 1 (TASK-101) in `homepad-api` on `feat/backup-import`, and Phase 3 (TASK-301) in `homepad` on `feat/backup-import-web` in parallel.

## Plan history

- 2026-11-07: Initial plan, from the approved spec and UX.
- 2026-11-07: TASK-301's calls live in `src/library/backup/transferApi.ts`, beside the components that use them, and go through `api.ts`'s `request()`. In `src/api.ts` they would ship in the entry chunk for every visitor; measured, the move keeps the entry JS at +440 B gzip for the whole feature. Download backup fetches the file as a Blob (`downloadBackup`) so the button can say "Preparing…" and show an error (UX §2), which a bare `<a download>` can't.
