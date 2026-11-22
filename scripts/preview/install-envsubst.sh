#!/usr/bin/env bash
# Put envsubst on PATH for scripts/preview/render.sh (ci.yml and mr-staging's
# deploy-cmd). The catthehacker act runner image ships no gettext-base, and
# `apt-get update && apt-get install gettext-base` there took 2m15s (PR #626,
# runs 7028/7030). Instead: the pinned Ubuntu noble .deb, sha256-verified (pinned
# from noble's Packages index, NOT fetched alongside the .deb), and just its
# envsubst binary (needs only libc).
set -euo pipefail

command -v envsubst >/dev/null 2>&1 && exit 0
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -sSLf -o "$tmp/gettext-base.deb" \
  http://archive.ubuntu.com/ubuntu/pool/main/g/gettext/gettext-base_0.21-14ubuntu2_amd64.deb
echo "3e2806e94aba780cac11961ede06bffd14d4b840c4085be33d597ec93773fba5  $tmp/gettext-base.deb" | sha256sum -c -
dpkg-deb -x "$tmp/gettext-base.deb" "$tmp/x"
install -m 755 "$tmp/x/usr/bin/envsubst" /usr/local/bin/envsubst
