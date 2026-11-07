# UX: Backup, restore, and import from Homepage

**Spec:** [`SPEC-backup-import.md`](../SPEC-backup-import.md) §11 (v0.1.0, Draft)
**Author:** Claude for Kare (design), drafted 2026-11-07
**Status:** Draft — awaiting Caleb on B-1…B-3, and on the spec's OQ-1…OQ-9.

This doc designs the five surfaces in spec §11. Everything else reuses what exists: the Admin Panel shell (`SettingsPanel`), `Modal`, the dirty-form confirm from `ServiceForm`, and the section skeletons from the System section.

The wireframes assume the spec's recommended defaults. Where a different answer to an OQ would change a screen, the note says so.

---

## 1. Where it lives

```
Account menu (admin)
  ├─ Appearance
  ├─ My Dashboard  → Go to my dashboard · My settings
  └─ Administration
       ├─ Admin settings        (existing: Accounts · System · Library)
       └─ Accounts              (existing)

Admin Panel
  ACCOUNTS
  SYSTEM
  APP LIBRARY
  BACKUP AND IMPORT             ← NEW, last
```

- **Backup and import is the last section of the Admin Panel.** It changes the whole catalog, so it sits under the amber "Administration" heading that already means "affects everyone". It goes last because it's used rarely, and the sections people use every week stay on top (B-1).
- The account menu doesn't change. "Admin settings" opens the panel, and the section is one scroll away.
- **The empty dashboard gets one link** for admins (B-2), §5.

## 2. Backup and import section

```
┌ Admin Panel ─────────────────────────────────────────── ✕ ┐
│ …                                                          │
│ BACKUP AND IMPORT                                          │
│                                                            │
│ Back up                                                    │
│ One file with your sections, apps, icons, App Library      │
│ and settings.                                              │
│ ☑ Include people (emails, favorites, kids' apps)           │
│                                      [Download backup]     │
│ ───────────────────────────────────────────────────────── │
│ Restore                                                    │
│ Load a Homepad backup file. You'll see the changes first.  │
│                                      [Restore from file…]  │
│ ───────────────────────────────────────────────────────── │
│ Import from Homepage                                       │
│ Bring in your services.yaml. You'll see the changes first. │
│                                      [Import…]             │
└────────────────────────────────────────────────────────────┘
```

- Three rows, each with one line of plain copy and one button on the right, at least 44px tall.
- **Download backup** starts the download at once; there's no extra step. The checkbox sits right above it, so what's in the file is clear before the click.
  - Ticked (default), the hint under the box reads: "The file will include email addresses. Keep it private."
  - Unticked, the hint reads: "No emails or personal settings."
- **While downloading,** the button reads "Preparing…" and is disabled. On success there's nothing more to show; the browser handles the file.
- **Download error:** inline under the button: "Couldn't make the backup. Try again." The rest of the panel still works.
- If the spec's OQ-1 lands on (a) or (b), the checkbox goes away and the description lists only what's in the file.

## 3. Restore flow

A `Modal` over the Admin Panel, with three steps: **Choose → Preview → Done.** The title stays "Restore from backup" throughout, and a small step line under it reads "Step 1 of 3".

### 3.1 Choose

```
┌ Restore from backup ─────────────────────────────── ✕ ┐
│ Step 1 of 3                                            │
│                                                        │
│ Backup file                                            │
│ ┌────────────────────────────────────────────────────┐ │
│ │  Drop a .json file here, or  [Choose file]         │ │
│ └────────────────────────────────────────────────────┘ │
│ homepad-backup-2026-11-07.json · 412 KB · 7 Nov 2026   │
│                                                        │
│ How to restore                                         │
│ (•) Merge — add new items and update matching ones.    │
│            Nothing is deleted.                         │
│ ( ) Replace — delete all apps, sections and App        │
│            Library offers first, then load the file.   │
│                                                        │
│                              [Cancel]   [Preview]      │
└────────────────────────────────────────────────────────┘
```

- **File picker:** the drop zone accepts one `.json` file. Once a file is picked, a line shows its name, size, and the `exportedAt` date read in the browser. A file that isn't JSON gets an inline error before any upload: "This isn't a Homepad backup file."
- **Mode** is a radio group, with Merge selected. Each option has one line saying exactly what it does.
- **Preview** is disabled until a file is picked. While the server works, it reads "Checking…".
- **Server errors** show inline above the buttons, using the copy in §6. The file stays picked, so the admin can switch mode or pick another.

