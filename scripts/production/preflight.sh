#!/usr/bin/env bash
set -Eeuo pipefail

required=(NODE_ENV ORIGIN BETTER_AUTH_URL AUTH_SIGN_UP_ENABLED DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD BETTER_AUTH_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM NVIDIA_API_KEY NVIDIA_BASE_URL NVIDIA_DEFAULT_MODEL OPENROUTER_API_KEY OPENROUTER_BASE_URL GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET)
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing+=("$name"); fi
done
if ((${#missing[@]})); then
  printf 'Faltan variables de producción: %s\n' "${missing[*]}" >&2
  exit 1
fi

if [[ "$NODE_ENV" != "production" ]]; then
  echo "NODE_ENV debe ser production" >&2
  exit 1
fi
if [[ "$ORIGIN" != https://* || "$BETTER_AUTH_URL" != https://* ]]; then
  echo "ORIGIN y BETTER_AUTH_URL deben usar HTTPS" >&2
  exit 1
fi
# El registro público está abierto por decisión explícita del proyecto. La
# puerta deja de bloquear el alta, pero exige que el correo de verificación
# tenga transporte: sin SMTP configurado, cada alta crearía una cuenta que su
# dueño nunca podría activar.
#
# No se comprueba el DNS del remitente: la verificación del dominio vive en el
# proveedor y no es observable desde aquí con la API key de envío.
if [[ "${AUTH_SIGN_UP_ENABLED:-false}" != "true" ]]; then
  echo "AUTH_SIGN_UP_ENABLED debe ser true para permitir crear cuentas" >&2
  exit 1
fi
if [[ "${AUTH_SIGN_UP_ENABLED}" == "true" ]]; then
  if [[ -z "${SMTP_PASSWORD:-}" || -z "${SMTP_FROM:-}" ]]; then
    echo "Registro abierto sin SMTP configurado: nadie podría verificar su correo" >&2
    exit 1
  fi
fi
for name in DB_PASSWORD BETTER_AUTH_SECRET SMTP_PASSWORD NVIDIA_API_KEY OPENROUTER_API_KEY GITHUB_CLIENT_SECRET GOOGLE_CLIENT_SECRET; do
  if [[ "${!name}" == *$'\n'* || "${!name}" == *$'\r'* ]]; then
    echo "$name contiene un salto de línea no permitido" >&2
    exit 1
  fi
done
echo "Preflight de producción correcto; no se ejecutaron migraciones"
