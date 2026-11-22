# Spec: Stricter iframe sandbox, with a per-app opt-in

**Spec ID:** SPEC-iframe-sandbox-optin
**Version:** 0.1.4
**Created:** 2026-11-19
**Author:** Claude (spec step for Caleb's 18.0.0 theme, "a household you can manage")
**Status:** SHIPPED — 18.0.0 (2026-11-22). Approved — Caleb, 2026-11-20: every §0 question decided. Status line read "Approved" until 2026-11-22.
**Repo:** `Code/homepad` (overlay, tile editor, nginx headers) + `Code/homepad-api` (column, read and write model, backup field)
**Estimate:** ~1.5 days (migration, API field, backup field, overlay sandbox rule, tile-edit toggle, frame headers, tests)
**Depends on:** SPEC-tile-click-action (v23, shipped 14.0.0), SPEC-backup-import (the App field list), SPEC-household-catalog-owner (ships in the same release; migration runner)
**Target version:** 18.0.0
**UX:** [`specs/ux/iframe-sandbox-optin-ux.md`](./ux/iframe-sandbox-optin-ux.md) (APPROVED 2026-11-20, I-1…I-4)
**Issues folded in:** homepad #334 (M3)

---

## 0. Open questions — decisions for Caleb

All questions are decided.

**Decided (Caleb, 2026-11-19):** the overlay's sandbox drops `allow-same-origin` by default. An admin can turn it back on per app.

**Decided — Q1, existing "Inline overlay" apps on upgrade (Caleb, 2026-11-19: "keep them opt in").** [AC-008, §10] Migration 0023 turns the opt-in on for every app whose click action is already `iframe`. New apps, and apps switched to Inline overlay later, start with it off. The reasoning: the danger of `allow-same-origin` is real only when the framed page has the same origin as Homepad (§3). This spec blocks that case outright, whatever the setting (AC-004), and stops Homepad's own pages from being framed (AC-006). Turning the opt-in off on upgrade would break sign-in inside most embedded apps (§3.2), with nothing that points the admin at the upgrade.

**Decided — Q4, nothing can frame Homepad (Caleb, 2026-11-19: "yes").** [AC-006, §10] Both nginx configs send `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. This closes the redirect path in §3.1 and the quickstart's missing header (§1a). The release note says that showing Homepad inside another page or dashboard stops working.

**Decided — Q2, who sets it (Caleb, 2026-11-20): A.** [AC-010] Admins, in the tile editor.

**Decided — Q3, same-origin apps (Caleb, 2026-11-20): A.** [AC-004] They never get `allow-same-origin`. The toggle shows greyed out with a reason.

---

## 1. Overview

A tile can open its app in an overlay on top of Homepad (click action **Inline overlay**). The overlay is an `<iframe>` with a sandbox that allows scripts and keeps the app's own origin. For an app on the same origin as Homepad, those two together let the app's scripts reach into Homepad. This spec makes the overlay stricter by default and adds a per-app opt-in for apps that need their own origin to work.

### 1a. What exists today (checked in the code, `homepad` `gitea/main` at `6eb8a35`, `homepad-api` `gitea/main` at `79e3b03`)

- **The sandbox string** is a constant in `src/grid/IframeOverlay.tsx`, line 21: `const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups';`. It is applied on line 130 (`sandbox={SANDBOX}`) of the `<iframe>` in `IframeOverlay`. `src={safeHref(service.url)}`.
- **The test pins both tokens.** `src/grid/IframeOverlay.test.tsx` lines 47–48 expect the sandbox to contain `allow-scripts` and `allow-same-origin` (its title says "a restrictive sandbox (AC-005)").
- **The spec set it this way on purpose:** SPEC-tile-click-action §5.4 lists the same four tokens and says it is "permissive enough for most self-hosted apps while preventing top-navigation and plugins".
- **Homepad's own pages can be framed by Homepad.** `nginx-security-headers.conf` sends `X-Frame-Options: SAMEORIGIN` (included by every location in `nginx.conf`, the image's config), and its comment says there is no Content-Security-Policy yet (the inline anti-flash script blocks one).
- **The quickstart's nginx sends no frame header at all.** `deploy/compose/nginx.conf` (the config the quickstart mounts) has only `Cache-Control` headers and doesn't include the snippet. A quickstart install can be framed by any site.
- **Who sets the click action:** admins only. `POST`/`PATCH /api/services…` are `classCatalogWrite` (`internal/api/server.go`). `services.click_action` is `NOT NULL DEFAULT 'new_tab'` with a CHECK of `new_tab | same_tab | iframe` (migration 0011). Kids see iframe tiles from their allow-list (SPEC-kid-accounts OQ-4).
- **Tile editor:** `src/grid/TileEditModal.tsx` has a three-way **Click action** control (`CLICK_ACTION_SEGMENTS`, around line 19) with a hint line under it (`CLICK_ACTION_HINT`). Save sends `clickAction` only when it changed (`handleSave`).
- **Backup:** `transfer.App` (`internal/transfer/backup.go`) carries `clickAction`. SPEC-backup-import §2.3 says an optional new field does not bump `schemaVersion`. `DecodeBackup` counts unknown fields and the preview reports them.
- **Issue #334's text was not available** to this spec (the Gitea issue needs a login). The scope here is from Caleb's brief and the code.

