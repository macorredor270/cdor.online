# Modelo de datos MySQL

MySQL es la única fuente de verdad de MAC. El esquema TypeScript vive en
`apps/platform/src/lib/server/db/schema` y las migraciones SQL revisadas en
`apps/platform/drizzle`.

Hostinger anuncia MariaDB 11.8.8 mediante el protocolo compatible MySQL. La
matriz local valida tanto MySQL 8.4.8 como MariaDB 11.8.8 sin cambiar el dialecto
Drizzle definido.

## Tablas

Better Auth 1.6.25, generado con su CLI y revisado:

- `user`
- `session`
- `account`
- `verification`

MAC:

- `profiles`
- `devices`
- `conversations`
- `messages`
- `memories`
- `user_preferences`
- `model_presets`
- `usage_events`
- `generation_requests`
- `sync_changes`
- `idempotency_keys`
- `rate_limit_buckets`

`message_parts` no existe en v1. `messages.content` es canónico mientras no
existan herramientas, adjuntos u otros tipos de parte.

## Decisiones

- Todos los IDs de entidad son ULID `CHAR(26)`.
- Las fechas son `DATETIME(3)`.
- `session.device_id` vincula opcionalmente una sesión Better Auth con un
  dispositivo MAC. El índice `(user_id, device_id)` permite revocar todas sus
  sesiones sin confiar en datos del cliente.
- Los contadores/cursor usan `BIGINT UNSIGNED`; en el wire format viajan como
  cadenas decimales.
- Las eliminaciones sincronizables usan `deleted_at`.
- `sync_changes.change_id` es el cursor autoritativo.
- Toda escritura sincronizable inserta la entidad y su cambio en la misma
  transacción.
- `generation_requests.cancel_requested_at` permite que la cancelación
  sobreviva a procesos y reinicios.
- `idempotency_keys` guarda estado y resultado materializado, nunca un stream
  SSE completo.
- Índices de ownership comienzan por `user_id` cuando la consulta necesita
  aislar al propietario.
- El changelog tiene una retención inicial de 90 días. Antes de eliminar el
  último cambio antiguo de una entidad, `pnpm maintenance:sync` inserta un
  snapshot de metadatos actual. Así `cursor=0` siempre puede materializar una
  resincronización completa sin guardar payloads JSON duplicados.
- La misma tarea oportunista elimina claves idempotentes caducadas por lotes.
  No se ejecuta como worker permanente ni desde el arranque o CI.

Los campos JSON se reservan para configuración, metadatos de uso y respuestas
idempotentes acotadas. No sustituyen columnas consultables ni ownership.
