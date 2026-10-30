# Contrato HTTP de MAC

Estado: contrato de wire format fijado en M1. Backend, autenticación, chat y
sincronización están implementados hasta M8; las interfaces visuales se
incorporan en milestones posteriores.

## Convenciones

- La API propia vive bajo `/api/v1`.
- Todos los IDs propios y de Better Auth son ULID Crockford de 26 caracteres en
  mayúsculas.
- Las fechas son ISO 8601 UTC con milisegundos, por ejemplo
  `2026-07-27T19:05:03.000Z`.
- Los valores procedentes de `BIGINT UNSIGNED` (`syncVersion`, `changeId` y
  cursores de sync) se serializan como cadenas decimales. Nunca se convierten a
  `number` en JavaScript.
- Los objetos rechazan propiedades no declaradas.
- Las mutaciones reintentables reciben un ULID como `Idempotency-Key` o como
  `clientOperationId`, según el contrato de la operación.

Una respuesta correcta usa:

```json
{
  "data": {},
  "meta": {
    "requestId": "01J00000000000000000000000"
  }
}
```

Un error usa:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Solicitud no válida",
    "requestId": "01J00000000000000000000000",
    "details": null
  }
}
```

El campo `details` no contendrá trazas, SQL, credenciales ni detalles internos
en producción.

## Validación de fronteras

Los cuerpos JSON normales admiten como máximo 1 MiB. La frontera HTTP exige un
media type JSON, rechaza `Content-Encoding` comprimido y cuenta los bytes leídos
aunque `Content-Length` falte o sea incorrecto. Un exceso devuelve
`PAYLOAD_TOO_LARGE`; JSON, encoding o contrato inválidos devuelven
`VALIDATION_ERROR`.

Los detalles de validación solo contienen `path` y `code`, con un máximo de 20
issues. Nunca repiten el valor recibido. Las respuestas también se validarán
contra su esquema antes de cruzar la frontera HTTP.

Los límites expresados en KiB cuentan bytes UTF-8; los expresados como
caracteres cuentan caracteres según el esquema. Las queries numéricas solo
aceptan enteros decimales explícitos y no realizan coerciones de booleanos,
espacios o notación exponencial.

## Límites

| Recurso | Límite |
| --- | ---: |
| Mensaje nuevo de usuario | 32 KiB |
| Contenido persistido de mensaje | 256 KiB |
| Delta SSE | 8 KiB |
| Página de conversaciones | 30 |
| Página de mensajes | 50 |
| Página de memorias | 100 |
| Pull de sincronización | 500 cambios |
| Push de sincronización | 100 operaciones |

## Autenticación

Los contratos cubren alta, acceso, recuperación, sesión, perfil y dispositivos.
Better Auth sirve su protocolo bajo `/api/auth/*`; el registro público se
controla mediante `AUTH_SIGN_UP_ENABLED=true` y requiere verificación de correo.
Una sesión móvil no
incluye su bearer firmado en el cuerpo de `AuthSessionData`: se entrega en la
cabecera de autenticación y se persistirá únicamente mediante
Keystore/Keychain.

Las rutas MAC de dispositivos son:

- `GET /api/v1/auth/devices`
- `POST /api/v1/auth/devices`
- `DELETE /api/v1/auth/devices/:deviceId`

Revocar un dispositivo elimina todas las sesiones Better Auth asociadas al
mismo usuario y dispositivo.

## Eliminación de cuenta

`POST /api/v1/account/delete` con `{ "password": "..." }` borra la cuenta. Se
usa POST y no DELETE porque la petición necesita cuerpo y algunos proxies lo
descartan en DELETE.

La sesión activa no basta: la contraseña se verifica contra Better Auth antes
de tocar la base. Confirmada, se elimina la fila de `user` y el
`ON DELETE CASCADE` declarado en todas las tablas de dominio y de Better Auth
suprime conversaciones, mensajes, memorias, preferencias, dispositivos,
sesiones, cuentas, generaciones, eventos de uso, cambios de sincronización y
claves de idempotencia. La operación es irreversible y no deja copia.

La respuesta nunca devuelve la contraseña ni datos del usuario eliminado:

```json
{ "data": { "deleted": true, "deletedAt": "2026-07-31T10:00:00.000Z" } }
```

## Conversaciones, mensajes y memorias

Las actualizaciones mutables incluyen `baseVersion` para detectar conflictos.
Los mensajes enviados desde sync son append-only, tienen
`clientOperationId` y solo pueden llevar rol `user`. El contenido de mensaje es
canónico en `messages.content`; M1 no introduce `message_parts`.

## Streaming de chat

`POST /api/v1/chat/stream` se consumirá con `fetch` y lectura incremental del
cuerpo HTTP; no se usa `EventSource`, porque la operación es POST. Cada bloque
SSE tiene un `event` y un `data` JSON validados por el mismo esquema:

```text
event: delta
data: {"messageId":"01J00000000000000000000000","sequence":0,"text":"Hola"}

```

Los únicos eventos públicos son:

- `start`: identifica generación, mensajes y request.
- `delta`: texto incremental con secuencia monotónica.
- `usage`: tokens de entrada y salida.
- `done`: mensaje final persistido y motivo de finalización.
- `error`: error estable de MAC, nunca el evento interno de NVIDIA.

El cuerpo acepta `webSearch: true` para usar el modelo OpenRouter configurado
para búsqueda. Si ese runtime no está configurado, la generación se rechaza
con `MODEL_UNAVAILABLE`; el cliente nunca envía claves del proveedor.

La idempotencia protege la creación de mensajes y generaciones. No almacena ni
reproduce una respuesta SSE completa.

## Regeneración

`POST /api/v1/chat/regenerate` emite exactamente los mismos cinco eventos que
`/chat/stream`; el cliente reutiliza el lector SSE sin cambios.

```json
{
  "conversationId": "01J...",
  "sourceMessageId": "01J...",
  "clientOperationId": "01J...",
  "modelMode": "balanced",
  "webSearch": true
}
```

`sourceMessageId` es el mensaje `assistant` que se quiere volver a generar.
Reglas:

- Los mensajes son append-only: la respuesta anterior se conserva intacta y se
  añade una nueva. No se sobrescribe ni se borra nada.
- El ancla del prompt es el último mensaje `user` completado en o antes del
  mensaje regenerado. El contexto se corta ahí: ni la respuesta sustituida ni
  lo posterior entran en el prompt.
- Regenerar una respuesta que todavía está `streaming` o `pending` devuelve
  `CONFLICT`; un id inexistente, ajeno o que no sea `assistant` devuelve
  `MESSAGE_NOT_FOUND`.
- `clientOperationId` da idempotencia con el mismo contrato que el stream:
  repetirlo devuelve `IDEMPOTENCY_CONFLICT` con el estado de la generación
  existente. Su hash incluye la ruta, de modo que una clave no puede cruzarse
  entre `/chat/stream` y `/chat/regenerate`.

## Catálogo de modelos

`GET /api/v1/models` requiere sesión y devuelve el catálogo propio de MAC, no
lo que publique el proveedor:

```json
{
  "data": {
    "items": [
      {
        "mode": "balanced",
        "displayName": "Equilibrado",
        "description": "…",
        "provider": "nvidia",
        "modelId": "meta/llama-3.1-8b-instruct",
        "contextTokens": 32768,
        "maximumOutputTokens": 2048,
        "isDefault": true,
        "availability": "available"
      }
    ],
    "defaultMode": "balanced",
    "verifiedAt": "2026-07-31T10:00:00.000Z"
  }
}
```

El catálogo anuncia exactamente los modos que `/chat/stream` aceptará: ambos
leen la misma definición, de modo que no puede publicarse un modo que el
streaming rechace.

`availability` distingue tres estados en vez de mentir con un booleano:
`available` y `unavailable` cuando el proveedor respondió, y `unknown` cuando
nunca pudo verificarse. La consulta al proveedor se cachea cinco minutos y su
fallo no tumba el endpoint: se conserva la última verificación conocida y
`verifiedAt` indica cuándo se obtuvo (`null` si nunca).

## Sincronización

Las rutas autenticadas son:

- `GET /api/v1/sync/pull?cursor=0&limit=500`
- `POST /api/v1/sync/push`

`pull` ordena por el cursor `changeId`. El changelog conserva metadatos y el
servidor materializa el estado actual desde MySQL al responder. Cada cambio
especifica entidad, operación, versión, fecha y un payload tipado; los borrados
llevan `null`. El cursor de salida avanza por las filas examinadas aunque una
entidad ya no exista.

`push` admite hasta 100 operaciones y devuelve un resultado por `operationId`:
`applied`, `duplicate`, `conflict` o `rejected`. Cada operación escribe entidad,
changelog y resultado idempotente en una única transacción. Reutilizar un
`operationId` con otra carga devuelve `IDEMPOTENCY_CONFLICT`.

Los mensajes son append-only. Conversaciones y preferencias aplican el orden
de recepción del servidor; las memorias exigen que `baseVersion` coincida. Un
borrado válido domina una actualización atrasada y una entidad borrada no se
resucita desde sync.

El servidor MySQL decide el resultado final. Un cursor anterior a la retención
se responde con `SYNC_CURSOR_INVALID`; el cliente descarta la réplica pertinente
y realiza una resincronización completa usando `cursor=0`. SQLite no decide
conflictos ni se convierte en autoridad.

## Uso

`GET /api/v1/usage` devuelve el resumen de los últimos 30 días del usuario
autenticado: generaciones, tokens de entrada, tokens de salida y total. El
cálculo se realiza directamente sobre `usage_events` en MySQL y aplica el
propietario en la consulta. MAC es gratuito: la interfaz no muestra costes. El
campo `knownCostMicrousd` se conserva por compatibilidad del contrato y vale
cero mientras ningún proveedor informe un coste.

La respuesta incluye además `quota`, el estado de las cuotas diarias del
usuario (ver [Cuotas](./ai.md#cuotas-de-uso)):

```json
{
  "quota": {
    "resetsAt": "2026-07-30T00:00:00.000Z",
    "messages": { "used": 12, "limit": 100 },
    "tokens": { "used": 18450, "limit": 150000 }
  }
}
```

`limit` es `null` cuando ese límite está desactivado. `resetsAt` es siempre
una medianoche UTC.

Si la cuota está agotada, `POST /api/v1/chat/stream` y `/chat/regenerate`
responden `429 RATE_LIMITED` **antes** de guardar nada, con un mensaje en
español y `details: { "quota": "messages" | "tokens" | "global" }`.

## Fuente TypeScript

Los esquemas Zod y sus tipos inferidos se exportan desde `@cdor/contracts`.
Platform y mobile deben importar esos tipos; no se mantienen interfaces
paralelas.
