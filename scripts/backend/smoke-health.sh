#!/usr/bin/env bash
set -euo pipefail

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_SMOKE_PORT="${CDOR_SMOKE_PORT:-4174}"
CDOR_TEMPORARY_DIRECTORY="$(mktemp -d)"
CDOR_SERVER_PID=""

cleanup() {
  if [[ -n "$CDOR_SERVER_PID" ]]; then
    kill -TERM "$CDOR_SERVER_PID" 2>/dev/null || true
    for _ in {1..30}; do
      if ! kill -0 "$CDOR_SERVER_PID" 2>/dev/null; then
        break
      fi
      sleep 0.1
    done
    if kill -0 "$CDOR_SERVER_PID" 2>/dev/null; then
      kill -KILL "$CDOR_SERVER_PID" 2>/dev/null || true
    fi
    wait "$CDOR_SERVER_PID" 2>/dev/null || true
  fi
  find "$CDOR_TEMPORARY_DIRECTORY" -type f -delete
  rmdir "$CDOR_TEMPORARY_DIRECTORY" 2>/dev/null || true
}
trap cleanup EXIT

source "$CDOR_REPOSITORY_ROOT/scripts/env.sh"
"$CDOR_REPOSITORY_ROOT/scripts/db/local-up.sh" mysql >/dev/null

DATABASE_URL="mysql://cdor:cdor_dev_password_only@127.0.0.1:3307/cdor_dev" \
  pnpm --dir "$CDOR_REPOSITORY_ROOT/apps/platform" db:migrate >/dev/null
pnpm --dir "$CDOR_REPOSITORY_ROOT/apps/platform" build >/dev/null

NODE_ENV=production \
ORIGIN="http://127.0.0.1:$CDOR_SMOKE_PORT" \
HOST=127.0.0.1 \
PORT="$CDOR_SMOKE_PORT" \
DB_HOST=127.0.0.1 \
DB_PORT=3307 \
DB_POOL_LIMIT=2 \
DB_NAME=cdor_dev \
DB_USER=cdor \
DB_PASSWORD=cdor_dev_password_only \
node "$CDOR_REPOSITORY_ROOT/apps/platform/build/index.js" \
  >"$CDOR_TEMPORARY_DIRECTORY/server.log" 2>&1 &
CDOR_SERVER_PID="$!"

for _ in {1..30}; do
  if curl --fail --silent \
    "http://127.0.0.1:$CDOR_SMOKE_PORT/health" \
    >"$CDOR_TEMPORARY_DIRECTORY/health.json"; then
    break
  fi
  if ! kill -0 "$CDOR_SERVER_PID" 2>/dev/null; then
    echo "El servidor terminó durante el arranque" >&2
    exit 1
  fi
  sleep 0.2
done

curl --fail --silent --dump-header \
  "$CDOR_TEMPORARY_DIRECTORY/ready.headers" \
  "http://127.0.0.1:$CDOR_SMOKE_PORT/health/ready" \
  >"$CDOR_TEMPORARY_DIRECTORY/ready.json"

CDOR_PROTECTED_STATUS="$(
  curl --silent --output "$CDOR_TEMPORARY_DIRECTORY/protected.json" \
    --write-out "%{http_code}" \
    "http://127.0.0.1:$CDOR_SMOKE_PORT/api/v1/conversations"
)"

node - "$CDOR_TEMPORARY_DIRECTORY" "$CDOR_PROTECTED_STATUS" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [root, protectedStatus] = process.argv.slice(2);
const readJson = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const health = readJson("health.json");
const ready = readJson("ready.json");
const protectedBody = readJson("protected.json");
const headers = fs.readFileSync(path.join(root, "ready.headers"), "utf8");

if (health.data?.status !== "ok" || !health.meta?.requestId) {
  throw new Error("Liveness no cumple el sobre");
}
if (ready.data?.status !== "ready" || !ready.meta?.requestId) {
  throw new Error("Readiness no cumple el sobre");
}
if (!/^x-request-id:/im.test(headers)) {
  throw new Error("Falta x-request-id");
}
if (
  protectedStatus !== "401" ||
  protectedBody.error?.code !== "UNAUTHENTICATED"
) {
  throw new Error("La ruta protegida no devolvió UNAUTHENTICATED");
}
NODE

echo "Smoke correcto: /health=200 /health/ready=200 protegida=401"
