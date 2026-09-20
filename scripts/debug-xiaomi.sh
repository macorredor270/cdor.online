#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CDOR_EXPECTED_SERIAL="HQRSFUZXXOR4PN6L"
CDOR_SERIAL="${ANDROID_SERIAL:-}"

if [[ -z "$CDOR_SERIAL" ]]; then
  printf '%s\n' \
    "ERROR: define ANDROID_SERIAL=$CDOR_EXPECTED_SERIAL" \
    "Dispositivos visibles:" >&2
  adb devices -l >&2
  exit 1
fi

if [[ "$CDOR_SERIAL" != "$CDOR_EXPECTED_SERIAL" ]]; then
  printf 'ERROR: este script solo admite el Xiaomi %s; recibido %s\n' \
    "$CDOR_EXPECTED_SERIAL" "$CDOR_SERIAL" >&2
  exit 1
fi

if [[ "$(adb -s "$CDOR_SERIAL" get-state 2>/dev/null)" != "device" ]]; then
  printf 'ERROR: el Xiaomi %s no está conectado y autorizado\n' \
    "$CDOR_SERIAL" >&2
  adb devices -l >&2
  exit 1
fi

CDOR_MODEL="$(adb -s "$CDOR_SERIAL" shell getprop ro.product.model | tr -d '\r')"
CDOR_DEVICE="$(adb -s "$CDOR_SERIAL" shell getprop ro.product.device | tr -d '\r')"
if [[ -z "$CDOR_MODEL" ]]; then
  printf 'ERROR: ADB no devolvió el nombre del modelo para %s\n' \
    "$CDOR_SERIAL" >&2
  exit 1
fi
printf 'Dispositivo CDOR: %s (%s) [%s]\n' \
  "$CDOR_MODEL" "$CDOR_DEVICE" "$CDOR_SERIAL"

adb -s "$CDOR_SERIAL" reverse --remove tcp:1420 >/dev/null 2>&1 || true
adb -s "$CDOR_SERIAL" reverse --remove tcp:1421 >/dev/null 2>&1 || true
adb -s "$CDOR_SERIAL" reverse tcp:1420 tcp:1420
adb -s "$CDOR_SERIAL" reverse tcp:1421 tcp:1421

cleanup() {
  adb -s "$CDOR_SERIAL" reverse --remove tcp:1420 >/dev/null 2>&1 || true
  adb -s "$CDOR_SERIAL" reverse --remove tcp:1421 >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$CDOR_ROOT"
source scripts/env.sh
export CDOR_ANDROID_USB=1
export RUST_LOG="cdor_mobile=debug,tauri=info"

pnpm --dir apps/mobile tauri android dev \
  --verbose --host 127.0.0.1 "$CDOR_MODEL"
