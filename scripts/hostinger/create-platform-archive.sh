#!/usr/bin/env bash
set -euo pipefail

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_OUTPUT="${1:-$CDOR_REPOSITORY_ROOT/artifacts/cdor-platform-hostinger.tar.gz}"
CDOR_ARCHIVE_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf -- "$CDOR_ARCHIVE_ROOT"
}
trap cleanup EXIT

if [[ -n "$(git -C "$CDOR_REPOSITORY_ROOT" status --porcelain)" ]]; then
  echo "El árbol Git debe estar limpio antes de preparar el archivo" >&2
  exit 1
fi

mkdir -p -- "$(dirname -- "$CDOR_OUTPUT")"
git -C "$CDOR_REPOSITORY_ROOT" archive \
  --format=tar \
  HEAD \
  .node-version \
  .npmrc \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  scripts/hostinger/build-runtime.sh \
  scripts/hostinger/server-entry.mjs \
  apps/platform \
  packages/contracts |
  tar -xf - -C "$CDOR_ARCHIVE_ROOT"

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
  // Hostinger currently provides pnpm 11.4.0 and does not let Corepack
  // switch to the version declared by the source monorepo during install.
  manifest.packageManager = "pnpm@11.4.0";
  manifest.engines.pnpm = "11.4.0";
  manifest.type = "module";
  manifest.main = "runtime/build/index.js";
  manifest.scripts["build:platform"] = "./scripts/hostinger/build-runtime.sh";
  manifest.scripts.build = manifest.scripts["build:platform"];
  manifest.scripts.start = "node runtime/build/index.js";
  fs.writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
' "$CDOR_ARCHIVE_ROOT/package.json"

node -e '
  const fs = require("node:fs");
  const path = process.argv[1];
  const workspace = fs.readFileSync(path, "utf8");
  const adapted = workspace.replace(
    /^(\s*esbuild:\s*)true\s*$/m,
    "$1false"
  );
  if (adapted === workspace) {
    throw new Error("No se encontró allowBuilds.esbuild=true");
  }
  fs.writeFileSync(path, adapted);
' "$CDOR_ARCHIVE_ROOT/pnpm-workspace.yaml"

tar -czf "$CDOR_OUTPUT" \
  -C "$CDOR_ARCHIVE_ROOT" \
  .node-version \
  .npmrc \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  scripts/hostinger/build-runtime.sh \
  scripts/hostinger/server-entry.mjs \
  apps/platform \
  packages/contracts

if tar -tzf "$CDOR_OUTPUT" | grep -Eq '(^|/)(apps/mobile|src-tauri)(/|$)'; then
  echo "El archivo contiene código móvil no permitido" >&2
  exit 1
fi

printf 'Archivo Hostinger creado: %s\n' "$CDOR_OUTPUT"
