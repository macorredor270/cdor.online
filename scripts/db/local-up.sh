#!/usr/bin/env bash
set -euo pipefail

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_COMPOSE_FILE="$CDOR_REPOSITORY_ROOT/infra/local/compose.mysql.yml"
CDOR_DATABASE_ENGINE="${1:-mysql}"

case "$CDOR_DATABASE_ENGINE" in
  mysql)
    CDOR_CLIENT="mysql"
    ;;
  mariadb)
    CDOR_CLIENT="mariadb"
    ;;
  *)
    echo "Motor local no permitido: $CDOR_DATABASE_ENGINE" >&2
    exit 64
    ;;
esac

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  up --detach --wait "$CDOR_DATABASE_ENGINE"

docker compose \
  --project-name cdor-local \
  --file "$CDOR_COMPOSE_FILE" \
  exec -T \
  -e MYSQL_PWD=cdor_local_root_only \
  "$CDOR_DATABASE_ENGINE" \
  "$CDOR_CLIENT" -uroot --batch --skip-column-names \
  -e "SELECT VERSION(), @@collation_server;"
