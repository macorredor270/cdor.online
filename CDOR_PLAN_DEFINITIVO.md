# CDOR — Plan definitivo de arquitectura, desarrollo, depuración y despliegue

> **Documento rector del proyecto.**  
> Dominio: `https://cdor.online`  
> Aplicaciones: web, Android e iOS  
> Repositorio: monorepo privado en GitHub  
> Hosting de producción inicial: Hostinger Business + MySQL de Hostinger  
> Última revisión del plan: 27 de julio de 2026

---

## 0. Objetivo del producto

CDOR será una plataforma de chat con inteligencia artificial compuesta por:

1. Una aplicación web disponible en `cdor.online`.
2. Una aplicación Android e iOS creada con Tauri 2.
3. Una API central que mantendrá usuarios, sesiones, conversaciones, mensajes, memorias, preferencias y consumo.
4. MySQL de Hostinger como fuente central y oficial de datos.
5. SQLite dentro del móvil como caché local, cola offline y almacenamiento rápido.
6. NVIDIA NIM como proveedor inicial de inferencia, siempre detrás de nuestra API.
7. Una identidad, memoria, sistema de prompts, selección de modelos y protocolo propios de CDOR.

La web y la aplicación móvil **no tienen que verse idénticas**, pero deben compartir:

- La misma cuenta.
- Las mismas conversaciones.
- Los mismos mensajes.
- Las mismas memorias.
- Las mismas preferencias sincronizables.
- El mismo protocolo de API.
- Los mismos identificadores y formatos de datos.
- Las mismas reglas de seguridad y límites de uso.

---

# 1. Decisiones cerradas

## 1.1 Stack definitivo

```text
REPOSITORIO
GitHub
Monorepo
pnpm workspaces

WEB + API
SvelteKit
Svelte 5
TypeScript
Node.js
CSS propio
Zod
Drizzle ORM
mysql2
Better Auth estable

HOSTING
Hostinger Business
cdor.online

BASE CENTRAL
MySQL de Hostinger

APP MÓVIL
Tauri 2
Rust
Svelte 5
TypeScript
CSS propio
SQLite

ANDROID
Kotlin solo para integraciones nativas que Rust/Tauri no cubran

IOS
Swift solo para integraciones nativas que Rust/Tauri no cubran

INTELIGENCIA ARTIFICIAL
NVIDIA NIM
Acceso exclusivo desde la API del servidor
Streaming HTTP

SINCRONIZACIÓN
MySQL como fuente de verdad
SQLite como caché y outbox local
Protocolo común web/móvil

REDIS
No en la primera versión

SUPABASE
No se utiliza

C++
No se utiliza

C#
No se utiliza
```

## 1.2 Identificadores y direcciones

```text
Nombre del producto: CDOR
Dominio web: https://cdor.online
API base: https://cdor.online/api/v1
Android applicationId: online.cdor.app
iOS bundle identifier: online.cdor.app
Esquema deep link futuro: cdor://
Repositorio sugerido: cdor-platform
Rama de desarrollo: main
Rama de producción: production
```

## 1.3 Principio arquitectónico principal

```text
Svelte móvil
    ↓ invoke/eventos
Rust dentro de Tauri
    ↓ HTTPS
API SvelteKit en cdor.online
    ↓
MySQL + NVIDIA NIM
```

La interfaz móvil **no hablará directamente con NVIDIA ni con MySQL**. Para reducir CORS, exposición de tokens y lógica duplicada, la interfaz Svelte móvil tampoco debería realizar directamente las operaciones sensibles de red: las realizará Rust.

---

# 2. Límites reales e inviolables

Esta sección evita construir el proyecto sobre supuestos falsos.

## 2.1 Límites de Hostinger Business

Hostinger Business se usará para:

- Ejecutar la aplicación Node.js generada por SvelteKit.
- Servir la web.
- Exponer la API.
- Conectarse a MySQL de Hostinger.
- Guardar variables de entorno.
- Desplegar desde GitHub.

No se asumirá que Hostinger Business permite:

- Ejecutar el backend Rust/Axum.
- Ejecutar Docker en producción.
- Ejecutar Redis.
- Ejecutar procesos del sistema personalizados.
- Mantener workers independientes permanentes.
- Controlar Nginx, systemd o el kernel.

El código Rust permanece en el repositorio, pero se compila para la aplicación móvil, no en Hostinger.

## 2.2 Límite de streaming

SvelteKit y Node pueden emitir respuestas por streaming, pero el proxy y los límites de Hostinger deben validarse con una prueba real.

Antes de construir toda la experiencia de chat se debe superar esta puerta:

```text
Prueba de streaming en producción
- Conexión mantenida durante al menos 5 minutos.
- Fragmentos visibles sin buffering completo.
- Cancelación al cerrar la conexión.
- Sin errores 502/504.
- Sin cortar la respuesta al superar cierto tamaño.
```

Si Hostinger aplica buffering o un tiempo máximo incompatible, las alternativas serán, por orden:

1. Mantener la web en Hostinger y trasladar solo la API a un VPS.
2. Usar respuestas fragmentadas por polling como solución temporal.
3. Nunca exponer la clave de NVIDIA en el cliente para “evitar” el problema.

## 2.3 Límites del móvil

- La generación de IA necesita internet.
- El modo offline permitirá leer caché, redactar y poner operaciones en cola; no generará IA.
- Android se puede desarrollar y compilar desde Arch Linux.
- iOS requiere macOS, Xcode y firma de Apple.
- GitHub Actions con runner macOS puede compilar iOS, pero las credenciales y perfiles de firma deben configurarse correctamente.
- Tauri usa el WebView del sistema; el rendimiento depende también del Android System WebView o WKWebView instalado.

## 2.4 Límites de seguridad

Prohibido:

- Clave NVIDIA dentro del APK, AAB, IPA o JavaScript público.
- Credenciales MySQL dentro de la app.
- Conexión directa del móvil a MySQL.
- Guardar tokens móviles en `localStorage`.
- Subir `.env`, keystores, certificados o perfiles a GitHub.
- Confiar en datos enviados por el cliente.
- Renderizar Markdown/HTML del modelo sin sanitización.
- Registrar contraseñas, tokens, prompts privados o contenido completo de chats en logs de producción.

## 2.5 Límites funcionales de la versión 1

La versión 1 no incluirá inicialmente:

- Modelos locales.
- C++, C# o Python en producción.
- Voz en tiempo real.
- Generación de imágenes.
- RAG complejo.
- Búsqueda web autónoma.
- Agentes que ejecuten acciones externas.
- Colaboración multiusuario en un mismo chat.
- Cifrado de extremo a extremo entre dispositivos.
- Redis.
- Pagos o suscripciones hasta estabilizar consumo y costes.

---

# 3. Arquitectura final

```text
┌──────────────────────────────────────────────────────────────┐
│                    GitHub: monorepo CDOR                     │
│                                                              │
│ apps/platform      apps/mobile        packages compartidos   │
└───────────┬───────────────┬───────────────────────┬───────────┘
            │               │                       │
            │ deploy        │ build                 │ imports
            ▼               ▼                       ▼
┌───────────────────┐  ┌────────────────────┐  ┌───────────────┐
│ Hostinger Business│  │ Android / iOS      │  │ Contratos     │
│ SvelteKit + Node  │  │ Tauri + Rust       │  │ UI/tokens     │
│ cdor.online       │  │ Svelte + SQLite    │  │ API client    │
└─────────┬─────────┘  └──────────┬─────────┘  └───────────────┘
          │                       │
          │ HTTPS                 │ HTTPS
          ├───────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│ API /api/v1                                                  │
│ Auth · chats · mensajes · memoria · sincronización · uso     │
└───────────────────────┬───────────────────────┬──────────────┘
                        │                       │
                        ▼                       ▼
              ┌──────────────────┐    ┌──────────────────┐
              │ MySQL Hostinger  │    │ NVIDIA NIM       │
              │ fuente de verdad │    │ inferencia       │
              └──────────────────┘    └──────────────────┘
```

