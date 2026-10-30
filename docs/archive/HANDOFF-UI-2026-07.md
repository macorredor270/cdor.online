# MAC — Handoff técnico y análisis crítico de UI

Documento de traspaso para redactar un prompt de refactorización de interfaz.
Estado a 31 de julio de 2026.

---

## 1. Qué es el producto

**MAC** es una plataforma de chat con IA. Web en `https://cdor.online` más
aplicación Android/iOS. Cuenta, conversaciones, mensajes, memorias y
preferencias son compartidos entre plataformas.

El dominio sigue siendo `cdor.online` y el identificador Android
`online.cdor.app` por decisión explícita: cambiar el `applicationId` habría
convertido la app en una instalación nueva, impidiendo actualizar.

Fase privada. Registro público abierto pero sin difusión. Una sola cuenta real
en producción.

---

## 2. Stack

```text
Monorepo pnpm workspaces
├── apps/platform   SvelteKit 2.70 + Svelte 5 (runas) + TypeScript, adapter-node
├── apps/mobile     Tauri 2.11 + Rust + Svelte 5 + SQLite
└── packages/contracts  Zod 4 como fuente única de tipos
```

- **Estilos**: CSS propio, sin framework. Sin Tailwind, sin librería de
  componentes. Variables CSS en `apps/platform/src/app.css`.
- **Base de datos**: MySQL 8.4 (Hostinger), Drizzle ORM.
- **Auth**: Better Auth 1.6.25, cookies HttpOnly en web, bearer en móvil.
- **IA**: NVIDIA NIM detrás de la API propia, streaming SSE.
- **Node**: 24.18.0 fijado.

**Restricción dura para el refactor**: no introducir Tailwind ni una librería
de componentes sin justificarlo. El proyecto es deliberadamente CSS propio.

---

## 3. Sistema de diseño actual

### Identidad

Isotipo en forma de M, púrpura con biseles cromados. PNG 1024×1024 con alfa en
`static/branding/mac-logo.png`. Variantes de 96 y 256 px por peso (el máster
pesa 1,5 MiB). Componente único `$lib/components/Logo.svelte` con `srcset`.

### Tokens

Definidos en `apps/platform/src/app.css`. La paleta de marca **no se redefine
entre temas**; solo cambian las variables semánticas que apuntan a ella.

```css
/* Marca — idéntica en ambos temas */
--mac-purple-950: #240046;  --mac-purple-900: #3a0a6e;
--mac-purple-800: #4a148c;  /* corporativo */
--mac-purple-700: #5e1bb7;  --mac-purple-600: #7625d6;
--mac-violet-500: #9333ea;  --mac-violet-400: #a855f7;
--mac-violet-300: #c084fc;
--mac-chrome-light: #f4f1fa; --mac-chrome: #c9c4d4; --mac-chrome-dark: #777181;
--mac-white: #ffffff; --mac-background: #faf9fc;
--mac-text: #17121f; --mac-text-muted: #716a7c; --mac-border: #e8e3ed;
--mac-gradient: linear-gradient(135deg, #4a148c 0%, #7625d6 55%, #a855f7 100%);
--mac-chrome-edge: linear-gradient(135deg, chrome-light, chrome, chrome-dark);

/* Semánticas — cambian con el tema */
--bg --surface --surface-2 --surface-3 --border --border-strong
--text --text-muted --accent --accent-strong --accent-soft
--button-bg --button-hover --on-accent --success --danger
--shadow --shadow-brand

/* Geometría y movimiento */
--radius-card: 16px; --radius-control: 12px;
--motion-fast: 160ms; --motion-base: 220ms;
--easing: cubic-bezier(0.22, 0.61, 0.36, 1);
```

Tema por defecto **oscuro** (`color-scheme: dark`), claro vía
`:root[data-theme="light"]`. El móvil (`apps/mobile/src/app.css`) replica la
misma paleta con sus propios nombres semánticos (`--muted`, `--accent-light`,
`--accent-button`).

### Clases utilitarias existentes

`.button` (+ `.secondary`, `.danger`, `[data-loading]`), `.field`, `.panel`
(+ `.interactive`), `.chrome-edge`, `.sr-only`, `.muted`, `.error`, `.success`.

Tipografía: Inter, una sola familia. `--font-mono` definida pero apenas usada.

---

## 4. Mapa de rutas

### Público
| Ruta | Estado |
|---|---|
| `/` | Portada + panel de acceso |
| `/register` | Alta con medidor de contraseña |
| `/verify-email` | Reenvío de verificación |
| `/forgot-password`, `/reset-password` | Recuperación |
| `/privacy`, `/terms` | Legales, estructura RGPD |
| `/robots.txt`, `/sitemap.xml` | |

