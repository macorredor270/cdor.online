#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 1 || "$#" -gt 2 ]]; then
  echo "Uso: run-test-command.sh <db:migrate:test|test:db|test:backend|test:auth|test:repositories|test:sse|test:sync|test:idempotency|db:explain> [mysql|mariadb]" >&2
  exit 64
fi

case "$1" in
  db:migrate:test|test:db|test:backend|test:auth|test:repositories|test:sse|test:sync|test:idempotency|db:explain) ;;
  *)
    echo "Comando DB no permitido: $1" >&2
    exit 64
    ;;
esac

CDOR_REPOSITORY_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
  pwd
)"
CDOR_DATABASE_ENGINE="${2:-mysql}"

case "$CDOR_DATABASE_ENGINE" in
  mysql)
    CDOR_DATABASE_PORT="3307"
    export CDOR_TEST_EXPECTED_VERSION="^8\\.4\\."
    export CDOR_TEST_COLLATION="utf8mb4_0900_ai_ci"
    ;;
  mariadb)
    CDOR_DATABASE_PORT="3308"
    export CDOR_TEST_EXPECTED_VERSION="^11\\.8\\.8-MariaDB"
    export CDOR_TEST_COLLATION="utf8mb4_unicode_ci"
    ;;
  *)
    echo "Motor local no permitido: $CDOR_DATABASE_ENGINE" >&2
    exit 64
    ;;
esac

source "$CDOR_REPOSITORY_ROOT/scripts/env.sh"
"$CDOR_REPOSITORY_ROOT/scripts/db/local-up.sh" "$CDOR_DATABASE_ENGINE"

export CDOR_TEST_ADMIN_DATABASE_URL="mysql://root:cdor_local_root_only@127.0.0.1:$CDOR_DATABASE_PORT/mysql"
export DATABASE_URL="mysql://cdor:cdor_dev_password_only@127.0.0.1:$CDOR_DATABASE_PORT/cdor_dev"

if [[ "$1" == "db:explain" ]]; then
  pnpm --dir "$CDOR_REPOSITORY_ROOT/apps/platform" db:migrate
fi

pnpm --dir "$CDOR_REPOSITORY_ROOT/apps/platform" "$1"
