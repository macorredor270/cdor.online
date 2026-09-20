#!/usr/bin/env bash
set -euo pipefail

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_COMPOSE_FILE="$CDOR_REPOSITORY_ROOT/infra/local/compose.mysql.yml"
CDOR_SOURCE_DATABASE="cdor_restore_source"
CDOR_TARGET_DATABASE="cdor_restore_target"
CDOR_TEMPORARY_DIRECTORY="$(mktemp -d)"
CDOR_DUMP_PATH="$CDOR_TEMPORARY_DIRECTORY/cdor_restore.sql"

cleanup() {
  docker compose \
    --project-name cdor-local \
    --file "$CDOR_COMPOSE_FILE" \
    exec -T \
    -e MYSQL_PWD=cdor_local_root_only \
    mysql \
    mysql -uroot \
    -e "DROP DATABASE IF EXISTS \`$CDOR_SOURCE_DATABASE\`; DROP DATABASE IF EXISTS \`$CDOR_TARGET_DATABASE\`;" \
    >/dev/null 2>&1 || true
  find "$CDOR_TEMPORARY_DIRECTORY" -type f -delete
  rmdir "$CDOR_TEMPORARY_DIRECTORY" 2>/dev/null || true
}
trap cleanup EXIT

source "$CDOR_REPOSITORY_ROOT/scripts/env.sh"
"$CDOR_REPOSITORY_ROOT/scripts/db/local-up.sh" >/dev/null

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  mysql \
  mysql -uroot \
  -e "DROP DATABASE IF EXISTS \`$CDOR_SOURCE_DATABASE\`; CREATE DATABASE \`$CDOR_SOURCE_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

DATABASE_URL="mysql://root:cdor_local_root_only@127.0.0.1:3307/$CDOR_SOURCE_DATABASE" \
  pnpm --dir "$CDOR_REPOSITORY_ROOT/apps/platform" db:migrate

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  mysql \
  mysql -uroot "$CDOR_SOURCE_DATABASE" \
  -e "INSERT INTO model_presets (id, \`key\`, display_name, provider, model_id, mode, enabled, sort_order, configuration) VALUES ('01J00000000000000000000000', 'restore-sentinel', 'Restore sentinel', 'test', 'test/model', 'balanced', true, 0, JSON_OBJECT());"

"$CDOR_REPOSITORY_ROOT/scripts/db/backup-local.sh" \
  "$CDOR_DUMP_PATH" \
  "$CDOR_SOURCE_DATABASE"

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  mysql \
  mysql -uroot \
  -e "DROP DATABASE IF EXISTS \`$CDOR_TARGET_DATABASE\`; CREATE DATABASE \`$CDOR_TARGET_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  mysql \
  mysql -uroot "$CDOR_TARGET_DATABASE" <"$CDOR_DUMP_PATH"

CDOR_RESTORED_COUNT="$(
  docker compose \
    --project-name cdor-local \
    --file "$CDOR_COMPOSE_FILE" \
    exec -T \
    -e MYSQL_PWD=cdor_local_root_only \
    mysql \
    mysql -uroot --batch --skip-column-names "$CDOR_TARGET_DATABASE" \
    -e "SELECT COUNT(*) FROM model_presets WHERE \`key\` = 'restore-sentinel';"
)"

if [[ "$CDOR_RESTORED_COUNT" != "1" ]]; then
  echo "La restauración no recuperó el registro centinela" >&2
  exit 1
fi

echo "Backup/restauración local verificados con registro centinela"
