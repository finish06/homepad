# Which tests run where

**CI is the gate.** A PR merges only when these three checks pass on its head
commit (branch protection on `main`):

| Check | Workflow | What it runs |
|---|---|---|
| `CI / Web (build, unit tests)` | `.gitea/workflows/ci.yml` | preview and CI shell tests, `npm run lint`, `npm run build`, `npx vitest run` |
| `CI / API (vet, build, tests)` | `.gitea/workflows/ci.yml` | `go vet ./...`, `go build ./...`, `go test ./... -count=1 -p 1` against a throwaway Postgres |
| `Browser gate` | `.gitea/workflows/browser-gate.yml` | `npm run test:gate` (real Chromium, mocked API) — only when the PR touches a surface the suite pins; otherwise a no-op pass |

Each job checks which side the PR changed and skips its steps when that side
didn't change. A change under `scripts/ci/` or `.gitea/` counts as both sides.
The browser gate's trigger is `scripts/ci/gate-surfaces.sh` and it fails closed
— an unreadable diff runs the suite, never a green no-op. The contract is in
[cicd.md](cicd.md#the-browser-gate).

**QA reviews what CI can't:** the running preview of the PR, the spec, and the
diff. Its runner has no Go and does not install packages, so a QA review that
says a repo gate was "not measured" is expected. The CI result for that commit
is the answer. Do not file a new issue for it; #691 tracks it.

## Run the gates yourself

```bash
npm run test:all
```

It runs every gate CI runs and ends with a list: PASS, FAIL, or NOT RUN with
the reason (no `node_modules`, no Go, no `DATABASE_URL`). It installs nothing.
Exit 0 means everything ran and passed, 1 means a failure, 2 means some gates
could not run on this machine.

For the Go tests, start a throwaway database first, or use `cd api && make test-db`:

```bash
cd api && make db-up
DATABASE_URL='postgres://homepad:homepad@localhost:5432/homepad_test?sslmode=disable' npm run test:all
```

## Things that used to need setup

- **No `npm run build` before vitest.** `bundle-budget` and `pwa-icons` check
  the built app. Each vitest run now builds it once (about 3 s) into
  `node_modules/.cache/homepad-test-dist` and checks that, so they always see
  the current source. A failed build fails the run.
- **No root for `render.test.sh`.** If `envsubst` is missing, the test fetches
  the pinned one into `~/.local/bin` (or `$ENVSUBST_BIN_DIR`). The pinned binary
  is Linux x86_64. On macOS, `brew install gettext`.
- **`docs-only.test.sh` needs Gitea.** It fetches the shared action it tests.
  Off that network, `test:all` reports it NOT RUN. `ACTION_YML=<file>` runs it
  on a local copy.
- **Browser tests are separate.** `npm run test:gate` and `npm run test:e2e`
  need a Playwright browser that matches `@playwright/test`
  (`npm run test:e2e:install`). On a QA pod the gate attaches to the CDP
  sidecar instead, and every test gets a fresh browser context, so the
  sidecar's cache from an earlier task can't leak in (#254).
