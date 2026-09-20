# Adjuntos y extracción de texto — diseño

Fecha: 3 de agosto de 2026
Estado: aprobado, pendiente de plan de implementación
Sub-proyecto: **A** de 4

## Contexto

CDOR no admite adjuntos. `messages.content` es canónico, `message_parts` no
existe y la frontera HTTP solo acepta JSON de hasta 1 MiB. Este documento
diseña la base: subir archivos, extraer su texto e inyectarlo en el prompt.

La petición original abarcaba también visión de imágenes, lectura de vídeo y
generación de archivos. Es demasiado para un solo spec, así que se descompuso
en cuatro sub-proyectos por dependencia:

| # | Sub-proyecto | Depende de | Estado |
| --- | --- | --- | --- |
| **A** | Adjuntos: subida, almacenamiento y extracción de texto | — | este documento |
| B | Visión: imágenes al VLM y frames de vídeo | A | pendiente |
| C | Generación de archivos: PDF, XLSX, DOCX, CSV, SVG/PNG | A | pendiente |
| D | Difusión: imágenes generadas por modelo | A, B | pendiente |

### Sobre «ilimitado y sin coste»

El requisito original era que todo fuese ilimitado y gratuito. La parte de este
sub-proyecto que sí lo es: la lectura de texto, código, PDF y ofimática corre en
CPU propia con librerías JavaScript puras, sin API externa ni coste por uso, y
sin límite de extensiones gracias a la detección por familias.

Lo que no puede serlo, y por qué:

- El disco de Hostinger es finito. Sin cuota por usuario, un solo usuario agota
  el almacenamiento de todos. Se fija cuota.
- La extracción corre en el mismo proceso Node que sirve el streaming, porque
  Hostinger Business no permite workers (`CDOR_PLAN_DEFINITIVO.md` §2.1). Un
  archivo sin límite de tamaño bloquea el event loop y degrada el chat de todos
  los usuarios. Se fija tope por archivo.
- El resumen automático de documentos que no caben en contexto consume
  peticiones al proveedor, y los tiers gratuitos de NVIDIA NIM y OpenRouter
  tienen rate limits duros. Se fija tope de llamadas por adjunto.

## Decisiones

| Eje | Decisión |
| --- | --- |
| Almacenamiento | Binario en disco de Hostinger; metadatos y texto extraído en MySQL |
| Plataformas | Web y móvil en el mismo sub-proyecto |
| Detección de tipo | Magic bytes y familias, nunca la extensión del cliente |
| Momento de extracción | Síncrona en la petición de subida, con `status` en el contrato para diferirla después |
| Texto que no cabe en contexto | Íntegro → resumen map-reduce → truncado con marca |
| Compresión | gzip del binario en disco y del texto extraído en MySQL |

### Límites

| Límite | Valor |
| --- | ---: |
| Tamaño por archivo | 25 MiB |
| Archivos por mensaje | 10 |
| Cuota por usuario | 2 GiB |
| Texto extraído por archivo | 1 MiB |
| Llamadas de resumen por adjunto | 8 |
| Retención | mientras exista la conversación |

Los tres primeros se eligieron para cubrir el 99 % de PDFs, hojas de cálculo y
fotos de móvil reales sin arriesgar el proceso Node. Subir la cuota después es
una migración trivial; bajarla obliga a borrar datos de usuarios.

## Arquitectura

Módulo nuevo `apps/platform/src/lib/server/attachments/`, consumido a través de
las tres capas existentes: la ruta valida HTTP y resuelve `Principal`, el
servicio aplica contratos, ownership y cuota, y el repositorio ejecuta SQL. El
binario nunca entra en MySQL y `storage.ts` es el único módulo que conoce el
sistema de ficheros.

```text
POST /api/v1/attachments (multipart)
  → payload.ts        lee a fichero temporal contando bytes reales (tope 25 MiB)
  → sniff.ts          familia por magic bytes
  → extract/<familia> texto + banderas
  → storage.ts        gzip → <ATTACHMENTS_ROOT>/<userId>/<sha256>.gz
  → repositorio       fila attachments + sync_changes en la misma transacción
  ← { id, filename, mediaType, family, bytes, status, extraction }

POST /api/v1/chat/stream { attachmentIds: [...] }
  → services/attachments  carga texto, verifica ownership
  → attachment-context.ts encaja el texto en el presupuesto de tokens
  → prompt-builder.ts     inyecta el bloque junto al mensaje actual
```

