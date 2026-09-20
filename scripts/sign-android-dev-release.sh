#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CDOR_ROOT"
source scripts/env.sh

CDOR_UNSIGNED_APK="apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
CDOR_SIGNED_APK="apps/mobile/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-dev-signed.apk"
CDOR_KEYSTORE="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
CDOR_APKSIGNER="$(
  find -L "$ANDROID_HOME/build-tools" -type f -name apksigner -print |
    sort -V |
    tail -n 1
)"

if [[ ! -f "$CDOR_UNSIGNED_APK" ]]; then
  printf 'ERROR: falta el APK release sin firmar; ejecuta el build primero\n' >&2
  exit 1
fi

if [[ ! -f "$CDOR_KEYSTORE" ]]; then
  printf 'ERROR: falta el keystore Android de desarrollo: %s\n' \
    "$CDOR_KEYSTORE" >&2
  exit 1
fi

if [[ ! -x "$CDOR_APKSIGNER" ]]; then
  printf 'ERROR: no se encontró apksigner en ANDROID_HOME\n' >&2
  exit 1
fi

"$CDOR_APKSIGNER" sign \
  --ks "$CDOR_KEYSTORE" \
  --ks-key-alias androiddebugkey \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out "$CDOR_SIGNED_APK" \
  "$CDOR_UNSIGNED_APK"

"$CDOR_APKSIGNER" verify --verbose "$CDOR_SIGNED_APK"
printf 'APK release de desarrollo firmado: %s\n' "$CDOR_SIGNED_APK"
