# homepad CI/CD

The contract: **every test suite runs exactly once per change, at the stage
where its result actually gates something.** No suite re-runs at commit, PR,
and merge.

## Pipeline stages

| Stage | Workflow | What runs | Why here |
|---|---|---|---|
| Push to a `feat/**` branch (no PR) | — | nothing in CI | Fast local feedback belongs on the dev machine (`npm run typecheck`, `npx vitest run`). CI spends minutes only when a result gates a merge. |
| Pull request to `main` | `ci.yml` — **required check** | `npm ci`, `npm run build` (includes `tsc --noEmit`), `npx vitest run` | The unit-level gate, once per head sha. |
| Pull request to `main` | `browser-gate.yml` — **required check** | Real-Chromium Playwright gate (`test:gate`) when the PR touches a surface the suite pins; reports a no-op pass otherwise so the required status always arrives | jsdom can't see z-index hit-testing or native event ordering; the path filter keeps API-only and docs-only PRs cheap. |
| Pull request to `main` | `mr-staging.yml` | Build candidate image `homepad:<sha>-test` (Kaniko), deploy to `homepad-staging`, dispatch the QA pool; on PASS the QA bot approves + merges | The e2e/QA level — needs a real deploy, so it runs against the staging rollout, not in a runner sandbox. Its `test-cmd` deliberately does **not** repeat the unit suite: `ci.yml` + `browser-gate.yml` are required checks on the same sha, and branch protection blocks the bot's merge if they fail. |
| Merge to `main` | `staging-release.yml` | Build integrated image `homepad:<sha>-beta` + `:<sha>`, roll to staging. **No tests.** | Branch protection means the merged tree is the exact tested tree; re-running the suites would be the wasteful third run. |
| Merge to `main` or a `vX.Y.Z` tag (mirrored to GitHub) | `.github/workflows/ghcr-release.yml` — **GitHub runners** | Build + push `ghcr.io/finish06/homepad` and `ghcr.io/finish06/homepad-api` (from `api/`) at `:<sha>` + `:latest` on main; `:X.Y.Z`, `:X.Y`, `:X` on a release tag. `linux/amd64` + `linux/arm64` (buildx + QEMU, gha layer cache). The public quickstart pins the version tag. **No tests** (same reasoning). | The Gitea push mirror (sync_on_commit) lands every merge on `github.com/finish06/homepad`, which triggers this workflow there — so the ghcr publish consumes zero homelab runner time and authenticates with the workflow's own `GITHUB_TOKEN` (`packages: write`); no PAT or Gitea secret involved. |

> **Why publish to ghcr at all when nothing in the homelab pulls it?** Deliberate. Audited 2026-09-29: no homepad manifest in any namespace references `ghcr.io/finish06/homepad`, and the only finish06 ghcr images the cluster pulls are `rx-dag` and `rsync-viewer`. The gethomepad demo runs on Cloud Run, outside the cluster, and was **not** checked — so "unconsumed" holds for the homelab and is unverified beyond it. It is kept as a second **public** publish target (the GitHub mirror is public, so this is where anyone outside the homelab would pull from) and as an off-cluster copy of every `main` build. A zero-consumer audit result is the expected state here, not a reason to retire it.

If a suite needs to run again (flaky infra, expired staging), re-run the
workflow — don't add overlapping triggers back.

## The browser gate

`.gitea/workflows/browser-gate.yml` is the one suite that cannot run in jsdom.
It drives the **built** app (`vite preview` on `dist/`, `/api/*` mocked per test)
in real Chromium at 1440×900 with `hasTouch`. It exists because bug #35 — the
tile `⋯` menu was unreachable by mouse (z-index hit-testing) and by touch (a
synthetic `mousedown` after `pointerup` closed what the user had just opened) —
went green in vitest twice while broken in a browser. See
[retros/2026-06-13-v10-35-retro.md](../retros/2026-06-13-v10-35-retro.md).

**What fires it.** `scripts/ci/gate-surfaces.sh` diffs the PR's own commits
(`base...head`) and prints `run=true` when the PR touches anything
`tests/browser-gate/` can observe:

| Surface | Why it is in the trigger |
|---|---|
| `src/**` | the app the specs drive — grid, app shell, accounts, widgets, library |
| `tests/browser-gate/**` | the specs, fixtures and API mocks themselves |
| `playwright.gate.config.ts`, this workflow, `scripts/ci/gate-surfaces.sh`, `scripts/ci/playwright-image.sh` | a change to the gate must be validated by a real browser run, not silently no-op |
| `package.json`, `package-lock.json` | a dependency bump can change behaviour with no `src/` change |
| `vite.config.ts`, `index.html`, `public/`, `nginx*`, `Dockerfile` | what ships and what serves it (`csp.spec.ts` asserts the served headers) |

