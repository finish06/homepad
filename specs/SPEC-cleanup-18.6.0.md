# Spec: Content-Security-Policy and the last issue cleanup for 18.6.0

**Spec ID:** SPEC-cleanup-18.6.0
**Version:** 0.1.0
**Created:** 2026-11-24
**Author:** Claude (orchestrated 18.6.0 feature work, "last batch of issue cleanup")
**Status:** In review
**Repo:** `Code/homepad` (nginx configs, `compose.yaml`, `tests/`, `src/grid/`, `api/internal/`, `specs/`)
**Issues:** #529, #256, #477, #403, #346
**Target version:** 18.6.0

---

## 1. Overview

Five open issues. One is real work: Homepad sends no Content-Security-Policy beyond `frame-ancestors` (#529). One is a check that every Go test that empties a database goes through the test-database guard (#256). Three are decisions Caleb asked to record so the issues can close (#477, #403, #346). There are no database or API changes.

## 2. What the app needs from a CSP (audit at `de3e806`, 18.5.0)

Checked in the source and in the built `dist/`:

| Need | Where | Directive |
|---|---|---|
| One inline script: the theme anti-flash bootstrap in `index.html` | `index.html` `<script>` before the bundle | `script-src 'self' 'sha256-…'` (the hash of that script, byte for byte) |
| The bundle and its lazy chunks, `<link rel="modulepreload">` | `/assets/*.js` | `script-src 'self'` |
| No `eval`, `new Function`, `WebAssembly` or `javascript:` URL in the bundle | grep of `dist/assets/*.js` | no `'unsafe-eval'` |
| Stylesheets | `/assets/*.css`, lazy CSS links | `style-src 'self'` |
| React `style={…}` props (11 files), `el.style.cssText` in `copyText.ts`, CSS custom properties | React sets them through the CSSOM, not a `style` attribute in markup | CSSOM writes are not blocked by `style-src`, so no `'unsafe-inline'` is needed. No code adds a `<style>` element or `setAttribute('style', …)`. The browser test proves it. |
| Fonts | none loaded; the app uses system fonts | `font-src 'self'` |
| Service icons: any http/https origin, `data:` initials badges, `/api/services/{id}/icon/…` | `src/lib/icons.ts`, library and ⌘K icons, import thumbnails | `img-src 'self' data: http: https:` |
| CSS `url("data:image/svg+xml,…")` backgrounds | `src/index.css` | covered by `img-src data:` |
| API calls and `/version.json` | `fetch` of same-origin paths only (`src/api.ts`, `widgetsInfo.ts`, `releaseCheck.ts`) | `connect-src 'self'` |
| Inline overlay tiles: any service the user adds, http or https | `src/grid/IframeOverlay.tsx` | `frame-src http: https:` |
| Web app manifest | `<link rel="manifest" href="/manifest.webmanifest">` | `manifest-src 'self'` |
| Workers | **None.** Homepad registers no service worker and starts no worker today. The PWA is the manifest only. | `worker-src 'self'`, so a same-origin worker added later still works |
| Forms | every form is handled in JS; SSO is `location.assign('/api/auth/oidc/login')`, a navigation | `form-action 'self'` |
| Being framed | refused everywhere (SPEC-iframe-sandbox-optin AC-006, with `X-Frame-Options: DENY`) | `frame-ancestors 'none'` |
| Plugins, `<base>` | not used | `object-src 'none'; base-uri 'self'` |

No `upgrade-insecure-requests`: many self-hosters serve Homepad, and their apps, over plain http.

## 3. The policy

```
default-src 'self'; script-src 'self' 'sha256-2WIx1PmtuXkeJsDIXK1WvlMpt2A4NyctD0cVBEfTl/M='; style-src 'self'; img-src 'self' data: http: https:; font-src 'self'; connect-src 'self'; frame-src http: https:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

It is enforced (`Content-Security-Policy`), not Report-Only, if the browser test in §5 is clean. If it is not clean, the header ships as `Content-Security-Policy-Report-Only` with `frame-ancestors 'none'` kept in an enforcing header, and this section says so.

The hash covers the anti-flash script's text exactly. Changing one character of that script changes the hash; a unit test (AC-004) fails until the policy is updated.

## 4. Where the header lives

Four nginx configs send Homepad's headers. Every one gets the same policy line, at server level and in every location that has its own `add_header` (nginx does not inherit `add_header` into such a location):

1. `nginx-security-headers.conf`, included by the image's `nginx.conf`.
2. `compose.yaml` `nginx-config` (the quickstart replaces the image's config).
3. `deploy/compose/nginx.conf` (`compose.build.yaml`, building from source).
4. The homelab ConfigMap `homepad-web-nginx` for staging and prod. It is not in this repo. The exact lines are in §7 for Joe.

## 5. Acceptance criteria

| ID | Issue | Criterion | Priority |
|----|-------|-----------|----------|
| AC-001 | #529 | The three in-repo nginx configs send the policy in §3 at server level and in every location that sets its own `add_header`. `X-Frame-Options: DENY` stays. | Must |
| AC-002 | #529 | An infra test (`tests/infra/frame-headers.test.ts`) fails if any location block in any of the three configs lacks the CSP line, or if the four copies of the policy (three configs and the §7 block) differ. | Must |
| AC-003 | #529 | A browser-gate test serves the built `dist/` with the headers parsed from `nginx-security-headers.conf` and records every `securitypolicyviolation` event and every console CSP error. It fails on any, across: sign-in, the dashboard with tiles and icons (remote https, http, `data:` badge and API-served icons), ⌘K, an Inline overlay tile (http and https), My settings and the Admin Panel, the kid board, and the manifest. | Must |
| AC-004 | #529 | A unit test hashes every inline `<script>` in the built `index.html` and fails unless each hash is in `script-src`, and fails if the policy has `'unsafe-inline'` or `'unsafe-eval'` for scripts. | Must |
| AC-005 | #529 | A control in the browser test injects an inline script and an off-origin `fetch`; both must be blocked and reported, so the test can fail. | Must |
| AC-006 | #529 | The image build (`Dockerfile`) refuses a snippet whose CSP lacks `default-src 'self'`. | Should |
| AC-007 | #256 | Every Go test path that connects to `DATABASE_URL` and writes, truncates, drops or creates goes through `dbguard`. §6 lists each path. | Must |
| AC-008 | #256 | Scratch databases that tests create and drop off the base server (`freshDB`, `scratchDB`) must have a `_test` name. A test proves `freshDB` refuses a non-`_test` name before it connects. | Must |
| AC-009 | #477 | The tile link's accessible description carries the recent checks ("Last 20 checks: 19 up, 1 down") when the sparkline shows. A vitest test covers it, the singular case, and its absence when uptime display is off. | Must |
| AC-010 | #477 | cap4 AC-006 is recorded as withdrawn in `specs/DECISIONS.md` and in cap4 §8.3. | Must |
| AC-011 | #403 | `specs/DECISIONS.md` records that dnd-kit's in-place shift stays, and a `DragOverlay` placeholder is revisited only if a real-device test shows the drop spot is unclear. v28 §8.4 points to it. | Must |
| AC-012 | #346 | `specs/DECISIONS.md` records the bento grid as parked, not planned, and points to #346 for the mockups. | Must |

## 6. #256 — which test paths reach a database

Filled in as built; see §8.

## 7. Homelab ConfigMap

Filled in as built; see §8.

## 8. As built

Filled in when the work lands.

## 9. Out of scope

- Moving the anti-flash script to a file. A hash keeps it inline and render-blocking-free; AC-004 catches drift.
- A `report-uri` / `report-to` endpoint. Homepad has nowhere to collect reports.
- #334 and #335 (iframe sign-in and blocked-embed detection). The policy allows any http/https frame, so it changes neither.
- Building the bento grid, a drag placeholder, or focusable sparkline dots.

## 10. Test plan

- `npm run lint`, `npx vitest run`.
- `cd api && go test ./... -count=1 -p 1` against a throwaway Postgres whose database is `homepad_test`.
- `npm run build && npm run test:gate` (the full browser gate, including the new CSP test).
- The image's nginx config checked with a real `nginx:1.27-alpine`: `nginx -t`, and `curl -I` on `/`, an asset, `/version.json` and `/manifest.webmanifest`.

## 11. Revision History

| Date | Version | Change |
|---|---|---|
| 2026-11-24 | 0.1.0 | Draft for 18.6.0, checked against `de3e806`. |
