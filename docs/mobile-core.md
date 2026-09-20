# Núcleo móvil Rust/SQLite

El núcleo de M9 vive en `apps/mobile/src-tauri/src/mobile_core`. No contiene
commands Tauri ni depende de Svelte; esa frontera se implementa en M10.

## Autoridad y acceso

- MySQL sigue siendo la única autoridad global.
- SQLite es una réplica parcial, estado técnico y outbox.
- `rusqlite` es la única vía de acceso a SQLite. La conexión y todo el SQL son
  privados al núcleo Rust; el WebView no recibe una conexión ni ejecuta SQL.
- La sesión no tiene columna ni tabla local. `SecretStore` exige una
  implementación nativa Keystore/Keychain en M10.
- El transporte y la conectividad están detrás de `SyncApi` y `Connectivity`;
  los tests usan dobles sin convertir SQLite en autoridad.

## Persistencia

Las migraciones SQL versionadas crean:

- `local_meta`
- `conversations`
- `messages`
- `memories`
- `preferences`
- `pending_operations`
- `sync_state`

Una mutación offline guarda la entidad y su operación pendiente dentro de la
misma transacción. `operation_id` es clave primaria; repetir la misma operación
no duplica y reutilizarla con otro payload revierte toda la transacción.

Los cambios pull se aplican en una transacción junto al cursor. Sus valores
reemplazan incondicionalmente la réplica local. Un delete elimina operaciones
locales atrasadas de esa entidad.

## Reintentos

La secuencia base es 1 s, 2 s, 5 s, 15 s, 30 s, 60 s y después 5 min. Cada
intervalo recibe jitter determinista entre 80% y 120%, para sobrevivir a un
reinicio sin necesitar guardar estado aleatorio. Los errores reintentables
actualizan `attempts` y `next_attempt_at_ms`; conflictos y rechazos permanentes
quedan en estado `failed` y no vuelven a salir como operaciones due.

## Durabilidad y ejecución

SQLite usa `foreign_keys=ON`, `synchronous=FULL`, timeout de 5 s y journal
`DELETE`. WAL se mantiene desactivado hasta probarlo en el Xiaomi físico durante
M11. El API del núcleo es síncrono y M10 deberá ejecutarlo fuera del hilo
principal mediante estado/commands dedicados.

Un cursor remoto inválido se reinicia una sola vez a `0`; el estado que llega
de MySQL vuelve a materializar la réplica.