### Módulos

`sniff.ts` — Detecta la familia leyendo la cabecera del fichero. Sin
dependencias externas. La extensión y el `Content-Type` del cliente solo se usan
para avisar de una discrepancia, nunca para decidir (§2.4 prohíbe confiar en
datos del cliente). Devuelve `AttachmentFamily`.

`extract/` — Un módulo por familia detrás de una interfaz común:

```ts
type Extractor = (input: ExtractInput) => Promise<ExtractResult>;
```

| Módulo | Cubre |
| --- | --- |
| `text.ts` | Cualquier fichero que valide como UTF-8 estricto. Familia abierta: `.txt`, `.md`, `.csv`, `.json`, `.xml`, `.yaml`, `.sql`, `.log`, `.srt` y cualquier extensión de código, sin enumerarlas |
| `pdf.ts` | PDF con capa de texto, página a página |
| `ooxml.ts` | `.docx`, `.xlsx`, `.pptx` |
| `odf.ts` | `.odt`, `.ods`, `.odp` |
| `archive.ts` | ZIP: listado de entradas y extracción de los miembros de texto |
| `media.ts` | Imagen, vídeo y audio: solo metadatos de cabecera (dimensiones, duración si el contenedor la expone). Sin `ffmpeg` |
| `binary.ts` | Desconocido: nombre, tamaño y `sha256`, sin contenido |

Añadir un formato es añadir un módulo; ninguno conoce a los demás.

Un binario desconocido **se acepta** y llega al modelo como metadatos, así que
`UNSUPPORTED_MEDIA_TYPE` no se dispara por «no sé leerlo». Se reserva para las
familias vetadas por seguridad, que no se almacenan nunca: ejecutables e
instaladores (`PE`, `ELF`, `Mach-O`, `.apk`, `.msi`, `.dmg`). `sniff.ts`
mantiene esa lista de firmas vetadas y la comprueba antes que ninguna otra.

`storage.ts` — Escritura atómica por fichero temporal más `rename`. Ruta
`<ATTACHMENTS_ROOT>/<userId>/<sha256>.gz`, donde `userId` es un ULID validado y
`sha256` hexadecimal, de modo que no existe recorrido de rutas. El nombre por
hash hace que dos subidas del mismo archivo compartan un solo blob; el borrado
físico solo ocurre cuando no queda ninguna fila apuntando a él.

La cuota de 2 GiB cuenta bytes **lógicos**: la suma de `byte_size` de las filas
vivas del usuario, no el espacio físico ocupado tras deduplicar. Subir dos veces
el mismo archivo consume cuota dos veces aunque en disco haya un solo blob. Es
lo que el usuario percibe y evita que la cuota dependa de un detalle interno.

`ATTACHMENTS_ROOT` debe apuntar **fuera** de `output_directory`: el despliegue
de Hostinger desde GitHub reemplaza ese directorio y borraría los adjuntos.

`attachment-context.ts` — Encaja el texto en el presupuesto de tokens:

```ts
interface AttachmentContextStrategy {
  fit(text: string, budgetTokens: number): Promise<FittedContext>;
}
```

`IntegralStrategy` si cabe entero. `SummaryStrategy` si no: trocea, resume cada
trozo y concatena, con tope de 8 llamadas al proveedor. `TruncateStrategy` si
tras resumir sigue sin caber: corta y marca el recorte de forma explícita en el
prompt y en la interfaz.

## Modelo de datos

Tabla `attachments`:

