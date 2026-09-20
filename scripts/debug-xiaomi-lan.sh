#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CDOR_EXPECTED_SERIAL="HQRSFUZXXOR4PN6L"
CDOR_SERIAL="${ANDROID_SERIAL:-}"
CDOR_LAN_HOST="${CDOR_LAN_HOST:-}"

if [[ -z "$CDOR_SERIAL" ]]; then
  printf 'ERROR: define ANDROID_SERIAL=%s\n' "$CDOR_EXPECTED_SERIAL" >&2
  exit 1
fi

if [[ "$CDOR_SERIAL" != "$CDOR_EXPECTED_SERIAL" ]]; then
  printf 'ERROR: se rechazó un dispositivo distinto al Xiaomi: %s\n' \
    "$CDOR_SERIAL" >&2
  exit 1
fi

if [[ "$(adb -s "$CDOR_SERIAL" get-state 2>/dev/null)" != "device" ]]; then
  printf 'ERROR: el Xiaomi %s no está conectado y autorizado\n' \
    "$CDOR_SERIAL" >&2
  adb devices -l >&2
  exit 1
fi

CDOR_MODEL="$(adb -s "$CDOR_SERIAL" shell getprop ro.product.model | tr -d '\r')"
if [[ -z "$CDOR_MODEL" ]]; then
  printf 'ERROR: ADB no devolvió el nombre del modelo para %s\n' \
    "$CDOR_SERIAL" >&2
  exit 1
fi

if [[ -z "$CDOR_LAN_HOST" ]]; then
  CDOR_LAN_HOST="$(
    ip -4 route get 1.1.1.1 |
      awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }'
  )"
fi

if [[ ! "$CDOR_LAN_HOST" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] ||
  ! ip -4 address show | grep -Fq "inet $CDOR_LAN_HOST/"; then
  printf 'ERROR: CDOR_LAN_HOST no es una IPv4 local activa: %s\n' \
    "$CDOR_LAN_HOST" >&2
  exit 1
fi

printf 'Xiaomi %s mediante LAN %s; usa solo una red de confianza\n' \
  "$CDOR_SERIAL" "$CDOR_LAN_HOST"

cd "$CDOR_ROOT"
source scripts/env.sh
export RUST_LOG="cdor_mobile=debug,tauri=info"

pnpm --dir apps/mobile tauri android dev \
  --verbose --host "$CDOR_LAN_HOST" "$CDOR_MODEL"
