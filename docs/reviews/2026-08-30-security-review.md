# Security Review — homepad (React/Vite SPA + nginx + Gitea CI → k8s)

Reviewed 2026-08-30 at commit `eaade5e` (branch `feat/glass-v2-accent`). Scope: this repo only (frontend, nginx, Dockerfile, CI). The Go backend at `/api/*` is out of repo; items that depend on it are flagged as verify-on-backend. All claims verified against the actual code; no files were edited.

**Overall posture is decent** — no `innerHTML`/`dangerouslySetInnerHTML` anywhere, cookie-based sessions (no tokens in localStorage), `rel="noopener noreferrer"` on every external link, SVG initials badge escapes XML (`src/icons.ts:52`), tiny dependency surface (react + dnd-kit only). The findings below are what remains: **2 high, 6 medium, 4 low**.

---

## High

### H1. PR-triggered workflow exposes deploy/registry secrets to PR code (pwn request)

`.gitea/workflows/mr-staging.yml:18-52` — triggers `on: pull_request`, then runs `npm ci; npm run build; npm test` on the PR head while the job env holds `REGISTRY_USERNAME/PASSWORD`, `NATS_PUBLISH_TOKEN`, and `KUBECONFIG_STAGING`. Anyone who can open a PR gets arbitrary code execution (npm postinstall scripts, vitest, or an edited test file) in a job that can read those env vars — enough to push malicious images and deploy to the staging namespace. Unlike GitHub, Gitea does not withhold secrets from `pull_request` runs by default. `browser-gate.yml` and `ci.yml` also run PR code but carry no secrets — those are fine.

**Fix:** split the job: run the untrusted `test-cmd` in a secrets-free job, and gate the build/push/deploy step so it only runs for PRs from repo collaborators (or move deploy to a `push` on a protected branch). At minimum, restrict who can open PRs on the Gitea instance and scope `KUBECONFIG_STAGING` to a ServiceAccount that can only `set image`/`rollout status` on `deploy/homepad-web` in `homepad-staging` (see M5). If the Gitea is single-user with registration closed, the practical risk is low today — but the workflow is one "open registration" toggle away from full staging compromise.

### H2. `npm ci || npm install` silently bypasses the lockfile in the production image

`Dockerfile:5` — `RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund`. If `npm ci` fails (lockfile drift, transient error), the build silently falls back to `npm install`, which resolves fresh semver ranges — unpinned, unreviewed package versions land in the shipped bundle with no signal. `COPY package.json package-lock.json* ./` (line 4) compounds it: the `*` glob makes the lockfile optional, so a missing lockfile still builds. This defeats lockfile-pinned supply-chain integrity exactly when it matters most.

**Fix:** `COPY package.json package-lock.json ./` and `RUN npm ci --no-audit --no-fund` with no fallback — lockfile drift should break the build loudly. Consider `--ignore-scripts` too (the build stage only needs vite/tsc; verify no dep requires install scripts).

---

## Medium

### M1. No security headers served by nginx

