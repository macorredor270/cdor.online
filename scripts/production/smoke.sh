#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_ORIGIN="${CDOR_ORIGIN:-https://cdor.online}"
health_headers="$(mktemp)"
health_body="$(mktemp)"
trap 'rm -f "$health_headers" "$health_body"' EXIT
curl --fail --silent --show-error --dump-header "$health_headers" "$CDOR_ORIGIN/health" >"$health_body"
grep -qi '^x-content-type-options: nosniff' "$health_headers"
grep -qi '^x-frame-options: DENY' "$health_headers"
grep -qi '^content-security-policy:' "$health_headers"
grep -q '"status":"ok"' "$health_body"
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "$CDOR_ORIGIN/api/v1/conversations")"
[[ "$status" == "401" ]]
echo "Smoke producción correcto: health=200, API sin sesión=401"