| Columna | Tipo | Notas |
| --- | --- | --- |
| `id` | `CHAR(26)` | ULID, clave primaria |
| `user_id` | `CHAR(26)` | propietario |
| `conversation_id` | `CHAR(26)` | conversación destino |
| `message_id` | `CHAR(26) NULL` | se rellena al crear el mensaje |
| `filename` | `VARCHAR(255)` | nombre original saneado |
| `media_type` | `VARCHAR(127)` | detectado, no el declarado |
| `family` | `VARCHAR(16)` | `text`, `pdf`, `ooxml`, `odf`, `archive`, `image`, `video`, `audio`, `binary` |
| `byte_size` | `BIGINT UNSIGNED` | viaja como cadena decimal |
| `sha256` | `CHAR(64)` | identidad del blob |
| `storage_path` | `VARCHAR(255)` | relativa a `ATTACHMENTS_ROOT` |
| `status` | `VARCHAR(16)` | `ready`, `failed`; `pending` reservado |
| `extracted_text` | `MEDIUMBLOB` | gzip, tope 1 MiB descomprimido |
| `extracted_characters` | `INT UNSIGNED` | |
| `extraction_flags` | `JSON` | `truncated`, `summarized`, `pages`, `sheets`, `entries` |
| `created_at` | `DATETIME(3)` | |
| `deleted_at` | `DATETIME(3) NULL` | borrado sincronizable |
| `sync_version` | `BIGINT UNSIGNED` | |

Índices `(user_id, conversation_id, created_at)` y `(user_id, message_id)`,
siguiendo la regla de que los índices de ownership empiezan por `user_id`.

`message_id` es nullable porque el archivo se sube antes de que el mensaje
exista. Los adjuntos que nunca se envían quedan huérfanos y los barre la misma
tarea oportunista que ya limpia `idempotency_keys` y el changelog
(`pnpm maintenance:sync`), no un worker.

### Desviación del plan rector

`CDOR_PLAN_DEFINITIVO.md` §20.4 dice «no almacenar blobs grandes en MySQL en
v1». `extracted_text` es un blob. Se acepta como excepción razonada, no como
descuido: está acotado a 1 MiB comprimido, es texto consultable y no el binario,
y el archivo real vive en disco. Si el volumen resultara problemático, moverlo a
disco junto al blob es un cambio local a `storage.ts` y al repositorio.

§2.5 excluye la generación de imágenes de la versión 1. Este sub-proyecto no la
incluye; la restricción habrá que revisarla antes del sub-proyecto D.

`docs/data-model.md` afirma que `message_parts` no existe «mientras no existan
herramientas, adjuntos u otros tipos de parte». Esa frase queda desactualizada y
se actualizará: los adjuntos viven en su propia tabla, no como partes de
mensaje, y `messages.content` sigue siendo canónico.

## Contratos

Fichero nuevo `packages/contracts/src/attachment.ts`, exportado desde
`index.ts`. Zod sigue siendo la fuente de verdad y los tipos se infieren.

- `AttachmentFamilySchema`, `AttachmentStatusSchema`, `AttachmentSchema`.
- `AttachmentUploadResponseSchema`.
- `ChatStreamRequestSchema` y `ChatRegenerateRequestSchema` ganan
  `attachmentIds: UlidSchema[]`, máximo 10.
- `SyncEntityTypeSchema` gana `"attachment"`.
- `CONTRACT_LIMITS` gana `ATTACHMENT_MAX_BYTES`,
  `ATTACHMENT_MAX_PER_MESSAGE`, `ATTACHMENT_USER_QUOTA_BYTES`,
  `ATTACHMENT_EXTRACTED_TEXT_MAX_BYTES` y `ATTACHMENT_SUMMARY_MAX_CALLS`.
- `ErrorCodeSchema` gana `UNSUPPORTED_MEDIA_TYPE`, `QUOTA_EXCEEDED` y
  `ATTACHMENT_NOT_FOUND`.

`byte_size` viaja como cadena decimal, como el resto de `BIGINT UNSIGNED`.

## Rutas

| Ruta | Comportamiento |
| --- | --- |
| `POST /api/v1/attachments` | Multipart. Acepta `Idempotency-Key`. Devuelve el adjunto con su resultado de extracción |
| `GET /api/v1/attachments/:id` | Descarga con ownership |
| `DELETE /api/v1/attachments/:id` | Borrado lógico y desvinculación |

`server/http/payload.ts` solo admite hoy media types JSON y rechaza cualquier
`Content-Encoding` comprimido. Se añade un lector multipart aparte que mantiene
esas garantías: cuenta los bytes leídos aunque `Content-Length` falte o mienta,
corta en 25 MiB con `PAYLOAD_TOO_LARGE`, y escribe a fichero temporal en vez de
acumular el cuerpo en memoria. El lector JSON existente no cambia.

## Interfaz web