---

# 4. Estructura final del repositorio

Se simplifican los contratos: Zod será la fuente de verdad y los tipos TypeScript se inferirán desde los esquemas. No habrá un paquete `validation` duplicando `contracts`.

```text
cdor/
├── apps/
│   ├── platform/                         # Web + API; Hostinger despliega esto
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── (public)/
│   │   │   │   │   ├── +layout.svelte
│   │   │   │   │   ├── +page.svelte
│   │   │   │   │   ├── login/
│   │   │   │   │   ├── register/
│   │   │   │   │   ├── privacy/
│   │   │   │   │   └── terms/
│   │   │   │   ├── (app)/
│   │   │   │   │   ├── +layout.server.ts
│   │   │   │   │   ├── +layout.svelte
│   │   │   │   │   ├── chat/
│   │   │   │   │   │   ├── +page.svelte
│   │   │   │   │   │   └── [conversationId]/
│   │   │   │   │   ├── memories/
│   │   │   │   │   ├── settings/
│   │   │   │   │   └── account/
│   │   │   │   └── api/
│   │   │   │       ├── auth/[...all]/
│   │   │   │       └── v1/
│   │   │   │           ├── health/
│   │   │   │           ├── users/
│   │   │   │           ├── devices/
│   │   │   │           ├── conversations/
│   │   │   │           ├── messages/
│   │   │   │           ├── memories/
│   │   │   │           ├── chat/stream/
│   │   │   │           ├── chat/cancel/
│   │   │   │           ├── models/
│   │   │   │           ├── sync/pull/
│   │   │   │           ├── sync/push/
│   │   │   │           └── usage/
│   │   │   ├── lib/
│   │   │   │   ├── components/          # Solo componentes propios de la web
│   │   │   │   ├── stores/
│   │   │   │   ├── client/
│   │   │   │   └── server/
│   │   │   │       ├── ai/
│   │   │   │       │   ├── provider.ts
│   │   │   │       │   ├── nvidia-client.ts
│   │   │   │       │   ├── model-router.ts
│   │   │   │       │   ├── prompt-builder.ts
│   │   │   │       │   ├── token-budget.ts
│   │   │   │       │   └── stream-transform.ts
│   │   │   │       ├── auth/
│   │   │   │       │   ├── auth.ts
│   │   │   │       │   ├── session.ts
│   │   │   │       │   └── guards.ts
│   │   │   │       ├── database/
│   │   │   │       │   ├── client.ts
│   │   │   │       │   ├── schema/
│   │   │   │       │   ├── repositories/
│   │   │   │       │   └── transaction.ts
│   │   │   │       ├── memory/
│   │   │   │       ├── sync/
│   │   │   │       ├── security/
│   │   │   │       ├── rate-limit/
│   │   │   │       ├── observability/
│   │   │   │       └── usage/
│   │   │   ├── hooks.server.ts
│   │   │   ├── app.d.ts
│   │   │   └── app.html
│   │   ├── drizzle/
│   │   │   ├── migrations/
│   │   │   └── meta/
│   │   ├── tests/
│   │   │   ├── unit/
│   │   │   ├── integration/
│   │   │   └── api/
│   │   ├── static/
│   │   ├── package.json
│   │   ├── svelte.config.js
│   │   ├── vite.config.ts
│   │   ├── drizzle.config.ts
│   │   └── tsconfig.json
│   │
│   └── mobile/                           # Android/iOS; Hostinger no lo compila
│       ├── src/
│       │   ├── routes/
│       │   ├── components/               # Solo componentes móviles
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   ├── chat/
│       │   │   ├── conversations/
│       │   │   ├── memories/
│       │   │   ├── sync/
│       │   │   └── settings/
│       │   ├── bridges/                  # Wrappers TypeScript de commands/eventos Tauri
│       │   ├── stores/
│       │   ├── styles/
│       │   ├── App.svelte
│       │   └── main.ts
│       ├── src-tauri/
│       │   ├── src/
│       │   │   ├── commands/
│       │   │   ├── database/
│       │   │   ├── sync/
│       │   │   ├── auth/
│       │   │   ├── network/
│       │   │   ├── streaming/
│       │   │   ├── native/
│       │   │   ├── telemetry/
│       │   │   ├── state.rs
│       │   │   ├── error.rs
│       │   │   ├── lib.rs
│       │   │   └── main.rs
│       │   ├── migrations/               # SQLite
│       │   ├── capabilities/
│       │   ├── gen/
│       │   │   ├── android/              # Kotlin/proyecto Android generado
│       │   │   └── apple/                # Swift/proyecto iOS generado
│       │   ├── tauri.conf.json
│       │   ├── tauri.android.conf.json
│       │   ├── tauri.ios.conf.json
│       │   ├── Cargo.toml
│       │   └── Cargo.lock
│       ├── tests/
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
│
├── packages/
│   ├── contracts/                        # Zod + tipos inferidos; protocolo oficial
│   │   ├── src/
│   │   │   ├── common.ts
│   │   │   ├── auth.ts
│   │   │   ├── chat.ts
│   │   │   ├── conversation.ts
│   │   │   ├── memory.ts
│   │   │   ├── sync.ts
│   │   │   ├── errors.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── api-client/                       # Cliente web; móvil sensible usa Rust
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   ├── conversations.ts
│   │   │   ├── memories.ts
│   │   │   ├── sync.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── chat-core/                        # Transformaciones puras, sin red ni secretos
│   │   ├── src/
│   │   │   ├── message-buffer.ts
│   │   │   ├── conversation-state.ts
│   │   │   ├── markdown-policy.ts
│   │   │   └── index.ts
│   │   └── package.json
│   ├── ui/                               # Componentes Svelte compartidos y accesibles
│   │   ├── src/
│   │   └── package.json
│   └── design-tokens/
│       ├── src/
│       │   ├── colors.css
│       │   ├── spacing.css
│       │   ├── typography.css
│       │   ├── motion.css
│       │   ├── elevation.css
│       │   └── themes.css
│       └── package.json
│
├── scripts/
│   ├── bootstrap.sh
│   ├── check-env.ts
│   ├── debug-xiaomi.sh
│   ├── debug-android-lan.sh
│   ├── migrate-production.ts
│   ├── smoke-production.ts
│   └── release-mobile.sh
│
├── infra/
│   └── local/
│       └── compose.mysql.yml              # Opcional, solo desarrollo local
│
├── .github/
│   └── workflows/
│       ├── checks.yml
│       ├── platform-build.yml
│       ├── android.yml
│       ├── ios.yml
│       └── release.yml
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── database.md
│   ├── synchronization.md
│   ├── security.md
│   ├── performance.md
│   └── runbooks/
│       ├── hostinger-deploy.md
│       ├── rollback.md
│       └── incident.md
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── .editorconfig
├── .env.example
├── .gitignore
├── PLAN.md
└── README.md
```

---

# 5. Orden obligatorio de desarrollo

El frontend visual se hace al final. Primero se construye una columna vertebral verificable.

```text
FASE 0  Entorno y decisiones
FASE 1  Monorepo y compilaciones vacías
FASE 2  Contratos compartidos
FASE 3  MySQL, esquema y migraciones
FASE 4  Backend/API y autenticación
FASE 5  NVIDIA NIM y streaming
FASE 6  Sincronización e idempotencia
FASE 7  Núcleo Rust móvil + SQLite, todavía sin UI final
FASE 8  Tests, CI y observabilidad
FASE 9  Deploy real en Hostinger y pruebas de carga
FASE 10 Frontend web
FASE 11 Frontend móvil
FASE 12 Integraciones Android/iOS
FASE 13 Hardening, publicación y operación
```

