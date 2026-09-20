#!/usr/bin/env bash
set -euo pipefail

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_RUNTIME_OUTPUT="${CDOR_RUNTIME_OUTPUT:-$CDOR_REPOSITORY_ROOT/runtime}"

if [[ -e "$CDOR_RUNTIME_OUTPUT" ]]; then
  echo "El directorio runtime ya existe: $CDOR_RUNTIME_OUTPUT" >&2
  exit 1
fi

find "$CDOR_REPOSITORY_ROOT/node_modules/.pnpm" \
  -type f \
  -path "*/bin/esbuild" \
  -exec chmod 755 {} +

(
  cd "$CDOR_REPOSITORY_ROOT/apps/platform"
  node node_modules/vite/bin/vite.js build
)

cp \
  "$CDOR_REPOSITORY_ROOT/scripts/hostinger/server-entry.mjs" \
  "$CDOR_REPOSITORY_ROOT/apps/platform/build/index.js"

if [[ -n "${npm_execpath:-}" && -f "$npm_execpath" ]]; then
  CDOR_PNPM_COMMAND=(node "$npm_execpath")
  CDOR_PNPM_MODE="lifecycle"
elif command -v pnpm >/dev/null 2>&1; then
  CDOR_PNPM_COMMAND=(pnpm)
  CDOR_PNPM_MODE="path"
else
  echo "No se encontró el ejecutable de pnpm" >&2
  exit 1
fi

printf 'pnpm runtime: %s\n' "$CDOR_PNPM_MODE"
"${CDOR_PNPM_COMMAND[@]}" \
  --filter @cdor/platform \
  --prod \
  deploy \
  --legacy \
  "$CDOR_RUNTIME_OUTPUT"

test -f "$CDOR_RUNTIME_OUTPUT/build/index.js"
test -d "$CDOR_RUNTIME_OUTPUT/node_modules"

# Hostinger's "Other" runtime can resolve the entry file either from the
# repository root or from inside output_directory. Keep a physical compatibility
# copy so `runtime/build/index.js` starts correctly in both cases; symlinks are
# avoided because the publish step may not preserve them.
mkdir -p "$CDOR_RUNTIME_OUTPUT/runtime"
cp -a \
  "$CDOR_RUNTIME_OUTPUT/build" \
  "$CDOR_RUNTIME_OUTPUT/runtime/build"

test -f "$CDOR_RUNTIME_OUTPUT/runtime/build/index.js"
printf 'Runtime Hostinger creado: %s\n' "$CDOR_RUNTIME_OUTPUT"
