#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 1 || "$#" -gt 2 ]]; then
  echo "Uso: backup-local.sh <salida.sql> [base_local]" >&2
  exit 64
fi

CDOR_OUTPUT_PATH="$1"
CDOR_DATABASE_NAME="${2:-cdor_dev}"

if [[ ! "$CDOR_DATABASE_NAME" =~ ^cdor_[a-z0-9_]+$ ]]; then
  echo "Base fuera del scope local permitido" >&2
  exit 64
fi
if [[ -e "$CDOR_OUTPUT_PATH" ]]; then
  echo "No se sobrescribe un backup existente: $CDOR_OUTPUT_PATH" >&2
  exit 73
fi

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_COMPOSE_FILE="$CDOR_REPOSITORY_ROOT/infra/local/compose.mysql.yml"

"$CDOR_REPOSITORY_ROOT/scripts/db/local-up.sh" >/dev/null
mkdir -p -- "$(dirname -- "$CDOR_OUTPUT_PATH")"
umask 077

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  mysql \
  mysqldump -uroot \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  "$CDOR_DATABASE_NAME" >"$CDOR_OUTPUT_PATH"

chmod 600 -- "$CDOR_OUTPUT_PATH"
echo "Backup local creado: $CDOR_OUTPUT_PATH"
