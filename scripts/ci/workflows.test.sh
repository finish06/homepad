#!/usr/bin/env bash
# Shape of homepad's workflows after the API moved in (SPEC-monorepo-api).
#
# What each check pins:
#   AC-004  every PR workflow always triggers (no on.paths) and each PR job skips
#           at step level, green, with "skipped: no web/API changes".
#   AC-005  staging-release: an `api` job, and a `web` job with `needs: api`; no
#           job-level `if:`, so a skip can't silently cut the `needs` chain.
#           With scripts/ci/staging-api-rollout.test.sh this is TC-003's proof:
#           the api job fails on a broken API, and web needs it.
#   AC-012  one mr-staging step; the API image is picked inside its deploy-cmd.
#   AC-015  go vet + go test from api/ against a Postgres 17 service.
#   AC-016  every merge to main builds both images.
#   TC-004  one GitHub tag workflow pushes both GHCR images, with no internal
#           host in the public mirror's workflow.
# A line-level reader, not a YAML parser: it knows only the 2-space layout these
# files use (`  <job>:` under `jobs:`, job keys at 4 spaces).
#
#   bash scripts/ci/workflows.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
wf="$repo/.gitea/workflows"

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

# job <file> <id>: the lines of one job.
job() {
  awk -v id="$2" '
    /^jobs:/ { injobs = 1; next }
    injobs && /^[^ #]/ { injobs = 0 }
    injobs && /^  [A-Za-z0-9_-]+:/ { cur = $1; sub(":", "", cur) }
    injobs && cur == id { print }
  ' "$1"
}
jobs_of() { awk '/^jobs:/{j=1;next} j&&/^[^ #]/{j=0} j&&/^  [A-Za-z0-9_-]+:/{s=$1; sub(":","",s); print s}' "$1" | sort | tr '\n' ' '; }
has() { grep -qE -- "$2" <<<"$1"; }
job_has() { has "$(job "$1" "$2")" "$3"; }
no_job_level_if() { ! job_has "$1" "$2" '^    if:'; }

for f in "$wf"/*.yml; do
  check "AC-004 $(basename "$f") has no paths filter" bash -c '! grep -nE "^ *paths(-ignore)?:" "$0"' "$f"
done

ci="$wf/ci.yml"
check "AC-004 ci.yml runs on every pull_request" grep -qE '^  pull_request:' "$ci"
check "AC-015 ci.yml has a web and an api job" test "$(jobs_of "$ci")" = "api web "
for j in web api; do
  check "AC-004 ci.yml $j job detects changes with scripts/ci/changed-sides.sh" job_has "$ci" $j 'scripts/ci/changed-sides\.sh'
  check "AC-004 ci.yml $j job skips at step level, not job level" no_job_level_if "$ci" $j
done
check "AC-004 ci.yml web job reports 'skipped: no web changes'" job_has "$ci" web 'skipped: no web changes'
check "AC-004 ci.yml api job reports 'skipped: no API changes'" job_has "$ci" api 'skipped: no API changes'
check "AC-015 the api job's job name is 'API (vet, build, tests)'" job_has "$ci" api '^    name: API \(vet, build, tests\)$'
check "AC-015 the api job runs against a Postgres 17 service" job_has "$ci" api 'image: postgres:17'
check "AC-015 the api job runs from api/" job_has "$ci" api 'working-directory: api'
check "AC-015 the api job runs go vet ./..." job_has "$ci" api 'run: go vet \./\.\.\.'
check "AC-015 the api job runs go test ./..." job_has "$ci" api 'run: go test \./\.\.\.'
check "AC-018 the web job runs the CI script tests" job_has "$ci" web 'scripts/ci/docs-only\.test\.sh'

e2e="$wf/e2e.yml"
check "AC-004 e2e.yml skips at step level with 'skipped: no web changes'" job_has "$e2e" e2e 'skipped: no web changes'
check "AC-004 e2e.yml has no job-level if" no_job_level_if "$e2e" e2e

mr="$wf/mr-staging.yml"
check "AC-012 mr-staging.yml has exactly one ci-shared mr-staging step" \
  test "$(grep -cE '^ *- uses: .*/Code/ci-shared/mr-staging@' "$mr")" = 1
check "AC-012 mr-staging.yml has one job" test "$(jobs_of "$mr")" = "mr-staging "
check "AC-013 its deploy-cmd picks the API image with scripts/preview/api-image.sh" grep -qF 'scripts/preview/api-image.sh' "$mr"
check "AC-013 and passes the PR's base sha for the diff" grep -qE '^ +BASE_SHA: +\$\{\{ github\.event\.pull_request\.base\.sha \}\}' "$mr"
check "AC-012 the preview keeps the per-PR concurrency group" grep -qF 'group: preview-pr-${{ github.event.pull_request.number }}' "$mr"
check "AC-012 the preview keeps the ownership-checked teardown" grep -qF 'bash scripts/preview/teardown-if-owner.sh' "$mr"
check "AC-012 the preview keeps PREVIEW_RUN" grep -qF 'PREVIEW_RUN:        ${{ github.run_id }}-${{ github.run_attempt }}' "$mr"
check "AC-012 the preview keeps the seed" grep -qF 'bash scripts/seed-qa.sh "$PREVIEW_URL"' "$mr"
# #680: the preview domain comes from the PREVIEW_DOMAIN repo variable, not a
# literal internal host (the GitHub mirror is public).
check "#680 staging-url is pr-<n>.\$PREVIEW_DOMAIN" \
  grep -qF 'staging-url: http://pr-${{ github.event.pull_request.number }}.${{ vars.PREVIEW_DOMAIN }}' "$mr"
check "#680 qa-login-url is the same host plus /api/login" \
  grep -qF 'qa-login-url: http://pr-${{ github.event.pull_request.number }}.${{ vars.PREVIEW_DOMAIN }}/api/login' "$mr"
check "#680 deploy-cmd builds PREVIEW_URL from PREVIEW_DOMAIN" \
  grep -qF 'PREVIEW_URL="http://pr-$PR_NUMBER.$PREVIEW_DOMAIN"' "$mr"
check "#680 the step maps PREVIEW_DOMAIN into its env" \
  grep -qE '^ +PREVIEW_DOMAIN: +\$\{\{ vars\.PREVIEW_DOMAIN \}\}$' "$mr"
# An unset variable must stop the deploy before the kubeconfig is written or
# anything is applied, not produce a preview at "pr-<n>.".
unset_line=$(grep -nF '::error::PREVIEW_DOMAIN repo variable is not set' "$mr" | head -1 | cut -d: -f1 || true)
kc_line=$(grep -nF '> /tmp/kc' "$mr" | head -1 | cut -d: -f1 || true)
check "#680 an empty PREVIEW_DOMAIN errors and exits 1 before the deploy touches the cluster" \
  bash -c '[ -n "$0" ] && [ "$0" -lt "$1" ] && sed -n "$0,$(($0 + 1))p" "$2" | grep -q "exit 1"' "${unset_line:-}" "${kc_line:-0}" "$mr"

sr="$wf/staging-release.yml"
check "AC-016 staging-release runs on every push to main" grep -qE '^    branches: \[main\]$' "$sr"
check "AC-005 staging-release has an api and a web job" test "$(jobs_of "$sr")" = "api web "
check "AC-005 TC-003 web needs api" job_has "$sr" web '^    needs: (api|\[ *api *\])$'
check "AC-005 api needs nothing" bash -c '! grep -q "^    needs:" <<<"$0"' "$(job "$sr" api)"
for j in api web; do
  check "AC-005 staging-release $j job has no job-level if" no_job_level_if "$sr" $j
done
check "AC-016 the api job builds homepad-api" job_has "$sr" api '^ +image-name: homepad-api$'
check "AC-016 from the api/ context" job_has "$sr" api '^ +context: api$'
check "AC-016 the web job builds homepad" job_has "$sr" web '^ +image-name: homepad$'
check "AC-005 the api job fetches apps/homepad/staging/02-api.yaml" job_has "$sr" api 'apps/homepad/staging/02-api\.yaml'
check "AC-005 AC-014 the api job rolls through scripts/ci/staging-api-rollout.sh" job_has "$sr" api 'scripts/ci/staging-api-rollout\.sh'

gh="$repo/.github/workflows/ghcr-release.yml"
check "TC-004 ghcr-release publishes ghcr.io/finish06/homepad" grep -qE 'images: ghcr\.io/finish06/homepad$' "$gh"
check "TC-004 and ghcr.io/finish06/homepad-api" grep -qE 'images: ghcr\.io/finish06/homepad-api$' "$gh"
check "TC-004 the API image builds from api/" grep -qE '^ +context: api$' "$gh"
check "TC-004 a vX.Y.Z tag triggers it" grep -qF "tags: ['v*.*.*']" "$gh"
check "TC-004 AC-011 no internal host or IP in the public GitHub workflows" \
  bash -c '! grep -rnE "svc\.cluster\.local|10\.17\.|nip\.io|calebdunn\.tech" "$0"' "$repo/.github"
check "AC-011 no internal host or IP in scripts/ci or scripts/preview/api-image.sh" \
  bash -c '! grep -nE "svc\.cluster\.local|10\.17\.|nip\.io|calebdunn\.tech" "$0"/scripts/ci/*.sh "$0"/scripts/preview/api-image.sh' "$repo"

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
