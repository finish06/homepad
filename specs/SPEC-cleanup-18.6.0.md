# Spec: Content-Security-Policy and the last issue cleanup for 18.6.0

**Spec ID:** SPEC-cleanup-18.6.0
**Version:** 0.2.1
**Created:** 2026-11-24
**Author:** Claude (orchestrated 18.6.0 feature work, "last batch of issue cleanup")
**Status:** SHIPPED — 18.6.0 (2026-11-24): #711, release #714. In production since 2026-11-24. The §7 ConfigMap line is live: on 2026-11-25 staging and production answered `/`, a script file, `/version.json` and `/manifest.webmanifest` with exactly one full policy header. The per-PR preview still sends only `frame-ancestors` (#715, open). Status line read "In review" until 2026-11-25.
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

Checked at `de3e806`. The #72 fix (from homepad-api, before the monorepo move) already routes `internal/storage`'s `requireDatabaseURL` through `dbguard.RequireTestDatabase`; the issue comments that say it has no guard are from before that fix. It has had a negative test since then (`TestRequireDatabaseURL_RefusesNonTestDatabaseName`, `…_RefusesProdHostDSN`).

Every path, and how it is guarded:

| Package | How it gets a database | Guard |
|---|---|---|
| `internal/testsupport` | `NewServer`, `NewServerWithGatus`, `NewEnv`, `NewEnvWith`, `NewOIDCServer`, `NewOIDCServerWith` | `RequireTestDatabase` (name, prod host, server marker); `truncate()` checks again before `TRUNCATE` |
| `internal/api` (most tests), `cmd/homepad-api` | testsupport, or `env.DSN` from it | as above |
| `internal/api` registration, register_validation, sessions, icons, cookie_secure | `dbguard.RequireTestDatabase(t)` directly | same |
| `internal/session` pgstore | `dbguard.RequireTestDatabase(t)`; a second store opens `store.DSN` from the first | same |
| `internal/storage` (all integration tests, incl. the `TRUNCATE` in migration_0013/0016, `DELETE FROM library_apps` in seed) | `requireDatabaseURL(t)` → `RequireTestDatabase` | same |
| `internal/storage` `freshDB`, `freshStore`, `adultsStore` | `CREATE` / `DROP DATABASE … WITH (FORCE)` of a scratch database off the base DSN | base: `requireDatabaseURL`. **Scratch name: not checked before 18.6.0.** |
| `internal/dbguard` `scratchDB` | the same, for the guard's own server tests | base: `CheckTestDatabase`. **Scratch name: not checked before 18.6.0.** |

**The gap.** Two scratch names did not end in `_test`: `homepad_mig0007_pop` and `homepad_mig0007_empty`. `freshDB` runs `DROP DATABASE IF EXISTS <name> WITH (FORCE)` on the base server. The base server is a test server, but it can hold other databases; one with that name would be dropped. Nothing checked the name.

**The fix.** `dbguard.CheckTestDatabaseName` is the name half of `CheckTestDatabase`. `freshDB` and `scratchDB` call it on the scratch name first, before they read `DATABASE_URL` or connect. The two migration-0007 names now end in `_test`. A source test (`internal/dbguard/coverage_test.go`) fails if any Go test file other than `internal/dbguard` reads `DATABASE_URL` itself, or if a file that creates or drops a database never calls `CheckTestDatabaseName`.

## 7. Homelab ConfigMap

For Joe. Staging and prod serve the `homepad-web-nginx` ConfigMap (Code/homelab, `homepad-staging/03-web.yaml` and `homepad/03-web.yaml`), not the image's nginx config. The policy reaches them only through this change.

**Done.** Both ConfigMaps carry the line, applied with the 18.6.0 promotion on 2026-11-24. Checked on 2026-11-25 with `curl -sI` on the four paths in step 3: each sent exactly one header, the line below.

**1. In both ConfigMaps, replace every line**

```
add_header Content-Security-Policy "frame-ancestors 'none'" always;
```

**with this line, exactly:**

```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'sha256-2WIx1PmtuXkeJsDIXK1WvlMpt2A4NyctD0cVBEfTl/M='; style-src 'self'; img-src 'self' data: http: https:; font-src 'self'; connect-src 'self'; frame-src http: https:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
```

It must be at server level **and** in every `location` that has its own `add_header` (nginx does not pass `add_header` down into those). Leave `X-Frame-Options "DENY"` and the other headers as they are.

**2. Restart the web pods.** The ConfigMap is mounted with `subPath`, which does not reload:

```
kubectl -n homepad-staging rollout restart deployment/homepad-web
kubectl -n homepad rollout restart deployment/homepad-web
```

**3. Check.** `curl -sI` on `/`, an `/assets/…js` file, `/version.json` and `/manifest.webmanifest`: each answers with exactly one `Content-Security-Policy` header, the line above. In a browser, sign in and open a tile; the console shows no "Content Security Policy" errors.