### Autenticado — `(app)` con guard server-side
| Ruta | Contenido |
|---|---|
| `/chat` | Estado vacío |
| `/chat/[conversationId]` | Chat con streaming SSE |
| `/memories` | CRUD de memorias |
| `/usage` | Consumo de tokens |
| `/settings` | Tema y preferencias locales |
| `/account` | Dispositivos + eliminar cuenta |

Layout `(app)`: barra lateral fija de 18rem con marca, botón de nueva
conversación, historial paginado, navegación secundaria y perfil. Móvil:
hamburguesa + `scrim`.

### API
`/api/v1/`: `models`, `conversations`, `conversations/:id/messages`,
`chat/stream`, `chat/cancel`, `chat/regenerate`, `memories`, `sync/pull`,
`sync/push`, `usage`, `auth/devices`, `account/delete`.

---

## 5. Chat: cómo funciona hoy

- `POST /api/v1/chat/stream` con `fetch` y lectura incremental. No
  `EventSource` porque es POST.
- Cinco eventos: `start`, `delta`, `usage`, `done`, `error`.
- Deltas agrupados cada 30 ms o 512 bytes en servidor.
- Markdown convertido a nodos Svelte tipados. **No existe `{@html}`**: el HTML
  recibido del modelo se muestra como texto y solo se crean enlaces `http(s)`
  con `noopener noreferrer`. Cualquier refactor debe conservar esto.
- Mensajes históricos con `content-visibility: auto` y paginación de 50.
- Mensaje de usuario sobre `--mac-gradient`; respuesta sobre el fondo.
- Acciones existentes: copiar, regenerar, cancelar.

---

## 6. Accesibilidad ya implementada — no romper

- `:focus-visible` con `outline: 3px solid` en `app.css`, reforzado en campos
  con `box-shadow`.
- `@media (prefers-reduced-motion: reduce)` anula transiciones.
- `.sr-only` para etiquetas de botones con icono.
- `role="alert"` en errores, `role="status"` en confirmaciones,
  `aria-live="polite"` en streaming.
- `alt=""` en el logo cuando es decorativo.

---

# ANÁLISIS CRÍTICO DE UI

Lo que sigue son problemas reales verificados en el código y en producción, no
opiniones genéricas.

## A. Roto o ausente

### A1. No existe página de error — **crítico**
No hay ningún `+error.svelte`. Un 404 o un 500 muestra la pantalla por defecto
de SvelteKit: fondo blanco, tipografía del sistema, sin marca. Es la única
pantalla del producto que no se ha diseñado, y es la que más probablemente vea
alguien que llega por un enlace roto.

### A2. Sin resaltado de sintaxis
El plan pedía Shiki con carga diferida. No se implementó. Los bloques de código
que devuelve el modelo salen como texto plano monoespaciado. Para un asistente
de IA orientado a trabajo técnico es una carencia de producto, no cosmética.
Tampoco hay botón de copiar por bloque de código: solo se copia el mensaje
entero.

### A3. Tres `confirm()` nativos del navegador
En revocar dispositivo, eliminar cuenta y borrar. Salen sin estilo, sin marca,
imposibles de tematizar, y en móvil se ven como alerta del sistema. Rompen por
completo la sensación de producto premium en los momentos más delicados.

### A4. Sin sistema de notificaciones
Los errores son `<p class="error">` inline. Cuando la acción ocurre lejos del
punto de scroll —revocar un dispositivo, sincronizar—, el usuario no ve
respuesta alguna. Hace falta un patrón de toast accesible con `role="status"`.

### A5. Sin estados de carga reales
Solo dos literales «Cargando…». No hay skeletons. Al abrir una conversación el
área de mensajes está vacía hasta que llega la respuesta. La barra lateral
aparece vacía antes de cargar el historial.

### A6. Sin valorar respuestas
No hay pulgar arriba/abajo. Requiere persistencia que no existe.

## B. Feo o descuidado

### B1. Cuatro sistemas de layout distintos para cinco páginas públicas
`landing-shell`, `register-shell`, `auth-page` (verify-email, forgot, reset) y
`main` pelado (privacy, terms). Cada uno con su propio ancho, su propio
espaciado y sus propias reglas. Es la causa raíz de que la superficie pública
se vea inconsistente.

### B2. Registro descentrado en escritorio
La tarjeta de alta se ancla a la izquierda dentro de un contenedor de 1180 px,
dejando dos tercios de pantalla vacíos a la derecha. En 1440 px es muy
evidente. O se centra, o se usa el espacio con algo.

