# Spec: Backup, restore, and import from Homepage

**Version:** 0.1.0
**Created:** 2026-11-07
**Author:** Claude for Caleb Dunn (via /add:spec)
**Status:** Approved — Caleb, 2026-11-07: all recommended defaults (OQ-1 c, OQ-2 a, OQ-3 a, OQ-4 b, OQ-5 c, OQ-6 a, OQ-7 a, OQ-8 a, OQ-9 b; B-1…B-3 as proposed).
**Repo:** `Code/homepad` (frontend) + `Code/homepad-api` (Go backend)
**Estimate:** ~4–5 days (export, restore with preview, Homepage parser and mapping, Admin Panel UI, tests)
**Depends on:** shared catalog model (SPEC-245-224), kid accounts (SPEC-kid-accounts, shipped 17.0.0), the shared-catalog write fix tracked in `Code/homepad-api#87`
**Target version:** next free minor after 17.0.0 (17.1.0 unless a sibling spec from the same work list ships first). Additive: no migration, no change for anyone who doesn't use it.

---

## 0. Open questions / decisions for Caleb

These replace the ADD interview. Each has a recommended default; "go with the defaults" approves all nine.

- **OQ-1: What goes in a backup.**
  - (a) The catalog only: sections, apps, uploaded icons, the App Library, and System settings.
  - (b) (a) plus kid accounts: name, color and allowed apps.
  - (c) (b) plus each adult's own dashboard (favorites, order, folded sections, appearance), keyed by email. The download dialog has an "Include people" box, on by default, so someone who wants to share their config in public can leave emails out.
  - **Recommended: (c).** No password hashes, sessions or secrets in any option (§9).
- **OQ-2: Uploaded icons in a backup.**
  - (a) Inside the JSON file, base64. One file to keep.
  - (b) A `.zip` with `homepad.json` and an `icons/` folder.
  - (c) Leave them out. Icon URLs only.
  - **Recommended: (a).** Icons are capped at 256 KB each, and most catalogs use URLs, so files stay small.
- **OQ-3: File format.**
  - (a) JSON, pretty-printed, keys in a fixed order, so it diffs cleanly in git.
  - (b) YAML.
  - (c) Both, chosen at download.
  - **Recommended: (a).**
- **OQ-4: Restore mode.**
  - (a) Merge only: add what's new, update what matches, never delete.
  - (b) Merge by default, with a Replace option behind a typed confirm. Replace empties the catalog and the App Library first.
  - (c) Replace only.
  - **Recommended: (b).** Accounts are always merged in both modes; restore never deletes an account (§2.2).
- **OQ-5: Which Homepage files to accept.**
  - (a) `services.yaml` only.
  - (b) `services.yaml` and `bookmarks.yaml`.
  - (c) (b) plus `settings.yaml`, used only for section order (`layout`) and the default link target (`target`).
  - **Recommended: (c).** Only `services.yaml` is required.
- **OQ-6: A Homepage app that's already in the catalog** (same link).
  - (a) Skip it, and show "Already on your dashboard" in the preview.
  - (b) Update the existing app's name, description and icon from the file.
  - (c) Add a second copy.
  - **Recommended: (a).** One exception: if the existing app has no status check and Gatus now knows its key, the import fills it in (§4.3). That makes "import, update Gatus, import again" work.
- **OQ-7: Nested Homepage groups.**
  - (a) One section per nested group, named "Parent / Child".
  - (b) Fold child groups into the parent's section.
  - (c) One section per nested group, under the child's name alone.
  - **Recommended: (a).** Nothing merges by surprise, and names stay unique.
- **OQ-8: Homepage icon names.**
  - (a) Dashboard Icons names (`sonarr.png`) and selfh.st names (`sh-sonarr`) become the same CDN URL Homepage uses. `mdi-` and `si-` icons get no icon, so the tile shows its initials badge, and the preview says so.
  - (b) As (a), but `mdi-` and `si-` also map to their CDN SVG. Those SVGs are black glyphs with no color, and they're hard to see in dark mode.
  - (c) The server downloads each icon once and stores it as an uploaded PNG. Works offline. Adds an outbound fetch to a fixed list of CDN hosts, and only PNG names work.
  - **Recommended: (a).** (c) can follow later as "Copy icons into Homepad".
