# Bridge Tauri móvil

La frontera móvil de M10 vive en `apps/mobile/src/bridge.ts` y
`apps/mobile/src-tauri/src/tauri_bridge.rs`. Svelte solo invoca commands
tipados y escucha eventos; no recibe una conexión SQLite ni puede ejecutar SQL
o peticiones autenticadas directamente.

## Sesión

El login envía email y contraseña de forma transitoria desde el WebView al
command Rust. Rust llama por HTTPS a Better Auth, extrae `set-auth-token` y
guarda el bearer mediante el plugin nativo `secure-session`.

- Android genera una clave AES/GCM no exportable en Android Keystore. Solo IV y
  ciphertext se guardan en `SharedPreferences`.
- iOS guarda el bearer como contraseña genérica en Keychain con
  `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.
- Escritorio conserva una implementación volátil solo para checks locales.
- No existen commands JavaScript para leer o escribir el bearer, ni permisos
  `secure-session:*` en la capability del WebView.
- SQLite no contiene ninguna columna, tabla o archivo de sesión.

Cerrar sesión intenta revocar el bearer en Better Auth y siempre elimina la
copia nativa. Reinstalar la aplicación elimina su almacén local; esa pérdida es
esperada y obliga a autenticar de nuevo.

## Commands

- `database_open`
- `auth_sign_in`, `auth_sign_out`, `auth_session`
- `conversation_save`, `conversation_get`
- `message_save`, `message_list`
- `sync_now`, `sync_status`
- `chat_start`, `chat_cancel`

Todo acceso SQLite se ejecuta con `spawn_blocking` sobre una conexión exclusiva
protegida por estado Rust. `conversation_save` y `message_save` delegan en los
repositorios M9 que escriben entidad y outbox en la misma transacción.

`sync_now` carga el bearer dentro de Rust, ejecuta push y pull contra
`https://cdor.online`, y emite `sync://state`. MySQL reemplaza siempre la
réplica SQLite cuando hay divergencia.

## Eventos de chat

`chat_start` devuelve de inmediato y Rust consume el stream POST SSE. El
protocolo CDOR se traduce a:

- `chat://started`
- `chat://delta`
- `chat://usage`
- `chat://completed`
- `chat://failed`

El backend ya agrupa los deltas en lotes de M7; el bridge entrega esos lotes al
WebView sin exponer el stream NVIDIA. `chat_cancel` solo acepta el ULID de una
generación y añade el bearer dentro de Rust.

## Interfaz móvil

Desde M13, `apps/mobile/src/App.svelte` monta la experiencia móvil sobre este
bridge. Abre SQLite antes de consultar la sesión, pinta primero la caché,
mantiene colecciones normalizadas y sincroniza al recuperar conectividad o
visibilidad. Los mensajes optimistas se cachean sin duplicar el outbox; si el
stream no llega a iniciarse, el mismo identificador idempotente pasa a la cola.

## Android local

Tauri 2.11.5 compila contra Android API 36. Si `/opt/android-sdk` es de solo
lectura, `scripts/env.sh` selecciona el SDK escribible en
`$XDG_DATA_HOME/cdor-android-sdk` cuando contiene `platforms/android-36`, y
reutiliza el NDK instalado.

```bash
source scripts/env.sh
pnpm --dir apps/mobile tauri android build \
  --debug --apk --target aarch64 --ci
```

La compilación iOS y la firma no se ejecutan en GitHub Actions. Se realizarán
manualmente en macOS cuando existan las credenciales Apple; el plugin Keychain
queda implementado y versionado desde M10.
