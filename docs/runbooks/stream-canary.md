# Canary de streaming en Hostinger

## Objetivo

Comprobar que Hostinger entrega un stream HTTP durante cinco minutos sin
buffering, 502 ni 504 antes de depender de SSE para chat.

La ruta técnica es:

```text
GET /api/v1/internal/stream-canary
Authorization: Bearer <STREAM_CANARY_TOKEN>
```

Emite un evento `tick` cada 250 ms durante cinco minutos y termina con `done`.
No llama a NVIDIA ni accede a MySQL.

## Preparación

1. Generar un token aleatorio de al menos 32 caracteres.
2. Guardar el mismo valor como `STREAM_CANARY_TOKEN` en el `.env` local y en
   las variables privadas de la aplicación Node de Hostinger.
3. No usar prefijo `PUBLIC_`, no incluirlo en el archivo de despliegue y no
   pegarlo en comandos que queden en el historial.
4. Crear el artefacto desde un commit limpio:

```bash
./scripts/hostinger/create-platform-archive.sh
```

El archivo solo contiene `apps/platform`, `packages/contracts` y los
manifiestos raíz necesarios. El script falla si detecta `apps/mobile` o
`src-tauri`.

Configuración Hostinger:

```text
Node:             24
Package manager:  pnpm
Build:            pnpm build:platform
Entry point:      apps/platform/build/index.js
Output:           apps/platform/build
```

## Validación

```bash
pnpm smoke:stream:hostinger
```

Aceptación automática:

- primer tick antes de 5 segundos;
- al menos 1100 ticks;
- duración observada mínima de 295 segundos;
- ningún intervalo entre ticks mayor de 5 segundos;
- evento final `done`;
- respuesta sin corte HTTP.

También puede observarse manualmente sin imprimir el token:

```bash
curl -N --max-time 310 \
  -H "Authorization: Bearer $STREAM_CANARY_TOKEN" \
  https://cdor.online/api/v1/internal/stream-canary
```

Si falla, no se inicia M8. Se conserva la evidencia y se decide entre mover la
API a VPS o sustituir el transporte por polling. NVIDIA nunca pasa al cliente.