No se pasa de fase si no se cumple su puerta de salida.

---

# 6. Fase 0 — Preparar el entorno

## 6.1 Arch Linux: dependencias base

```bash
sudo pacman -Syu
sudo pacman -S --needed \
  webkit2gtk-4.1 \
  base-devel \
  curl \
  wget \
  file \
  openssl \
  appmenu-gtk-module \
  libappindicator-gtk3 \
  librsvg \
  xdotool \
  git \
  rustup \
  nodejs \
  npm \
  android-tools \
  jdk17-openjdk
```

Android Studio se instala por su paquete oficial o AUR confiable. Desde SDK Manager se instalan:

```text
Android SDK Platform
Android SDK Platform-Tools
Android SDK Build-Tools
Android SDK Command-line Tools
NDK (Side by side)
```

## 6.2 Rust y pnpm

```bash
rustup default stable
rustup update stable
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android

corepack enable
pnpm --version
rustc --version
cargo --version
adb version
```

## 6.3 Variables Android en Arch

Añadir al shell correspondiente:

```bash
export JAVA_HOME=/opt/android-studio/jbr
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$(find "$ANDROID_HOME/ndk" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
export PATH="$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
```

No se fija manualmente una versión del NDK en este documento; se fija en CI y documentación una vez Tauri compile correctamente. Después no se cambia sin una rama de actualización.

## 6.4 Puerta de salida

```bash
node -v
pnpm -v
rustc -V
cargo -V
adb devices -l
```

Todo debe responder sin errores.

---

# 7. Fase 1 — Crear monorepo y esqueletos compilables

## 7.1 Crear repositorio

```bash
mkdir cdor
cd cdor
git init -b main
corepack enable
pnpm init
```

## 7.2 Workspace

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

El workspace existe porque pnpm soporta monorepos mediante este archivo.

## 7.3 Crear `apps/platform`

Crear SvelteKit con TypeScript, Svelte 5 y sin una librería visual pesada. Añadir `@sveltejs/adapter-node`.

Objetivo mínimo:

```bash
pnpm --dir apps/platform build
node apps/platform/build
```

Debe abrir una página de salud sencilla y responder:

```http
GET /api/v1/health
200 { "ok": true, "service": "cdor-platform" }
```

## 7.4 Crear `apps/mobile`

Crear una aplicación Tauri 2 con frontend Svelte/TypeScript. Inicializar Android:

```bash
pnpm --dir apps/mobile tauri android init
```

El proyecto debe compilar y abrir una pantalla vacía en Android antes de añadir lógica.

## 7.5 Scripts raíz

`package.json` raíz:

```json
{
  "name": "cdor",
  "private": true,
  "packageManager": "pnpm@11.3.0",
  "scripts": {
    "dev:platform": "pnpm --dir apps/platform dev",
    "build:platform": "pnpm --dir apps/platform build",
    "start:platform": "pnpm --dir apps/platform start",
    "dev:mobile": "pnpm --dir apps/mobile tauri dev",
    "dev:android": "pnpm --dir apps/mobile tauri android dev",
    "build:android": "pnpm --dir apps/mobile tauri android build",
    "build:ios": "pnpm --dir apps/mobile tauri ios build",
    "check": "pnpm -r check",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:generate": "pnpm --dir apps/platform db:generate",
    "db:migrate": "pnpm --dir apps/platform db:migrate",
    "db:studio": "pnpm --dir apps/platform db:studio"
  }
}
```

La versión de pnpm se actualizará conscientemente; nunca se deja `latest` en CI.

## 7.6 Puerta de salida

- `pnpm install --frozen-lockfile` funciona desde un clon limpio.
- La web compila.
- Tauri desktop compila.
- Tauri Android instala una app mínima.
- GitHub Actions ejecuta `check` y `build:platform`.

---

# 8. Fase 2 — Contratos y protocolo antes de la base de datos

## 8.1 Reglas del protocolo

- API versionada bajo `/api/v1`.
- Identificadores ULID de 26 caracteres.
- Fechas en UTC y formato ISO 8601 en la API.
- MySQL usa `DATETIME(3)`.
- Eliminación sincronizable mediante `deleted_at`.
- Todos los POST sensibles aceptan una clave de idempotencia.
- Errores con códigos estables, no textos que el cliente tenga que interpretar.

## 8.2 Sobre de respuesta

Éxito:

```json
{
  "data": {},
  "meta": {
    "requestId": "01J..."
  }
}
```

Error:

```json
{
  "error": {
    "code": "CONVERSATION_NOT_FOUND",
    "message": "No se encontró la conversación",
    "requestId": "01J...",
    "details": null
  }
}
```

## 8.3 Códigos mínimos

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
RATE_LIMITED
RESOURCE_NOT_FOUND
CONFLICT
IDEMPOTENCY_CONFLICT
PAYLOAD_TOO_LARGE
MODEL_UNAVAILABLE
AI_PROVIDER_TIMEOUT
AI_PROVIDER_ERROR
STREAM_CANCELLED
SYNC_CURSOR_INVALID
INTERNAL_ERROR
```

## 8.4 Contratos Zod

`packages/contracts` contiene los esquemas y exporta `z.infer`. No se escriben interfaces duplicadas a mano.

Ejemplo conceptual:

```ts
export const MessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool"
]);

