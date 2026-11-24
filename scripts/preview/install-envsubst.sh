#!/usr/bin/env bash
# Put envsubst on PATH for scripts/preview/render.sh (ci.yml and mr-staging's
# deploy-cmd). The catthehacker act runner image ships no gettext-base, and
# `apt-get update && apt-get install gettext-base` there took 2m15s (PR #626,
# runs 7028/7030). Instead: the pinned Ubuntu noble .deb, sha256-verified (pinned
# from noble's Packages index, NOT fetched alongside the .deb), and just its
# envsubst binary (needs only libc).
#
# Works without root (#639, SPEC-test-infra-18.3.0 AC-004). It installs into the
# first of these it can write:
#   $ENVSUBST_BIN_DIR (if set) -> /usr/local/bin -> $HOME/.local/bin
# and prints that folder on stdout, so a caller can add it to PATH:
#   PATH="$(bash scripts/preview/install-envsubst.sh):$PATH"
# If envsubst is already on PATH it prints its folder and downloads nothing.
set -euo pipefail

if existing="$(command -v envsubst 2>/dev/null)"; then
  dirname "$existing"
  exit 0
fi

die() { echo "install-envsubst: $*" >&2; exit 1; }

case "$(uname -s)/$(uname -m)" in
  Linux/x86_64 | Linux/amd64) ;;
  *) die "the pinned binary is for Linux x86_64 only, not $(uname -s)/$(uname -m). Install gettext from your package manager (macOS: brew install gettext)." ;;
esac

if [ -n "${ENVSUBST_BIN_DIR:-}" ]; then
  dest=$ENVSUBST_BIN_DIR
elif [ -w /usr/local/bin ]; then
  dest=/usr/local/bin
else
  dest="$HOME/.local/bin"
fi
mkdir -p "$dest" 2>/dev/null || die "cannot create $dest. Set ENVSUBST_BIN_DIR to a folder you can write."
[ -w "$dest" ] || die "cannot write $dest. Set ENVSUBST_BIN_DIR to a folder you can write."

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -sSLf -o "$tmp/gettext-base.deb" \
  http://archive.ubuntu.com/ubuntu/pool/main/g/gettext/gettext-base_0.21-14ubuntu2_amd64.deb
echo "3e2806e94aba780cac11961ede06bffd14d4b840c4085be33d597ec93773fba5  $tmp/gettext-base.deb" | sha256sum -c - >&2

# dpkg-deb where there is one. Otherwise unpack by hand: a .deb is an ar archive
# whose data.tar.zst holds the files.
mkdir "$tmp/x"
if command -v dpkg-deb >/dev/null 2>&1; then
  dpkg-deb -x "$tmp/gettext-base.deb" "$tmp/x"
elif command -v ar >/dev/null 2>&1 && command -v zstd >/dev/null 2>&1; then
  (cd "$tmp" && ar x gettext-base.deb data.tar.zst)
  zstd -dc "$tmp/data.tar.zst" | tar -x -C "$tmp/x" ./usr/bin/envsubst
else
  die "need dpkg-deb, or ar and zstd, to unpack the .deb."
fi
install -m 755 "$tmp/x/usr/bin/envsubst" "$dest/envsubst"
echo "install-envsubst: installed $dest/envsubst" >&2
echo "$dest"