### B3. Privacidad y términos sin marca
Su cabecera es la palabra «MAC» en texto plano. **Son las dos únicas páginas
sin el isotipo.** Además son un muro de texto: 12 secciones sin índice, sin
anclas, sin separadores visuales entre bloques. Nadie las va a leer así.

### B4. Barra lateral sin jerarquía
Historial, navegación secundaria y perfil tienen el mismo peso visual. Las
conversaciones se distinguen solo por un fondo sutil al estar activas. Sin
agrupación por fecha (hoy / esta semana / anteriores), sin buscador, sin
renombrar ni borrar desde la lista. Con 50 conversaciones es inusable.

### B5. Avatar de perfil como inicial en un círculo
`data.user.name.slice(0, 1)`. Es el patrón por defecto de cualquier plantilla.

### B6. Estados vacíos pobres
Un carácter `✦` suelto, un título y un párrafo. Sin ilustración, sin acciones
sugeridas, sin ejemplos de qué preguntar. El estado vacío del chat es la
primera pantalla que ve un usuario nuevo tras entrar.

### B7. Densidad tipográfica plana
Casi todo el texto de apoyo es `--text-muted` al mismo tamaño. Sin escala
tipográfica declarada: cada componente inventa su `font-size` con valores
sueltos (`0.74rem`, `0.83rem`, `0.85rem`, `0.87rem`…). Faltan tokens
`--text-xs/sm/base/lg/xl`.

### B8. Radios inconsistentes
Conviven `0.35rem`, `0.5rem`, `0.6rem`, `0.65rem`, `0.75rem`, `1rem`, `999px`
con los tokens `--radius-card: 16px` y `--radius-control: 12px`. Los tokens se
añadieron pero no se propagaron a los componentes antiguos.

### B9. El cromado del logo no se usa en la interfaz
Existe `--mac-chrome-edge` y la clase `.chrome-edge`, pero no se aplica en
ningún sitio. La identidad promete un acabado premium que la interfaz no
recoge.

### B10. Móvil web sin barra inferior
La app móvil nativa tiene `BottomNav`. La web en móvil usa hamburguesa. Misma
marca, dos modelos de navegación distintos.

## C. Riesgos del refactor — respetar

1. **No introducir `{@html}`.** El Markdown se renderiza a nodos Svelte
   tipados a propósito. Es una decisión de seguridad.
2. **No suprimir `:focus-visible`.** Ya hubo que revertir un `outline: none`.
3. **Svelte 5 con runas** (`$state`, `$derived`, `$props`, `$effect`). No
   sintaxis de Svelte 4. Excepción: `register/+page.svelte` aún usa `$:`.
4. **`object-fit: contain` en todas las variantes del logo.** No deformar, no
   recortar, no aplicar filtros CSS que alteren su color.
5. **El plan de rendimiento tiene presupuestos**: bundle inicial móvil
   < 250 KiB comprimido, 60 FPS en scroll, actualización de streaming en
   20–50 ms por lote. Cualquier librería pesada los pone en riesgo.
6. **`content-visibility` y paginación de 50** en la lista de mensajes existen
   por rendimiento con conversaciones largas.

## D. Orden sugerido

1. Tokens: escala tipográfica y de radios; propagarlos y eliminar valores
   sueltos.
2. Un solo shell público; `+error.svelte` con marca.
3. Reemplazar `confirm()` por diálogo propio accesible; añadir toasts.
4. Chat: resaltado diferido, copiar por bloque, estados vacíos con ejemplos.
5. Barra lateral: agrupar por fecha, buscar, renombrar y borrar.
6. Skeletons.
7. Privacidad y términos: índice, anclas y marca.

---

## 7. Estado operativo

- Producción sirve la versión actual desplegada **a mano por SSH**, no por la
  tubería. El repo del servidor marca `deploy: ca23bf9` aunque los archivos son
  posteriores. Copia de seguridad en `runtime/build.bak-20260731104518`.
- **14 commits sin subir a GitHub**: ni la máquina de desarrollo ni el servidor
  pueden autenticarse contra el remoto.
- Base de datos verificada: `user_email_unique` presente, cero duplicados, 3
  migraciones aplicadas, cero generaciones colgadas. Volumen: 1 cuenta, 3
  conversaciones, 12 mensajes.
- Bloqueadores de lanzamiento abiertos: carga concurrente en Hostinger (falla a
  25 usuarios simultáneos), restauración de backup nunca verificada, revisión
  jurídica de los textos legales, iOS sin compilar.

## 8. Comandos

```bash
pnpm check              # svelte-check + tsc, debe dar 0 errores
pnpm test               # 15 archivos
pnpm build:platform
pnpm test:e2e:web       # smoke: públicas 200, app privada 303
pnpm scan:client-secrets
pnpm dev:platform
```
