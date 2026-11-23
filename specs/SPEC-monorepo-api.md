# Spec: One repo for the web app and the API

**Spec ID:** SPEC-monorepo-api
**Version:** 0.4.0
**Created:** 2026-11-22
**Author:** Claude (Caleb asked, 2026-11-22: "thoughts on merging homepad-api and homepad-ui into same repo?")
**Status:** Shipped 2026-11-23 (85e1a67)
**Repo:** `Code/homepad` (receives the API) + `Code/homepad-api` (archived at the end) + `Code/ci-shared` and `Code/homelab` (Joe; see §6)
**Estimate:** ~2 days of repo work, plus Joe's CI and staging changes
**Depends on:** 18.0.1 shipped first (M9), and per-PR preview environments live (SPEC-preview-environments, #624), so API changes get their own preview instead of the shared staging slot
**Target version:** the first release after 18.0.1. The move itself changes no product behaviour.

---

## 0. Open questions

**Answered by Joe (PR #625, 2026-11-22):**

- **J1. ci-shared with two images: no ci-shared change.** `mr-staging` and `staging-release` already take `image-name`, `dockerfile` and `context`. But **no workflow-level path filters**: `main` requires status checks, and a workflow skipped by `on.paths` never reports, so the PR can never merge. Every workflow always triggers and decides inside the job (AC-004). Use **one** mr-staging step per PR, since mr-staging dispatches QA and two would race (AC-012).
- **J2. Per-PR staging for API changes: yes, through previews,** not the shared slot (#493). The preview template takes `${API_IMAGE}`. If the PR touches `api/`, use the PR's `homepad-api:<sha>-test`, else main's (AC-013).
- **J3. Order on merge:** one staging-release workflow with an `api` job and a `web` job that `needs: api`. The `api` job waits on `rollout status` and fails the run if the API isn't ready. Skips happen at step level, not job level, to be safe with `needs` (AC-005).
- **J4. pg_dump in CI: no.** The dump that matters is prod's, and it stays Joe's manual pre-release step. Staging's database is throwaway QA data, and the CI deployer is deliberately get/patch only. Instead, staging-release fails loudly when a migration fails (AC-014).
- **J5. QA dispatch: nothing to change.** The recipe is picked only from `staging-url`, and the recipes have no repo- or language-specific rules. `go vet` and `go test` go in a required CI job (AC-015).
- **J6. homelab pins: unchanged shape, and better.** Build **both** images on every merge to main, so every main SHA has a matching pair and prod is described by one SHA (AC-016).

**Decided by Caleb (2026-11-22):**

- **C1. Go module path: `github.com/finish06/homepad/api`** (option a; Joe agreed). Today it is the internal Gitea hostname plus `/code/homepad-api`, in 115 `.go` files, and that hostname is on the public GitHub mirror. The new path removes it.
- **C2. When: now.** 18.0.1 shipped (2026-11-23 00:06Z), preview environments are live (#626) and the seed is merged (#627, #637).

## 1. Overview

Homepad is two repos that always ship together: `Code/homepad` (React web app, specs, docs, the CHANGELOG) and `Code/homepad-api` (Go API, migrations). They already share a version number: both are tagged `v18.0.0`. They deploy as a pair, API first.

Keeping them apart costs time on every cross-stack feature. 18.0.0 needed paired PRs (API #108 and #110 with web #605 and #608), timed by hand and reviewed twice. All specs sit in the web repo, even when most of the work is in the API. Agents need two checkouts and two briefs.

This spec moves the API into `Code/homepad` under `api/` with its full history, keeps both images and their names, and archives `Code/homepad-api`.

## 2. Target layout

```
homepad/
  api/                 ← all of homepad-api: cmd/ internal/ migrations/ Dockerfile go.mod …
  src/ tests/ …        ← the web app, unchanged
  specs/ docs/         ← unchanged; API-only docs move to docs/api/ if they don't fit
  CHANGELOG.md         ← one changelog
  .gitea/workflows/    ← web and API workflows, path-filtered
  .github/workflows/   ← one ghcr-release that builds both images
```

The web stays at the root, so the web's paths, configs and tests don't move.

## 3. Acceptance Criteria

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-001 | `api/` holds the whole API tree, imported with its history: `git filter-repo --to-subdirectory-filter api` on a copy of homepad-api, then a merge with `--allow-unrelated-histories` (not `subtree add`). `git log -- api/internal/…` shows the old commits. | Must |
| AC-002 | The Go module path is changed to `github.com/finish06/homepad/api` (C1) in `api/go.mod` and every import. `go build ./...` and `go test ./... -count=1 -p 1` pass from `api/`. | Must |
| AC-003 | Both images keep their names: `homepad` (web) and `homepad-api` (API), on the internal registry and on GHCR (`ghcr.io/finish06/homepad`, `ghcr.io/finish06/homepad-api`). | Must |
| AC-004 | Every workflow triggers on every PR, with no `on.paths` filter. Each job finds what changed (`git diff --name-only base..head`) and, when its side didn't change, exits green with "skipped: no web changes" or "skipped: no API changes". So every required check always reports. Docs-only changes keep their current fast path. | Must |
| AC-005 | staging-release has an `api` job and a `web` job with `needs: api`. The `api` job rolls the API, waits on `rollout status`, and fails the run if it isn't ready, so the web never rolls onto a broken API (J3). | Must |
| AC-006 | One tag `vX.Y.Z` on homepad publishes both images at `:X.Y.Z` on GHCR, and both report version `X.Y.Z`. | Must |
| AC-007 | The quickstart `compose.yaml` and the README install steps still work from a clean host, unchanged for users. | Must |
| AC-008 | `Code/homepad-api` is archived with a README pointing to `Code/homepad/api`. Its GitHub mirror is archived the same way. Nothing is deleted. | Must |
| AC-009 | The open homepad-api issues are moved to homepad (re-filed, with links both ways). Old `homepad-api#NN` references in specs and the CHANGELOG stay as they are; they still resolve in the archived repo. | Should |
| AC-010 | `CLAUDE.md`, `docs/development.md` and the README describe one repo: how to run the API and the web together locally, and where each lives. | Must |
| AC-011 | No internal hostname or IP is added to a tracked file. The new module path (C1) removes one. | Must |
| AC-012 | One mr-staging step per PR. It builds or rolls whichever images changed and dispatches QA once (J1). | Must |
| AC-013 | A PR that touches `api/` gets a preview whose API is that PR's `homepad-api:<sha>-test`; other PRs get main's API (J2). | Must |
| AC-014 | When a migration fails on staging, staging-release fails and says so (the API's boot log reports `migrations applied (N new)`; readiness is checked). The prod pg_dump stays a manual release step (J4). | Must |
| AC-015 | `go vet` and `go test` run in a required CI job (J5). | Must |
| AC-016 | Every merge to main builds and pushes both images at that SHA, even when only one side changed (J6). | Must |
| AC-017 | Branch protection on `main` lists the new required checks in the same change as the workflows, so no PR deadlocks waiting on a check that never reports. | Must |
| AC-018 | A test pins the docs-only rule: `api/migrations/*.sql` never counts as docs-only, while `api/README.md` and `api/docs/` do. | Must |
| AC-019 | The demo build (`homelab apps/demo-status/build-job.yaml`) clones `Code/homepad` and builds from `api/` before homepad-api is archived. | Must |
| AC-020 | The `homepad` GitHub repo's workflow has write access to the `ghcr.io/finish06/homepad-api` package, checked on a test tag before the first real release. | Must |
| AC-021 | homepad has every Actions secret and variable homepad-api uses (e.g. `QA_BACKEND`, registry and NATS secrets), compared list against list before the archive. | Must |

## 4. User Test Cases

- **TC-001 Web-only PR.** Change a file in `src/`. The web jobs run; the Go jobs report green as skipped. The preview runs the PR's web with main's API.
- **TC-002 API-only PR.** Change a file in `api/internal/`. The Go jobs run; the web jobs report green as skipped. The PR's preview runs the PR's API with main's web (AC-013).
- **TC-003 Paired PR with a migration.** Add a migration and the web code that uses it. On merge, the pg_dump is taken (J4), the API rolls and becomes ready, then the web rolls.
- **TC-004 Release.** Tag `vX.Y.Z`. GHCR has `homepad:X.Y.Z` and `homepad-api:X.Y.Z`; both `/version.json` and the API version report `X.Y.Z`.
- **TC-005 Clean install.** On a clean Docker host, the README's one-command install comes up healthy.

## 5. Migration plan

1. **Prerequisites.** 18.0.1 shipped. Preview environments live (#624, Stitch's workflows, seed #623). No open homepad-api PRs.
2. **CI first, on a branch** (Joe): always-on workflows with in-job change detection, one mr-staging step, the two-job staging-release, both images on every merge, `go test` in CI, the new required checks (AC-004, AC-005, AC-012–AC-017). Prove it with TC-001–TC-003 against **a preview**, not staging.
3. **Import** on that branch: history (AC-001), module path (AC-002). The API's own workflows are removed; they are now jobs in the root workflows.
4. **Before merge:** GHCR package access checked on a test tag (AC-020). Secrets and vars compared (AC-021). The demo build switched to `Code/homepad` (AC-019).
5. **Merge** through QA as usual.
6. **Cut over:** the next release is tagged only on homepad. Archive homepad-api and its mirror, read-only (AC-008). Move the open issues (AC-009).
7. **Docs** (AC-010), plus the references outside this repo: the ci-shared consumers doc (`consumers/homepad/README.md`) and joe-ops notes that name homepad-api.

**Rollback.** Until step 6, homepad-api is untouched and still deployable, and reverting the merge PR returns to two repos. That stops being true once the first API change lands in `api/`: from then on the two have diverged. So homepad-api is archived read-only, not deleted, and there is no going back by revert after that point.

## 6. Who does what

| Part | Owner |
|---|---|
| Import, module path, docs, issue move | Claude (homepad session) |
| Preview environments (prerequisite) | Stitch via Joe |
| GHCR package access (AC-020) | Caleb (GitHub package settings) |
| Workflows, required checks, preview wiring, staging order, secrets, demo build (J1–J5, AC-017, AC-019, AC-021) | Joe |
| homelab pins (J6) | Joe / Gus |
| Go-ahead and the C1/C2 decisions | Caleb |

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A path filter misses a file and a change ships untested | MED | HIGH | A root-level change (lockfiles, workflows, compose) runs every job; a test pins the filter lists |
| Web rolls before the API on staging | LOW | HIGH | Ordered jobs with a rollout wait (AC-005); TC-003 proves it before merge |
| A required check never reports and PRs deadlock | MED | HIGH | No `on.paths` filters; in-job skips that exit green; protection updated in the same change (AC-004, AC-017) |
| Two QA runs race on one PR | MED | MED | One mr-staging step per PR (AC-012) |
| The demo build breaks when homepad-api is archived | HIGH if missed | MED | Switched before the archive (AC-019) |
| The first tag fails to push `homepad-api` to GHCR | MED | MED | Package access checked on a test tag (AC-020) |
| History import breaks blame or bisect | LOW | LOW | `git log --follow` checked on a few files in review |

## 8. Out of Scope

- Changing how prod is promoted: it stays manual and digest-pinned from `Code/homelab`.
- Merging the two images into one.
- Moving getHomepad (the marketing site) in. It deploys on its own and has no code in common.

## 9. Sign-offs

| Role | Who | Status |
|---|---|---|
| CI / staging / homelab | Joe | Reviewed 2026-11-22: "Yes", after 18.0.1 and previews (PR #625) |
| Decision | Caleb | Approved 2026-11-22: module path `github.com/finish06/homepad/api`, start now |

## 10. Revision History

| Date | Version | Changes |
|---|---|---|
| 2026-11-22 | 0.1.0 | First draft, for Joe's review |
| 2026-11-22 | 0.2.0 | Joe's review folded in: J1–J6 answered; AC-004 and AC-005 rewritten; AC-012–AC-021 added; previews made a prerequisite; migration plan, rollback and risks updated |
| 2026-11-22 | 0.3.0 | Approved by Caleb: C1 = `github.com/finish06/homepad/api`, C2 = start now (prerequisites met) |
| 2026-11-23 | 0.4.0 | Shipped: the API merged under `api/` with its history (85e1a67, PR #642). homepad-api archived on Gitea and GitHub; releases are tagged only on homepad. AC-010 docs: CLAUDE.md, docs/development.md, README and api/README.md describe one repo |
