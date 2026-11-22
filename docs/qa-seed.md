# QA seed

Each per-PR preview starts with an empty database. The QA seed turns it into
one known starting state, so every QA brief can start from the same page.
QA briefs rely on the names and settings below. If you change the fixture,
change this page in the same commit (`tests/infra/seed-qa.test.ts` checks
that every name here matches `scripts/qa-fixture.json`).

## Run it

```bash
QA_EMAIL=… QA_PASSWORD=… bash scripts/seed-qa.sh <homepad-url>
```

- `<homepad-url>` is the address the web app is served on, with no path,
  for example `http://localhost:5173`. The seed calls `<homepad-url>/api/…`.
- `QA_EMAIL` and `QA_PASSWORD` come from the environment (in CI, from a
  secret). They are never printed. The password needs at least 8 characters.
- `SEED_WAIT_SECONDS` (default 60) is how long it waits for the API to
  answer before giving up.
- It needs Node 20 or newer and nothing else: no `npm ci`, no `curl`, no
  `jq`. The work is in `scripts/seed-qa.js`; `seed-qa.sh` only checks that
  Node is there.

It talks to the public HTTP API only. No SQL and no database dump, so it keeps
working when the schema changes.

## What it does

1. If the install has no adult account yet, it registers `QA_EMAIL`. The
   first adult on an empty install always becomes admin, whatever
   `HOMEPAD_REGISTRATION` says.
2. It signs in as `QA_EMAIL` and checks the account is admin.
3. It creates whatever part of the fixture is missing and puts back anything
   that differs from it. Then it reads everything back and checks it.
4. It signs out.

Running it again is safe. A second run writes nothing and ends with
`already in the QA starting state`. If a QA run changed a fixture item (say,
turned an overlay setting off), the next run puts it back. It never deletes
anything, so apps, sections or accounts that QA added stay.

Sections and the kid are matched by name. Apps are matched by slug, because
the slug is the one thing the API keeps unique; a renamed fixture app gets its
name back.

## When it fails

It exits 1 with one line starting `seed-qa: FAILED:` when:

- any request gets an HTTP status it did not expect (the line names the
  request, the status and the API's message),
- the address answers with something that isn't the API (for example the
  web app's HTML page),
- the install already has accounts and `QA_EMAIL` can't sign in (someone
  else registered first, or the password is wrong),
- the QA account is not admin (someone else registered first),
- after seeding, the fixture does not read back exactly.

A missing URL, `QA_EMAIL` or `QA_PASSWORD` exits 2. A preview whose seed
failed must not go to QA.

## The fixture

After seeding, the install has exactly this, plus anything QA added.

### Accounts

| Account | Role | Notes |
|---|---|---|
| `QA_EMAIL` | admin | the first account; signs in with `QA_PASSWORD` |
| **QA Kid** | kid | avatar color green; sees only its 3 allowed apps |

### Sections

In this order, at the top of the App Grid:

| Section | Width |
|---|---|
| **Media** | 6 of 12 columns (half) |
| **Tools** | 6 of 12 columns (half) |
| **Kids** | 12 of 12 columns (full) |

### Apps

Within a section, apps sort by name (no one has a saved order yet). No app
has an icon, a Gatus key or a widget, so every status reads Unknown.

| App | Slug | Section | Click action | Let this app keep its sign-in | Address |
|---|---|---|---|---|---|
| **Movies** | `qa-movies` | Media | New tab | off | `https://example.com/movies` |
| **Music** | `qa-music` | Media | Same tab | off | `https://example.com/music` |
| **Overlay Keeps Sign-in** | `qa-overlay-keeps-signin` | Tools | Inline overlay | **on** | `https://example.org/` |
| **Overlay Strict** | `qa-overlay-strict` | Tools | Inline overlay | **off** | `https://example.net/` |
| **Kids Games** | `qa-kids-games` | Kids | New tab | off | `https://example.org/games` |
| **Kids Videos** | `qa-kids-videos` | Kids | New tab | off | `https://example.net/videos` |
| **Notes** | `qa-notes` | none (Uncategorized) | New tab | off | `https://example.com/notes` |

The two overlay apps are on another origin than Homepad, so the setting
decides their sandbox: **Overlay Keeps Sign-in** opens with
`allow-same-origin`, **Overlay Strict** without it. The addresses are the
reserved example domains, so they point at nothing real.

### Kid's allowed apps

**QA Kid** may open these three, and nothing else:

- **Kids Games** (`qa-kids-games`)
- **Kids Videos** (`qa-kids-videos`)
- **Overlay Strict** (`qa-overlay-strict`)

So the kid sees the **Kids** section and the **Tools** section (with only
Overlay Strict in it). **Media**, **Notes** and **Overlay Keeps Sign-in** are
hidden. A kid has no password: as the QA admin, open **Accounts** in the Admin
Panel, tap QA Kid and choose **Sign in this device as QA Kid**.

### Widgets

- **Clock**: on, 24-hour. It shows the time in each viewer's time zone and
  needs no outside service.
- **Weather**: off. It would call Open-Meteo, which a preview may not reach.
- **Web search**: left at the default (off).

There is no tile widget. All three tile widget types (Jellyfin, Sonarr,
Radarr) read numbers from a running app with an API key, and a preview has
none. The clock is the status widget that works with no network.

### Not touched

The App Library (the API fills it on first boot), other system settings,
and the admin's own preferences (theme, density, display name) keep the
API's defaults.