Everything else — `api/**`, `docs/**`, `specs/**`, `deploy/**` — gets a green
no-op. The job always runs, so the required status is always reported; a
workflow skipped by `on.paths` would never report and would deadlock every PR.

**It fails closed.** No base sha, an unreachable sha, a failed `git diff`, or an
empty diff means *run the gate*. A required browser check that cannot read the
diff must not report green. (Until this change it did: the trigger was an
inline `git diff … | grep -q`, so a bad base sha emptied the pipe, `grep`
missed, and the job passed without testing anything.)

**The job name is load-bearing.** Branch protection on `main` requires the
context `Browser gate / Browser gate (#35 tile/menu/dnd) (pull_request)`, i.e.
`<workflow name> / <job name> (pull_request)`. Renaming `jobs.browser-gate`'s
`name:` stops that context from ever reporting and blocks every PR.
`scripts/ci/workflows.test.sh` pins the string, plus the trigger script, the
image check, the per-PR `concurrency` group and the job timeout.

**The image tag is load-bearing too.** The job runs in
`mcr.microsoft.com/playwright:v1.60.0-noble`, which ships the Chromium for
exactly `@playwright/test` 1.60.0. When the lockfile moves ahead of the tag,
`npx playwright install chromium` silently downloads ~150 MB from
`cdn.playwright.dev` at run time — the #226 flake (5 × 30 s → "Failed to install
browsers"). `scripts/ci/playwright-image.sh` compares the tag with the lockfile
on every run and fails with the exact fix. **When you bump `@playwright/test`,
update the tag in the same commit** (`v<version>-noble`; the image is published
for every Playwright release).

**What it still cannot see.** The specs mock `/api/*` by hand, so a mock that
disagrees with the server passes while the real app fails — #239 was exactly
that (`PUT /api/categories/order` mocked as 200; the API returns 204, so
reorder rolled back under a green gate). Mock contracts are your responsibility
when you change an endpoint; the deployed behaviour is what the QA pool checks
against the PR's preview in `mr-staging.yml`.

**Overlap with `e2e.yml`.** Both workflows install deps, build, and run
Playwright on the built app in the same pinned image, on the same PR.
`e2e.yml` runs `tests/e2e` (first paint, the theme boot path, the built-bundle
secret scan) on every web-changing PR; this gate runs `tests/browser-gate` (the
#35 interaction pins, and the accounts/CSP/kid-board/widget pins). The specs are
disjoint, so neither is redundant — but the setup is paid for twice. Folding
both into one workflow (one `npm ci`, one `npm run build`, two `playwright test`
runs) is the obvious follow-up; it is not done here because the required status
context *is* this job's name, so moving it is a branch-protection change rather
than a workflow edit.

Local run: `npm run build && npm run test:gate` (needs the build — the gate
serves `dist/`, not the dev server). To see whether CI would run it for a
branch: `bash scripts/ci/gate-surfaces.sh "$(git merge-base HEAD origin/main)" HEAD`.

## Release awareness (the UI knows a new build shipped)

Every deployed tab can tell the user a newer release is live:

1. **Build**: `vite.config.ts` (`emit-version-json` plugin) writes
   `dist/version.json` — `{ version, sha, builtAt }` — with the same
   `GIT_SHA` CI bakes into the bundle as `__GIT_SHA__` (ci-shared passes
   `--build-arg GIT_SHA=<sha>`).
2. **Serve**: `nginx.conf` serves `location = /version.json` with
   `Cache-Control: no-store`, so the probe always reflects the build behind
   the ingress, never a cached copy. The Dockerfile guard asserts both the
   file and the location exist in the image.
3. **UI**: `useReleaseCheck` polls it every 5 minutes and immediately when the
   tab becomes visible; when the fetched sha differs from `__GIT_SHA__`,
   `UpdateBanner` shows "homepad vX.Y.Z is available" with a Refresh button.
   `sha: 'dev'` on either side disables the check (local dev never nags).

So "release a new version" is simply: merge a PR → `staging-release` builds and
rolls the image → every open tab notices within 5 minutes (or on next focus).

## Toolchain

CI runs Node 22 (`actions/setup-node`). Local dev should match — `.nvmrc`
pins 22, `package.json#engines` declares `>=20 <23`.

**Node 26 local runs work as of 2026-09-12.** They previously failed ~49 tests
across two files. Node 26 defines a native `localStorage` accessor on the global
object that returns `undefined` without `--localstorage-file`, and because
vitest's jsdom environment shares one global object with the Node realm, that
accessor shadowed jsdom's own implementation. The first throw landed inside a
setup/teardown hook, which aborted it, so `cleanup()` never ran and rendered
trees accumulated — surfacing as unrelated "Found multiple elements" failures
elsewhere. `src/test/setup.ts` now installs a Map-backed `Storage` when none is
present; it is inert on CI's Node 22, where jsdom supplies one. The engines
range is unchanged: the shim makes the *suite* runnable on 26, it does not make
26 a supported build target.