### 1b. Decisions

- Caleb, 2026-11-19: stricter by default, per-app opt-in.
- Caleb, 2026-11-19: existing Inline overlay apps stay opted in on upgrade (Q1, "keep them opt in").
- Caleb, 2026-11-19: `X-Frame-Options: DENY` and `frame-ancestors 'none'` on both nginx configs (Q4, "yes").
- Caleb, 2026-11-20: admins set it, in the tile editor (Q2 A).
- Caleb, 2026-11-20: apps on Homepad's own origin never get `allow-same-origin`; the switch shows greyed out with a reason (Q3 A).

---

## 2. Model

### 2.1 The two sandboxes

| App setting | `sandbox` value |
|---|---|
| Default (off) | `allow-scripts allow-forms allow-popups` |
| Opt-in (on), app on another origin | `allow-scripts allow-same-origin allow-forms allow-popups` |
| Opt-in (on), app on Homepad's own origin | `allow-scripts allow-forms allow-popups` (Q3: the opt-in is ignored) |

No other token changes. `allow-top-navigation` and `allow-popups-to-escape-sandbox` stay off.

### 2.2 What the admin sees

- In the tile editor, when **Inline overlay** is chosen, a switch appears under the hint: **Let this app keep its sign-in**. Help line: "Turn this on if the app asks you to sign in every time, or stays blank. Only for apps you trust."
- When the app's address has Homepad's own origin, the switch is off and greyed out, with: "Not available for pages on this Homepad's own address."
- When the address can't be parsed, the switch is off and greyed out, with: "Enter the app's full address first, like https://app.example." (UX I-1.) The greyed-out state doesn't change the saved value, and Save doesn't send it (UX I-2).
- The switch is hidden for New tab and Same tab. Its value is kept, so switching back to Inline overlay restores it.

### 2.3 Origin check

"Same origin" means same scheme, host and port as `window.location` of the Homepad page, compared after `safeHref` and `new URL(...)`. A URL that can't be parsed counts as same-origin (fail closed: no `allow-same-origin`).

---

## 3. Threat model

### 3.1 What `allow-same-origin` with `allow-scripts` allows

- **App on Homepad's origin** (the tile points at Homepad itself, or at an app the same reverse proxy serves under a path on Homepad's host): the framed page runs as Homepad. Its scripts can read `parent.document`, remove the iframe's own `sandbox` attribute and reload unsandboxed, read what Homepad shows on screen (including an invite or reset link while its dialog is open), and call `/api/…` with the viewer's session. The session cookie is `HttpOnly`, so it can't be read, but it is sent. If the viewer is an admin, a script in that app can act as the admin. A single stored-XSS bug in a path-routed app becomes a Homepad admin takeover.
- **App on another origin:** the app runs as itself, with its own cookies and storage. It can't read Homepad's page or call Homepad's API with the viewer's cookies in a way it can read (the browser's same-origin rules apply, and Homepad's API has no CORS). This is how the app behaves in a normal tab.
- **App on a sibling subdomain (same site):** another origin, so the point above applies. Homepad's `SameSite=Lax` cookie goes with same-site requests whether or not the frame is sandboxed, as it would from a normal tab of that app. Dropping `allow-same-origin` makes the frame an opaque origin, which removes that path while it's in the overlay. This is a small extra gain.
- **Redirects:** a frame that starts on another origin and redirects to Homepad's origin becomes same-origin with Homepad. The URL check (§2.3) can't see this. AC-006 closes it for Homepad's own pages by refusing to be framed at all. A redirect to a different path-routed app on Homepad's host stays possible; it needs a malicious app to send the viewer to a page with its own bug, and it needs the admin to have opted in. Accepted.

### 3.2 What dropping `allow-same-origin` costs

The frame gets an opaque origin. Inside the overlay the app has no cookies, no `localStorage`, no `IndexedDB`, and no service worker. Most self-hosted apps keep their sign-in in a cookie or `localStorage`, so they show their sign-in page every time, or fail to load. Static dashboards and pages that need no sign-in keep working. The opt-in exists for the first group.

