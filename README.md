<p align="center">
  <img src="./docs/banner.svg" alt="Homepad" width="100%">
</p>

<p align="center">
  <strong>The self-hosted homelab dashboard for the whole household.</strong><br>
  Every service in one place, with live health, and a personal view for everyone under your roof.
</p>

<p align="center">
  <a href="https://gethomepad.dev">Website</a> ·
  <a href="https://demo.gethomepad.dev">Live demo</a> ·
  <a href="#quickstart">Quickstart</a> ·
  <a href="#how-it-compares">Compare</a> ·
  <a href="./docs/development.md">Develop</a>
</p>

<p align="center">
  <a href="https://github.com/finish06/homepad/tags"><img src="https://img.shields.io/github/v/tag/finish06/homepad?label=release&sort=semver" alt="Latest release"></a>
  <a href="https://github.com/finish06/homepad/pkgs/container/homepad"><img src="https://img.shields.io/badge/ghcr.io-amd64%20%7C%20arm64-2496ED?logo=docker&logoColor=white" alt="Docker images for amd64 and arm64"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/finish06/homepad/stargazers"><img src="https://img.shields.io/github/stars/finish06/homepad?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <img src="./docs/screenshots/desktop-dark.webp" alt="Homepad dashboard in dark mode: 52 self-hosted apps grouped into Monitoring, Dashboards, Photos and Media, every tile showing Online with its response time, under an 'All systems operational' banner" width="100%">
</p>

## Try it in 10 seconds

