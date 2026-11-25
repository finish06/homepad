# Spec: Test setup cleanup for 18.3.0

**Spec ID:** SPEC-test-infra-18.3.0
**Version:** 0.1.0
**Created:** 2026-11-23
**Author:** Claude (Caleb asked, 2026-11-23: "clean up more issues, tackle another bundle". This is the test-setup bundle.)
**Status:** SHIPPED — 18.3.0 (2026-11-24): #702, release #706. Every listed issue is closed except #691 (§4, runner side, Joe). Status line read "In review" until 2026-11-25.
**Repo:** `Code/homepad` (`tests/infra/`, `scripts/`, `vite.config.ts`, docs)
**Issues:** #254, #547, #614, #619, #621, #628, #631, #635, #638, #639, #640, #641, #645, #646, #647, #648, #649, #678, #679, #681, #690, #691, #695, #697, #699
**Target version:** 18.3.0

---

## 1. Overview

25 open issues say a test could not run in the QA environment, or ran wrong there. Most are QA advisories, and many are the same finding filed again on each PR. They come down to four causes:

1. Two vitest suites read a built `dist/`, so `vitest run` fails on a clean checkout (#640, #641, #646, #679, #690, #697).
2. `render.test.sh` needs `envsubst`, and its installer only wrote to `/usr/local/bin` (#639, #681).
3. The QA runner has no Go and no installed packages, so it cannot run the repo gates (#628, #645, #648, #649, #691, #695, #699).
4. Single findings about one PR, the runner, or a check nobody had confirmed.

This spec fixes the causes that live in this repo, says plainly which gates CI owns, and closes the rest with evidence. The QA runner is Joe's; nothing here changes it.

No user-facing change.

## 2. Already fixed or no longer true (close with evidence)

| Issue | Evidence |
|---|---|
| #647 shell tests fail, implementation missing | Found on a draft commit of #642. #642 merged with the scripts. On `main` (116d79e): changed-sides 14/14, staging-api-rollout 19/19, workflows 53/53, api-image 10/10 |
| #638 concurrency cancel untested | The Gitea server runs 1.27.3 (needs 1.26+). Run 7165 (mr-staging, PR #680) was cancelled 13 s after the next commit was pushed, and the new commit's run went on to pass |
| #619 unicode escape in `.add/config.json` | The value is the same either way. The file has no `\u` escapes left; nothing to change |
| #631 do-not-merge probe PR | #630 was closed without merging |
| #621 five spec-drift issues not matched | #563, #564, #588, #593 and #594 are all closed |

## 3. Acceptance criteria

| ID | Issue | Criterion | Priority |
|----|-------|-----------|----------|
| AC-001 | #640 + 5 dups | `npx vitest run` passes on a clean checkout with no `dist/`. A vitest global setup builds the app once per run into `node_modules/.cache/homepad-test-dist`, and `bundle-budget` and `pwa-icons` read that. | Must |
| AC-002 | #640 | Those two suites never skip. A failed build fails the run with a message that names the build. They always check the current source, not an old `dist/`. | Must |
| AC-003 | #690 | The budget is still enforced in CI: `ci.yml` runs `npx vitest run`, which now builds what it checks. The per-run build is the same artifact as `npm run build` (same asset hashes). | Must |
| AC-004 | #639 | `install-envsubst.sh` works without root. It installs into `$ENVSUBST_BIN_DIR`, else `/usr/local/bin` if writable, else `~/.local/bin`, and prints the folder. It unpacks the `.deb` without `dpkg-deb` if needed (`ar` + `zstd`). CI's root path is unchanged. | Must |
| AC-005 | #681 | `render.test.sh` installs `envsubst` itself when it is missing and puts it on PATH. If it can't, it fails, never skips. | Must |
| AC-006 | #635 | Coverage prints its table even when a test fails (`coverage.reportOnFailure`). | Should |
| AC-007 | #628, #645 + Go dups | `npm run test:all` runs every gate CI runs and reports each as PASS, FAIL or NOT RUN with what is missing. It installs nothing. Exit 0 all passed, 1 a failure, 2 some gates did not run. | Must |
| AC-008 | #678 | A test pins `compose.build.yaml`'s API build to the same context and Dockerfile that `staging-release.yml` and `ghcr-release.yml` build, and the web build to the root Dockerfile. | Should |
| AC-009 | #254 | A test keeps the browser gate off the CDP sidecar's shared default context, whose HTTP cache survives across QA tasks. qa-kit tools that load pages must ask for a fresh context. | Should |
| AC-010 | #645 + dups | `docs/testing.md` says which gates CI runs and requires, and what QA covers. CLAUDE.md and AGENTS.md drop "build before vitest". | Must |
| AC-011 | — | `staging-api-rollout.sh` uses no `sed -i`, so its test also passes on macOS. | Could |

## 4. Out of scope (left open for Joe, runner side)

- #691 (tracking, with #628, #645, #648, #649, #695, #699 closed into it): the QA runner image needs Go 1.25+, `npm ci`, and a throwaway Postgres to run the Go gates.
- #614: the runner's preinstalled Playwright browser does not match the repo's Playwright.
- #547: the QA pod image lacks `libglib-2.0.so.0`, so `test:e2e` cannot launch Chromium.

## 5. Test plan

- `rm -rf dist && npx vitest run`: all green. Then `npm run build && npx vitest run`: all green.
- Control: an extra 20 kB in `src/main.tsx` fails the entry budget with no `npm run build`.
- `render.test.sh` as a non-root user in `ubuntu:24.04` (amd64), with and without `dpkg-deb`; the root install path as CI.
- Controls for AC-008 and AC-009: changing the compose default context, or a qa-kit tool to `fresh: false`, fails the test.
- `docker compose -f compose.build.yaml build api` once, locally.
- `npm run lint`, `npm run build`, `bash scripts/test-all.sh`.
