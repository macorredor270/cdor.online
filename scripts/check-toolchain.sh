#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# shellcheck source=env.sh
source "$CDOR_ROOT/scripts/env.sh"

EXPECTED_NODE="$(tr -d "[:space:]" < "$CDOR_ROOT/.node-version")"
ACTUAL_NODE="$(node --version | sed "s/^v//")"

if [[ "$ACTUAL_NODE" != "$EXPECTED_NODE" ]]; then
  echo "ERROR: Node $EXPECTED_NODE requerido; activo $ACTUAL_NODE" >&2
  exit 1
fi

if [[ "$(pnpm --version)" != "11.3.0" ]]; then
  echo "ERROR: pnpm 11.3.0 requerido" >&2
  exit 1
fi

if ! java -version 2>&1 | head -n 1 | grep -q '"17\.'; then
  echo "ERROR: JAVA_HOME no apunta a JDK 17" >&2
  exit 1
fi

for target in \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android
do
  if ! rustup target list --installed | grep -qx "$target"; then
    echo "ERROR: falta el target Rust $target" >&2
    exit 1
  fi
done

if [[ -z "${NDK_HOME:-}" || ! -d "$NDK_HOME" ]]; then
  echo "ERROR: no se encontró un Android NDK side-by-side" >&2
  exit 1
fi

node --version
pnpm --version
rustc --version
cargo --version
java -version 2>&1 | head -n 1
adb version | head -n 1
printf "ANDROID_HOME=%s\n" "$ANDROID_HOME"
printf "NDK_HOME=%s\n" "$NDK_HOME"
