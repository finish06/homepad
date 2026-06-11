# homepad — product decisions (Joe)

Decisions made under authority delegated by Caleb → Joe (2026-06-11). Newest on top.

## 2026-06-11 — Per-user "Arrange" toggle becomes a settings **gear** (entry point)

Refinement of the PR #8 Arrange toggle (Caleb's framing, via Joe). The per-user
control is now a **settings-gear icon button** in the header — the **non-admin
settings/controls entry point**, not just a renamed toggle.

- **Gear shown to ALL logged-in users** (not admin-gated), distinct from the
  admin **Edit** toggle, which is untouched.
- **For now the gear toggles personal arrange mode** — same per-user behavior as
  PR #8: off by default → reorder arrows hidden (decluttered view); on → arrows
  shown. **A5 preserved** — a non-admin can still reorder (`PUT /api/layout` is
  not admin-gated). The gear only gates arrow *visibility*.
- **Built as an extensible affordance**, positioned to host future per-user
  controls — deliberately **not** over-built into a settings menu yet.
- **Accessible:** icon button with `aria-label="Personal settings"` and
  `aria-pressed` reflecting arrange state; the gear `<svg>` is `aria-hidden`.
- Implemented test-first on `feat/settings-gear` (replaces the PR #8 text
  toggle; Catalog reorder logic untouched).

## 2026-06-11 — Reorder arrows gated behind a per-user "Arrange" toggle (A5)

Caleb wanted the normal view decluttered — the reorder arrows shouldn't always
show. An earlier read ("arrows only in edit mode") would have made reorder
admin-only, which **conflicts with A5** (personal reorder is every user's, not an
admin power). Resolution (Joe, delegated):

- **Add a lightweight `Arrange` toggle in the header for ALL logged-in users**
  (NOT admin-gated). Off by default → arrows hidden (clean view); on → arrows
  shown. Client-ephemeral, like the admin Edit toggle.
- **Leave the admin Edit toggle untouched.** Edit mode still surfaces the
  icon/delete controls and (as before) hides the arrows.
- **A5 preserved:** a non-admin can still reorder — `PUT /api/layout` is not
  admin-gated. The toggle only controls *visibility* of the arrows, not *who*
  may reorder.
- Implemented test-first on `feat/reorder-edit-mode-gating` (PR #8).

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