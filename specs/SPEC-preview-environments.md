# SPEC — Per-PR Preview Environments

**Spec ID:** SPEC-preview-environments
**Created:** 2026-11-22
**Revised:** 2026-11-22 (Joe review — workflow, quota enforcement, seed gate, cleanup)
**Author:** Walt (product lead)
**Status:** SHIPPED — 2026-11-23 (the last part, seed #637, merged 11-23): workflows #626 and #634, seed #627 and #637. Every non-docs PR gets its own preview, capped at 3 at once. Caleb approved 2026-11-22. Status line read "Ready for build" until 2026-11-25.
**Repos:** `Code/homepad` (CI workflows) · `Code/homelab` (cluster manifests, `apps/homepad/preview/`)
**Dependency:** homepad-api issue Code/homepad #623 (seed script — must land before first preview can be QA'd)

---

## 1. Problem

homepad has one shared QA slot: namespace `homepad-staging`. Every PR's
`mr-staging` workflow deploys its `:<sha>-test` image there, and the
`qa-runner` checks `/version.json` to confirm the deployed sha matches the PR
head.

Two concurrent PRs (#554/#555, 2026-11-22 21:50Z) overwrite each other's
staging deploy: the first QA fires against the second PR's image and fails.
Additionally, `staging-release` (triggered on every merge to `main`) redeploys
`homepad-staging`, which can interrupt a running PR QA.

The fix: give every open PR its own preview environment, isolated by PR number.

---

## 2. Approved design (do not reopen these choices)

| Decision | Choice |
|---|---|
| Namespace | One shared `homepad-preview` namespace; per-PR objects labelled `pr=<n>` (and `sha=<sha>`). No per-PR namespace (CI only has namespace-scoped RBAC). |
| Containers per preview | web (`homepad:<sha>-test`), api (`homepad-api` latest `-beta`), db (Postgres, `emptyDir`; `strategy: Recreate`) |
| URL | `http://pr-<n>.homepad-preview.<STAGING_IP>.nip.io` via Traefik host rule per PR. `<STAGING_IP>` is a repo literal (the value already appears in `mr-staging.yml`; a CI variable is optional but not required). |
| Seed | On **every** deploy: Code/homepad issue #623 seed script runs idempotently. Registers the QA admin from `QA_EMAIL`/`QA_PASSWORD` via `POST /api/register` (first registrant → admin, `homepad-api` `internal/api/auth.go:122`), then upserts fixed fixtures. A second run on an already-seeded DB changes nothing and exits 0. #623 owns the fixture definition; this spec does not redefine it. |
| Lifecycle | On PR open/push: deploy (or update in place) → seed → qa-gate against preview URL. On PR close or merge: teardown all `pr=<n>` objects. Daily CronJob: delete any `pr=<n>` objects where `homepad.preview/deployed-at` annotation is older than 48h (backstop for teardown failures). |
| Cap | Max 3 concurrent previews, enforced by `count/deployments.apps: 9` in the namespace ResourceQuota (see §3). |
| homepad-staging | Remains as "what's on main" (staging-release target). No longer used by PR QA. |
| Docs-only PRs | Unchanged — `ci-docs-approver` approves; no preview created. |
| CI workflow | Reuse `ci-shared` `mr-staging`; change `deploy-cmd`, `staging-url`, `qa-login-url`, and env. Only teardown is a new workflow. |

---

## 3. ResourceQuota and LimitRange

Joe creates these in `homepad-preview` (`apps/homepad/preview/02-quota.yaml`).

**ResourceQuota** (enforces the 3-preview cap):

| Resource | Limit | Derivation |
|---|---|---|
| `requests.memory` | `750Mi` | 3 × (32+64+128)Mi = 672Mi + headroom |
| `requests.cpu` | `450m` | 3 × (25+50+50)m = 375m + headroom |
| `count/deployments.apps` | `9` | 3 Deployments × 3 previews — **this is the enforcement mechanism** |

`count/deployments.apps: 9` is what makes the 10th Deployment fail at `kubectl apply`
(exits non-zero). A ResourceQuota on pod `requests.*` alone would let `kubectl apply`
exit 0 and silently fail only at the ReplicaSet/Pod level, which is not visible enough.

**db Deployment uses `strategy: Recreate`** (emptyDir volume). The web Deployment uses
`RollingUpdate` with default surge (`maxSurge: 1`). With 3 previews at max capacity the
worst-case pod count is 3 × (1 web surge + 1 web running + 1 api + 1 db) = 12 pods.
The memory and cpu request headroom in the ResourceQuota above accommodates this;
Joe should verify the arithmetic fits before applying.

**LimitRange** (`apps/homepad/preview/02-quota.yaml`, second doc): sets
per-container default requests/limits to web 32Mi/25m, api 64Mi/50m, db
128Mi/50m so pods with no explicit resources don't slip through uncapped.

**4th-preview behaviour:** `kubectl apply` for the 4th preview's Deployments fails
with a ResourceQuota exceeded error. CI surfaces this as a visible PR failure; no
auto-eviction. The developer merges or closes an older PR. If a rollout fails for
any reason, the deploy step must clean up all `pr=<n>` objects for that PR so a
partial deploy does not consume quota slots permanently (see AC-007).

---

## 4. Object layout per preview

All objects in namespace `homepad-preview`, all labelled `app=homepad,pr=<n>,sha=<sha>`,
all annotated `homepad.preview/deployed-at=<RFC3339 timestamp>`:

| Kind | Name | Notes |
|---|---|---|
| Deployment | `homepad-web-pr-<n>` | image `homepad:<sha>-test`; `strategy: RollingUpdate` |
| Deployment | `homepad-api-pr-<n>` | image `homepad-api:<latest-beta>` |
| Deployment | `homepad-db-pr-<n>` | Postgres, `emptyDir` volume; `strategy: Recreate` |
| Service | `homepad-web-pr-<n>` | port 80 |
| Service | `homepad-api-pr-<n>` | port 8080 |
| Service | `homepad-db-pr-<n>` | port 5432 |
| ConfigMap | `homepad-nginx-pr-<n>` | nginx conf; `proxy_pass http://homepad-api-pr-<n>:8080` (per-PR) |
| IngressRoute | `homepad-pr-<n>` | Traefik `Host(\`pr-<n>.homepad-preview.<STAGING_IP>.nip.io\`)` |

Templates live in `Code/homelab` at `apps/homepad/preview/template/`. CI
renders them with `envsubst` (substituting `${PR_NUMBER}` and `${IMAGE_REF}`)
and applies. Objects are **not** committed; they exist only while the PR is open.

---

## 5. Acceptance criteria

Must = blocking gate. Should = strong expectation but non-blocking if justified.

| ID | Priority | Criterion |
|---|---|---|
| AC-001 | Must | Two PRs pushed at the same time each receive a QA run against their own `:<sha>-test` build. Neither run sees the other PR's sha. (Covers the #554/#555 scenario.) |
| AC-002 | Must | A fresh preview (new emptyDir DB) seeds correctly: QA admin login succeeds using `QA_EMAIL`/`QA_PASSWORD` after seed, and the fixture data is present. |
| AC-003 | Must | A seed failure causes the PR gate to fail visibly — the CI step exits non-zero, qa-gate is not invoked, the PR is not merged. No silent green on an empty install. |
| AC-004 | Must | A merge to main (triggering `staging-release`) does not alter or restart any `homepad-preview` objects. A QA run in progress against a preview is not disrupted. |
| AC-005 | Must | Teardown on PR close/merge removes every object labelled `pr=<n>` from `homepad-preview`. Verified: a `kubectl get all,configmap,ingressroute -l pr=<n> -n homepad-preview` after teardown returns empty. |
| AC-006 | Must | The daily CronJob deletes any `pr=<n>` objects where the `homepad.preview/deployed-at` annotation is older than 48h. Verified by: (a) the CronJob spec uses a label-selector delete loop keyed on the annotation, and (b) a manual test run against a preview with a manually backdated annotation cleans it up. |
| AC-007 | Must | Attempting to deploy a 4th concurrent preview fails: `kubectl apply` exits non-zero with a ResourceQuota exceeded message. The PR gate fails visibly. The three existing previews are unaffected. Additionally: if any rollout fails to become healthy within the timeout, the deploy step deletes all `pr=<n>` objects for that PR before exiting non-zero, so partial failures do not leave orphaned objects consuming quota. |
| AC-008 | Must | qa-gate build-identity check passes: `GET /version.json` on `http://pr-<n>.homepad-preview.<STAGING_IP>.nip.io/version.json` returns `{"sha":"<PR-head-sha>"}`. |
| AC-009 | Must | Updating a PR (force-push or new commit) replaces the web deployment's image in place (no new DB), re-runs the seed (which is idempotent — changes nothing on an already-seeded DB, exits 0), then re-runs qa-gate against the updated sha. |
| AC-010 | Must | Docs-only PRs (approved by `ci-docs-approver`) produce no preview objects in `homepad-preview`. |
| AC-011 | Must | homepad-api PRs: no preview is created. The api PR continues through pr-review-only flow unchanged. |
| AC-012 | Should | The preview URL for a PR is logged or annotated (e.g. in the CI job summary) so a developer can manually visit it. |
| AC-013 | Should | A preview that fails to come healthy within 120s (rollout timeout) fails the CI step before invoking qa-gate. The deploy step must wait for all three Deployments' rollouts to complete (`kubectl rollout status --timeout=120s`) before proceeding to seed or qa-gate. |

---

## 6. Test approach

| AC | How to verify |
|---|---|
| AC-001 | Integration: push two PRs in rapid succession in a test environment (or confirm in the #554/#555 replay on a branch with preview enabled). Each `qa-gate` log shows a different sha. |
| AC-002, AC-003 | qa-gate smoke: login with `QA_EMAIL`/`QA_PASSWORD` after seed. Seed failure: break the seed script's endpoint in a test branch; confirm gate fails. |
| AC-004 | Trigger `staging-release` while a preview is in qa-gate; confirm no pod restarts in `homepad-preview` (`kubectl get events -n homepad-preview`). |
| AC-005 | After PR close, run `kubectl get all,configmap,ingressroute -l pr=<n> -n homepad-preview`; expect zero resources. |
| AC-006 | Manual: apply test objects with annotation `homepad.preview/deployed-at` set to a timestamp >48h ago; run CronJob manually with `kubectl create job --from=...`; confirm cleanup. |
| AC-007 | (a) With 3 open PRs (quota full), push a 4th; confirm CI step fails and shows ResourceQuota error. (b) Break a rollout in a test branch; confirm CI deletes `pr=<n>` objects before exiting. |
| AC-008 | qa-gate: existing sha-check in `qa-runner` against preview URL. |
| AC-009 | Push a second commit to an open PR; confirm seed runs and exits 0 (DB already seeded — no data change), image rolls, sha-check passes new sha. |
| AC-010, AC-011 | Workflow path check: docs-only and homepad-api workflows do not invoke the preview deploy step. |

---

## 7. Workflow changes (Stitch scope)

**No new `preview-deploy.yml`.** The existing `ci-shared` `mr-staging` job is reused.
Only these inputs to `mr-staging` change for Code/homepad:

- **`deploy-cmd`**: render templates from `Code/homelab` `apps/homepad/preview/template/`
  via `envsubst` (substituting `${PR_NUMBER}` and `${IMAGE_REF}`), apply to
  `homepad-preview`, wait for all three rollout statuses (`kubectl rollout status
  --timeout=120s`), then run the seed script. On any rollout failure, delete all
  `pr=<n>` objects before exiting non-zero.
- **`staging-url`**: `http://pr-${{ github.event.pull_request.number }}.homepad-preview.<STAGING_IP>.nip.io`
- **`qa-login-url`**: `http://pr-${{ github.event.pull_request.number }}.homepad-preview.<STAGING_IP>.nip.io/api/login`
- **env additions**: `KUBECONFIG_PREVIEW` (scoped SA token for `homepad-preview`),
  `QA_EMAIL`, `QA_PASSWORD` (Gitea repo secrets — see §8 Joe column). The workflow
  passes these to the seed step and never echoes them.

The seed step runs on every deploy (idempotent; AC-009). There is no "is the DB new"
check — the `/api/users/count` endpoint does not exist, and Code/homepad #623 makes
the seed itself the source of truth.

**New workflow: `.gitea/workflows/preview-teardown.yml`**

Trigger: `pull_request` → `main`, types `[closed]`

Steps:
1. Install `kubectl`; authenticate with `KUBECONFIG_PREVIEW`.
2. `kubectl delete deployment,service,configmap,ingressroute -l pr=${{ github.event.pull_request.number }} -n homepad-preview` — lists kinds explicitly (`kubectl delete all` does not cover IngressRoute/ConfigMap). No-op if the PR was never deployed (no matching objects).

**Update: `staging-release.yml`** — no change to staging deploy target. `homepad-staging`
continues to receive main pushes.

---

## 8. Ownership

| Owner | Deliverable |
|---|---|
| **Joe (cluster)** | `Code/homelab` `apps/homepad/preview/`: `00-namespace.yaml`, `01-rbac.yaml` (RoleBinding for `ci-deployer` SA), `02-quota.yaml` (ResourceQuota + LimitRange), `05-cleanup.yaml` (daily CronJob — cleans by `homepad.preview/deployed-at` annotation), `template/` (manifests with `${PR_NUMBER}` / `${IMAGE_REF}` / `deployed-at` annotation placeholders), `README.md`. Traefik routing (IngressRoute CRD or dynamic config). `KUBECONFIG_PREVIEW` CI secret scoped to `homepad-preview` namespace. **Gitea repo secrets `QA_EMAIL` and `QA_PASSWORD` on Code/homepad** (same values as the existing qa-runner Secret; needed by the deploy-cmd seed step). |
| **Stitch (code)** | `Code/homepad` `.gitea/workflows/`: update `mr-staging` inputs (`deploy-cmd`, `staging-url`, `qa-login-url`, env); new `preview-teardown.yml`. `ci-shared` changes deferred until pilot success. |
| **homepad-api** | Code/homepad issue #623 (idempotent seed script) — must be merged to `homepad-api` main before first preview can be QA'd. |
| **Per-PR objects** | Rendered by CI from `apps/homepad/preview/template/` at deploy time. Not committed. |

---

## 9. Decisions (formerly open questions)

All four original OQs are resolved:

| # | Decision |
|---|---|
| OQ-1 | **4th-preview behaviour: fail-and-wait.** `kubectl apply` fails on `count/deployments.apps` exhaustion; CI surfaces the error. No auto-eviction. |
| OQ-2 | **homepad-api PRs: pr-review only.** Fleet practice; extend to api PRs post-pilot. |
| OQ-3 | **nginx ConfigMap per-PR.** `proxy_pass` must include the PR-scoped service name. |
| OQ-4 | **KUBECONFIG_PREVIEW.** Joe creates SA `ci-deployer` in `homepad-preview`, binds it to a Role with get/list/watch/create/update/patch/delete on Deployments, Services, ConfigMaps, IngressRoutes, Pods, and Jobs in that namespace. Joe generates a kubeconfig from that SA's token and stores it as a Gitea org secret `KUBECONFIG_PREVIEW`. |

**48-h CronJob cleanup (item 6 from Joe's review):** Recommend **option (a) only —
deploy-at annotation, no Gitea token.** The teardown workflow fires on `[closed]`
and handles both merged and abandoned PRs; this is the primary cleanup path. The
48h annotation backstop covers the rare case where teardown failed or the Actions
runner was down. Adding Gitea API polling to the CronJob for PR-closed detection
(option b) duplicates the teardown trigger, requires a read-only Gitea token to
provision and rotate, and adds failure modes. A leaked preview env for ≤48h is
not a resource or security concern given the 3-preview quota and emptyDir db.
Drop option (b).

---

## 10. Out of scope

- TLS on preview URLs (`*.nip.io` has no TLS route; http only per fleet convention).
- Persistent preview databases (emptyDir only; no data survives pod restart).
- Preview URLs visible in Gitea PR comments (nice-to-have; can be added later via Gitea Deployments API).
- Per-PR namespaces (explicitly rejected by Caleb; CI RBAC is namespace-scoped).
- Extending previews to `homepad-api` PRs (OQ-2; deferred to post-pilot).
- Changes to prod release pipeline.

---

## 11. Sign-offs

**Walt (product) ✓** — Caleb approved the design 2026-11-22. No UI surface; no Kare design section required.

**Kare (design)** — Not required. This spec is CI/infra-only with no user-facing UI changes.