### 3.3 Who can change it

Only admins, as for the URL and the click action (Q2). A member or a kid can't widen a sandbox. A restored backup can set it, and restore is admin-only.

---

## 4. Acceptance Criteria

| ID | Criterion | Priority |
|---|---|---|
| AC-001 | An app with Inline overlay and the opt-in off renders `sandbox="allow-scripts allow-forms allow-popups"`. | Must |
| AC-002 | With the opt-in on and an address on another origin, it renders `allow-scripts allow-same-origin allow-forms allow-popups`. | Must |
| AC-003 | No sandbox ever contains `allow-top-navigation`, `allow-top-navigation-by-user-activation` or `allow-popups-to-escape-sandbox` (a test over every combination). | Must |
| AC-004 | An address with Homepad's own origin, or one that can't be parsed, never gets `allow-same-origin`, whatever the setting (Q3). | Must |
| AC-005 | The tile editor shows the switch only for Inline overlay. For a same-origin or unparseable address it is off, disabled (`aria-disabled`, still focusable), and shows the matching §2.2 reason (UX §2). | Must |
| AC-006 | Every response from both nginx configs (`nginx.conf` through `nginx-security-headers.conf`, and `deploy/compose/nginx.conf`, which today sends no security headers) carries `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'`. A `tests/infra` source-contract test pins both files. | Must |
| AC-007 | `services.iframe_same_origin` exists, `BOOLEAN NOT NULL DEFAULT FALSE`. `GET /api/services` returns it as `iframeSameOrigin` on every app. | Must |
| AC-008 | Migration 0023 sets `iframe_same_origin = TRUE` for every app with `click_action = 'iframe'` at upgrade time (Q1, decided), once. Apps added or switched later start at false. | Must |
| AC-009 | `POST /api/services` and `PATCH /api/services/{id}` accept `iframeSameOrigin` (boolean). Any other type is 400. A PATCH without it leaves it unchanged. | Must |
| AC-010 | Only admins can write it: the routes are already `classCatalogWrite`. A member or kid PATCH is 403, as today. | Must |
| AC-011 | Backups carry `iframeSameOrigin` on each app, as an optional field of the `schemaVersion: 2` file that 18.0.0 writes (SPEC-household-catalog-owner Q5, AC-012). This field doesn't bump the version again. Restoring a file without the field (any v1 file, through the 1→2 upgrader): Merge leaves an existing app's value alone; a new app gets false. | Must |
| AC-012 | Homepage import creates apps with `iframeSameOrigin` false. | Must |
| AC-013 | `IframeOverlay.test.tsx` is updated: the AC-005 test of SPEC-tile-click-action now expects the default without `allow-same-origin`, and new tests cover AC-001…AC-004. | Must |
| AC-014 | The overlay's blocked-embed fallback (5 s, "This site can't be embedded") is unchanged. | Must |

---

## 5. User Test Cases

**TC-001 — Upgrade keeps an app working (Q1, decided).** *Precondition:* 17.1.0 with a Grafana tile on Inline overlay, signed in inside the overlay. Upgrade. *Expected:* the overlay still shows Grafana signed in. The tile editor shows the switch on.

**TC-002 — A new overlay app starts strict.** Add an app, choose Inline overlay, save, open it. *Expected:* `sandbox` has no `allow-same-origin` (dev tools). An app that needs sign-in shows its sign-in page in the overlay.

**TC-003 — Opt in.** Turn on **Let this app keep its sign-in**, save, open. *Expected:* sign-in inside the overlay sticks.

**TC-004 — Same-origin app.** Point a tile at a path on Homepad's own address and choose Inline overlay. *Expected:* the switch is off and greyed out with the reason. The overlay shows "This site can't be embedded" (the page refuses to be framed, AC-006).

**TC-005 — Members and kids.** As a member, `PATCH /api/services/{id} {"iframeSameOrigin":true}` → 403. As a kid, the overlay works for allowed iframe apps, with the app's setting.

**TC-006 — Backup round trip.** Export, restore on a fresh install. *Expected:* each app's setting comes back. Restore a 17.1.0 file: existing apps keep their value; new ones are off.

---

## 6. Data Model

Migration `0023_iframe_same_origin`. Runs once under the new runner (SPEC-household-catalog-owner Q3). The column add is still `IF NOT EXISTS`, and the backfill runs only in the same statement batch that adds the column:

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'services'
          AND column_name = 'iframe_same_origin'
    ) THEN
        ALTER TABLE services ADD COLUMN iframe_same_origin BOOLEAN NOT NULL DEFAULT FALSE;
        -- Q1 (decided 2026-11-19): apps already on Inline overlay keep today's behavior.
        UPDATE services SET iframe_same_origin = TRUE WHERE click_action = 'iframe';
    END IF;
