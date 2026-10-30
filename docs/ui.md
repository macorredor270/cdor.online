# Interfaz web

Referencia vigente del sistema de diseño de `apps/platform`. Sustituye al
traspaso de julio de 2026 (`archive/HANDOFF-UI-2026-07.md`).

## Principios

- **CSS propio**, sin Tailwind ni librerías de componentes con estilo.
- **La paleta de marca no cambia entre temas.** Los componentes usan solo las
  variables semánticas (`--bg`, `--surface*`, `--text*`, `--accent*`,
  `--border*`, `--danger`…), que apuntan a la marca.
- **Silencio visual:** sin resplandores de fondo, glassmorphism sistemático,
  emojis como iconos ni rejillas simétricas de tarjetas idénticas.
- **Seguridad:** el Markdown del modelo se convierte en nodos Svelte tipados.
  No existe `{@html}`; los enlaces solo admiten `http(s)`.

## Tokens (`src/app.css`)

| Grupo | Tokens |
| --- | --- |
| Texto | `--text-xs` (0.75rem, suelo) · `--text-sm` · `--text-base` · `--text-lg` · `--text-xl` · `--text-2xl` · `--text-display` |
| Espaciado | `--space-1` … `--space-12` (múltiplos de 4px) |
| Radios | `--radius-xs` 6 · `--radius-sm` 8 · `--radius-control` 12 · `--radius-card` 16 · `--radius-pill` |
| Anchos | `--width-page` (páginas de la app) · `--width-chat` · `--width-prose` · `--width-wide` · `--sidebar-width` · `--sidebar-rail` · `--topbar-height` · `--gutter` |
| Movimiento | `--motion-fast` 160ms · `--motion-base` 220ms · `--motion-slow` 320ms · `--easing` · `--easing-out` |

Animaciones comunes: `mac-rise` (entrada con desplazamiento) y `mac-fade`.
`prefers-reduced-motion` las anula globalmente. La app móvil
(`apps/mobile/src/app.css`) comparte la escala de texto y radios.

Ningún componente debe usar un tamaño de letra, radio o variable que no esté
en esta tabla. Para comprobar variables inexistentes:

```bash
used=$(grep -rhoE 'var\(--[a-z0-9-]+' apps/platform/src | sed 's/var(//' | sort -u)
defined=$(grep -rhoE '(^|[ ;{])--[a-z0-9-]+:' apps/platform/src | grep -oE -- '--[a-z0-9-]+' | sort -u)
comm -23 <(echo "$used") <(echo "$defined")   # solo deben salir --hl-dark y --hl-light
```

## Tema

- Oscuro por defecto; claro con `:root[data-theme="light"]`; opción «Sistema».
- El script en línea de `src/app.html` aplica el tema **antes del primer
  pintado**. `src/lib/client/theme.ts` lee y guarda la preferencia
  (`localStorage["cdor-theme"]`). Ambos deben mantenerse sincronizados.
- El resaltado de código (Shiki, carga diferida) tokeniza con los dos temas a
  la vez; cada token lleva `--hl-dark` y `--hl-light` y el CSS elige.

## Componentes

| Componente | Uso |
| --- | --- |
| `Icon` | Iconos de trazo en una rejilla de 20×20. Añade rutas aquí, no SVG en línea. |
| `AppPage` | Cabecera y ancho de Memorias, Uso, Ajustes y Cuenta. |
| `app/ConversationList` | Historial agrupado por fecha, renombrado en línea, acciones superpuestas. |
| `app/AccountMenu` | Menú de cuenta; se cierra con Escape, clic fuera o navegación. |
| `Composer` | Caja de mensaje con búsqueda web opcional. |
| `Markdown` / `MarkdownBlocks` / `CodeBlock` | Render del árbol de `@cdor/markdown` (ver abajo) con código resaltado. |
| `MediaEmbed` | Audio, vídeo e imagen enlazados por el modelo (ver abajo). |
| `ConfirmDialog` | Sustituto accesible de `confirm()`. |
| `ToastViewport` + `toasts` | Notificaciones con `role="status"`. |
| `Skeleton` | Estados de carga. |
| `PublicShell` / `AuthCard` / `LegalLayout` | Superficie pública y autenticación. |

## Markdown y medios

El parser vive en `packages/markdown` y lo comparten la web y el móvil; cada
app tiene sus componentes de render. Se vuelve a parsear en cada fragmento del
streaming, así que la respuesta se ve formateada mientras se escribe.

- **Bloques:** títulos h1–h6 (y subrayados con `===`), párrafos, código con
  ``` o ~~~ (también sin cerrar durante el streaming), citas anidadas con
  Markdown dentro, listas anidadas, numeradas desde cualquier número, tareas
  `[ ]`/`[x]`, tablas GFM con alineación (máx. 12 × 200) y separadores
  (`---`, `***`, `___`, `- - -`, `——`).
- **En línea:** negrita, cursiva, ambas, tachado, código, enlaces, URLs
  sueltas, autoenlaces `<https://…>`, imágenes y escapes con `\`.
- **Medios:** un enlace, URL o imagen **solo en su párrafo** que apunte a
  audio (mp3, wav, ogg, m4a, aac, flac, opus), vídeo (mp4, webm, mov, m4v, ogv)
  o imagen pasa a `MediaEmbed`. Dentro de una frase sigue siendo un enlace.
- **Seguridad:** nunca HTML; solo http(s). Los medios externos **no se cargan
  solos**: la tarjeta muestra el dominio y se carga al pulsar, porque una
  carga automática revelaría la IP del usuario y permitiría filtrar datos de
  la conversación en la URL mediante inyección de prompt. Los del propio
  dominio cargan directamente; los `http://` solo se ofrecen como enlace. La
  CSP permite `img-src` y `media-src` por `https:` para que el clic funcione.
- **Límites:** profundidad máxima 6 y ventanas de búsqueda acotadas, para que
  una respuesta hostil no bloquee el navegador (cubierto por pruebas).

## Patrones

- **Layout de la app:** barra lateral fija en escritorio (plegable a un raíl,
  preferencia en `localStorage["mac.sidebar"]`); en móvil, barra superior y
  cajón con cierre por Escape, clic en el fondo o navegación.
- **Chat:** la columna de mensajes y el compositor comparten `--width-chat`.
  La columna es un grid `minmax(0, 1fr)` para que el código y las tablas no
  desborden en móvil. El streaming solo hace autoscroll si el usuario está al
  final; si no, aparece un botón para volver.
- **Transiciones de página:** View Transitions en el layout raíz; la barra
  lateral tiene `view-transition-name: app-sidebar` y no se anima.
- **Foco:** `:focus-visible` con contorno de 3px en el acento. Nunca
  `outline: none` sin alternativa. Los elementos que aparecen tras la carga
  se enfocan con una acción, no con `autofocus`.
- **Objetivos táctiles:** 44px en controles principales; en `hover: none` las
  acciones de la fila activa son visibles y más grandes.

## Verificación visual

Con `pnpm dev` y un usuario local verificado, conviene revisar a 1440px y
390px, en ambos temas: chat con código y tabla, chat vacío, barra plegada,
cajón móvil, menú de cuenta, búsqueda, Memorias, Uso, Ajustes, Cuenta, 404 y
la superficie pública.
