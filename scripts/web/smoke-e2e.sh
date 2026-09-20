#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CDOR_PORT=4177
CDOR_LOG="$(mktemp)"

cleanup() {
  if [[ -n "${CDOR_SERVER_PID:-}" ]]; then
    kill "$CDOR_SERVER_PID" >/dev/null 2>&1 || true
    wait "$CDOR_SERVER_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$CDOR_LOG"
}
trap cleanup EXIT INT TERM

cd "$CDOR_ROOT/apps/platform"
HOST=127.0.0.1 PORT="$CDOR_PORT" ORIGIN="http://127.0.0.1:$CDOR_PORT" \
  node build >"$CDOR_LOG" 2>&1 &
CDOR_SERVER_PID=$!

for _ in {1..40}; do
  if curl --fail --silent "http://127.0.0.1:$CDOR_PORT/health" >/dev/null; then
    break
  fi
  if ! kill -0 "$CDOR_SERVER_PID" >/dev/null 2>&1; then
    sed -n '1,120p' "$CDOR_LOG" >&2
    exit 1
  fi
  sleep 0.25
done

CDOR_HOME="$(curl --fail --silent "http://127.0.0.1:$CDOR_PORT/")"
CDOR_PRIVACY="$(curl --fail --silent "http://127.0.0.1:$CDOR_PORT/privacy")"
CDOR_TERMS="$(curl --fail --silent "http://127.0.0.1:$CDOR_PORT/terms")"
CDOR_ROBOTS="$(curl --fail --silent "http://127.0.0.1:$CDOR_PORT/robots.txt")"
CDOR_PROTECTED_STATUS="$(
  curl --silent --output /dev/null --write-out '%{http_code}' \
    "http://127.0.0.1:$CDOR_PORT/chat"
)"

# Anclado a marcadores estructurales, no al copy: la portada se reescribe a
# menudo y una aserción sobre el texto comercial convierte cada retoque en un
# fallo de smoke.
# Se comprueba que exista un título no vacío, no cuál es: la marca ha cambiado
# dos veces y cada renombrado rompía este smoke.
grep -Eq "<title>[^<]+</title>" <<<"$CDOR_HOME"
# `auth-title` lo emite AuthCard, que comparten portada, registro, verificación
# y las dos pantallas de contraseña: el ancla ya no depende de una página.
grep -Fq 'id="auth-title"' <<<"$CDOR_HOME"
grep -Fq 'href="/register"' <<<"$CDOR_HOME"
grep -Fq "Privacidad" <<<"$CDOR_PRIVACY"
grep -Fq "Términos de uso" <<<"$CDOR_TERMS"
grep -Fq "Disallow: /chat" <<<"$CDOR_ROBOTS"
[[ "$CDOR_PROTECTED_STATUS" == "303" ]]

printf '%s\n' "Smoke web correcto: páginas públicas 200 y aplicación privada 303"
