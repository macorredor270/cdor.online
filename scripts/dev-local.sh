#!/usr/bin/env bash
set -Eeuo pipefail

CDOR_REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CDOR_REPOSITORY_ROOT"

source scripts/env.sh

# El .env raíz contiene los secretos privados del desarrollador. Se cargan
# solo en este proceso y se sustituyen abajo las credenciales de la base local.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

./scripts/db/local-up.sh mysql

export DB_HOST=127.0.0.1
export DB_PORT=3307
export DB_NAME=cdor_dev
export DB_USER=cdor
export DB_PASSWORD=cdor_dev_password_only
export DATABASE_URL=mysql://cdor:cdor_dev_password_only@127.0.0.1:3307/cdor_dev
export ORIGIN=http://localhost:5173
export BETTER_AUTH_URL=http://localhost:5173
export AUTH_SIGN_UP_ENABLED=true

pnpm --dir apps/platform db:migrate
exec pnpm --dir apps/platform dev --host "${CDOR_DEV_HOST:-0.0.0.0}"