export const ChatMessageSchema = z.object({
  id: UlidSchema,
  conversationId: UlidSchema,
  role: MessageRoleSchema,
  content: z.string().max(65536),
  status: z.enum([
    "pending",
    "streaming",
    "completed",
    "cancelled",
    "failed"
  ]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
  syncVersion: z.number().int().nonnegative()
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
```

## 8.5 Puerta de salida

- API, web y móvil pueden importar `@cdor/contracts`.
- Tests prueban entradas válidas e inválidas.
- No hay tipos duplicados para el mismo objeto.

---

# 9. Fase 3 — MySQL y migraciones

## 9.1 Crear MySQL en Hostinger

En hPanel:

```text
Sitios web → cdor.online → Bases de datos → Administración
```

Crear:

```text
Base:    u333974886_cdor
Usuario: u333974886_cdorapp
Clave:   generada, larga y única
```

El prefijo real lo decide Hostinger. Se copian exactamente el host, puerto, base y usuario mostrados en hPanel; no se asume que el host siempre será `localhost`.

## 9.2 Desarrollo local

Opción preferida: MySQL local aislado para no experimentar sobre producción.

`infra/local/compose.mysql.yml` puede levantar únicamente MySQL para desarrollo. Es opcional y nunca se despliega en Hostinger.

Variables:

```env
DATABASE_URL=mysql://cdor:cdor_dev@127.0.0.1:3306/cdor_dev
```

Para conectarse desde el PC directamente a MySQL de Hostinger, antes hay que autorizar la IP mediante Remote MySQL. No se abre a `0.0.0.0/0`.

## 9.3 Tablas

### Autenticación

Better Auth generará sus tablas oficiales para MySQL/Drizzle. No se modifican manualmente sin regenerar y revisar la migración.

Tablas funcionales de CDOR:

```text
profiles
devices
conversations
messages
message_parts
memories
user_preferences
model_presets
usage_events
generation_requests
sync_changes
idempotency_keys
rate_limit_buckets
```

## 9.4 Campos principales

### `profiles`

```text
user_id              VARCHAR(36) PK/FK
username              VARCHAR(32) UNIQUE NULL
public_name           VARCHAR(80)
avatar_url            VARCHAR(2048) NULL
locale                VARCHAR(16) NOT NULL DEFAULT 'es-ES'
timezone              VARCHAR(64) NOT NULL DEFAULT 'UTC'
created_at            DATETIME(3)
updated_at            DATETIME(3)
```

### `devices`

```text
id                    CHAR(26) PK
user_id               VARCHAR(36) INDEX
name                  VARCHAR(120)
platform              ENUM('web','android','ios','desktop')
app_version           VARCHAR(32)
last_seen_at          DATETIME(3)
created_at            DATETIME(3)
revoked_at            DATETIME(3) NULL
```

### `conversations`

```text
id                    CHAR(26) PK
user_id               VARCHAR(36) INDEX
title                 VARCHAR(255)
model_mode            VARCHAR(64)
created_at            DATETIME(3)
updated_at            DATETIME(3)
deleted_at            DATETIME(3) NULL
sync_version          BIGINT UNSIGNED

INDEX(user_id, updated_at)
INDEX(user_id, deleted_at, updated_at)
```

### `messages`

```text
id                    CHAR(26) PK
conversation_id       CHAR(26) INDEX
user_id               VARCHAR(36) INDEX
client_operation_id   CHAR(26) NULL UNIQUE
role                  ENUM('user','assistant','system','tool')
content               LONGTEXT
status                ENUM('pending','streaming','completed','cancelled','failed')
model_provider        VARCHAR(32) NULL
model_id              VARCHAR(160) NULL
input_tokens          INT UNSIGNED NULL
output_tokens         INT UNSIGNED NULL
finish_reason         VARCHAR(32) NULL
error_code            VARCHAR(64) NULL
created_at            DATETIME(3)
updated_at            DATETIME(3)
deleted_at            DATETIME(3) NULL
sync_version          BIGINT UNSIGNED

INDEX(conversation_id, created_at)
INDEX(user_id, updated_at)
```

### `memories`

```text
id                    CHAR(26) PK
user_id               VARCHAR(36) INDEX
content               TEXT
category              VARCHAR(64)
importance            TINYINT UNSIGNED DEFAULT 1
enabled               BOOLEAN DEFAULT TRUE
source_message_id     CHAR(26) NULL
created_at            DATETIME(3)
updated_at            DATETIME(3)
deleted_at            DATETIME(3) NULL
sync_version          BIGINT UNSIGNED

INDEX(user_id, enabled, updated_at)
```

### `generation_requests`

```text
id                    CHAR(26) PK
user_id               VARCHAR(36) INDEX
conversation_id       CHAR(26) INDEX
assistant_message_id  CHAR(26) UNIQUE
provider              VARCHAR(32)
model_id              VARCHAR(160)
state                 ENUM('queued','streaming','completed','cancelled','failed')
started_at            DATETIME(3) NULL
completed_at          DATETIME(3) NULL
latency_first_token_ms INT UNSIGNED NULL
latency_total_ms      INT UNSIGNED NULL
input_tokens          INT UNSIGNED NULL
output_tokens         INT UNSIGNED NULL
error_code            VARCHAR(64) NULL
created_at            DATETIME(3)
```

### `sync_changes`

```text
change_id             BIGINT UNSIGNED AUTO_INCREMENT PK
user_id               VARCHAR(36) INDEX
entity_type           VARCHAR(32)
entity_id             CHAR(26)
operation             ENUM('upsert','delete')
entity_version        BIGINT UNSIGNED
created_at            DATETIME(3)

INDEX(user_id, change_id)
```

El cursor de sincronización es `change_id`, no una fecha del teléfono.

### `idempotency_keys`

```text
user_id               VARCHAR(36)
idempotency_key       VARCHAR(128)
request_hash          CHAR(64)
response_status       SMALLINT
response_body         JSON NULL
created_at            DATETIME(3)
expires_at            DATETIME(3)

PRIMARY KEY(user_id, idempotency_key)
INDEX(expires_at)
```

## 9.5 Migraciones

Reglas:

1. Nunca usar `drizzle-kit push` directamente en producción.
2. Generar migración versionada.
3. Revisar SQL.
4. Probar sobre una base local limpia.
5. Probar actualización desde la versión anterior.
6. Hacer backup antes de producción.
7. Aplicar migración una sola vez.
8. No ejecutar migraciones automáticamente en cada arranque web.

Scripts:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:check": "drizzle-kit check",
  "db:studio": "drizzle-kit studio"
}
```

## 9.6 Puerta de salida

- Base nueva puede crearse solo con migraciones.
- Índices verificados con `EXPLAIN`.
- Backup y restauración probados.
- La API de salud puede comprobar MySQL sin exponer credenciales.

---

# 10. Fase 4 — Backend y autenticación

## 10.1 Mejor Auth

Se utilizará una versión **estable fijada en el lockfile**, no beta ni release candidate.

Configuración:

- Adaptador Drizzle con proveedor MySQL.
- Integración oficial SvelteKit.
- Cookies HTTP-only para web.
- Bearer token para aplicación móvil.
- El token móvil se guarda en Stronghold o almacenamiento seguro controlado desde Rust, nunca en `localStorage`.
- Correo/contraseña en la primera versión.
- Verificación de correo y recuperación de contraseña antes de abrir el registro público.
- El correo transaccional se envía con Resend mediante SMTP detrás de una
  interfaz reemplazable. La API key permanece solo en el servidor. Se verifica
  `cdor.online` y se usa `no-reply@cdor.online` como remitente inicial.

## 10.2 Sesiones

Web:

```text
Cookie Secure
HttpOnly
SameSite=Lax
Path=/
Rotación de sesión
```

Móvil:

```text
Authorization: Bearer <session-token>
Token almacenado por Rust en almacén cifrado
Revocación por dispositivo
Nunca se envía al frontend más tiempo del necesario
```

## 10.3 Endpoints iniciales

```text
GET    /api/v1/health
GET    /api/v1/models
GET    /api/v1/account/usage

GET    /api/v1/devices
DELETE /api/v1/devices/:id

GET    /api/v1/conversations
POST   /api/v1/conversations
GET    /api/v1/conversations/:id
PATCH  /api/v1/conversations/:id
DELETE /api/v1/conversations/:id

GET    /api/v1/conversations/:id/messages
POST   /api/v1/chat/stream
POST   /api/v1/chat/cancel
POST   /api/v1/chat/regenerate

GET    /api/v1/memories
POST   /api/v1/memories
PATCH  /api/v1/memories/:id
DELETE /api/v1/memories/:id

GET    /api/v1/sync/pull?cursor=...
POST   /api/v1/sync/push
```

## 10.4 Reglas de autorización

Cada repositorio debe filtrar por `user_id`. Nunca basta con recibir un ID de conversación y buscarlo globalmente.

Incorrecto:

```sql
SELECT * FROM conversations WHERE id = ?
```

Correcto:

```sql
SELECT * FROM conversations WHERE id = ? AND user_id = ?
```

## 10.5 Límites de payload

Valores iniciales, configurables:

```text
Título de chat:               255 caracteres
Mensaje de usuario:           32 KiB
Mensaje de asistente guardado: 256 KiB
Memoria individual:           4 KiB
Operaciones sync por petición: 100
Tamaño JSON normal:           1 MiB
Chats por página:             30
Mensajes por página:          50
```

## 10.6 Rate limiting sin Redis

Usar dos capas:

1. Límite rápido en memoria por proceso para abuso evidente.
2. Contadores MySQL atómicos como límite autoritativo.

No se confía únicamente en memoria porque el proceso puede reiniciarse.

Límites iniciales de desarrollo:

```text
Login:       10 intentos / 15 minutos / IP + email
Registro:     5 intentos / hora / IP
Chat:        20 generaciones / 10 minutos / usuario
Sync:        60 peticiones / minuto / dispositivo
API general: 180 peticiones / minuto / usuario
Concurrencia IA: 1 generación activa por usuario inicialmente
```

## 10.7 Puerta de salida

- Registro, login, logout y revocación funcionan.
- Un usuario no puede leer recursos de otro.
- Tests de validación, autorización e idempotencia pasan.
- No hay secretos en respuestas ni logs.

---

# 11. Fase 5 — Adaptador NVIDIA NIM y streaming

## 11.1 Abstracción del proveedor

Nunca se llama a NVIDIA desde una ruta de forma directa. Se define una interfaz:

```ts
interface AiProvider {
  listModels(): Promise<AiModel[]>;
  streamChat(request: AiChatRequest, signal: AbortSignal): AsyncIterable<AiChunk>;
}
```

Implementación inicial:

```text
NvidiaNimProvider
```

Así se puede cambiar el endpoint o proveedor sin cambiar web, móvil o base de datos.

## 11.2 Variables

```env
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_DEFAULT_MODEL=
NVIDIA_REQUEST_TIMEOUT_MS=120000
```

La lista de modelos expuesta al usuario se mantiene en configuración propia. No se entrega automáticamente todo lo que devuelva el proveedor.

## 11.3 Flujo de generación

```text
1. Validar sesión.
2. Validar payload.
3. Resolver conversación del usuario.
4. Comprobar rate limit y concurrencia.
5. Crear mensaje del usuario de forma idempotente.
6. Crear mensaje assistant con estado streaming.
7. Construir prompt con presupuesto de contexto.
8. Abrir petición NVIDIA con AbortSignal.
9. Retransmitir fragmentos.
10. Acumular contenido en memoria con límite máximo.
11. Persistir snapshots periódicos, no por token.
12. Al completar, guardar contenido final y métricas.
13. Registrar cambio de sync.
14. Al cancelar/fallar, cerrar proveedor y dejar estado coherente.
```

## 11.4 Formato del stream de CDOR

No exponer sin filtrar el formato interno de NVIDIA. CDOR emite eventos propios:

```text
event: start
data: { generationId, messageId }

event: delta
data: { text }

event: usage
data: { inputTokens, outputTokens }

event: done
data: { finishReason, message }

event: error
data: { code, requestId }
```

## 11.5 Agrupación

El servidor puede recibir tokens muy pequeños. Debe agruparlos antes de emitir:

```text
Ventana: 20–40 ms
O tamaño: 256–1024 bytes
Lo que ocurra primero
```

El móvil vuelve a agrupar eventos hacia Svelte para no cruzar el bridge Rust/JS por cada token.

## 11.6 Persistencia durante streaming

No ejecutar un `UPDATE` MySQL por token.

Estrategia:

```text
Memoria durante la generación
Snapshot cada 1–2 segundos o 4–8 KiB
Escritura final al terminar
```

Si el proceso muere, la respuesta puede recuperarse hasta el último snapshot y marcarse `failed` durante reconciliación.

## 11.7 Presupuesto de contexto

El prompt no enviará siempre toda la conversación.

Orden:

1. Prompt de sistema versionado.
2. Memorias habilitadas y relevantes.
3. Resumen de contexto antiguo, si existe.
4. Últimos mensajes completos.
5. Mensaje actual.

Siempre reservar margen para la salida. Si el modelo tiene una ventana de contexto conocida, el router aplica un presupuesto conservador.

## 11.8 Prueba crítica en Hostinger

Crear una ruta temporal de streaming sin NVIDIA que emita un número cada 250 ms durante 5 minutos. Probarla desde:

- Navegador en Wi-Fi.
- Navegador en datos móviles.
- App Tauri Android.
- Con la pantalla apagándose y regresando.
- Cancelando a mitad.

Esta prueba se hace antes del frontend final.

## 11.9 Puerta de salida

- Stream real de NVIDIA funciona en producción.
- Cancelar cierra la petición upstream.
- Desconectar no deja generaciones eternas.
- Los estados MySQL son coherentes tras error, timeout y cancelación.

---

# 12. Fase 6 — Sincronización web/móvil

## 12.1 Fuente de verdad

```text
MySQL = autoridad global
SQLite = réplica parcial y cola local
```

## 12.2 Modelo de sincronización

Cada cambio de entidad genera una fila en `sync_changes` dentro de la misma transacción.

Pull:

```http
GET /api/v1/sync/pull?cursor=1842&limit=500
```

Respuesta:

```json
{
  "data": {
    "nextCursor": 1914,
    "hasMore": false,
    "changes": []
  }
}
```

Push:

```http
POST /api/v1/sync/push
Idempotency-Key: <ULID>
```

```json
{
  "operations": [
    {
      "operationId": "01J...",
      "entity": "conversation",
      "action": "upsert",
      "baseVersion": 4,
      "payload": {}
    }
  ]
}
```

## 12.3 Conflictos

Primera política:

```text
Mensajes: append-only; no se fusionan textos simultáneos.
Títulos/preferencias: última versión aceptada por servidor.
Borrado: gana sobre una actualización antigua.
Memorias: conflicto explícito si baseVersion no coincide.
```

El servidor nunca confía en el reloj del teléfono para ordenar cambios.

## 12.4 Outbox móvil

SQLite:

```text
pending_operations
- operation_id
- entity_type
- entity_id
- action
- payload_json
- base_version
- attempts
- next_attempt_at
- created_at
- last_error
```

Reintentos:

```text
1 s, 2 s, 5 s, 15 s, 30 s, 60 s, máximo 5 min
Con jitter
No reintentar errores 4xx permanentes
```

## 12.5 Puerta de salida

- Crear chat offline y sincronizar al volver la red.
- Repetir una petición no duplica mensajes.
- Dos dispositivos ven cambios.
- Un cursor viejo pagina correctamente.
- Los deletes llegan a SQLite.

---

# 13. Fase 7 — Núcleo Rust móvil antes de la interfaz

## 13.1 Responsabilidades de Rust

```text
Abrir y migrar SQLite
Guardar caché
Mantener outbox
Autenticación segura
Cliente HTTPS
Streaming
Reintentos y timeouts
Sincronización
Control de conectividad
Emisión de eventos agrupados a Svelte
Integraciones nativas
Logs técnicos sin secretos
```

## 13.2 SQLite

Usar SQLite mediante Rust o el plugin SQL de Tauri con backend SQLite. La elección concreta se congela tras un prototipo de rendimiento. La lógica de acceso debe quedar detrás de repositorios Rust; Svelte no ejecuta SQL arbitrario.

Tablas locales:

```text
local_meta
conversations
messages
memories
preferences
pending_operations
sync_state
```

## 13.3 Commands Tauri mínimos

```text
auth_sign_in
auth_sign_out
auth_session

conversation_list
conversation_get
conversation_create
conversation_update
conversation_delete

message_list
chat_start
chat_cancel
chat_retry

memory_list
memory_create
memory_update
memory_delete

sync_now
sync_status
```

## 13.4 Eventos Rust → Svelte

```text
chat://started
chat://delta
chat://completed
chat://failed
sync://state
network://state
session://expired
```

Un evento `chat://delta` lleva lotes, no tokens individuales.

## 13.5 Estado

No convertir `AppState` en una estructura global gigantesca. Separar:

```text
DatabaseState
AuthState
NetworkState
SyncState
GenerationRegistry
```

## 13.6 Errores Rust

Todos los errores cruzan el bridge como objetos serializables:

```rust
struct AppErrorPayload {
    code: String,
    message: String,
    retryable: bool,
    request_id: Option<String>,
}
```

No enviar stack traces al frontend en producción.

## 13.7 Puerta de salida

Antes de diseñar el chat bonito debe existir una pantalla técnica que pueda:

- Iniciar sesión.
- Crear conversación.
- Enviar mensaje.
- Recibir streaming.
- Cancelar.
- Cerrar/reabrir y recuperar desde SQLite.
- Trabajar offline y sincronizar.

---

# 14. DEBUG Android/Xiaomi con ADB y hot reload

## 14.1 Configuración del Xiaomi

En el Xiaomi/Redmi:

1. Activar Opciones de desarrollador tocando varias veces la versión/compilación del sistema.
2. Activar **Depuración USB**.
3. Aceptar la huella RSA del ordenador.
4. Si HyperOS lo exige para instalar la app de desarrollo, activar temporalmente la opción de instalación por USB correspondiente.
5. Mantener el teléfono desbloqueado durante la primera instalación.

No se desactiva seguridad del sistema, no se necesita root y no se desbloquea el bootloader.

## 14.2 Verificar el dispositivo correcto

```bash
adb kill-server
adb start-server
adb devices -l
```

Ejemplo esperado:

```text
HQRSFUZXXOR4PN6L device product:gust_eea model:23108RN04Y device:gust
```

Nunca ejecutar scripts contra “el primer dispositivo” cuando haya más de uno. Usar siempre `ANDROID_SERIAL`.

```bash
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
adb -s "$ANDROID_SERIAL" get-state
adb -s "$ANDROID_SERIAL" shell getprop ro.product.model
```

## 14.3 Modo oficial recomendado: Tauri por red local

La CLI de Tauri ejecuta Android en modo desarrollo y soporta hot reload del frontend y reconstrucción del Rust observado.

`apps/mobile/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421
        }
      : undefined
  }
});
```

Ejecutar:

```bash
cd cdor
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
pnpm --dir apps/mobile tauri android dev --host
```

Si hay varias IP, forzar selección:

```bash
pnpm --dir apps/mobile tauri android dev --force-ip-prompt
```

O indicar la IP LAN del PC:

```bash
pnpm --dir apps/mobile tauri android dev --host 192.168.178.149
```

Requisitos:

- PC y móvil en la misma red.
- Puerto 1420 y HMR 1421 accesibles en la red local.
- No usar una red pública/no confiable para el servidor de desarrollo.

Cambios esperados:

```text
Svelte/TypeScript/CSS → HMR casi inmediato
Rust                 → recompila y reinicia la app
Kotlin/Gradle         → recompilación Android más lenta
```

## 14.4 Modo USB con `adb reverse`

Este modo evita depender de la Wi-Fi y obliga al móvil a alcanzar el servidor del PC por USB.

Crear `scripts/debug-xiaomi.sh`:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERIAL="${ANDROID_SERIAL:-}"

if [[ -z "$SERIAL" ]]; then
  echo "ERROR: define ANDROID_SERIAL con el serial mostrado por adb devices -l" >&2
  exit 1
fi

adb -s "$SERIAL" get-state >/dev/null

MODEL="$(adb -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')"
DEVICE="$(adb -s "$SERIAL" shell getprop ro.product.device | tr -d '\r')"

echo "Dispositivo: $MODEL ($DEVICE) [$SERIAL]"

# Vite y websocket HMR vistos como localhost dentro del teléfono.
adb -s "$SERIAL" reverse --remove-all || true
adb -s "$SERIAL" reverse tcp:1420 tcp:1420
adb -s "$SERIAL" reverse tcp:1421 tcp:1421

cleanup() {
  adb -s "$SERIAL" reverse --remove-all >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

cd "$ROOT"
export CDOR_ANDROID_USB=1
export RUST_LOG="cdor_mobile=debug,tauri=info"

pnpm --dir apps/mobile tauri android dev "$SERIAL" --verbose
```

Dar permisos:

```bash
chmod +x scripts/debug-xiaomi.sh
```

Ajustar Vite para USB:

```ts
const usb = process.env.CDOR_ANDROID_USB === "1";
const host = process.env.TAURI_DEV_HOST;

server: {
  host: usb ? "127.0.0.1" : host || false,
  port: 1420,
  strictPort: true,
  hmr: usb
    ? {
        protocol: "ws",
        host: "localhost",
        port: 1421,
        clientPort: 1421
      }
    : host
      ? { protocol: "ws", host, port: 1421 }
      : undefined
}
```

`tauri.conf.json` mantiene:

```json
{
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  }
}
```

Ejecutar:

```bash
export ANDROID_SERIAL=HQRSFUZXXOR4PN6L
./scripts/debug-xiaomi.sh
```

Si la CLI de Tauri decide sobrescribir la URL con una IP LAN o la versión instalada no respeta este modo, usar el modo oficial `--host`. El modo USB es una comodidad propia del proyecto, no debe bloquear el desarrollo.

## 14.5 Chrome DevTools del WebView

Con la app de desarrollo abierta:

1. Abrir Chromium/Chrome en el PC.
2. Navegar a `chrome://inspect/#devices`.
3. Localizar `online.cdor.app`.
4. Pulsar **inspect**.

Sirve para:

- Consola JavaScript.
- Red.
- WebSocket de HMR.
- Layout y CSS.
- Memoria del WebView.
- Performance trace.

## 14.6 Logs Android

Limpiar y seguir logs:

```bash
adb -s "$ANDROID_SERIAL" logcat -c
adb -s "$ANDROID_SERIAL" logcat
```

Filtrado general útil:

```bash
adb -s "$ANDROID_SERIAL" logcat \
  | grep --line-buffered -Ei 'cdor|tauri|rust|chromium|AndroidRuntime|FATAL EXCEPTION'
```

Crash buffer:

```bash
adb -s "$ANDROID_SERIAL" logcat -b crash -d
```

Estado del proceso:

```bash
adb -s "$ANDROID_SERIAL" shell pidof online.cdor.app
adb -s "$ANDROID_SERIAL" shell dumpsys meminfo online.cdor.app
adb -s "$ANDROID_SERIAL" shell dumpsys gfxinfo online.cdor.app framestats
```

## 14.7 Reiniciar y limpiar

Forzar cierre:

```bash
adb -s "$ANDROID_SERIAL" shell am force-stop online.cdor.app
```

Borrar datos locales de desarrollo:

```bash
adb -s "$ANDROID_SERIAL" shell pm clear online.cdor.app
```

Desinstalar:

```bash
adb -s "$ANDROID_SERIAL" uninstall online.cdor.app
```

No usar `pm clear` sobre una build con datos que quieras conservar.

## 14.8 Simular red

Pruebas manuales seguras:

- Desactivar Wi-Fi/datos desde el teléfono.
- Enviar mensaje y verificar que queda en outbox.
- Reactivar red y verificar sincronización.
- Cambiar entre Wi-Fi y datos durante streaming.
- Bloquear/desbloquear pantalla.
- Rotar pantalla.
- Activar ahorro de batería.
- Matar la app desde recientes y reabrir.

No usar comandos ADB destructivos o cambios persistentes de red sin necesidad.

## 14.9 Perfil release en el Xiaomi

El modo debug no representa el rendimiento real. Crear periódicamente una build release:

```bash
pnpm --dir apps/mobile tauri android build
```

Instalar el APK release de pruebas correspondiente con:

```bash
adb -s "$ANDROID_SERIAL" install -r /ruta/al/apk
```

Medir siempre scroll, arranque y memoria en release.

---

# 15. Fase 8 — Tests, CI y observabilidad

## 15.1 Tests obligatorios

### Unitarios

- Contratos Zod.
- Construcción de prompts.
- Token budget.
- Transformación de streaming.
- Resolución de conflictos sync.
- Reintentos.

### Integración

- Repositorios MySQL.
- Transacciones que escriben entidad + `sync_changes`.
- Idempotencia.
- Auth y autorización.
- Provider NVIDIA simulado.

### API

- Usuario A no accede a usuario B.
- Rate limiting.
- Cancelación.
- Payloads enormes.
- Stream incompleto.
- Timeout del proveedor.

### Rust

```bash
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

### Web/Svelte

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
```

## 15.2 CI

`checks.yml`:

```text
checkout
setup Node
setup pnpm
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build:platform
cargo fmt --check
cargo clippy
cargo test
```

No compilar Android en cada commit. Android se compila en PR importantes, manualmente o con etiquetas de release.

## 15.3 Logs

Cada petición obtiene `requestId`.

Log estructurado mínimo:

```json
{
  "level": "info",
  "requestId": "01J...",
  "route": "/api/v1/chat/stream",
  "userIdHash": "...",
  "status": 200,
  "durationMs": 1420
}
```

Nunca incluir:

- Clave NVIDIA.
- Contraseña.
- Token de sesión.
- Cookie.
- Prompt completo en producción.
- Contenido completo de memoria.

## 15.4 Puerta de salida

- CI verde desde clon limpio.
- Fallos de NVIDIA simulados.
- Tests de ownership de datos.
- Logs permiten encontrar un fallo por `requestId`.

---

# 16. Fase 9 — Deploy de backend/API antes del frontend final

## 16.1 SvelteKit Node

Usar `@sveltejs/adapter-node`.

Construcción:

```bash
pnpm --dir apps/platform build
```

Arranque:

```bash
node apps/platform/build
```

En `apps/platform/package.json`:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node build",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json"
  }
}
```

## 16.2 Hostinger

Repositorio:

```text
GitHub → cdor-platform
Rama → production
```

Hostinger debe ejecutar la aplicación Node/SvelteKit. Dependiendo de la interfaz disponible, configurar el directorio del proyecto como `apps/platform` o usar scripts raíz que filtren el workspace.

Opción raíz:

```text
Install: corepack enable && pnpm install --frozen-lockfile
Build:   pnpm build:platform
Start:   pnpm start:platform
Output:  apps/platform/build
Entry:   apps/platform/build/index.js
```

La ruta de entrada exacta se confirma mirando el contenido generado por `adapter-node` y la pantalla de Hostinger; no se inventa si el panel la detecta automáticamente.

## 16.3 Variables de producción

```env
NODE_ENV=production
ORIGIN=https://cdor.online
PUBLIC_APP_URL=https://cdor.online
PUBLIC_API_URL=https://cdor.online/api/v1

DB_HOST=<valor hPanel>
DB_PORT=3306
DB_NAME=<valor hPanel>
DB_USER=<valor hPanel>
DB_PASSWORD=<secreto>
DATABASE_URL=mysql://...

BETTER_AUTH_SECRET=<mínimo 32 bytes aleatorios>
BETTER_AUTH_URL=https://cdor.online

NVIDIA_API_KEY=<secreto>
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_DEFAULT_MODEL=<modelo validado>
```

## 16.4 Despliegue seguro

```text
1. Backup MySQL.
2. Aplicar migración revisada.
3. Desplegar rama production.
4. Probar /api/v1/health.
5. Probar auth.
6. Probar stream sintético.
7. Probar NVIDIA.
8. Ejecutar smoke tests.
9. Observar logs y uso de recursos.
```

## 16.5 Rollback

- Mantener etiqueta Git de cada release.
- No mezclar migraciones destructivas con el mismo despliegue que elimina compatibilidad.
- Usar cambios de base expand/contract:
  1. Añadir columna nueva.
  2. Desplegar código compatible con ambas.
  3. Migrar datos.
  4. Dejar de usar antigua.
  5. Eliminar en otra release.

## 16.6 Puerta de salida

El backend debe operar varios días con una interfaz técnica mínima antes de empezar la UI final.

---

# 17. Fase 10 — Frontend web

Solo ahora se construye la experiencia visual web.

## 17.1 Pantallas

```text
Landing
Registro/login
Chat
Historial
Memorias
Ajustes
Cuenta y uso
Privacidad
Términos
```

## 17.2 Diseño

- CSS propio y design tokens.
- Componentes accesibles.
- Sin kit visual pesado.
- Layout web distinto del móvil.
- Soporte oscuro/claro desde tokens.
- Carga diferida de Markdown avanzado y resaltado.

## 17.3 Renderizado del chat

Durante streaming:

- Mostrar texto ligero.
- No rerenderizar todo el chat.
- Acumular fragmentos.
- No ejecutar Shiki por token.

Al terminar:

- Parsear Markdown final.
- Sanitizar.
- Resaltar código de forma diferida.
- Renderizar tablas y bloques complejos cuando entren en viewport.

## 17.4 Puerta de salida

- Teclado y foco correctos.
- Navegación accesible.
- Chat de 1.000 mensajes sigue utilizable mediante virtualización/paginación.
- Lighthouse y trazas sin regresiones graves.

---

# 18. Fase 11 — Frontend móvil

## 18.1 Principios

- Svelte es presentación; Rust mantiene datos y red sensibles.
- Mostrar primero SQLite y sincronizar después.
- Navegación adaptada a una mano.
- Safe areas.
- Teclado móvil sin tapar el composer.
- Gestos mínimos y previsibles.
- No copiar ciegamente el layout web.

## 18.2 Pantallas

```text
Onboarding/login
Inicio/nuevo chat
Chat
Historial en sheet/drawer
Memorias
Ajustes
Cuenta
Estado offline/sync
```

## 18.3 Actualización de streaming

```text
Rust recibe red
Rust agrupa 20–40 ms
Rust emite lote
Store Svelte actualiza solo mensaje activo
Markdown ligero durante stream
Markdown final al completar
```

## 18.4 Lista de mensajes

- Cargar últimos 50.
- Cargar anteriores al llegar arriba.
- Mantener anclaje del scroll.
- No tener miles de nodos DOM.
- Cada mensaje es un componente aislado.
- Bloques de código largos se renderizan bajo demanda.

## 18.5 Puerta de salida

- 60 FPS objetivo en el Xiaomi de prueba durante scroll normal.
- Composer responde sin saltos con teclado.
- Cierre/reapertura conserva estado.
- Cambio de red no duplica mensajes.

---

# 19. Fase 12 — Kotlin y Swift

No escribir Kotlin o Swift hasta que una necesidad no esté cubierta por plugins oficiales o Rust.

Casos posibles:

```text
Biometría
Notificaciones avanzadas
Compartir
Deep links
Compras dentro de la app
Widgets
Integración específica con Android/iOS
```

Cada plugin nativo tendrá:

- Interfaz Rust estable.
- Permisos mínimos.
- Implementación Kotlin.
- Implementación Swift.
- Simulación/fallback para desarrollo de escritorio.
- Tests manuales documentados.

---

# 20. Optimización “como un cohete”

## 20.1 Presupuestos de rendimiento

Objetivos, no garantías absolutas:

```text
Acción táctil → feedback visual:         < 50 ms
Abrir chat cacheado:                     < 150 ms
Actualización visual de streaming:       20–50 ms por lote
Frame objetivo:                          16,7 ms para 60 FPS
Bundle inicial móvil JS comprimido:      objetivo < 250 KiB
Consultas comunes MySQL:                 objetivo < 50 ms servidor
Overhead propio antes de NVIDIA:         objetivo < 150 ms
Memoria Android en chat normal:          objetivo < 200 MiB
```

Se miden en release, no en debug.

## 20.2 Frontend

- Svelte 5.
- Evitar stores globales gigantes.
- Estado normalizado por ID.
- Virtualización/paginación.
- `transform` y `opacity` para animaciones.
- Evitar `backdrop-filter` a pantalla completa en Android débil.
- No animar `height` continuamente.
- Imágenes con tamaño reservado para evitar layout shift.
- Lazy import de Shiki, KaTeX y componentes pesados.
- Fuentes limitadas y, si se empaquetan, subconjuntos legales.
- No incluir librerías duplicadas.

## 20.3 Rust móvil

- Cliente HTTP reutilizable.
- Timeouts explícitos.
- No bloquear el hilo principal.
- SQLite con WAL si es estable en el dispositivo y bajo pruebas.
- Transacciones para lotes.
- Prepared statements/repositorios.
- Evitar serializar conversaciones completas por cada delta.
- Payloads pequeños por el bridge.
- Cancelación cooperativa.

## 20.4 MySQL

- Pool pequeño inicialmente, por ejemplo 2–5 conexiones, ajustado según límites reales de Hostinger.
- Índices compuestos según consultas reales.
- Paginación por cursor, no `OFFSET` enorme.
- Seleccionar columnas necesarias.
- No almacenar blobs grandes en MySQL en v1.
- No hacer N+1.
- Ejecutar `EXPLAIN` en endpoints críticos.
- Archivar o resumir chats enormes en lugar de enviar todo al modelo.

## 20.5 Streaming

- Backpressure.
- Abortar upstream al desconectarse el cliente.
- Heartbeat solo si Hostinger/proxy lo necesita.
- Agrupar deltas.
- No guardar por token.
- Límite máximo de respuesta para evitar memoria ilimitada.

## 20.6 Carga

Antes de abrir usuarios:

```text
10 usuarios concurrentes
25 usuarios concurrentes
50 usuarios concurrentes
```

Medir:

- CPU/RAM en Hostinger.
- Conexiones MySQL.
- Tiempo al primer token.
- Errores 5xx.
- Desconexiones.
- Consumo NVIDIA.

No afirmar que soporta miles de usuarios sin pruebas.

---

# 21. Seguridad

## 21.1 API

- Validación Zod en todos los límites.
- Ownership por usuario.
- CSRF para acciones web con cookie cuando corresponda.
- Same-origin para web.
- Rust móvil hace peticiones nativas.
- HTTPS obligatorio.
- Headers de seguridad.
- CSP estricta compatible con Svelte/Tauri.
- Sanitización de Markdown.
- Links externos con confirmación/política segura.

## 21.2 Tauri

- Capabilities mínimas.
- Solo commands necesarios.
- Scopes de filesystem limitados.
- No activar shell genérico.
- No permitir ejecutar comandos arbitrarios.
- Auditar plugins y mantener versiones compatibles.
- Secretos en Stronghold/almacén seguro, no frontend.

## 21.3 Datos

- Minimizar datos guardados.
- Botón para borrar memoria.
- Botón para borrar conversación.
- Proceso de eliminación de cuenta.
- Política de retención de logs.
- Backups MySQL.
- No usar contenido privado para entrenamiento sin consentimiento explícito.

---

# 22. Git y ramas

```text
main        desarrollo estable
production  estado desplegado en Hostinger
feature/*   cambios aislados
fix/*       correcciones
release/*   preparación de versión móvil
```

Reglas:

- PR hacia `main`.
- CI obligatorio.
- `production` solo recibe cambios probados desde `main`.
- Tags:

```text
platform-v0.1.0
android-v0.1.0
ios-v0.1.0
```

## 22.1 `.gitignore`

```gitignore
node_modules/
.svelte-kit/
build/
dist/
.vite/
coverage/

**/target/

.gradle/
**/android/app/build/
**/android/build/
**/android/local.properties
*.apk
*.aab
*.jks
*.keystore

DerivedData/
Pods/
*.ipa
*.p12
*.mobileprovision

.env
.env.*
!.env.example

*.sqlite
*.sqlite3
*.db
*.db-shm
*.db-wal

*.log
logs/
.cache/
tmp/

.idea/
.vscode/
.DS_Store
```

Sí se suben:

```text
src-tauri/src
Cargo.toml
Cargo.lock
tauri*.conf.json
migraciones MySQL
migraciones SQLite
gen/android y gen/apple cuando contengan configuración/código nativo necesario
```

---

# 23. Checklist de lanzamiento

## Backend

- [ ] MySQL con backup probado.
- [ ] Migraciones reproducibles.
- [ ] Auth con verificación/recuperación.
- [ ] Ownership tests.
- [ ] Rate limiting.
- [ ] Idempotencia.
- [ ] Streaming probado en Hostinger.
- [ ] Cancelación probada.
- [ ] Métricas de uso NVIDIA.
- [ ] Política de privacidad y términos.

## Web

- [ ] Responsive.
- [ ] Accesible.
- [ ] CSP.
- [ ] Sanitización Markdown.
- [ ] Estados offline/error.
- [ ] Borrado de chat/memoria/cuenta.

## Android

- [ ] Debug por ADB.
- [ ] Release probada en Xiaomi físico.
- [ ] Firma separada y respaldada.
- [ ] Permisos mínimos.
- [ ] Política de red clara.
- [ ] App bundle generado.
- [ ] Sin secretos en APK/AAB.

## iOS

- [ ] Mac/Xcode disponible.
- [ ] Bundle ID registrado.
- [ ] Certificados y perfiles.
- [ ] Build física.
- [ ] Safe areas/teclado.
- [ ] Privacidad App Store.

---

# 24. Criterio de “terminado” para la versión 1

La v1 solo se considera terminada cuando:

1. Un usuario se registra e inicia sesión en web y móvil.
2. Empieza un chat en web y lo continúa en Android/iOS.
3. Los mensajes se transmiten progresivamente.
4. Cancelar funciona.
5. La app abre chats cacheados sin red.
6. Los mensajes offline se envían una sola vez al recuperar red.
7. La memoria se puede ver, editar, desactivar y borrar.
8. Un usuario jamás accede a los datos de otro en tests automatizados.
9. La clave NVIDIA no aparece en bundles, logs ni tráfico cliente.
10. El Xiaomi físico mantiene una experiencia fluida en build release.
11. Hostinger soporta la carga medida o existe una migración clara de la API a VPS.
12. Hay backups y rollback documentados.

---

# 25. Orden de ejecución resumido

```text
1. Instalar herramientas.
2. Crear monorepo.
3. Conseguir build web y Android vacíos.
4. Crear contratos Zod.
5. Diseñar MySQL y migraciones.
6. Implementar auth.
7. Implementar API CRUD.
8. Implementar NVIDIA y streaming.
9. Validar streaming real en Hostinger.
10. Implementar sync.
11. Implementar SQLite/Rust/outbox.
12. Probar todo con una UI técnica mínima.
13. Añadir tests y CI.
14. Dejar backend estable en producción.
15. Crear frontend web final.
16. Crear frontend móvil final.
17. Añadir Kotlin/Swift solo cuando haga falta.
18. Optimizar con mediciones release.
19. Firmar y publicar.
```

---

# 26. Fuentes técnicas oficiales consultadas

- Tauri 2 — desarrollo móvil, CLI, Android dev/hot reload y requisitos: `https://v2.tauri.app/develop/`, `https://v2.tauri.app/reference/cli/`, `https://v2.tauri.app/start/prerequisites/`
- Tauri 2 — plugins SQL, Stronghold y desarrollo Kotlin/Swift: `https://v2.tauri.app/plugin/sql/`, `https://v2.tauri.app/plugin/stronghold/`, `https://v2.tauri.app/develop/plugins/develop-mobile/`
- SvelteKit adapter-node: `https://svelte.dev/docs/kit/adapter-node`
- pnpm workspaces: `https://pnpm.io/workspaces`
- Drizzle con MySQL/mysql2: `https://orm.drizzle.team/docs/mysql/get-started-mysql`
- Better Auth con SvelteKit y Drizzle/MySQL: `https://better-auth.com/docs/integrations/svelte-kit`, `https://better-auth.com/docs/adapters/drizzle`
- Resend — límites, SMTP y verificación de dominio: `https://resend.com/pricing`, `https://resend.com/docs/send-with-smtp`, `https://resend.com/docs/dashboard/domains/introduction`
- NVIDIA NIM LLM API: `https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html`
- Hostinger Node.js y MySQL: `https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/`, `https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/`

---

**Regla final:** primero datos, contratos, backend, streaming, sincronización, Rust y pruebas. La interfaz bonita llega después. Una UI espectacular sobre una base frágil no sirve; CDOR debe sentirse rápido porque su arquitectura lo es, no porque esconda errores con animaciones.
