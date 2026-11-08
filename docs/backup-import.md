# Backup, restore, and import from Homepage

Homepad keeps your dashboard in Postgres. From the Admin Panel you can download
all of it as one file, load that file back, and bring in a Homepage
configuration. Only admins see these tools.

Open the account menu (your avatar, top right), then **Administration → Admin
settings**. **Backup and import** is the last section of the Admin Panel.

The web app and homepad-api need to be from the same release for these tools to
work.

- [Back up](#back-up)
- [Restore](#restore)
- [Import from Homepage](#import-from-homepage)
- [Scheduled backups](#scheduled-backups)
- [The backup file](#the-backup-file)

## Back up

Select **Download backup**. Your browser saves `homepad-backup-YYYY-MM-DD.json`.

The file holds:

- every section, in order, with its width;
- every app: name, description, link, icon, section, click action and status key;
- uploaded icons, inside the file;
- the App Library, in order;
- System settings: the uptime default for new accounts and the slow threshold.

**Include people** is ticked by default. With it ticked, the file also holds:

- each adult, by email: display name, color, appearance, favorites, app order
  and folded sections;
- each kid, by name: color, appearance, allowed apps and favorites.

That means the file holds email addresses. Keep it private. Untick **Include
people** to leave all of that out, for example to share your setup with someone.

A backup never holds passwords, sign-ins, single sign-on settings, environment
settings or the Gatus address.

Two backups of a dashboard that hasn't changed are the same apart from the
`exportedAt` line, so a backup is easy to keep in git.

## Restore

Select **Restore from file…** and choose a backup file. Then choose how to
restore:

- **Merge** (the default) adds what's new and updates what matches. Nothing is
  deleted. Sections match by name, apps by their slug, and App Library offers by
  name and link. For a match, the file wins.
- **Replace** deletes every app, section and App Library offer first, then loads
  the file. Deleting apps also removes everyone's favorites and order for them,
  and kids' allowed apps. To go ahead you type `REPLACE`. Download a backup first
  if you might want the old dashboard back.

Select **Preview**. The preview lists what will be added, updated, deleted and
skipped, and why. Nothing changes until you select **Restore** (or **Replace**).
If the dashboard changed after the preview, Homepad shows the new preview and
you select Restore again.

A restore is all or nothing. If anything fails, nothing changes.

People are always merged, in both modes:

- **Adults** match by email. A restore never creates or deletes an adult,
  because the file has no password. An adult in the file with no account here is
  skipped. Ask them to sign up first, then restore again.
- **Kids** match by name. A kid in the file who isn't here is created. Sign
  their device in again from **Accounts**. A kid who isn't in the file is left
  alone.
- For each match, favorites from the file are added, and app order and folded
  sections are set from the file.

Restoring the same file twice changes nothing the second time.

Backups can be up to 16 MB. The compose install allows that out of the box. If
you run Homepad behind your own reverse proxy, allow a 16 MB request body on
`/api/`.

## Import from Homepage

If you used [Homepage](https://gethomepage.dev), you can bring your services in.
Select **Import…** and paste or upload your Homepage files:

- `services.yaml` (required);
- `bookmarks.yaml` (optional);
- `settings.yaml` (optional). Homepad reads only `layout`, for the order of new
  sections, and `target`, for how links open.

Select **Preview** to see what will come across. An import only adds. It never
deletes, renames or moves what's already on your dashboard.

- Each Homepage group becomes a section. A nested group becomes a section
  named `Parent / Child`. New sections go after your existing ones.
- An app whose link is already on your dashboard is skipped as "Already on your
  dashboard". So importing the same file again adds nothing.
- Imported apps keep Homepage's order on your own dashboard. Other people see
  them A–Z until they arrange their own.
- Icons: a link stays a link. A Dashboard Icons name such as `sonarr.png`, or a
  selfh.st name such as `sh-sonarr`, becomes the same CDN link Homepage uses, for
  example `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/sonarr.png`.

### Status checks

Homepad reads status from [Gatus](https://github.com/TwiN/gatus). When an app
has `siteMonitor` or `ping`, the preview shows a Gatus snippet for it. Copy or
download the snippet, add it to your Gatus config, and restart Gatus. Then run
the same import again. Each app is "Already on your dashboard", and its status
turns on.

For example, this `services.yaml` entry:

```yaml
- Media:
    - Sonarr:
        icon: sonarr.png
        href: http://sonarr.home.arpa/
        siteMonitor: http://sonarr.home.arpa/
```

gives this snippet:

```yaml
endpoints:
  - name: Sonarr
    group: Media
    url: "http://sonarr.home.arpa/"
    interval: 60s
    conditions:
      - "[STATUS] < 400"
```

A `ping` (for example `ping: 192.0.2.1`) becomes an `icmp://192.0.2.1` endpoint
with the condition `[CONNECTED] == true`.

### What doesn't carry over

- **Widgets** (`widget`, `widgets`). They often hold API keys, so Homepad drops
  them without storing or showing them.
- **Docker and Kubernetes discovery.** Apps found by Docker labels or
  Kubernetes aren't in `services.yaml`. Docker stats (`server`, `container`,
  `showStats`) and Kubernetes settings (`app`, `namespace`, `podSelector`) are
  dropped too.
- **Layout styling:** tabs, per-group `style`, `columns`, `header`, `icon` and
  `initiallyCollapsed`.
- **Look and feel:** `title`, `theme`, `color`, `background` and the other
  `settings.yaml` keys. `providers` can hold secrets, so it is never stored or
  shown.
- **`mdi-` and `si-` icons.** Those tiles show their initials.
- **Local icon files** such as `/icons/router.png`. Upload the icon on the app
  after the import.
- **Links that use Homepage variables** (`{{HOMEPAGE_VAR_…}}`,
  `{{HOMEPAGE_FILE_…}}`). Add those apps by hand.
- **`siteMonitor` and `ping`** become the Gatus snippet above. Homepad has no
  checks of its own.

Each Homepage file can be up to 1 MB, with up to 1,000 apps and 200 sections.

## Scheduled backups

The Admin Panel download is a manual backup. For a backup on a schedule, back up
the Postgres database with `pg_dump`, for example from cron on the host:

```sh
docker compose exec -T postgres pg_dump -U homepad homepad > homepad-$(date +%F).sql
```

Use the user and database names from your `.env`.

## The backup file

The file is pretty-printed JSON. It starts with:

```json
{ "format": "homepad-backup", "schemaVersion": 1, "exportedAt": "…", "homepadVersion": "…" }
```

Every later Homepad can restore a version 1 file. A file from a newer Homepad
than yours is refused with "This backup is from a newer Homepad. Update
Homepad, then try again."

The JSON Schema for version 1 is `docs/schema/homepad-backup-v1.json` in
[homepad-api](https://github.com/finish06/homepad-api).