`nginx.conf:1-36` — no `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, or `Permissions-Policy`. The app is a session-cookie-authenticated SPA; a CSP is the backstop for exactly the stored-XSS class in M2, and missing `frame-ancestors` allows clickjacking of the admin UI.

**Fix:** in the `server` block:

```nginx
server_tokens off;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```

Caveats: (1) `img-src` needs `data:` (initials badges) and `https:` (admin icon URLs); tighten to named hosts if external icons are dropped. (2) nginx `add_header` inheritance — a `location` block that declares its own `add_header` (the asset-cache and `/index.html` locations both do) **stops inheriting** server-level headers, so repeat the security headers in those locations via an `include security-headers.conf;` snippet, or set them at the ingress. HSTS: TLS terminates at Pangolin, so set `Strict-Transport-Security` there — don't set it in two places with different values.

### M2. `javascript:` URL injection via service/library URLs (stored XSS on click)

Service and offer URLs go straight into `href` with no scheme check: `src/AppGrid.tsx:696`, `src/Catalog.tsx:1011` and `src/Catalog.tsx:1387`, `src/CommandLauncher.tsx:322`, `src/StatusBar.tsx:171`, `src/AlertHistoryPanel.tsx:57`. `src/ServiceForm.tsx:186-192` accepts the URL as free text with zero validation, and `src/api.ts` sends it verbatim. React does not block `javascript:` hrefs (dev-warn only), so a service saved with `url: "javascript:..."` executes in the session of **any user who clicks the tile** — the catalog is shared, so this crosses user boundaries (admin→user today; user→user if any owner-scoped create path exists on the backend). `src/CommandLauncher.tsx:148` programmatically clicks the anchor on Enter, so the launcher triggers it keyboard-only.

**Fix:** allowlist `http:`/`https:` at both ends. Client: in `ServiceForm` (and the library admin form) reject via `new URL(url).protocol`, plus a shared `safeHref(url)` helper at all six render sites that returns `#` for non-http(s) schemes. Server: the Go API must enforce the same allowlist on `url` and `icon` — the client check is UX only. (`icon` into `<img src>` is not script-executable in modern browsers, but allowlist it anyway.)

### M3. kubectl fetched at deploy time without checksum verification

`.gitea/workflows/mr-staging.yml:42` and `.gitea/workflows/staging-release.yml:24` — `curl -sSLf -o /usr/local/bin/kubectl https://dl.k8s.io/...` then immediately executed with the staging kubeconfig in scope. HTTPS protects transit, but a compromised mirror/CDN response or corrupted download becomes cluster-credentialed code execution with no integrity check.

**Fix:** hardcode the published sha256 and verify before `chmod +x`:

```sh
curl -sSLf -o /usr/local/bin/kubectl https://dl.k8s.io/release/v1.30.2/bin/linux/amd64/kubectl
echo "<sha256 from kubectl.sha256, pinned in the workflow>  /usr/local/bin/kubectl" | sha256sum -c -
chmod +x /usr/local/bin/kubectl
```

Fetch the hash once and pin it — don't fetch hash and binary from the same origin at run time. Better: bake kubectl into a custom runner image.

### M4. Composite actions pulled over plaintext HTTP with a mutable ref

`.gitea/workflows/mr-staging.yml:26` and `.gitea/workflows/staging-release.yml:18` — `uses: http://gitea-http.gitea.svc.cluster.local:3000/Code/ci-shared/...@v3`. The action that receives all the secrets is fetched unauthenticated over cluster-internal HTTP, and `@v3` is a mutable ref: anyone who can spoof that DNS name or intercept pod traffic (a compromised pod in a NetworkPolicy-less namespace), or who has write access to `Code/ci-shared`, can substitute the action body.

**Fix:** reference via the Gitea instance's HTTPS URL if it has one; pin to a full commit SHA instead of `@v3`; add a NetworkPolicy restricting who can reach `gitea-http.gitea.svc`. Cluster-internal, so exploitation requires an existing foothold — medium, not high.

### M5. Staging kubeconfig scope + `/tmp/kc` handling

`.gitea/workflows/mr-staging.yml:39`, `.gitea/workflows/staging-release.yml:22` — `printf '%s' "$KUBECONFIG_STAGING" > /tmp/kc` creates the file with default umask (typically world-readable) and it persists for the rest of the job — including the PR-controlled steps in H1's scenario. The kubeconfig's user likely can do far more than roll one deployment.

**Fix:** `install -m 600 /dev/null /tmp/kc && printf '%s' "$KUBECONFIG_STAGING" > /tmp/kc`, delete it after the rollout, and — the part that matters — make the credential a namespace-scoped ServiceAccount token bound to a Role allowing only `get`/`patch` on that one Deployment.

### M6. CSRF posture unverifiable from the frontend — confirm on the backend