- **OQ-9: Homepage `siteMonitor` and `ping`** (Homepad's status comes from Gatus only).
  - (a) Skip them, and list them in the report.
  - (b) Build a Gatus endpoints snippet from them, ready to paste into your Gatus config. Set an app's status key only when Gatus already reports that key. Other apps show "Not monitored" until you add the snippet and import again.
  - (c) As (b), but always set the key. Those tiles show "Unknown" until Gatus has the endpoint.
  - **Recommended: (b).** A fresh import never shows a page of grey "Unknown" tiles.

UX-only choices (where the section sits, the empty-dashboard link) are in the UX doc §9 (B-1…B-3).

---

## 1. Overview

Competitor research on 2026-11-07 found backup and export as an unmet request across dashboards: 27 requests and 73 votes, for example Heimdall ([discussion #695](https://github.com/linuxserver/Heimdall/discussions/695), web UI backup) and Flame ([issue #318](https://github.com/pawelmalak/flame/issues/318)). Homepad keeps everything in Postgres and is edited in the browser, so people ask "where's my config as code?" and worry about lock-in.

Homepage (`gethomepage/homepage`) is the most popular competitor. Its users keep their dashboard in YAML files. An import that reads those files lets them try Homepad in a few minutes. The idea was listed in `docs/milestones/M7-growth-install-funnel.md` ("import from Homepage config") and never specced.

This spec covers three things:

1. **Back up:** an admin downloads one file with the whole dashboard.
2. **Restore:** an admin uploads that file, sees what will change, then applies it.
3. **Import from Homepage:** an admin pastes or uploads Homepage's YAML, sees what will be added and what can't come across, then imports.

### 1a. What exists today (grounded in the code, `homepad-api` `gitea/main` at `32f3200`)

- **The catalog is one admin's rows.** Sections (`categories`) and apps (`services`) are owned by the first admin: `SharedCatalogOwnerID` in `internal/storage/storage.go`, `role='admin' ORDER BY created_at, id LIMIT 1`. Every reader sees that owner's rows.
- **Writes by a second admin 404 today.** Catalog write paths scope to the acting admin's id, not the owner's (`Code/homepad-api#87`, open; another spec is fixing it). Import and restore must write through the owner from day one, whatever #87's fix looks like.
- **An app is:** `slug` (unique per owner), `name`, `description`, `url`, `icon` (free text, rendered as an image URL by `iconSrc` in `src/lib/icons.ts`), `gatus_key` (nullable), `category_id` (nullable = Uncategorized), `click_action` (`new_tab` | `same_tab` | `iframe`), and `source_library_id` (provenance only).
- **Uploaded icons** live in `service_icons`: one PNG per `light`/`dark` variant, ≤256 KB, ≤512×512 px, PNG magic-byte checked (`internal/api/icons.go`).
- **A section is:** `name` (unique per owner), `sort_index`, `grid_width` (12-column span: 3, 4, 6 or 12).
- **The App Library** (`library_apps`): `name`, `url`, `icon`, `description`, `suggested_category`, `sort_index`.
- **System settings** (`system_settings` singleton): `show_uptime_display` (the default for new accounts) and `status_degraded_ms` (nullable).
- **Per person:** `favorites`, `user_layout` (the person's own app order), `user_collapsed_categories`, and on `users`: `theme_pref`, `density_pref`, `show_health_bar`, `show_uptime_display`, `display_name`, `avatar_color`.
- **Kids:** `role='kid'`, no email, no password by default, `display_name` unique case-insensitively, allow-list in `kid_allowed_services`.
- **There is no catalog-wide app order.** `ListServices` orders by the viewer's own `user_layout`, then by name. A person who never arranged sees A–Z.
- **The API doesn't check URL schemes.** `handleCreateService` checks only that `url` is present. `src/lib/safeUrl.ts` says the Go API "must enforce the same allowlist server-side". Bulk import is a new way to write many URLs at once, so this spec adds the check on the import paths (§9).
- **The API has YAML available.** `gopkg.in/yaml.v3` is already in `go.mod` (indirect, via testify). Using it directly adds no new module.
- **Uploads over 1 MB fail on the compose install.** The `nginx-config` block in `compose.yaml` and `deploy/compose/nginx.conf` set no `client_max_body_size`, so nginx's 1 MB default applies to `/api/`. The production ingress's body limit lives in `Code/homelab`, not in this repo, so it has to be checked before release.

---

## 2. Model

### 2.1 Back up (export)

An admin downloads `homepad-backup-YYYY-MM-DD.json`. It holds (per OQ-1 (c)):

- **Catalog:** sections in order with their width; apps with every field above; uploaded icon bytes (OQ-2 (a)).
- **App Library:** every offer, in order.
- **System settings:** `showUptimeDisplay`, `statusDegradedMs`.
- **People** (only when "Include people" is ticked):
  - adults: email, display name, avatar color, appearance prefs, favorites, app order, folded sections;
  - kids: name, color, allowed apps, appearance prefs, favorites.

References inside the file use **slugs** for apps, **names** for sections, **email** for adults and **name** for kids. The file has no database IDs, so it restores cleanly onto a different install.

### 2.2 Restore

The admin picks a backup file and a mode (OQ-4 (b)):

- **Merge** (default): add what's new, update what matches, leave everything else alone.
  - Sections match by exact name, apps by slug, App Library offers by name and URL together.
  - For a match, the file wins for every field it carries.
  - An uploaded icon in the file replaces that variant. An icon the file doesn't have is left alone.
- **Replace:** delete every app, section and App Library offer, then load the file. Deleting apps also drops every person's favorites, order and kid allow-lists for them (FK cascade), and the file's people section then puts back what it has. The admin types `REPLACE` to confirm.

**People are always merged, in both modes:**

- Adults match by email. Homepad never creates or deletes an adult on restore: an adult has to sign in with a password or OIDC, and the file holds neither. An adult in the file with no matching account is listed as skipped.
- Kids match by name, case-insensitively. A kid in the file with no match is created, with no password and no signed-in devices. A kid not in the file is left alone.
- For a matched person: favorites from the file are added; their app order and folded sections are replaced by the file's; their prefs are set from the file.

**Every restore is two steps: preview, then apply.** The preview changes nothing. It returns the plan (what will be created, updated, left unchanged, deleted or skipped, and why) and a `planHash`. Apply sends the same file back with that hash. The server works the plan out again, and if the result differs (the catalog changed in between) it refuses with 409 and the UI asks for a fresh preview. Apply is one database transaction: it all lands, or none of it does.

**Idempotent:** restoring the same file twice in Merge mode leaves the same state, and the second preview shows nothing to change.

### 2.3 Schema versioning

Every backup starts with:

```json
{ "format": "homepad-backup", "schemaVersion": 1, "exportedAt": "…", "homepadVersion": "17.1.0" }
```

- `format` must be `homepad-backup`, or the file is rejected as "not a Homepad backup".
- `schemaVersion` is an integer. It goes up only for a breaking change: a field renamed, removed, or with a new meaning. Adding an optional field does not bump it.
- **Older files:** the API keeps one upgrade function per version step (1→2, 2→3 …) and runs them in order before planning. Every schema version ever released stays restorable.
- **Newer files:** a `schemaVersion` above what this server knows is rejected with 422: "This backup is from a newer Homepad. Update Homepad, then try again."
- **Unknown fields** in a known version are ignored. The preview lists them once ("3 fields this version doesn't use were ignored"), so nothing is dropped without a word.
- `homepadVersion` is for people. Nothing reads it.

### 2.4 Import from Homepage

The admin pastes text or picks files for up to three Homepage files (OQ-5 (c)): `services.yaml` (required), `bookmarks.yaml` and `settings.yaml` (optional). The server parses them, maps them with the table in §4, and returns a preview. The admin imports, and gets a report.

- It's always a **merge into the existing catalog**. Import never deletes or renames anything.
- An app whose link is already in the catalog is skipped (OQ-6 (a)). Links are compared after trimming whitespace and a trailing `/`, with the scheme and host lowercased.
- New sections go after the existing ones, in Homepage order (§4.1).
- Preview and apply work as in §2.2: same `planHash`, same 409 for a stale preview, one transaction.
- Re-running the same import adds nothing (every app is now "Already on your dashboard").

---

## 3. Backup file schema (v1)

```json
{
  "format": "homepad-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-11-07T18:04:11Z",
  "homepadVersion": "17.1.0",
  "includesPeople": true,
  "settings": {
    "showUptimeDisplay": true,
    "statusDegradedMs": 1500
  },
  "sections": [
    { "name": "Media", "gridWidth": 6 },
    { "name": "Network", "gridWidth": 3 }
  ],
  "apps": [
    {
      "slug": "jellyfin",
      "name": "Jellyfin",
      "description": "Movies and TV",
      "url": "https://jellyfin.example.com",
      "icon": "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/jellyfin.png",
      "section": "Media",
      "clickAction": "new_tab",
      "gatusKey": "media_jellyfin",
      "uploadedIcons": {
        "dark": { "png": "iVBORw0KGgoAAAANSUhEUgAA…", "sha256": "9f2c…" }
      }
    },
    {
      "slug": "router",
      "name": "Router",
      "description": "",
      "url": "http://192.0.2.1",
      "icon": "",
      "section": null,
      "clickAction": "same_tab",
      "gatusKey": null,
      "uploadedIcons": {}
    }
  ],
  "library": [
    { "name": "Immich", "url": "https://immich.app", "icon": "", "description": "Photos", "suggestedCategory": "Media" }
  ],
  "people": {
    "adults": [
      {
        "email": "alex@example.com",
        "displayName": "Alex",
        "avatarColor": null,
        "prefs": { "theme": "dark", "density": "compact", "showHealthBar": true, "showUptimeDisplay": true },
        "favorites": ["jellyfin"],
        "order": ["jellyfin", "router"],
        "collapsedSections": ["Network"]
      }
    ],
    "kids": [
      {
        "name": "Maya",
        "avatarColor": "teal",
        "prefs": { "theme": "light", "density": "large", "showHealthBar": false, "showUptimeDisplay": true },
        "allowedApps": ["jellyfin"],
        "favorites": ["jellyfin"]
      }
    ]
  }
}
```

Rules:

- **Order is the array order.** `sections[]` order is each section's `sort_index`, and `library[]` order is the offers' order.
- **`section: null`** means Uncategorized.
- **`people`** is omitted entirely when `includesPeople` is false.
- **`uploadedIcons`** has up to two keys, `light` and `dark`. Each holds base64 PNG bytes and their SHA-256 (hex, the same value as `service_icons.etag`). On restore, the bytes must match the hash. They also go through the same checks as `PUT /api/services/{id}/icon/{variant}`: PNG magic bytes, ≤256 KB, ≤512×512 px.
- **References** (`favorites`, `order`, `allowedApps`) are app slugs, and `collapsedSections` are section names. A reference to something missing from the file is dropped, with a warning in the preview.
- **What the file never contains:** IDs, password hashes, session tokens or hashes, OIDC config or secrets, env config, the Gatus base URL, and `source_library_id`. `source_library_id` is provenance only: on restore it's re-linked by matching an offer's name and URL.
- **Key order is fixed and output is indented by two spaces,** so two backups of the same dashboard are byte-identical apart from `exportedAt`.

A JSON Schema for v1 ships at `docs/schema/homepad-backup-v1.json`. Tests check exports against it.

---

## 4. Homepage mapping

The Homepage format below comes from its docs and source on 2026-11-07: `docs/configs/services.md`, `bookmarks.md` and `settings.md`, plus `src/components/resolvedicon.jsx` and `src/utils/config/service-helpers.js` on `main`.

### 4.1 `services.yaml`

`services.yaml` is a YAML list of groups. Each group is a one-key map from the group name to a list of entries. An entry is a one-key map from a service name to its fields. If the value is itself a list, it's a nested group.

| Homepage | Homepad | Notes |
|---|---|---|
| Group name (top level) | Section `name` | Matches an existing section by exact name, or creates one. New sections get `gridWidth` 6 (the default). |
| Nested group | Section named `Parent / Child` | OQ-7 (a). Any depth: `A / B / C`. |
| Group order | Section order | New sections are appended after the existing ones, in the order of `settings.yaml` `layout` if given, then in file order. Existing sections never move. |
| Service name (the map key) | `name` | Trimmed. An empty name skips the entry. |
| — | `slug` | Derived from the name: lowercase, every run of non `a-z0-9` characters becomes `-`, trimmed of `-`. A collision with an existing or earlier slug gets `-2`, `-3` and so on. |
| `href` | `url` | Required. Must be `http` or `https`. Otherwise the entry is skipped: "No link" or "Link isn't http or https". |
| `href` with `{{HOMEPAGE_VAR_…}}`, `{{HOMEPAGE_FILE_…}}` or `${…}` | — | Skipped: "Link uses a Homepage variable. Add it by hand." Homepad can't read Homepage's environment. |
| `description` | `description` | As is. `{{…}}` placeholders are left as text, with a warning. |
| `icon:` an `http(s)://` URL | `icon` | As is. |
| `icon:` a local path such as `/icons/x.png` | — | No icon (initials badge), with a warning: "Local icon files can't be copied. Upload it on the app." |
| `icon:` a Dashboard Icons name, with or without `.png`/`.svg`/`.webp` | `icon` = `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/{ext}/{name}.{ext}` | With no extension, `png` is used. These are the same URLs Homepage loads. |
| `icon: sh-{name}` with an optional extension | `icon` = `https://cdn.jsdelivr.net/gh/selfhst/icons@main/{ext}/{name}.{ext}` | With no extension, `png` is used. |
| `icon: mdi-…` or `si-…`, with an optional `-#hex` color | — | No icon (initials badge), with a warning (OQ-8 (a)). |
| `target: _blank` / `_self` / `_top` | `clickAction` `new_tab` / `same_tab` / `same_tab` | With no `target`, `settings.yaml` `target` is used, then `new_tab`. |
| `weight` | Order within the section | Homepage sorts a group by `weight`, then by file order (its default weight is the position × 100). Homepad keeps that order for the importing admin (§4.4). |
| `siteMonitor`, `ping` | `gatus_key` and the Gatus snippet | §4.3 (OQ-9 (b)). |
| `widget`, `widgets` | — | Skipped: "Widgets don't carry over." Widget blocks often hold API keys. They are never stored, logged or echoed back. |
| `server`, `container`, `showStats` | — | Skipped (Docker stats). |
| `app`, `namespace`, `podSelector` | — | Skipped (Kubernetes). |
| `statusStyle`, `id`, any other key | — | Ignored, and counted in the report's "Ignored settings" line. |

Docker-label and Kubernetes-discovered services aren't in `services.yaml`, so they don't import. The UI says so on the import screen.

### 4.2 `bookmarks.yaml` and `settings.yaml`

`bookmarks.yaml` has the same group shape. Each bookmark's value is a list holding one map.

| Homepage | Homepad | Notes |
|---|---|---|
| Bookmark group | Section | Same rules as a service group. A bookmark group with the same name as a service group shares that section. |
| Bookmark name | `name` | |
| `href` | `url` | Same rules as a service `href`. |
| `description` | `description` | Homepage shows the link's host when there's no description. Homepad leaves it empty. |
| `icon` | `icon` | Same rules as §4.1. |
| `abbr` | — | Ignored. The initials badge does the same job. |

From `settings.yaml`, only two things are read:

- `layout`: the order of group names, used for new sections. Its per-group `style`, `columns`, `header`, `icon`, `tab`, `iconsOnly` and `initiallyCollapsed` are ignored.
- `target`: the default click action.

Everything else (`title`, `theme`, `color`, `background`, `providers`, `quicklaunch` and the rest) is ignored and listed once in the report. `providers` can hold secrets; it is never stored or echoed back.

### 4.3 Status checks (OQ-9 (b))

For each imported app that has `siteMonitor` or `ping`:

- The import works out the Gatus key Homepad would use, with Gatus's own rule (`config/key/key.go`, `ConvertGroupAndNameToKey`): `sanitize(section) + "_" + sanitize(name)`. `sanitize` lowercases, trims, and replaces `/ _ . , space # + &` with `-`.
- If the API's current Gatus snapshot already has that key, the app's `gatus_key` is set to it. If not, `gatus_key` stays empty, and the tile shows "Not monitored".
- The preview and the report include a Gatus snippet with one endpoint per app that wasn't matched:

```yaml
endpoints:
  - name: Sonarr
    group: Media
    url: "http://sonarr.host/"     # from siteMonitor
    interval: 60s
    conditions:
      - "[STATUS] < 400"
  - name: Router
    group: Network
    url: "icmp://192.0.2.1"        # from ping
    interval: 60s
    conditions:
      - "[CONNECTED] == true"
```

- After adding the snippet to Gatus and restarting it, the admin runs the same import again. Each app is "Already on your dashboard", and its empty `gatus_key` is now filled because Gatus knows the key. That's the one field an import ever changes on an existing app (OQ-6).

### 4.4 Order within a section

Homepad has no catalog-wide app order (§1a). The importing admin's own order (`user_layout`) gets the imported apps appended, in Homepage order. If the admin has no saved order yet, one is first saved from their current view, so nothing they already see moves. Everyone else sees imported apps A–Z within each section until they arrange. The report says so in one line.

### 4.5 Parsing safety

- YAML is parsed on the server with `gopkg.in/yaml.v3` into plain maps and lists. Custom tags are rejected, and anchors and aliases are capped (yaml.v3's excessive-aliasing guard).
- Nesting deeper than 8 groups is rejected.
- The wrong shape gets a plain message with the line number: "This doesn't look like a Homepage services.yaml. It should be a list of groups. (line 3)".

---

## 5. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | An admin can download a backup from the Admin Panel. The file is JSON matching `docs/schema/homepad-backup-v1.json`, named `homepad-backup-YYYY-MM-DD.json`. | Must |
| AC-002 | The backup holds every section (order, width), every catalog app (all fields in §3), every uploaded icon variant, every App Library offer (in order), and System settings. | Must |
| AC-003 | With "Include people" ticked, the backup holds adults (by email) and kids (by name) with prefs, favorites, order, folded sections and kid allowed apps. With it unticked, the file has no `people` key and no email address anywhere. | Must |
| AC-004 | No backup ever contains a password hash, a session token or hash, OIDC config or secrets, env config, the Gatus base URL, or a database ID. A test greps a backup made from a fully populated test DB for each of these. | Must |
| AC-005 | Two backups of an unchanged dashboard are byte-identical apart from `exportedAt`. | Should |
| AC-006 | Export, restore and Homepage import are admin-only. A user gets 403 and a kid gets 403 (route class `admin-only`). A signed-out request gets 401. | Must |
| AC-007 | Every restore and import has a preview that changes nothing in the database. It returns counts and a per-item list: create, update, unchanged, delete, skip. Every skip has a reason. | Must |
| AC-008 | Apply needs the preview's `planHash`. If the server's re-computed plan differs, apply returns 409 and changes nothing. | Must |
| AC-009 | Apply is all-or-nothing: an error part-way leaves the database as it was before. Two applies at once are serialized. | Must |
| AC-010 | Restore in Merge mode adds new items, updates matches (sections by name, apps by slug, offers by name and URL), and leaves items that aren't in the file unchanged. | Must |
| AC-011 | Restore in Replace mode deletes every app, section and App Library offer, then loads the file. The UI requires typing `REPLACE`. The preview lists the deletions. | Must |
| AC-012 | Restore never creates or deletes an adult. An adult with no matching email is listed as skipped. Kids are created when missing, with no password and no devices. | Must |
| AC-013 | Restoring the same file twice in Merge mode gives the same state. The second preview shows zero creates, updates and deletes. | Must |
| AC-014 | A backup restored onto a fresh install (one admin, empty catalog) reproduces the sections, apps, icons, offers, settings and kids. Each matched person's favorites, order and folded sections come back too. | Must |
| AC-015 | Uploaded icon bytes are checked against their `sha256` and against the icon upload rules (PNG, ≤256 KB, ≤512×512). A bad icon skips that icon, with a warning. It doesn't fail the restore. | Must |
| AC-016 | A file with `schemaVersion` higher than the server knows is rejected with 422 and the "newer Homepad" message. A file whose `format` isn't `homepad-backup` is rejected with 422 "not a Homepad backup". | Must |
| AC-017 | A v1 file stays restorable by every later server: upgrade functions run in order, and a test fixture of every released schema version is restored in CI. | Must |
| AC-018 | Unknown fields in a known schema version are ignored, and the preview counts them. | Should |
| AC-019 | An admin can paste or upload `services.yaml`, plus optional `bookmarks.yaml` and `settings.yaml`, and preview the import. | Must |
| AC-020 | Homepage fields map as in §4.1–§4.2. Each row of those tables has at least one test. | Must |
| AC-021 | Homepage import never deletes, renames or reorders existing sections or apps. An app whose normalized link already exists is skipped as "Already on your dashboard". | Must |
| AC-022 | Widget blocks, `providers`, and any value under them are never stored, logged, or returned in a response. A test imports a file with a widget `key` and greps the DB, the logs and every response for it. | Must |
| AC-023 | `siteMonitor` and `ping` set `gatus_key` only when the current Gatus snapshot has the computed key. Every other monitored app appears in the Gatus snippet. Re-importing fills an existing app's empty `gatus_key` and nothing else (§4.3). | Must |
| AC-024 | Every URL written by restore or import (`url`, `icon`) is `http(s)` or empty. Anything else skips that item (restore) or entry (import), with a reason. | Must |
| AC-025 | All restore and import writes go to the shared catalog owner (`SharedCatalogOwnerID`), whichever admin runs them. A test runs both as a second admin (`homepad-api#87`). | Must |
| AC-026 | Limits: a backup body ≤16 MB, each Homepage file ≤1 MB, ≤1,000 apps, ≤200 sections, ≤1,000 offers and ≤100 kids per file. Over the size limit gets 413. Over a count gets 422 with the count. | Must |
| AC-027 | The compose install accepts a 16 MB restore: `client_max_body_size 16m` on `/api/` in `compose.yaml`'s `nginx-config` and in `deploy/compose/nginx.conf`. | Must |
| AC-028 | Malformed JSON or YAML gets 400 with a plain message and, for YAML, the line number. The UI shows it next to the input. | Must |
| AC-029 | Imported apps keep Homepage's order (weight, then file order) in the importing admin's own order, and nothing already on their dashboard moves (§4.4). | Should |
| AC-030 | The API logs one line per apply: who, mode, and counts. Never file contents. | Should |
| AC-031 | `docs/backup-import.md`, linked from the README, explains backup, restore and Homepage import, and lists what doesn't carry over from Homepage. | Must |
| AC-032 | Users and kids see no change. Admins see a new "Backup and import" section in the Admin Panel. | Must |

---

## 6. User Test Cases

**TC-001 — Back up.** *Precondition:* a catalog with 3 sections, 12 apps (2 with uploaded icons), 5 offers, one adult and one kid.
1. The admin opens **Admin Panel → Backup and import → Download backup**, with Include people ticked.

*Expected:* a `.json` file downloads. It has 3 sections, 12 apps with both uploaded icons inline, 5 offers, settings, one adult and one kid. Grepping it finds no `password`, `$2a$`, `token` or UUID.

**TC-002 — Back up without people.** Same as TC-001 with Include people unticked. *Expected:* no `people` key, and no `@` anywhere in the file.

**TC-003 — Restore onto a fresh install.** *Precondition:* a new install with one admin and an empty catalog; Alex has signed up with the same email.
1. Choose the TC-001 file, keep Merge, and select **Preview**.
2. Check the preview: 3 sections, 12 apps, 2 icons and 5 offers to add; 1 kid to create; Alex matched.
3. Select **Restore**.

*Expected:* the dashboard matches the original. Alex's favorites and order are back. Maya appears in Accounts with no devices.

**TC-004 — Restore twice.** Repeat TC-003 step 1. *Expected:* the preview reads "Nothing to change".

**TC-005 — Replace.** *Precondition:* the catalog has an app "Old thing" that isn't in the file. Choose Replace. *Expected:* the preview lists "Old thing" under Delete. Restore stays disabled until `REPLACE` is typed. After restore, "Old thing" is gone and everything in the file is present.

**TC-006 — Stale preview.** Preview a restore. In another tab, add an app with the same slug as one in the file. Back in the first tab, select Restore. *Expected:* "Your dashboard changed since the preview. Preview again." Nothing changes.

**TC-007 — Newer file.** Edit a backup's `schemaVersion` to 99. *Expected:* "This backup is from a newer Homepad. Update Homepad, then try again."

**TC-008 — Homepage import (happy path).** Paste this `services.yaml`:

```yaml
- Media:
    - Sonarr:
        icon: sonarr.png
        href: http://sonarr.host/
        description: Series
        siteMonitor: http://sonarr.host/
        widget: { type: sonarr, url: http://sonarr.host, key: abc123 }
    - Plex:
        icon: mdi-plex
        href: http://plex.host/
- Infra:
    - Router:
        href: http://192.0.2.1
        ping: 192.0.2.1
        target: _self
    - Core:
        - Proxmox:
            icon: https://example.com/proxmox.png
            href: https://pve.host:8006
```

*Expected preview:*
- Sections to add: Media, Infra, "Infra / Core".
- 4 apps to add.
- Sonarr: Dashboard Icons PNG URL; "Widget not imported".
- Plex: "Icon not available (mdi-plex), shows initials".
- Router: opens in the same tab.
- A Gatus snippet with Sonarr (http) and Router (icmp).

After import, `abc123` is nowhere in the DB, the logs or any response.

**TC-009 — Import again after updating Gatus.** Add the snippet to Gatus, wait for a poll, then import the same YAML. *Expected:* 4 apps "Already on your dashboard". Sonarr and Router get a status key, and their tiles show live status.

**TC-010 — Bad input.** Paste a Docker compose file. *Expected:* "This doesn't look like a Homepage services.yaml. It should be a list of groups." with the line number. The Preview button stays enabled for another try.

**TC-011 — A second admin.** As an admin who isn't the first admin, run TC-003 and TC-008. *Expected:* both succeed, and every user sees the result (AC-025).

**TC-012 — Not an admin.** As a user, then as a kid, call each route in §8. *Expected:* 403 for all of them. The Admin Panel section isn't shown.

---

## 7. Data Model

No migration. Everything maps onto existing tables (§1a).

- Restore and import run in one transaction, holding a new advisory lock (`importLockKey`, distinct from `migrateLockKey`), so two applies can't interleave.
- The plan is computed by one pure function, `Plan(current Snapshot, input Parsed) Plan`, used by both preview and apply. `planHash` is the SHA-256 of the plan's canonical JSON. Apply rebuilds the plan inside the transaction (under the lock) and compares hashes before writing.

## 8. API Contract

New, all `admin-only` (`requireNotKid` in front, `requireAdmin` in the handler):

| Method | Path | Body / result |
|---|---|---|
| GET | `/api/admin/export?people=true\|false` | `200 application/json`, `Content-Disposition: attachment; filename="homepad-backup-YYYY-MM-DD.json"`, `Cache-Control: no-store`. Default `people=true`. |
| POST | `/api/admin/restore/preview?mode=merge\|replace` | Body: the backup file (`application/json`, ≤16 MB) → `200 Plan` |
| POST | `/api/admin/restore?mode=merge\|replace&plan={planHash}` | Body: the same file → `200 Result`. `409` if the plan changed. |
| POST | `/api/admin/import/homepage/preview` | `{ "services": "<yaml>", "bookmarks"?: "<yaml>", "settings"?: "<yaml>" }` (each ≤1 MB) → `200 Plan` |
| POST | `/api/admin/import/homepage?plan={planHash}` | Same body → `200 Result` |

`Plan`:

```json
{
  "planHash": "3b1f…",
  "mode": "merge",
  "summary": {
    "create":    { "sections": 2, "apps": 4, "icons": 0, "offers": 0, "kids": 0 },
    "update":    { "sections": 0, "apps": 0, "icons": 0, "offers": 0, "people": 0 },
    "delete":    { "sections": 0, "apps": 0, "offers": 0 },
    "unchanged": 0,
    "skipped":   1
  },
  "items": [
    { "kind": "section", "name": "Media", "action": "create" },
    { "kind": "app", "name": "Sonarr", "section": "Media", "action": "create",
      "warnings": ["widget_dropped"] },
    { "kind": "app", "name": "Grafana", "section": "Infra", "action": "skip",
      "reason": "href_uses_variable" }
  ],
  "ignored": { "fields": 3, "settings": ["title", "theme", "providers"] },
  "gatusSnippet": "endpoints:\n  - name: Sonarr\n …"
}
```

- `reason` and `warnings` are stable codes. The UI owns the words (UX §6), so copy can change without an API change.
- `gatusSnippet` appears only for a Homepage import, and only when an app needs it.
- `Result` is `Plan` without `planHash`, plus `"applied": true`.

Errors (plain-text body, matching the existing handlers):

| Status | When |
|---|---|
| 400 | Malformed JSON or YAML (YAML includes the line), an unknown `mode`, or `plan` missing on apply |
| 401 | No session |
| 403 | Not an admin, or a kid |
| 409 | `planHash` doesn't match the current plan |
| 413 | Body over 16 MB (backup) or a file over 1 MB (Homepage) |
| 422 | Not a Homepad backup; newer schema; not a Homepage services file; over a count limit |

The route-coverage test in `routes_test.go` gets the five new routes with class `admin-only`.

## 9. Security

- **Admin only**, by route class. A kid is refused even if a handler forgets its admin gate (`requireNotKid`).
- **No secrets out:** the export is built from an explicit allow-list of fields. It is never a dump of rows, so a column added later can't leak by default. AC-004's test is the check.
- **Personal data:** emails and personal settings are in the file only with Include people. The UI says what's in the file before download (UX §2).
- **No secrets kept from Homepage:** `widget`, `widgets` and `providers` are dropped during parsing, before planning. They never reach the plan, the logs or the DB (AC-022).
- **URL allow-list:** `url` and `icon` must be `http(s)` or empty on every import and restore write (AC-024). The single-app routes don't check this today (§1a). Closing that gap there too is worth a separate issue; this spec only covers the paths it adds.
- **No outbound fetches:** neither the preview nor apply fetches any URL from the file (OQ-8 (a)). The Gatus snapshot read is the in-memory poller cache.
- **Parser limits:** size caps before parsing (`http.MaxBytesReader`), the YAML aliasing guard, no custom tags, depth ≤8, and count caps (AC-026).
- **Icon bytes** go through the same PNG checks as upload, plus a hash match.
- **Writes land in the shared catalog** through `SharedCatalogOwnerID`, never the acting admin's id (AC-025, `homepad-api#87`).
- **Audit:** one log line per apply, with no file contents (AC-030).

## 10. Frontend Implementation

- A new Admin Panel section, **Backup and import**, sits after the App Library section (UX §1). It holds three actions: Download backup, Restore from backup, Import from Homepage.
- Restore and Homepage import each open a `Modal` with input → preview → done steps (UX §3–§4). The preview renders the `Plan`. Copy for each reason and warning code lives in one map, `src/library/importCopy.ts`.
- Downloading the backup uses a plain `<a href="/api/admin/export?people=…" download>`. The Gatus snippet downloads from a client-side `Blob`, and there's also a Copy button.
- No YAML library in the browser: the server parses (§4.5), so the bundle budget doesn't move.
- New `src/api.ts` calls: `exportUrl(people)`, `previewRestore(file, mode)`, `applyRestore(file, mode, planHash)`, `previewHomepageImport(texts)`, `applyHomepageImport(texts, planHash)`.
- After any apply, the app refetches services, categories and the library, the same way it does after a catalog edit.

## 11. Design (Kare)

UX artifact: [`specs/ux/backup-import-ux.md`](./ux/backup-import-ux.md) (Draft). Surfaces:

1. the Backup and import section in the Admin Panel;
2. the Download backup confirm, with the Include people box;
3. the restore flow: pick a file, pick a mode, preview, the Replace confirm, done;
4. the Homepage import flow: paste or upload three files, preview with skips and warnings, the Gatus snippet, done;
5. the empty-dashboard link for admins (UX B-2).

## 12. Out of Scope

- Scheduled or automatic backups, and API tokens for scripted backups. For now, an admin can back up the database with `pg_dump`, and the docs say how.
- Importing from Homarr, Dashy, Heimdall, Flame or Organizr. The plan/apply engine is built so another source can be added later.
- Exporting to Homepage's format.
- Homepage's widgets, Docker or Kubernetes discovery, tabs, per-group columns or style, backgrounds, and themes.
- Creating adult accounts from a backup, and backing up passwords.
- Copying CDN icons into Homepad (OQ-8 (c)). Possible follow-up.
- Restoring signed-in devices. Kids restored onto a new install need their iPad signed in again.
- Undo after apply. Download a backup first; the UI suggests this before a Replace.

## 13. Sign-offs

| Role | Name | Status |
|---|---|---|
| Product | Caleb | Pending (OQ-1…OQ-9) |
| Design | Kare | Pending (`specs/ux/backup-import-ux.md`, B-1…B-3) |

## 14. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-07 | 0.1.0 | Draft from item 3 of Caleb's approved next-work list, with recommended defaults for OQ-1…OQ-9. |