**[demo.gethomepad.dev](https://demo.gethomepad.dev)**, log in with `homepad@gethomepad.dev` / `homepad1`. There's no signup. The demo may take about 15 seconds to wake up.

## Quickstart

You need Docker with Compose v2.23 or newer. Nothing else to clone or build:

```bash
mkdir homepad && cd homepad
curl -fsSLO https://raw.githubusercontent.com/finish06/homepad/main/compose.yaml
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > .env
docker compose up -d
```

Open **http://localhost:8080** and register: **the first account becomes the admin.** Then set `HOMEPAD_REGISTRATION=invite_only` in `.env` and run `docker compose up -d` again, so only you can add accounts.

Next steps:
- **Add your apps.** Pick from the built-in App Library of 50+ self-hosted apps with icons, or add your own.
- **Live status.** Connect [Gatus](https://gatus.io): add `COMPOSE_PROFILES=gatus` and `GATUS_BASE_URL=http://gatus:8080` to `.env` to run one alongside. See [docs/monitoring.md](./docs/monitoring.md).
- **Kids.** Give a kid a dashboard with only the apps you choose, signed in on the family iPad for months. See [docs/kid-accounts.md](./docs/kid-accounts.md).
- **Single sign-on.** See [SSO](#single-sign-on) below.
- **Update** with `docker compose pull && docker compose up -d`.

Images: `ghcr.io/finish06/homepad` and `ghcr.io/finish06/homepad-api`, for linux/amd64 and linux/arm64 (so a Raspberry Pi works). They're pinned by `HOMEPAD_VERSION` in `.env`.

## Why Homepad

Homepad is a dashboard for a household. The admin keeps one list of apps. Everyone in the house signs in and gets their own view of it.

- **Sign in, built in.** Local accounts, or OIDC with PKCE from a provider such as PocketID. Members of your admin group become admins. See [Single sign-on](#single-sign-on).
- **Edit in the browser.** The admin adds and edits apps, sections and icons in the browser. Pick from the App Library or add your own. Each tile opens in a new tab, the same tab, or an overlay.
- **A view for each person.** Each person keeps their own favorites, tile order, theme and tile size.
- **Light, dark or system.** Each person picks Light, Dark or System. System follows the device as it changes. The theme is set before the page draws, so it does not flash on load.
- **Live status, checked on the server.** Each tile can show UP, DEGRADED or DOWN, its response time and recent uptime, from [Gatus](https://gatus.io). The API asks Gatus. The browser gets only each tile's result, never the addresses Gatus checks. Admins can see the Gatus address in Settings.
- **Kid accounts.** A kid account is a name and a color, with only the apps you pick. See [docs/kid-accounts.md](./docs/kid-accounts.md).
- **Installs like an app.** Add it to the home screen of a phone or iPad. Touch-sized targets.
- **Fast to get around.** ⌘K search across every app, apps grouped into sections, and Large, Compact or List tiles.

<p align="center">
  <img src="./docs/screenshots/desktop-light.webp" alt="Homepad dashboard in light mode" width="68%">
  &nbsp;
  <img src="./docs/screenshots/phone-dark.webp" alt="Homepad on a phone, dark mode" width="24%">
</p>

## How it compares

Each cell was checked on 2026-11-07 against the project's own docs and code: Homepage 2.7, Homarr 2.12, Dashy 4.9 and Heimdall 2.8. If something here is wrong or out of date, please open an issue.

|  | Homepad | Homepage | Homarr | Dashy | Heimdall |
|---|:-:|:-:|:-:|:-:|:-:|
| Each person signs in to their own dashboard | ✓ | ✕ ¹ | ✓ | ⚠ ² | ✓ |
| Add and edit apps in the browser | ✓ | ✕ | ✓ | ✓ | ✓ |
| Built-in OIDC sign-in | ✓ | ✓ ¹ | ✓ | ✓ | ✕ ⁴ |
| Live status, checked on the server | ✓ | ✓ | ✓ | ✓ | ✕ ⁴ |
| The address being checked stays off the browser | ✓ | ✕ ³ | ✕ ³ | ✕ ³ | ✕ |
| Installs to the home screen (PWA) | ✓ | ✓ | ✓ | ✓ | ✕ |

✓ yes · ⚠ partly, see the note · ✕ no

1. Homepage has an optional login since 2.0: one shared password, or OIDC. Everyone who signs in sees the same page. Apps are set in YAML files.
2. Dashy lists users in its config file. The admin can hide sections or items for some users. Everyone else sees the same dashboard.
3. Homepage, Homarr and Dashy run status checks on the server. The address each check uses is also sent to the page. Homepad sends the page only the result.
4. Heimdall has local users and can trust a sign-in header from a proxy. It has no up or down status checks.

Homepage has more than 100 service widgets and can run next to Homepad. Homepad has no service widgets.

## Single sign-on

Local accounts work out of the box. To add OIDC, set in `.env`:

```dotenv
OIDC_ENABLED=true
OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=homepad
OIDC_CLIENT_SECRET=...
OIDC_REDIRECT_URL=https://homepad.example.com/api/auth/oidc/callback
OIDC_ADMIN_GROUP=admins        # optional: members of this group become admins
```

Register the redirect URL with your provider, then run `docker compose up -d`. With `OIDC_ENABLED=false`, the SSO endpoints aren't registered and the login screen shows local sign-in only.

## Running it for real

- **HTTPS.** Put Homepad behind your reverse proxy (Traefik, Caddy, nginx, Pangolin…) and set `COOKIE_SECURE=true`. Leave it `false` only for plain `http://localhost`, or the login cookie is dropped.
- **Port.** Set `HOMEPAD_WEB_PORT` (default 8080).
- **Data.** Everything lives in the `homepad_pg` Postgres volume; the web and API containers are disposable. Back that volume up.
- **All settings** are documented in [`.env.example`](./.env.example).

## Project

- **Docs:** [monitoring](./docs/monitoring.md) · [kid accounts](./docs/kid-accounts.md) · [development](./docs/development.md) · [changelog](./CHANGELOG.md)
- **Backend:** [finish06/homepad-api](https://github.com/finish06/homepad-api) (Go + Postgres)
- **Contributing:** issues and PRs are welcome. Start with [docs/development.md](./docs/development.md).
- **License:** [MIT](./LICENSE)

If Homepad is useful to your household, a ⭐ helps other homelabbers find it.