`src/api.ts` uses cookie sessions (`credentials: 'include'`) for every state-changing call, with no CSRF token anywhere. JSON `Content-Type` forces a CORS preflight for most endpoints, but that only protects if the backend rejects `text/plain`/form-encoded bodies — and `setFavorite`/`deleteService`/`deleteIcon` (`src/api.ts:197-240`) send no body at all, so a cross-site `fetch(..., {method:'POST', mode:'no-cors', credentials:'include'})` would carry the cookie if SameSite isn't set.

**Backend action items:** confirm the session cookie is `SameSite=Lax` (minimum) + `Secure` + `HttpOnly`, and that JSON endpoints reject wrong Content-Type.

---

## Low

### L1. nginx runs as root; images pinned by tag, not digest

`Dockerfile:2,17` — `node:20-alpine` and `nginx:1.27-alpine` are mutable tags (pin by `@sha256:` digest for reproducibility), and the stock nginx image runs its master process as root. **Fix:** `nginxinc/nginx-unprivileged:1.27-alpine` (listens on 8080; adjust `listen`/`EXPOSE`/Service targetPort) or a k8s `securityContext` (`runAsNonRoot`, `readOnlyRootFilesystem`, drop capabilities). `server_tokens off` folds into M1's fix.

### L2. Default QA credentials committed

`qa-kit/demo-gridscan.js:15` and `qa-kit/preflight.js:26` — fallback `qa@test.local / Test12345!`. Harmless as a fixture, but the staging URL is public in the workflow (`https://homepad-staging.10.17.2.213.nip.io`); if the staging QA account actually uses this default, it's a valid login. **Fix:** make `QA_PASSWORD` required (fail fast when unset); rotate the staging QA account if it ever used the default.

### L3. Vite 5.4.8 dev-server advisories

`package.json:47` — `vite ^5.4.8`; the 5.4.x line below ~5.4.15 has known dev-server file-disclosure issues (CVE-2025-30208 family, `?raw`/`?import` bypasses). Production images are unaffected (static build), but `npm run dev` on a LAN is in scope. **Fix:** update within 5.4.x and add `npm audit --omit=dev --audit-level=high` to `ci.yml` — the Dockerfile's `--no-audit` means advisories never surface anywhere today.

### L4. Admin-supplied external icon URLs

`src/icons.ts:136-141`, `src/LibraryBrowse.tsx:208` — the `icon` field renders as an `<img src>` to any host. Not script-executable, but it leaks user IPs/user-agents to arbitrary third parties on every dashboard render and breaks silently on mixed content. Covered by M1's CSP `img-src` plus M2's server-side scheme allowlist; consider proxying/caching icons server-side long-term.

---

## Clean checks (verified, not speculative)

- No `dangerouslySetInnerHTML`, `innerHTML`, `document.write`, `eval`, or `new Function` in `src/` or `index.html`.
- localStorage stores only UI state (theme, accent, collapse set, recently-opened log) — no credentials or tokens; auth is a server-side cookie session.
- All `target="_blank"` links carry `rel="noopener noreferrer"`.
- `initialBadge` escapes `&<>` before embedding names in the SVG data URI (`src/icons.ts:52-55`).
- OIDC redirect is a hardcoded same-origin path (`src/App.tsx:366`), not attacker-influenced.
- No committed private keys, cloud keys, or PATs found; `.env` is git- and docker-ignored; sourcemaps are off in prod builds.
- `browser-gate.yml` interpolates only `github.event.pull_request.base.sha` into shell — a SHA, not an injectable attacker-controlled string (PR titles/branch names are not interpolated anywhere).

---

## Suggested order of work

1. **H2** (one-line Dockerfile fix) and **M1** (nginx headers) — minutes each, biggest hardening per effort.
2. **M2** — `safeHref` helper + form validation here, matching allowlist in the Go backend.
3. **H1/M5** — restructure the PR gate so secrets never coexist with PR code; scope the kubeconfig.
4. **M3/M4** — checksum-pin kubectl, SHA-pin the ci-shared actions.
5. **L-items** opportunistically; verify **M6** on the backend.
