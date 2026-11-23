#!/usr/bin/env bash
# Which API a PR's preview runs (SPEC-monorepo-api AC-012, AC-013).
#
# scripts/preview/api-image.sh prints the API image for mr-staging's deploy-cmd.
# A PR that touches api/ gets its own homepad-api:<sha>-test, built inside the
# one mr-staging step by ci-shared's build-push.sh; every other PR gets main's
# API, read from homepad-staging. The diff is a real one (scratch git repo);
# kubectl and build-push.sh are stubs that log their calls.
#
#   bash scripts/preview/api-image.test.sh
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat > "$work/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >> "$STUB_LOG"
printf '%s' registry.example/homepad-api:79e3b03-beta
STUB
cat > "$work/build-push.sh" <<'STUB'
#!/usr/bin/env bash
{ echo "build-push CONTEXT=$CONTEXT DOCKERFILE=$DOCKERFILE GIT_SHA=$GIT_SHA REGISTRY=$REGISTRY"
  printf 'dest %s\n' $DESTINATIONS; } >> "$STUB_LOG"
echo "Kaniko build output that must not end up in API_IMAGE"
exit "${STUB_BUILD_RC:-0}"
STUB
chmod +x "$work/bin/kubectl" "$work/build-push.sh"

pass=0 fail=0
check() { # check <AC id + name> <command...>
  local name=$1; shift
  if "$@"; then pass=$((pass + 1)); echo "ok   - $name"
  else fail=$((fail + 1)); echo "FAIL - $name"; fi
}

g() { git -C "$work/r" -c user.name=t -c user.email=t@example.invalid "$@"; }
git init -q -b main "$work/r"
mkdir -p "$work/r/src" "$work/r/api/internal"
echo a > "$work/r/src/App.tsx"; echo a > "$work/r/api/internal/x.go"
g add -A; g commit -qm base
base=$(g rev-parse HEAD)
g checkout -q -b web; echo b >> "$work/r/src/App.tsx"; g commit -qam web; web=$(g rev-parse HEAD)
g checkout -q -b api "$base"; echo b >> "$work/r/api/internal/x.go"; g commit -qam api; api=$(g rev-parse HEAD)

# pick <head sha> [build exit code]: the image lands in $work/image, logs in $work/calls.
pick() {
  : > "$work/calls"
  (cd "$work/r" && PATH="$work/bin:$PATH" STUB_LOG="$work/calls" STUB_BUILD_RC=${2:-0} \
    BASE_SHA="$base" PR_SHA="$1" REGISTRY=registry.example IMAGE_TAG="${1:0:7}-test" \
    BUILD_PUSH="$work/build-push.sh" \
    bash "$repo/scripts/preview/api-image.sh" > "$work/image" 2> "$work/err")
}
image_is() { [ "$(cat "$work/image")" = "$1" ]; }
logged() { grep -qxF "$1" "$work/calls"; }
not_logged() { ! grep -q "$1" "$work/calls"; }

pick "$api" || :
check "AC-013 TC-002 an API PR's preview runs its own homepad-api:<sha>-test" \
  image_is "registry.example/homepad-api:${api:0:7}-test"
check "AC-012 the API image is built from api/ with api/Dockerfile" \
  logged "build-push CONTEXT=api DOCKERFILE=Dockerfile GIT_SHA=$api REGISTRY=registry.example"
check "AC-012 it is pushed as :<sha>-test" logged "dest registry.example/homepad-api:${api:0:7}-test"
check "AC-012 and as the immutable :<sha>" logged "dest registry.example/homepad-api:${api:0:7}"
check "AC-013 an API PR does not read main's API" not_logged kubectl
check "AC-013 the build's own output stays out of the image name" test "$(wc -l < "$work/image")" -le 1

pick "$web" || :
check "AC-013 TC-001 a web PR's preview runs main's API (what homepad-staging runs)" \
  image_is registry.example/homepad-api:79e3b03-beta
check "AC-013 main's API is read from the homepad-staging Deployment" \
  logged "kubectl -n homepad-staging get deploy homepad-api -o jsonpath={.spec.template.spec.containers[0].image}"
check "AC-012 a web PR builds no API image" not_logged build-push

build_fails() { ! pick "$api" 1; }
check "AC-012 a failed API build fails the deploy" build_fails

echo "# $pass passed, $fail failed"
[ "$fail" -eq 0 ]