### 3.2 Preview

```
┌ Restore from backup ─────────────────────────────── ✕ ┐
│ Step 2 of 3 · Merge                                    │
│                                                        │
│  Add 2 sections · Add 9 apps · Update 3 apps           │
│  Add 2 icons · Add 1 kid · 1 skipped                   │
│                                                        │
│ ▾ Sections (2 to add)                                  │
│     + Media                                            │
│     + Network                                          │
│ ▾ Apps (9 to add, 3 to update, 4 unchanged)            │
│     + Jellyfin              Media                      │
│     ~ Grafana               Infra   name, icon         │
│     …                                                  │
│ ▾ People                                               │
│     ~ alex@example.com      favorites, order           │
│     + Maya (kid)            sign her iPad in again     │
│     – sam@example.com       skipped: no account with   │
│                             this email                 │
│ ▸ Unchanged (4)                                        │
│                                                        │
│ Nothing changes until you select Restore.              │
│                              [Back]   [Restore]        │
└────────────────────────────────────────────────────────┘
```

- **The summary line comes first,** in plain counts. Zero counts are left out.
- **Groups:** Sections, Apps, App Library, People, Settings, then Unchanged.
  - Groups with changes start expanded; Unchanged starts collapsed.
  - Each row has a mark (`+` add, `~` update, `–` skip or delete), the name, and a short note: which fields change, or why it's skipped.
  - The marks are always paired with words. Color is never the only signal.
- **Warnings** (a bad icon, an unknown field) sit on the row they belong to, in the note column. Warnings that belong to no row go in one line under the summary: "3 fields this version doesn't use were ignored."
- **Nothing to change:** if every count is zero, the body reads "Nothing to change. Your dashboard already matches this backup." The only button is **Close**.
- **Back** returns to Choose with the file and mode kept.
- Over about 50 rows, each group shows its first 20, then "Show all 112".

### 3.3 Replace confirm

When the mode is Replace, the preview adds a Delete group (expanded, first) and a confirm field above the buttons:

```
│ ▾ Delete (6 apps, 1 section, 2 offers)                 │
│     – Old thing             Infra                      │
│     …                                                  │
│                                                        │
│ This deletes everything listed above, and everyone's   │
│ favorites for those apps. Download a backup first if   │
│ you might want it back.         [Download backup]      │
│                                                        │
│ Type REPLACE to confirm  [            ]                │
│                              [Back]   [Replace]        │
```

- The primary button reads **Replace**, styled as destructive. It stays disabled until the field holds `REPLACE` (case-sensitive).
- The in-line **Download backup** uses the same route as §2, so a safety copy is one click away.

### 3.4 Done

```
┌ Restore from backup ─────────────────────────────── ✕ ┐
│ Step 3 of 3                                            │
│                                                        │
│ ✓ Restored.                                            │
│ Added 2 sections and 9 apps. Updated 3 apps.           │
│ Added 1 kid: Maya. Sign her device in from Accounts.   │
│                                                        │
│                                         [Done]         │
└────────────────────────────────────────────────────────┘
```

- **The result repeats the summary, past tense.** A follow-up line appears only when there's something to do: a new kid, or people that were skipped.
- **Done** closes the modal, and the dashboard behind is already refreshed.
- **Stale preview (409):** the modal returns to step 2 with a banner: "Your dashboard changed since the preview. Here's the new one." The new plan is already loaded, so one more click applies it.
- **Failure:** "Restore didn't finish. Nothing was changed." plus the reason, with **Back** and **Try again**.

## 4. Homepage import flow

The same three-step `Modal`: **Add files → Preview → Done.** Title: "Import from Homepage".

### 4.1 Add files

```
┌ Import from Homepage ────────────────────────────── ✕ ┐
│ Step 1 of 3                                            │
│                                                        │
│ services.yaml   (required)                             │
│ [ Paste | Upload ]                                     │
│ ┌────────────────────────────────────────────────────┐ │
│ │ - Media:                                           │ │
│ │     - Sonarr:                                      │ │
│ │         href: http://sonarr.host/                  │ │
│ │ …                                                  │ │
│ └────────────────────────────────────────────────────┘ │
│                                                        │
│ ▸ bookmarks.yaml   (optional)                          │
│ ▸ settings.yaml    (optional, for section order)       │
│                                                        │
│ Apps found by Docker labels or Kubernetes aren't in    │
│ these files, so they won't come across. Your current   │
│ apps stay as they are.                                 │
│                                                        │
│                              [Cancel]   [Preview]      │
└────────────────────────────────────────────────────────┘
```

