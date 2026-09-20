# Backend de plataforma

La plataforma mantiene tres capas server-only:

1. las rutas SvelteKit validan HTTP, obtienen `Principal` y forman el sobre;
2. los servicios aplican contratos, ownership y errores de dominio;
3. los repositorios contienen SQL Drizzle y transacciones.

Las rutas nunca consultan tablas directamente. Los repositorios reciben siempre
`userId` en las lecturas y mutaciones de datos privados.

## Principal

`hooks.server.ts` asigna un ULID de request y parte de `principal = null`.
Desde M5, una cookie CDOR o un bearer firmado válidos se resuelven mediante
Better Auth y se traducen a la abstracción `Principal`. Una credencial ausente,
inválida o revocada mantiene `principal = null`; los filtros de ownership de
repositorios y servicios no cambian.

## Pool

El pool se crea de forma perezosa en la primera operación que lo necesita. Usa
de una a diez conexiones, tres por defecto, y se cierra tanto explícitamente
como ante `SIGINT`/`SIGTERM`. Importar módulos no abre sockets.

## Rutas M4

- `GET /health`: liveness, no consulta dependencias.
- `GET /health/ready`: readiness genérica mediante ping MySQL.
- `/api/v1/conversations`: listar y crear.
- `/api/v1/conversations/:id`: leer, actualizar y eliminar.
- `/api/v1/conversations/:id/messages`: listar.
- `/api/v1/memories`: listar y crear.
- `/api/v1/memories/:id`: leer, actualizar y eliminar.
- `/api/v1/auth/devices`: listar y vincular el dispositivo de la sesión actual.
- `/api/v1/auth/devices/:id`: revocar el dispositivo y todas sus sesiones.

Todos los resultados usan el sobre común y `x-request-id`. Readiness no revela
host, versión, usuario ni errores de MySQL.

## Concurrencia

Las actualizaciones y eliminaciones bloquean la fila y comparan `baseVersion`.
Una versión antigua produce `CONFLICT` con la versión pública actual. La
mutación y `sync_changes` se escriben en la misma transacción.