END $$;
```

Down migration: `ALTER TABLE services DROP COLUMN IF EXISTS iframe_same_origin`.

## 7. API Contract

| Route | Change |
|---|---|
| `GET /api/services` | Each app gains `iframeSameOrigin` (boolean). Additive. Kids get it for their allowed apps. |
| `POST /api/services` | Optional `iframeSameOrigin`; default false. |
| `PATCH /api/services/{id}` | Optional `iframeSameOrigin`. |
| `GET /api/admin/export`, restore | App gains `iframeSameOrigin` (AC-011). The JSON Schema for version 2, `docs/schema/homepad-backup-v2.json` (new in 18.0.0, `homepad-api`), has it as an optional boolean. `homepad-backup-v1.json` stays as it was: v1 files never carry the field. |

An 18.0.0 backup restored on 17.1.0 is refused as a newer file (`schemaVersion` 2, SPEC-household-catalog-owner Q5; SPEC-backup-import AC-016), whatever its fields.

## 8. Frontend Implementation

- `src/api.ts`: `Service.iframeSameOrigin?: boolean`; the create and patch types gain it.
- `src/grid/IframeOverlay.tsx`: replace the `SANDBOX` constant with `sandboxFor(service, pageOrigin)` per §2.1 and §2.3, in `src/lib/` with unit tests.
- `src/grid/TileEditModal.tsx`: the switch under the Click action hint (§2.2). Save sends it only when changed, like `clickAction`.
- `nginx-security-headers.conf`, `deploy/compose/nginx.conf`: `X-Frame-Options DENY`, `Content-Security-Policy "frame-ancestors 'none'"` (AC-006). This is a CSP with one directive, so the inline anti-flash script is unaffected.

## 9. Design (Kare)

UX artifact: [`specs/ux/iframe-sandbox-optin-ux.md`](./ux/iframe-sandbox-optin-ux.md) (APPROVED 2026-11-20, I-1…I-4 at the recommendations). One surface: the tile editor's Inline overlay switch, its help line, and its greyed-out state, at 390 and 1440, light and dark.

## 10. Upgrade and Compatibility

- No visible change for existing overlay apps (Q1, decided). New overlay apps are stricter.
- Homepad can no longer be shown inside a frame by any site, including itself. On the image's own nginx, `SAMEORIGIN` already stopped other sites. On the quickstart's nginx nothing did, so a quickstart install that someone embeds in another dashboard (for example a Home Assistant iframe panel) stops showing there. That is the one visible break from this spec, and the release notes name it.
- Release-note lines:
  - "Apps that open in the overlay are now more locked down by default. Apps you already set to open in the overlay keep working as before. For new ones that ask you to sign in every time, turn on 'Let this app keep its sign-in' in the app's settings. Only do this for apps you trust."
  - "Homepad can no longer be shown inside another page or dashboard." (Q4, decided)

## 11. Out of Scope

- Other sandbox tokens per app (camera, downloads, top navigation).
- A full Content-Security-Policy for Homepad (blocked on the inline anti-flash script).
- Detecting redirects inside the frame.
- Per-user sandbox settings (Q2 option B).

## 12. Sign-offs

| Role | Name | Status |
|---|---|---|
| Owner | Caleb | Approved 2026-11-20: all §0 questions decided |
| Product | Walt | Pending |
| Design | Kare | Approved 2026-11-20 (`specs/ux/iframe-sandbox-optin-ux.md`, I-1…I-4) |

## 13. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-19 | 0.1.0 | Draft for 18.0.0, checked against `homepad` `6eb8a35` and `homepad-api` `79e3b03`. |
| 2026-11-19 | 0.1.1 | Caleb decided Q1 ("keep them opt in") and Q4 ("yes"). |
| 2026-11-20 | 0.1.2 | AC-011 and §7: backups are on `schemaVersion` 2 (SPEC-household-catalog-owner Q5), fixing the "stays 1" mismatch. UX artifact approved (I-1…I-4): the unparseable-address reason (I-1) and the saved value under the greyed state (I-2) go into §2.2; AC-005 points at the UX. |
| 2026-11-22 | 0.1.3 | Marked SHIPPED (18.0.0). §1b records Q2 and Q3 in place of the stale "Pending" line (#593). |
| 2026-11-22 | 0.1.4 | §7: `iframeSameOrigin` is in the v2 schema file, not the v1 file (#594). |