- **Each file has a Paste / Upload switch** (a segmented control, the same as the click-action control from v21/#428).
  - Paste is a monospace textarea, about 12 lines tall, that grows to 24.
  - Upload accepts one `.yaml` or `.yml` file and shows its name and size.
- **bookmarks.yaml and settings.yaml start collapsed.** Expanding one shows the same switch.
- **The note under the files** says, in two short sentences, what won't come across and that nothing already there changes.
- **Preview** is disabled until services.yaml has content. While working, it reads "Checking…".
- **Parse errors** show under the textarea they belong to, with the line number. For a pasted file, the matching line in the textarea is selected.
- **Closing with text entered** asks "Discard this import?" (the `ServiceForm` dirty confirm).
- If OQ-5 lands on (a), the two optional rows go away.

### 4.2 Preview

```
┌ Import from Homepage ────────────────────────────── ✕ ┐
│ Step 2 of 3                                            │
│                                                        │
│  Add 3 sections · Add 11 apps · 2 already here         │
│  1 skipped                                             │
│                                                        │
│ ▾ Media (new section)                                  │
│     + Sonarr         icon ✓   widget not imported      │
│     + Plex           shows initials (mdi-plex)         │
│     = Jellyfin       already on your dashboard         │
│ ▾ Infra / Core (new section)                           │
│     + Proxmox        icon ✓                            │
│ ▾ Skipped                                              │
│     – Grafana        link uses a Homepage variable.    │
│                      Add it by hand.                   │
│                                                        │
│ ▾ Status checks                                        │
│   2 apps had siteMonitor or ping. Homepad reads status │
│   from Gatus. Add these to your Gatus config, then     │
│   import again to turn on their status.                │
│   ┌──────────────────────────────────────────────────┐ │
│   │ endpoints:                                       │ │
│   │   - name: Sonarr                                 │ │
│   │     group: Media                                 │ │
│   │ …                                                │ │
│   └──────────────────────────────────────────────────┘ │
│                [Copy]  [Download gatus-endpoints.yaml] │
│                                                        │
│ Not imported: widgets, Docker stats, tabs, theme,      │
│ background. (5 settings)                               │
│                                                        │
│ Nothing changes until you select Import.               │
│                              [Back]   [Import 11 apps] │
└────────────────────────────────────────────────────────┘
```

- **The preview is grouped by section,** in the order the sections will appear.
  - Each app row has a mark (`+` add, `=` already here, `–` skipped), the name, and a short note.
  - The icon shows as a 24px thumbnail when it has a URL, or as the initials badge when it doesn't, so the admin sees what the tile will look like.
- **Skipped** collects every entry that won't import, each with its reason and what to do.
- **Status checks** appears only when the file has `siteMonitor` or `ping`.
  - The snippet is read-only, monospace, and scrolls inside its box.
  - **Copy** confirms with "Copied" for 2 seconds.
  - If OQ-9 lands on (a), this block becomes one line: "2 apps had status checks. Set up status for them in Gatus."
- **The "Not imported" line** lists the categories of what was dropped, in plain words, and keeps the full field list out of the way.
- **The primary button names the count:** "Import 11 apps". If there's nothing to add, the body reads "Everything here is already on your dashboard." The only button is **Close**, and the Status checks block still shows if it applies.
- **Re-import after a Gatus change:** rows for existing apps read "= Jellyfin · already here · status turned on", and the button reads "Turn on status for 2 apps".

### 4.3 Done

```
│ ✓ Imported 11 apps into 3 new sections.                │
│ They're at the end of your dashboard. Other people see │
│ them A–Z until they arrange their own.                 │
│                                                        │
│ Next: add the status checks to Gatus.   [Copy snippet] │
│                                         [Done]         │
```

- **The "Other people see them A–Z" line** shows only when other accounts exist (spec §4.4).
- **The Next line** shows only when there's a snippet.
- **Stale preview and failure** behave as in §3.4, with "Import" in place of "Restore".

## 5. Empty dashboard (admin)

When the catalog has no apps and the viewer is an admin, the dashboard body shows:

```
┌──────────────────────────────────────────────┐
│            No apps yet.                      │
│                                              │
│   [+ Add an app]   [Browse the App Library]  │
│                                              │
│   Coming from Homepage?                      │
│   Import your services.yaml                  │
└──────────────────────────────────────────────┘
```

- **"Import your services.yaml" is a text link.** It opens §4 directly, over the dashboard.
- **Users see no link.** Kids keep their own empty state ("No apps yet. Ask a grown-up to add some.").
- The link goes away once there's one app. It's for new installs (B-2).

## 6. Copy for reason and warning codes

One map in `src/library/importCopy.ts`. Every message is one or two short sentences, and says what to do when there's something to do.

| Code | Copy |
|---|---|
| `not_a_backup` | This isn't a Homepad backup file. |
| `schema_newer` | This backup is from a newer Homepad. Update Homepad, then try again. |
| `not_homepage_services` | This doesn't look like a Homepage services.yaml. It should be a list of groups. |
| `yaml_syntax` | There's a problem on line {n}: {detail}. |
| `too_large` | This file is too big. Backups can be up to 16 MB, and Homepage files up to 1 MB. |
| `too_many` | This file has {count} {things}. The limit is {limit}. |
| `plan_changed` | Your dashboard changed since the preview. Here's the new one. |
| `no_link` | No link. |
| `bad_scheme` | Link isn't http or https. |
| `href_uses_variable` | Link uses a Homepage variable. Add it by hand. |
| `already_here` | Already on your dashboard. |
| `widget_dropped` | Widget not imported. |
| `icon_local` | Local icon files can't be copied. Upload it on the app. |
| `icon_glyph` | Shows initials ({icon}). |
| `icon_invalid` | Icon skipped: not a valid PNG. |
| `adult_no_account` | Skipped: no account with this email. |
| `kid_needs_device` | Sign their device in again from Accounts. |
| `ref_missing` | {n} favorites or order entries pointed at apps not in the file. |
| `unknown_fields` | {n} fields this version doesn't use were ignored. |
| `status_on` | Status turned on. |
| `network` | Couldn't reach Homepad. Check your connection and try again. |

## 7. Accessibility

- **Both modals:**
  - each step change moves focus to the step's heading;
  - the step line is part of the heading's accessible name ("Restore from backup, step 2 of 3");
  - Escape closes the modal; with input entered, it asks first.
- **Drop zones** are real `<input type="file">` controls with a visible label. Drag and drop is an extra, never the only way.
- **Preview groups** are disclosure buttons (`aria-expanded`). Each row's mark has a text equivalent ("Add", "Update", "Skip", "Delete", "Already here").
- **The REPLACE field** has a visible label and `aria-describedby` pointing at the warning text.
- **The snippet box** is a read-only `<textarea>`, so screen readers and keyboard selection work, labelled "Gatus endpoints".
- **"Copied" status** is announced through an `aria-live="polite"` region.
- **Touch:** every button and disclosure is at least 44×44px, and the modals work at 820px wide (iPad portrait).

## 8. Screenshot checkpoints (for TC-001…TC-012)

1. The Backup and import section, with Include people ticked and unticked, at 1440 and 820.
2. Restore step 1 with a file picked, at 820.
3. Restore preview, Merge, with adds, updates and one skipped person, at 1440.
4. Restore preview, Replace, with the Delete group and the confirm field, at 820.
5. The restore "Nothing to change" state.
6. Homepage step 1, services pasted and bookmarks expanded, at 1440.
7. Homepage preview with a skipped app, an initials icon and the Status checks block, at 1440 and 820, dark and light.
8. The Homepage done state with the Next line.
9. The admin empty dashboard with the import link, at 1440.
10. A YAML parse error with the line selected.

## 9. Decisions for Caleb

- **B-1: Where the section sits.** I put it last in the Admin Panel. The alternative is its own menu item under Administration. **Recommended: last section, no menu item.**
- **B-2: Empty-dashboard link.** An admin with no apps sees "Coming from Homepage? Import your services.yaml". The alternative is the Admin Panel only. **Recommended: show the link.** It's the switch path for new installs from the M7 launch.
- **B-3: Preview length.** Long previews show the first 20 rows per group, then "Show all". The alternative is to show every row. **Recommended: first 20, then Show all.**

## Sign-off

| Role | Name | Status |
|---|---|---|
| Design | Kare | Drafted 2026-11-07 |
| Product | Caleb | Pending (B-1…B-3) |
