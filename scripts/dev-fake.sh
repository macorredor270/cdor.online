#!/usr/bin/env bash
# Arranca MAC en local con un proveedor de IA falso (sin claves reales).
set -Eeuo pipefail
cd "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source scripts/env.sh

PORT="${FAKE_PROVIDER_PORT:-4010}"
node scripts/fake-provider.mjs "$PORT" &
FAKE_PID=$!
trap 'kill "$FAKE_PID" 2>/dev/null || true' EXIT

export CDOR_FAKE_AI_PORT="$PORT"
bash scripts/dev-local.sh
