# Proveedores de IA

## Autoridad y frontera

Toda inferencia sale desde módulos `server` de `apps/platform`. La web y el
móvil nunca reciben claves de proveedor ni llaman directamente a NVIDIA u
OpenRouter.

`AiProvider` define `listModels` y `streamChat`. Las rutas HTTP consumirán esa
interfaz en M7 y traducirán sus fragmentos al protocolo SSE propio de CDOR.

## NVIDIA NIM

NVIDIA es el proveedor inicial de producción. El adaptador usa la API compatible
con OpenAI:

- `GET /v1/models` para comprobar disponibilidad;
- `POST /v1/chat/completions` con `stream: true`;
- bearer privado, timeout y `AbortSignal`;
- validación de catálogo y fragmentos antes de utilizarlos;
- errores estables de CDOR sin cuerpo interno del proveedor.

La allowlist se mantiene en `model-router.ts`; nunca se publica todo el catálogo
del proveedor. El benchmark fijo puntúa 50 % calidad, 30 % latencia y 20 %
coste. Como el endpoint alojado es un servicio gratuito de prototipado y no
publica precio por token verificable, `costUnits` mide consumo ponderado de
tokens con tarifas relativas iguales. No representa euros ni dólares.

Resultado del 27 de julio de 2026:

| Modelo | Calidad | Latencia media | Cost units | Total |
| --- | ---: | ---: | ---: | ---: |
| `meta/llama-3.1-8b-instruct` | 1,0000 | 545 ms | 0,000220 | 0,9596 |
| `nvidia/nemotron-3-super-120b-a12b` | 1,0000 | 1125 ms | 0,000299 | 0,7875 |
| `meta/llama-3.3-70b-instruct` | 1,0000 | 14505 ms | 0,000200 | 0,7000 |

Ganador fijado: `meta/llama-3.1-8b-instruct`. Un smoke posterior respondió en
1210 ms con uso informado por NVIDIA.

Referencias oficiales:

- <https://docs.nvidia.com/nim/large-language-models/latest/reference/api-reference.html>
- <https://docs.api.nvidia.com/nim/reference/llm-apis>

## OpenRouter

OpenRouter se añadió por decisión explícita del usuario como proveedor
alternativo experimental. No reemplaza NVIDIA en producción.

El adaptador bloquea antes de la red cualquier ID que no sea
`openrouter/free` o termine en `:free`. El smoke consulta el catálogo autenticado
y prueba como máximo tres modelos concretos. El 27 de julio de 2026 respondieron
2 de 3:

- `cohere/north-mini-code:free`;
- `google/gemma-4-26b-a4b-it:free`.

