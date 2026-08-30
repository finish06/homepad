# homepad CI/CD

The contract: **every test suite runs exactly once per change, at the stage
where its result actually gates something.** No suite re-runs at commit, PR,
and merge.

## Pipeline stages

| Stage | Workflow | What runs | Why here |
|---|---|---|---|
| Push to a `feat/**` branch (no PR) | — | nothing in CI | Fast local feedback belongs on the dev machine (`npm run typecheck`, `npx vitest run`). CI spends minutes only when a result gates a merge. |
| Pull request to `main` | `ci.yml` — **required check** | `npm ci`, `npm run build` (includes `tsc --noEmit`), `npx vitest run` | The unit-level gate, once per head sha. |
| Pull request to `main` | `browser-gate.yml` — **required check** | Real-Chromium Playwright gate (`test:gate`), only when tile/menu/dnd-relevant paths changed; reports a no-op pass otherwise so the required status always arrives | jsdom can't see z-index hit-testing or native event ordering; path-filtering keeps unrelated PRs cheap. |
| Pull request to `main` | `mr-staging.yml` | Build candidate image `homepad:<sha>-test` (Kaniko), deploy to `homepad-staging`, dispatch the QA pool; on PASS the QA bot approves + merges | The e2e/QA level — needs a real deploy, so it runs against the staging rollout, not in a runner sandbox. Its `test-cmd` deliberately does **not** repeat the unit suite: `ci.yml` + `browser-gate.yml` are required checks on the same sha, and branch protection blocks the bot's merge if they fail. |
| Merge to `main` | `staging-release.yml` | Build integrated image `homepad:<sha>-beta` + `:<sha>`, roll to staging. **No tests.** | Branch protection means the merged tree is the exact tested tree; re-running the suites would be the wasteful third run. |
| Merge to `main` | `ghcr-release.yml` | Build + push `ghcr.io/finish06/homepad:<sha>` + `:latest` via `ci-shared/build-push@v3`. **No tests** (same reasoning). | Public-cloud copy of the exact tested image. Separate workflow so a ghcr.io outage never blocks the staging rollout. Needs the `GHCR_TOKEN` Gitea secret — a GitHub classic PAT with `write:packages`. |

If a suite needs to run again (flaky infra, expired staging), re-run the
workflow — don't add overlapping triggers back.

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
pins 22, `package.json#engines` declares `>=20 <23`. (Node 26 + vitest 2's
jsdom environment is known-broken: `localStorage` never lands on the test
globals and much of the suite fails for environment reasons.)