**Optional staging trial first.** To watch for violations without blocking anything, staging can carry the old enforcing line and add a report-only one beside it, at the same places, then switch to step 1:

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self' 'sha256-2WIx1PmtuXkeJsDIXK1WvlMpt2A4NyctD0cVBEfTl/M='; style-src 'self'; img-src 'self' data: http: https:; font-src 'self'; connect-src 'self'; frame-src http: https:; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
```

(`frame-ancestors` is ignored in report-only, so the enforcing line keeps framing refused.)

**When the hash changes.** The `sha256-…` value is the hash of the theme script in `index.html`. If a release changes that script, its CHANGELOG says so and gives the new line, and the ConfigMap must change in the same promotion. A stale hash does not break the app: the browser skips that one script, so a dark-theme user sees a light flash on load, and the console shows the violation.

## 8. As built

**#529 — enforced, not Report-Only.** The policy in §3 runs clean, so it ships as an enforcing `Content-Security-Policy`. No `'unsafe-inline'` anywhere: the theme script is allowed by hash, and React's `style` props go through the CSSOM, which `style-src` does not block.

- **Configs (AC-001).** The one line is in `nginx-security-headers.conf` (the image, server level and every location through the include), `compose.yaml` `nginx-config` (server level and all four locations that add headers) and `deploy/compose/nginx.conf` (server level and both locations that add headers). Checked with a real `nginx:1.27-alpine`: `nginx -t` passes for all three, and the image config answers `/`, a client route, `/index.html`, an `/assets/…js` file, `/version.json`, `/manifest.webmanifest` and `/favicon.svg` with exactly one CSP header.
- **Infra test (AC-002, AC-004).** `tests/infra/frame-headers.test.ts`: every location in the three configs carries the line; every CSP line in them and in §7 is the snippet's line word for word; the hashes in `script-src` are exactly the inline scripts of the **built** `index.html`; no `'unsafe-inline'`, `'unsafe-eval'`, `*` or scheme source in `default-src`, `script-src` or `style-src`. The block parser now treats a quoted header value as one token (the CSP's `;` used to split it).
- **Browser test (AC-003, AC-005).** `tests/browser-gate/csp.spec.ts`, 10 tests, served by `tests/browser-gate/csp-server.js` (a second `webServer` in `playwright.gate.config.ts`, port 4175), which sends every `add_header` from the snippet. It records `securitypolicyviolation` events from the first byte and console CSP errors. Flows: headers present; the hashed theme script sets `dark` before the bundle; sign-in (signed-out card with SSO, then password sign-in); dashboard with https, http, `data:` and uploaded icons, the sparkline, ⌘K and the tile editor, with every `<img>` loaded; Inline overlay on an https and an http app; My settings and the whole Admin Panel; the kid board with ⌘K; the manifest through `Page.getAppManifest` with no errors, and no service worker registered. The control injects an inline script, a `style` attribute and an off-origin `fetch`; all three are blocked and reported (`script-src-elem`, `style-src-attr`, `connect-src`). With `img-src`, `frame-src` and the hash tightened, all 10 tests fail. `CSP_GATE_URL` points the same tests at another server: they also pass 10/10 against a real `nginx:1.27-alpine` with the image's config.
- **Dockerfile (AC-006).** The build also greps the snippet for `default-src 'self'`.
- **Not tested here:** Safari and Firefox. The gate is Chromium only. A browser that does not know `manifest-src` or `worker-src` falls back to `script-src` or `default-src`, both `'self'`, so it allows the same thing.

**#256 — one gap closed (AC-007, AC-008).** See §6. `CheckTestDatabaseName` added; `freshDB` and `scratchDB` call it first; `homepad_mig0007_pop` and `homepad_mig0007_empty` renamed to `…_test`. New tests: `TestFreshDB_RefusesNonTestScratchName` and `TestFreshDB_AcceptsTestScratchNameThenGuardsTheBase` (child process, unreachable base, so a check after connecting would show as "cannot connect"); `TestOnlyDbguardReadsDatabaseURLInTests`, `TestEveryScratchDatabaseNameIsChecked`, `TestCoverageRulesSeeAViolation`, `TestCheckTestDatabaseName` in `internal/dbguard/coverage_test.go`. Control: with the name check removed from `freshDB`, the first test fails with the "cannot connect" output.

**#477 (AC-009, AC-010).** `AppGrid` adds a hidden `tile-checks-summary` line and points the tile link's `aria-describedby` at it (with the widget line, when there is one). Six tests in `src/grid/uptime-sparkline.test.tsx`. Decision in `specs/DECISIONS.md`; cap4 AC-006 struck through and §8.3 updated.

**#403, #346 (AC-011, AC-012).** Recorded in `specs/DECISIONS.md`; v28 §8.4 points to the #403 decision.

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
| 2026-11-24 | 0.2.0 | As built: §6 test-path table, §7 ConfigMap lines, §8. Enforced, not Report-Only. |
| 2026-11-25 | 0.2.1 | Shipped in 18.6.0. §7: the ConfigMap change is live on staging and production. |
