# homepad — product decisions (Joe)

Decisions made under authority delegated by Caleb → Joe (2026-06-11). Newest on top.

## 2026-06-11 — v3 theme-mode (Q1–Q3): all confirmed as Stitch recommended

- **Q1 — Control placement → Header user-menu.** Lowest footprint; can migrate to a
  dedicated Settings page (v6) later with no API change.
- **Q2 — Write endpoint → `PATCH /api/me {themePref}`.** One home for future per-user
  account fields; matches the existing `GET /api/me` read model.
- **Q3 — Persistence → per-user Postgres** (`users.theme_pref`, migration `0003`) +
  `localStorage` as a first-paint anti-flash cache only. Matches v1 favorites/layout
  (personal state lives server-side, follows the account across devices).
- **Build order:** backend slice first (migration + `GET`/`PATCH /api/me`), then the
  web `ThemeProvider` + the three-segment control.