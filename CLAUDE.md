# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

La documentación (`docs/`, `CDOR_PLAN_DEFINITIVO.md`), los mensajes de UI y los
mensajes de error de cara al usuario están en español. Los comentarios de código
están en inglés. Mantén esa convención.

## Fuente canónica

`CDOR_PLAN_DEFINITIVO.md` es la autoridad de arquitectura, límites y orden de
desarrollo. `PLAN.md` solo apunta ahí. Antes de proponer un cambio estructural,
comprueba las secciones 2.1–2.5 (límites inviolables) y 5 (orden obligatorio).
`docs/milestones/M0.md`…`M15.md` registra lo entregado por milestone.
`docs/ui.md` es la referencia del sistema de diseño web (tokens, tema,
componentes y patrones); `docs/archive/` guarda documentos de trabajo antiguos.

## Toolchain

Node 24.18.0 fijado por `.node-version` y `engines` (no construir con Node 26),
pnpm 11.3.0, Rust estable, JDK 17 + NDK para Android. `.npmrc` usa
`engine-strict=true` y `save-exact=true`: las dependencias se fijan a versión
exacta, sin rangos.

```bash
source scripts/env.sh          # activa el toolchain solo en el shell actual
./scripts/check-toolchain.sh
pnpm install --frozen-lockfile
```

## Comandos

### Desarrollo

```bash
pnpm dev                 # levanta MySQL local en :3307, migra y arranca vite dev
pnpm dev:mobile          # WebView Svelte de la app móvil
pnpm tauri android dev   # app Tauri sobre dispositivo/emulador
pnpm check               # svelte-check + tsc en todos los workspaces
```

`pnpm dev` ejecuta `scripts/dev-local.sh`, que carga el `.env` raíz y luego
**sobrescribe** las credenciales de DB con las del contenedor local. No apunta a
producción por accidente.

### Tests

`pnpm test` corre el subconjunto sin base de datos. Los suites que necesitan
MySQL pasan por `scripts/db/run-test-command.sh`, que arranca el contenedor y
exporta `DATABASE_URL` antes de delegar en el script del workspace.

```bash
pnpm test                # subconjunto rápido, sin DB
pnpm test:validation     # contratos + plataforma + escaneo de secretos
pnpm test:ai             # adaptadores NVIDIA/OpenRouter, router, catálogo
pnpm test:web            # rutas y cliente web
pnpm test:backend        # requiere DB local
pnpm test:auth           # requiere DB local
pnpm test:db             # requiere DB local
pnpm test:sse            # requiere DB local
pnpm test:sync           # requiere DB local
pnpm db:compat:test      # misma suite de DB contra MySQL 8.4 y MariaDB 11.8
pnpm test:e2e:web        # build + smoke E2E
```

Un solo archivo o test:

```bash
pnpm --dir apps/platform exec vitest run tests/ai/openrouter.test.ts
pnpm --dir apps/platform exec vitest run tests/ai/openrouter.test.ts -t "nombre del test"
pnpm --dir packages/contracts exec vitest run tests/chat.test.ts
./scripts/db/run-test-command.sh test:backend mariadb   # suite con DB, otro motor
```

Los tests de SvelteKit necesitan `svelte-kit sync` previo; los scripts del
workspace ya lo incluyen, `vitest run` directo no.

### Base de datos

```bash
pnpm db:local:up         # contenedor mysql (3307) o mariadb (3308)
pnpm db:generate         # genera migración desde el esquema Drizzle
pnpm db:check            # drizzle-kit check + verify-migrations.mjs
pnpm db:migrate          # aplica migraciones
pnpm db:verify-schema
pnpm db:explain
pnpm db:backup
```

Las migraciones son SQL revisado a mano en `apps/platform/drizzle`, no se aplican
en el arranque de la app.

### Seguridad y producción

```bash
pnpm scan:client-secrets     # falla si un secreto server-only entra en el bundle cliente
pnpm security:audit
pnpm production:preflight
pnpm production:smoke
pnpm smoke:nvidia            # sale a red real; solo servidor o CI protegido
pnpm smoke:openrouter
pnpm build:hostinger
```

## Arquitectura

```text
apps/platform  → SvelteKit 3 + adapter-node 6 → Hostinger Business (cdor.online)
apps/mobile    → Svelte + Tauri/Rust      → Android/iOS
packages/contracts → Zod, fuente de verdad de tipos compartidos
packages/markdown  → parser de Markdown del modelo (árbol tipado, sin HTML), web y móvil
```

SvelteKit 3: no hay `svelte.config.js`; la configuración de Kit vive en
`sveltekit({...})` dentro de `apps/platform/vite.config.ts`. El alias `$lib`
ya no existe: se importa con `#lib/...` (subpath imports de `package.json`) y
extensión explícita (`#lib/server/foo.js` para un `.ts`). Estado de página con
`$app/state`, nunca `$app/stores`.

### Frontera de red

El móvil **nunca** habla con NVIDIA ni con MySQL. El WebView Svelte tampoco hace
red sensible: invoca commands Tauri y Rust ejecuta HTTPS contra `cdor.online`.

```text
Svelte móvil → invoke/eventos → Rust (Tauri) → HTTPS → API SvelteKit → MySQL + NVIDIA NIM
```

### Capas del backend (`apps/platform/src/lib/server`)

Tres capas estrictas, sin saltos:

1. **rutas** (`src/routes/api/v1/**/+server.ts`) — validan HTTP, resuelven
   `Principal`, forman el sobre de respuesta;