`google/gemma-4-31b-it:free` no respondió en esa ejecución. La disponibilidad
gratuita es variable y tiene límites bajos, por lo que por defecto este
proveedor no actúa como respaldo automático. Puede activarse de forma opcional
(ver [Respaldo entre proveedores](#respaldo-entre-proveedores)).

## Cuotas de uso

Cada usuario tiene un límite diario de mensajes y de tokens, y existe un tope
global de tokens. Los días son **UTC** (el contador se reinicia a las 00:00 UTC).

| Variable | Por defecto | Qué limita |
| --- | --- | --- |
| `QUOTA_USER_DAILY_MESSAGES` | 100 | Mensajes (y regeneraciones) por usuario y día. |
| `QUOTA_USER_DAILY_TOKENS` | 150000 | Tokens de entrada y salida por usuario y día. |
| `QUOTA_GLOBAL_DAILY_TOKENS` | 0 (apagado) | Tokens de todos los usuarios juntos. |

`0` desactiva el límite; una cadena vacía usa el valor por defecto. **Activa el
tope global antes de usar un proveedor de pago**: es lo que impide que un pico
de uso se convierta en una factura sin techo. Con proveedores gratuitos suele
bastar con los límites por usuario.

Cómo se aplican (`services/quota.ts`, `db/repositories/quota.ts`):

- Los contadores viven en `rate_limit_buckets`, con el usuario guardado como
  hash. No hay migración: la tabla ya existía.
- **Mensajes:** se cuentan antes de generar con un único `UPDATE` condicional,
  así que peticiones simultáneas no pueden rebasar el límite.
- **Tokens:** se suman al completar cada respuesta (consumo real; una respuesta
  cortada se cuenta por estimación) y se comprueban antes de la siguiente. Por
  eso pueden rebasarse como mucho por las generaciones ya en curso (máximo 2 por
  usuario).
- **Devolución:** si la preparación falla, o el proveedor falla sin dar nada, el
  mensaje no cuenta. Quien no recibe respuesta no gasta cuota.
- El orden de comprobación es global → tokens del usuario → mensajes, para no
  contar un mensaje que otro límite iba a rechazar.

## Respaldo entre proveedores

`FallbackProvider` (`ai/fallback.ts`) encadena proveedores y pasa al siguiente
si uno falla **antes de entregar texto**. Tras el primer fragmento no cambia: una
respuesta empezada con un modelo no puede continuarla otro sin duplicar o
contradecir lo ya mostrado, así que el error llega al usuario.

- Un proveedor que falla (429, 5xx, timeout) queda apartado: el `Retry-After`
  que indique, o 20 s. Las peticiones siguientes van directas al respaldo en vez
  de esperar otro fallo. Si todos están apartados se prueban igualmente.
- Si un proveedor no da texto en 25 s se pasa al siguiente.
- La cancelación del usuario nunca activa el respaldo.
- Si fallan todos se muestra el error del principal.
- La generación, el mensaje y `usage_events` anotan el proveedor que **realmente
  sirvió** (fragmento `route`), no el previsto.
- Cada cambio se registra como `CDOR_PROVIDER_FAILOVER` con solo nombres de
  proveedor y código de error.

**Activación:** `AI_FALLBACK_OPENROUTER=true` y `OPENROUTER_API_KEY`. El
respaldo usa el router gratuito `openrouter/free`. Está desactivado por defecto
porque los modelos gratuitos pueden registrar los prompts; actívalo solo si
aceptas esa condición. La ventana de contexto del prompt se calcula con el modelo
principal, así que un respaldo con menos contexto puede rechazar conversaciones
muy largas.

Para añadir otro proveedor, implementa `AiProvider` y añade una entrada a la
cadena en `services/chat-runtime.ts` (`withFallback`) con el modelo que debe
pedírsele.

## Búsqueda web del modelo

La búsqueda no se ejecuta en el navegador. Con `OPENROUTER_API_KEY`, el
compositor muestra un único control «Buscar en web», activado por defecto en
web y Android. Apagarlo muestra un aviso de que el conocimiento puede estar
desactualizado desde diciembre de 2023 y usa el modelo
configurado mediante NVIDIA NIM; encenderlo conserva ese mismo modelo y traduce
únicamente su identificador al equivalente de OpenRouter para añadir la
herramienta server-side `openrouter:web_search`.

No existe un segundo `OPENROUTER_SEARCH_MODEL`. El motor `auto` usa búsqueda
nativa cuando el proveedor la ofrece y Exa en los demás casos. El servidor
limita cada resultado a 2.500 caracteres, cinco resultados por búsqueda y ocho
en total. El modelo decide si la pregunta requiere entre cero y varias
búsquedas. El prompt le proporciona la fecha actual, exige buscar los datos
actuales o posteriores a diciembre de 2023, tratar las páginas como contenido
no confiable y citar las fuentes mediante enlaces Markdown.

La búsqueda puede tener coste adicional aunque el modelo tenga una variante
gratuita. La variante heredada `:online` y el plugin `web` no se utilizan.

Referencias oficiales:

- <https://openrouter.ai/docs/guides/routing/model-variants/free>
- <https://openrouter.ai/docs/api/api-reference/models/get-models>
- <https://openrouter.ai/docs/guides/features/server-tools/web-search>

## Comandos

```bash
pnpm test:ai
pnpm benchmark:nvidia
pnpm smoke:nvidia
pnpm smoke:openrouter
pnpm scan:client-secrets
```

Los tres últimos comandos leen el `.env` raíz, no imprimen claves ni contenido
generado y solo deben ejecutarse en un servidor o CI protegido.
