#!/usr/bin/env bash
set -Eeuo pipefail

required=(NODE_ENV ORIGIN BETTER_AUTH_URL AUTH_SIGN_UP_ENABLED DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD BETTER_AUTH_SECRET SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET)
missing=()
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then missing+=("$name"); fi
done
if ((${#missing[@]})); then
  printf 'Faltan variables de producción: %s\n' "${missing[*]}" >&2
  exit 1
fi

# MAC es una pasarela de proveedores de IA gratuitos: hace falta al menos uno.
# NVIDIA, Groq, Gemini y Mistral se activan con su clave; AI_CUSTOM_PROVIDERS
# declara proveedores propios. OpenRouter solo cuenta como proveedor de chat si
# se pide expresamente (AI_FALLBACK_OPENROUTER=true), porque su clave también
# sirve para la búsqueda web.
has_provider=false
for name in NVIDIA_API_KEY GROQ_API_KEY GEMINI_API_KEY MISTRAL_API_KEY AI_CUSTOM_PROVIDERS; do
  if [[ -n "${!name:-}" ]]; then has_provider=true; fi
done
if [[ -n "${OPENROUTER_API_KEY:-}" && "${AI_FALLBACK_OPENROUTER:-false}" == "true" ]]; then
  has_provider=true
fi
if [[ "$has_provider" != "true" ]]; then
  echo "Falta un proveedor de IA: define al menos una clave (NVIDIA_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, MISTRAL_API_KEY), AI_CUSTOM_PROVIDERS, u OPENROUTER_API_KEY con AI_FALLBACK_OPENROUTER=true" >&2
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
for name in DB_PASSWORD BETTER_AUTH_SECRET SMTP_PASSWORD NVIDIA_API_KEY OPENROUTER_API_KEY GROQ_API_KEY GEMINI_API_KEY MISTRAL_API_KEY GITHUB_CLIENT_SECRET GOOGLE_CLIENT_SECRET; do
  if [[ "${!name:-}" == *$'\n'* || "${!name:-}" == *$'\r'* ]]; then
    echo "$name contiene un salto de línea no permitido" >&2
    exit 1
  fi
done
echo "Preflight de producción correcto; no se ejecutaron migraciones"