`Composer.svelte` admite arrastrar y soltar, selector de archivos múltiple y
pegado desde el portapapeles. Cada adjunto se muestra como chip con nombre,
tamaño y estado. Un adjunto resumido o truncado lo indica de forma visible, sin
esconder que el modelo no vio el documento entero. Los errores de cuota y de
tipo no soportado se muestran en el chip, no como error global del chat.

## Móvil

Command Tauri `attachment_upload`: selector nativo, lectura del fichero en Rust
y subida con el bearer cargado desde Keystore/Keychain. El WebView no ve el
token ni realiza la petición, igual que el resto de la frontera móvil.

El outbox guarda la **ruta local** del archivo, no sus bytes: una subida sin red
sobrevive al reinicio sin inflar SQLite ni duplicar el contenido. Si el fichero
local desapareció al reintentar, la operación pasa a `failed` y no vuelve a
salir como pendiente.

`chat_start` acepta `attachment_ids`. `docs/tauri-bridge.md` se actualiza con el
command nuevo.

## Seguridad

- La extensión y el `Content-Type` del cliente no deciden nada (§2.4).
- XXE desactivado al parsear el XML de OOXML y ODF.
- ZIP a un solo nivel, ratio de descompresión máximo 100:1 y 200 entradas, para
  descartar zip-bombs.
- El PDF solo se recorre para extraer texto; no se ejecuta JavaScript embebido.
- La descarga responde siempre con `Content-Disposition: attachment` y
  `X-Content-Type-Options: nosniff`, para que un SVG o HTML subido no se ejecute
  en el dominio.
- El nombre de archivo se renderiza como texto, nunca como HTML.
- El texto extraído entra al prompt marcado como contenido no confiable, igual
  que ya se hace con los resultados de búsqueda web.
- Los logs no registran nombre de archivo ni contenido extraído.
- `ATTACHMENTS_ROOT` se añade a `SERVER_SECRET_ENV_NAMES` en
  `server/config/schema.ts`, a `SENSITIVE_SERVER_NAMES` en
  `scripts/scan-client-secrets.mjs` y a `.env.example`.

## Errores

| Código | Cuándo |
| --- | --- |
| `PAYLOAD_TOO_LARGE` | El archivo supera 25 MiB |
| `QUOTA_EXCEEDED` | La cuota de 2 GiB del usuario está agotada |
| `UNSUPPORTED_MEDIA_TYPE` | La familia detectada no tiene extractor y no es adjuntable |
| `ATTACHMENT_NOT_FOUND` | Id inexistente o de otro usuario |
| `VALIDATION_ERROR` | Multipart mal formado, más de 10 adjuntos, contrato inválido |

Ningún mensaje de error revela rutas de disco ni detalles del extractor.

## Pruebas

- Unidad de `sniff.ts` con fixtures reales de cada familia, incluidos ficheros
  con extensión mentirosa.
- Unidad por extractor: documento normal, documento vacío, UTF-8 inválido, PDF
  sin capa de texto, XLSX con varias hojas.
- Seguridad: zip-bomb, XXE en `.docx`, nombre con recorrido de rutas, SVG con
  script en la descarga.
- Límites: archivo de 25 MiB + 1 byte, undécimo adjunto, cuota agotada.
- Integración de ruta con base de datos: ownership ajeno, idempotencia,
  vinculación a mensaje y `sync_changes` en la misma transacción.
- `prompt-builder`: adjunto que cabe, que necesita resumen y que se trunca;
  verificación del orden de recorte historial → memorias → adjunto.
- `pnpm scan:client-secrets` con la variable nueva.

`.github/workflows/backend.yml` amplía sus `paths` con el módulo y sus tests, o
se crea `attachments.yml` con la misma forma que `ai.yml`.

## Documentación

- `docs/attachments.md` nuevo: familias soportadas, límites, seguridad.
- `docs/api.md`: rutas y tabla de límites.
- `docs/data-model.md`: tabla nueva y corrección de la nota sobre adjuntos.
- `docs/tauri-bridge.md`: command `attachment_upload`.
- `CLAUDE.md`: comandos y módulo nuevos si procede.

## Fuera de alcance

Visión de imágenes y frames de vídeo (sub-proyecto B), generación de archivos
(C), imágenes por difusión (D), OCR de PDFs escaneados y transcripción de audio.
El OCR depende de un modelo de visión, así que corresponde a B.
