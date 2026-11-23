#!/usr/bin/env bash
# The API image for this PR's preview, for mr-staging's deploy-cmd
# (SPEC-monorepo-api AC-012, AC-013). Prints the image ref on stdout; all
# progress, including the build's, goes to stderr.
#
#   BASE_SHA=… PR_SHA=… REGISTRY=… IMAGE_TAG=<short sha>-test BUILD_PUSH=<build-push.sh> \
#     bash scripts/preview/api-image.sh
#
# - The PR touches api/ (scripts/ci/changed-sides.sh): build and push
#   homepad-api:<sha>-test, plus the immutable :<sha>, from api/ with
#   api/Dockerfile. BUILD_PUSH is ci-shared's own build-push.sh, the script the
#   mr-staging action builds the web image with, so both images build the same way
#   inside the one mr-staging step.
# - Otherwise: main's API, i.e. whatever homepad-staging runs. The preview
#   deployer may read exactly that field (homelab apps/homepad/preview/01-rbac.yaml).
set -euo pipefail
: "${BASE_SHA:?}" "${PR_SHA:?}" "${REGISTRY:?}" "${IMAGE_TAG:?}"

sides=$(bash "$(dirname "$0")/../ci/changed-sides.sh" "$BASE_SHA" "$PR_SHA")
if [ "$(sed -n 's/^api=//p' <<<"$sides")" = true ]; then
  ref="$REGISTRY/homepad-api:$IMAGE_TAG"
  echo "PR touches api/: building $ref" >&2
  DESTINATIONS="$ref
$REGISTRY/homepad-api:${IMAGE_TAG%-test}" DOCKERFILE=Dockerfile CONTEXT=api GIT_SHA="$PR_SHA" \
    bash "${BUILD_PUSH:?}" >&2
  echo "$ref"
else
  echo "no API changes: the preview runs main's API (homepad-staging's homepad-api)" >&2
  kubectl -n homepad-staging get deploy homepad-api -o jsonpath='{.spec.template.spec.containers[0].image}'
fi