2. **servicios** (`server/services/`) — contratos, ownership, errores de dominio;
3. **repositorios** (`server/db/repositories/`) — SQL Drizzle y transacciones.

Las rutas nunca consultan tablas. Los repositorios reciben siempre `userId` en
lecturas y mutaciones privadas. `hooks.server.ts` asigna el ULID de request y
resuelve `principal` (`null` si la credencial falta, es inválida o está revocada).

### Contratos

`packages/contracts` (Zod 4) es la fuente de verdad; los tipos TypeScript se
infieren de los esquemas. `apps/platform/src/lib/protocol.ts` y
`apps/mobile/src/protocol.ts` solo reexportan desde ahí. No dupliques esquemas ni
escribas interfaces a mano en las apps.

Convenciones del wire format (`docs/api.md`):

- IDs ULID Crockford de 26 caracteres en mayúsculas;
- fechas ISO 8601 UTC con milisegundos;
- todo `BIGINT UNSIGNED` (`syncVersion`, `changeId`, cursores) viaja como cadena
  decimal y **nunca** se convierte a `number` en JavaScript;
- los objetos rechazan propiedades no declaradas;
- sobre común `{ data, meta.requestId }` / `{ error: { code, message, requestId, details } }`;
- `details` solo lleva `path` y `code`, máximo 20 issues, nunca el valor recibido.

### IA y streaming

Toda inferencia sale de `server/ai/`. `AiProvider` expone `listModels` y
`streamChat`; los fragmentos del proveedor se traducen al protocolo SSE propio de
CDOR (`server/stream/`), nunca se reenvía el stream crudo del proveedor.

- NVIDIA NIM es el proveedor de producción (API compatible OpenAI).
- OpenRouter es alternativo y solo aporta la herramienta server-side
  `openrouter:web_search` sobre el mismo modelo; bloquea antes de la red
  cualquier ID que no sea `openrouter/free` o no termine en `:free`.
- La allowlist de modelos vive en `server/ai/model-router.ts`. Nunca publiques el
  catálogo completo del proveedor.
- `generation_requests.cancel_requested_at` hace que la cancelación sobreviva a
  reinicios de proceso.
- Cuotas diarias por usuario y tope global (`services/quota.ts`, tabla
  `rate_limit_buckets`) y respaldo entre proveedores (`ai/fallback.ts`, opt-in
  con `AI_FALLBACK_OPENROUTER`): ver `docs/ai.md`. Toda variable nueva de esto
  es server-only y debe constar en `SERVER_SECRET_ENV_NAMES` y en el escáner.

Detalles en `docs/ai.md`.

### Sincronización

MySQL es la única autoridad. SQLite (móvil,
`apps/mobile/src-tauri/src/mobile_core`) es réplica parcial + outbox; el WebView
no recibe conexión SQLite ni ejecuta SQL. Toda escritura sincronizable inserta la
entidad y su fila en `sync_changes` **en la misma transacción**.
`sync_changes.change_id` es el cursor autoritativo. Las actualizaciones bloquean
la fila y comparan `baseVersion`; una versión antigua devuelve `CONFLICT`.

Ver `docs/data-model.md`, `docs/mobile-core.md`, `docs/tauri-bridge.md`.

## Restricciones de despliegue

Hostinger Business solo ejecuta la app Node de SvelteKit. No hay Docker, Redis,
workers permanentes, procesos del sistema ni control de Nginx/systemd en
producción. Las tareas de mantenimiento son oportunistas o manuales
(`pnpm maintenance:sync`, `pnpm maintenance:generations`), nunca daemons.

El build de Hostinger no ejecuta Tauri, Cargo, Gradle ni Xcode:

```bash
pnpm install --frozen-lockfile --filter @cdor/platform...
pnpm hostinger:build
pnpm hostinger:start
```

`vite.config.ts` fuerza `ssr.noExternal: true` en build porque Hostinger publica
solo `output_directory` y puede omitir `node_modules` anidados.

## Reglas de seguridad no negociables

- Ninguna clave de proveedor ni credencial MySQL en APK/AAB/IPA ni en JS público.
  `SERVER_SECRET_ENV_NAMES` en `server/config/schema.ts` y
  `scripts/scan-client-secrets.mjs` deben incluir toda variable server-only nueva;
  el prefijo `PUBLIC_` está prohibido para secretos.
- El móvil no se conecta a MySQL directamente.
- Los bearer móviles se guardan en Keystore/Keychain vía el plugin nativo
  `secure-session`. No hay commands JS para leerlos ni permisos `secure-session:*`
  en la capability del WebView. Nunca `localStorage`.
- Markdown/HTML del modelo siempre sanitizado antes de renderizar.
- Los logs de producción no registran contraseñas, tokens, prompts ni contenido
  de chats. Readiness (`/health/ready`) no revela host, versión ni errores MySQL.
- `.env`, keystores, certificados y perfiles nunca se suben.

## Alcance de la v1

Fuera de alcance según el plan: modelos locales, voz en tiempo real, generación de
imágenes, RAG complejo, agentes con acciones externas, colaboración multiusuario,
E2E entre dispositivos, Redis y pagos. `message_parts` no existe;
`messages.content` es canónico mientras no haya herramientas ni adjuntos.

## CI

Workflows por dominio en `.github/workflows/` (`ai`, `auth`, `backend`,
`database`, `mobile-core`, `streaming`, `sync`, `web`, `platform-build`,
`production`, `checks`), disparados por `paths`. Al añadir un módulo nuevo,
actualiza los `paths` del workflow correspondiente o quedará sin cobertura. Los
smokes contra proveedores externos solo corren en `workflow_dispatch`.
