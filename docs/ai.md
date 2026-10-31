# IA de MAC

## Autoridad y frontera

Toda inferencia sale desde módulos `server` de `apps/platform`. La web y el
móvil nunca reciben claves de proveedor ni llaman directamente a ninguno.

`AiProvider` define `listModels` y `streamChat`. Las rutas HTTP consumen esa
interfaz y traducen sus fragmentos al protocolo SSE propio de MAC; nunca se
reenvía el stream crudo de un proveedor.

## El modelo MAC

MAC es gratuito y se presenta como **un único modelo propio**. Detrás hay una
pasarela (`server/ai/gateway/`) que reparte las conversaciones entre los
proveedores de IA gratuitos que configures, con respaldo automático, y a la que
se pueden conectar otros.

```text
cliente ──▶ «mac» ──▶ GatewayProvider ──┬─▶ NVIDIA NIM
 (web/móvil)           (FallbackProvider)├─▶ Groq
                                         ├─▶ Google Gemini
                                         ├─▶ Mistral
                                         ├─▶ OpenRouter (router gratuito, opt-in)
                                         └─▶ tus proveedores (AI_CUSTOM_PROVIDERS)
```

**Identidad pública.** El catálogo (`GET /api/v1/models`), los mensajes y la
sincronización muestran siempre proveedor `mac` y modelo `mac`
(`PUBLIC_MODEL` en `@cdor/contracts`). El proveedor y el modelo reales que
sirvieron cada respuesta solo se anotan en las tablas operativas
(`generation_requests` y `usage_events`), para poder auditar el uso. Que los
clientes no los vean es marca, no ocultación a la autoridad: la política de
privacidad debe nombrar a los proveedores de IA como encargados del
tratamiento (ver [Privacidad](#privacidad-y-datos)).

**Sin pagos.** Todo es gratuito por defecto y en esta versión no hay planes ni
cobros. Solo se incluyen proveedores con nivel gratuito permanente, sin tarjeta.

### Qué se adoptó de proyectos existentes

Se estudió el Router de [LiteLLM](https://docs.litellm.ai/docs/routing),
[llm-gateway](https://github.com/nicogarcia0/llm-gateway),
[Portkey](https://github.com/Portkey-AI/gateway) y Bifrost. Son procesos aparte
(Python, Go, Docker, Redis) y Hostinger solo ejecuta la aplicación Node, así que
no se pueden desplegar tal cual: se adaptaron sus ideas a TypeScript dentro de
la aplicación.

| Idea | De dónde | Aquí |
| --- | --- | --- |
| Un nombre de modelo, varios despliegues detrás | LiteLLM *model group* | `GatewayProvider` + `MAC_MODEL` |
| Cupo de peticiones por despliegue (`rpm`) | LiteLLM `rpm` | `RateWindow`, `<ID>_RPM` |
| Reparto ponderado | LiteLLM `simple-shuffle` + `weight` | `AI_ROUTING=weighted` |
| Orden de preferencia con desbordamiento | LiteLLM `order` | `AI_ROUTING=ordered`, `AI_PROVIDER_ORDER` |
| Enfriamiento por despliegue ante 429 y errores | LiteLLM `cooldown` | `FallbackProvider` (respeta `Retry-After`) |
| Descarte previo por ventana de contexto | LiteLLM `enable_pre_call_checks` | `contextTokens` por despliegue |
| Respaldo antes del primer texto, nunca a mitad | LiteLLM (streams) | `FallbackProvider` |
| Si todos están apartados, se prueban igualmente | LiteLLM fallback a despliegue concreto | `#order` |

**Lo que no se adoptó, a propósito:**

- **Estado compartido (Redis).** Los cupos y enfriamientos viven en memoria del
  proceso. Con varias instancias cada una llevaría su cuenta; el 429 real del
  proveedor sigue siendo la red de seguridad.
- **Rotar varias claves del mismo proveedor** (lo hace `llm-gateway`). Los
  límites gratuitos son por cuenta o proyecto: rotar cuentas para saltárselos
  incumple las condiciones de los proveedores y acaba en bloqueos.

## Proveedores incluidos

Un proveedor se activa **al definir su clave**; sin ella no se llama nunca. Las
cifras de los niveles gratuitos las publican los proveedores y **cambian con
frecuencia**: verifícalas en su documentación antes de depender de ellas.

| Proveedor | Variables | Qué hay que saber del nivel gratuito |
| --- | --- | --- |
| NVIDIA NIM | `NVIDIA_API_KEY`, `NVIDIA_RPM` | Créditos de prueba en build.nvidia.com; el límite (≈40 pet./min) es por cuenta y los términos de prueba pueden excluir el uso en producción. Solo modelos de la lista blanca de MAC. |
| Groq | `GROQ_API_KEY`, `GROQ_DEFAULT_MODEL`, `GROQ_RPM` | Permanente, sin tarjeta; ≈30 pet./min y un tope diario por modelo. |
| Google Gemini | `GEMINI_API_KEY`, `GEMINI_DEFAULT_MODEL`, `GEMINI_RPM` | Gratuito en AI Studio; límites no publicados por modelo. **Google puede usar los prompts del nivel gratuito para mejorar sus productos.** |
| Mistral | `MISTRAL_API_KEY`, `MISTRAL_DEFAULT_MODEL`, `MISTRAL_RPM` | Plan «Experiment», con verificación de teléfono y límites bajos. **Los datos del plan gratuito pueden usarse para entrenar.** |
| OpenRouter | `OPENROUTER_API_KEY` + `AI_FALLBACK_OPENROUTER=true` | Router gratuito `openrouter/free` (≈20 pet./min, tope diario bajo). Opt-in: **los modelos gratuitos pueden registrar los prompts**. |

**Descartados para esta versión** (no encajan con «gratis sin tarjeta»):
Cerebras (hoy exige método de pago verificado y sus créditos caducan), GitHub
Models (solo prototipado, ventanas de entrada muy pequeñas) y Hugging Face
(créditos mensuales pequeños y cobro al superarlos). Siguen siendo conectables
como proveedor propio si cambias de criterio.

## Configuración rápida

Basta una clave para que MAC funcione:

```bash
GROQ_API_KEY=gsk_...
```

Varios proveedores reparten la carga y se respaldan entre sí:

```bash
NVIDIA_API_KEY=nvapi-...
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=...
AI_PROVIDER_ORDER=groq,nvidia      # los que se prueban primero
AI_ROUTING=ordered                  # o "weighted" para repartir por cupo
```

`pnpm smoke:providers` comprueba cada proveedor configurado (modelo elegido,
respuesta real y latencia) sin imprimir claves. Úsalo tras cambiar claves.

## Elección del modelo

Los modelos **no se fijan en el código**: los proveedores retiran y renombran
modelos gratuitos con frecuencia (Groq retiró Llama 3.3 70B y Google apagó
Gemini 2.0 Flash en 2026). Cada despliegue consulta el catálogo de su proveedor
y elige según una lista de preferencias (`ai/gateway/registry.ts`); dentro de
la primera coincidencia se toma la versión más reciente. El resultado se cachea
10 min, una única consulta se comparte entre peticiones simultáneas y se vuelve
a descubrir si el proveedor deja de reconocer el modelo.

Para fijar uno, define `<ID>_DEFAULT_MODEL` (`GROQ_DEFAULT_MODEL=...`). NVIDIA
solo admite los modelos de su lista blanca en `model-router.ts`.

## Enrutado y respaldo

`FallbackProvider` (`ai/fallback.ts`) prueba los despliegues y pasa al
siguiente si uno falla **antes de entregar texto**. Tras el primer fragmento no
cambia: una respuesta empezada con un modelo no puede continuarla otro sin
duplicar o contradecir lo ya mostrado, así que el error llega al usuario.

- **Orden.** `AI_ROUTING=ordered` (por defecto) usa el primero disponible y los
  demás de respaldo. `weighted` reparte al azar según el cupo (`<ID>_RPM`) o el
  `weight` de cada proveedor propio. `AI_PROVIDER_ORDER` elige el orden;
  los no listados van detrás.
- **Cupo por minuto.** Un despliegue sin cupo se salta hasta que se libere.
- **Enfriamiento.** Un despliegue que falla (429, 5xx, timeout) se aparta: el
  `Retry-After` que indique o 20 s. Las peticiones siguientes van directas a los
  demás en lugar de esperar otro fallo. `MODEL_UNAVAILABLE` no aparta (suele
  depender de la petición) pero invalida el modelo descubierto.
- **Contexto.** Se descartan antes de llamar los despliegues cuya ventana no
  admite el prompt más la salida reservada.
- **Primer texto.** Si un proveedor no responde en 25 s se pasa al siguiente.
- **Si todos están apartados, sin cupo o sin contexto** se prueban igualmente en
  orden: nunca se rechaza una petición sin intentarla.
- **Cancelación.** La del usuario nunca activa el respaldo.
- **Si fallan todos** se muestra el error del principal. El mensaje no consume
  cuota (ver [Cuotas de uso](#cuotas-de-uso)).
- Cada cambio de proveedor se registra como `CDOR_PROVIDER_FAILOVER` con solo
  nombres de proveedor y código de error, nunca contenido.

## Añadir un proveedor propio

Cualquier API compatible con OpenAI (Ollama, vLLM, LM Studio, Cloudflare
Workers AI, Together, un servidor tuyo…) se conecta **sin tocar código** con
`AI_CUSTOM_PROVIDERS`, una lista JSON de hasta 8 entradas:

```bash
AI_CUSTOM_PROVIDERS='[
  {"id":"ollama","baseUrl":"http://127.0.0.1:11434/v1","model":"llama3.3"},
  {"id":"mi-vllm","baseUrl":"https://llm.midominio.com/v1","apiKey":"...",
   "model":"qwen2.5-72b-instruct","rpm":60,"weight":3,"contextTokens":65536}
]'
```

| Campo | Obligatorio | Descripción |
| --- | --- | --- |
| `id` | sí | `a-z`, `0-9` y `-`, hasta 24; no puede repetirse ni coincidir con un proveedor incluido. |
| `baseUrl` | sí | URL base de la API (termina antes de `/chat/completions`). |
| `model` | sí | Modelo que se pide. |
| `apiKey` | no | Los servidores locales no la necesitan. |
| `rpm` | no | Peticiones por minuto que admite. |
| `weight` | no | Peso en `AI_ROUTING=weighted`. Por defecto, `rpm`. |
| `contextTokens` | no | Ventana de contexto (por defecto 32 768). |

El valor es privado como cualquier clave: consta en `SERVER_SECRET_ENV_NAMES` y
en el escáner de secretos del cliente. Un JSON inválido da un error que nombra la
variable, nunca su contenido.

**Para añadir un proveedor al registro** (lo que hace que se active solo con su
clave) basta una entrada en `GENERIC_PROVIDERS` de `ai/gateway/registry.ts` y
sus tres variables (`<ID>_API_KEY`, `<ID>_DEFAULT_MODEL`, `<ID>_RPM`) en
`SERVER_SECRET_ENV_NAMES`, el esquema de `config/schema.ts` y el escáner. Una
prueba falla si el registro y esas listas dejan de coincidir.

## Cuotas de uso

Cada usuario tiene un límite diario de mensajes y de tokens, y existe un tope
global de tokens. Los días son **UTC** (el contador se reinicia a las 00:00 UTC).

| Variable | Por defecto | Qué limita |
| --- | --- | --- |
| `QUOTA_USER_DAILY_MESSAGES` | 100 | Mensajes (y regeneraciones) por usuario y día. |
| `QUOTA_USER_DAILY_TOKENS` | 150000 | Tokens de entrada y salida por usuario y día. |
| `QUOTA_GLOBAL_DAILY_TOKENS` | 0 (apagado) | Tokens de todos los usuarios juntos. |

`0` desactiva el límite; una cadena vacía usa el valor por defecto. Los límites
por usuario reparten de forma justa los cupos gratuitos de los proveedores. El
tope global es opcional: actívalo si quieres que un pico de uso no agote esos
cupos para todos los demás.

Cómo se aplican (`services/quota.ts`, `db/repositories/quota.ts`):

- Los contadores viven en `rate_limit_buckets`, con el usuario guardado como
  hash. No hay migración: la tabla ya existía.
- **Mensajes:** se cuentan antes de generar con un único `UPDATE` condicional,
  así que peticiones simultáneas no pueden rebasar el límite.
- **Tokens:** se suman al completar cada respuesta (consumo real; una respuesta
  cortada se cuenta por estimación) y se comprueban antes de la siguiente. Por
  eso pueden rebasarse como mucho por las generaciones ya en curso (máximo 2 por
  usuario).
- **Devolución:** si la preparación falla, o todos los proveedores fallan sin dar
  nada, el mensaje no cuenta. Quien no recibe respuesta no gasta cuota.
- El orden de comprobación es global → tokens del usuario → mensajes, para no
  contar un mensaje que otro límite iba a rechazar.

## Privacidad y datos

Los prompts y las respuestas pasan por los proveedores que configures. Varios
niveles gratuitos **pueden registrar o usar los datos para mejorar o entrenar
sus modelos** (Gemini y Mistral lo indican para el nivel gratuito; los modelos
gratuitos de OpenRouter pueden registrar prompts). Por eso:

- Activa solo los proveedores cuyas condiciones aceptes; no hay llamadas a un
  proveedor sin clave.
- La política de privacidad de MAC debe nombrar a los proveedores de IA
  activos como encargados del tratamiento y avisar de ello. Los textos legales
  están pendientes de revisión jurídica (ver `docs/BACKLOG.md`).
- Los logs de producción no registran prompts ni respuestas.

## NVIDIA NIM

NVIDIA fue el proveedor inicial y sigue siendo uno más de la pasarela. El
adaptador usa la API compatible con OpenAI (`GET /v1/models`,
`POST /v1/chat/completions` con `stream: true`, bearer privado, timeout y
`AbortSignal`) y valida catálogo y fragmentos antes de usarlos. Los errores
llegan al usuario como errores estables de MAC, sin cuerpo interno del
proveedor. El mismo cliente (`NvidiaNimProvider`) sirve a todos los proveedores
compatibles con OpenAI: solo cambian URL, clave y nombre.

La lista blanca vive en `model-router.ts`; nunca se publica todo el catálogo del
proveedor. El benchmark fijo (`pnpm benchmark:nvidia`) puntúa 50 % calidad, 30 %
latencia y 20 % coste relativo de tokens (no representa dinero). Resultado del
27 de julio de 2026:

| Modelo | Calidad | Latencia media | Total |
| --- | ---: | ---: | ---: |
| `meta/llama-3.1-8b-instruct` | 1,0000 | 545 ms | 0,9596 |
| `nvidia/nemotron-3-super-120b-a12b` | 1,0000 | 1125 ms | 0,7875 |
| `meta/llama-3.3-70b-instruct` | 1,0000 | 14505 ms | 0,7000 |

Sin `NVIDIA_DEFAULT_MODEL`, la pasarela descubre el mejor candidato de la lista
blanca disponible (prefiere `llama-3.3-70b-instruct`, después Nemotron y
`llama-3.1-8b-instruct`).

Referencias oficiales:

- <https://docs.nvidia.com/nim/large-language-models/latest/reference/api-reference.html>
- <https://docs.api.nvidia.com/nim/reference/llm-apis>

## OpenRouter

OpenRouter participa en el chat solo con `AI_FALLBACK_OPENROUTER=true` y
`OPENROUTER_API_KEY`: su clave también sirve para la búsqueda web y los modelos
gratuitos pueden registrar los prompts. Usa el router gratuito `openrouter/free`.
El adaptador bloquea antes de la red cualquier ID que no sea `openrouter/free` o
no termine en `:free`: un modelo de pago nunca se usa como chat.

La disponibilidad gratuita es variable y tiene límites bajos (el 27 de julio de
2026 respondieron 2 de 3 modelos `:free` probados), por lo que funciona mejor
como último respaldo que como proveedor principal: pon `AI_PROVIDER_ORDER` con
OpenRouter al final, que es su posición por defecto.

## Búsqueda web del modelo

**Desactivada por defecto** (`AI_WEB_SEARCH=false`): la herramienta
`openrouter:web_search` es de pago, y MAC es gratuito. Para activarla hacen
falta `AI_WEB_SEARCH=true` y `OPENROUTER_API_KEY` con créditos; entonces el
compositor muestra el control «Buscar en web».

La búsqueda no se ejecuta en el navegador. Usa un modelo de OpenRouter fijo
(`meta-llama/llama-3.3-70b-instruct`, o el equivalente del modelo de NVIDIA
configurado) y añade la herramienta server-side. El motor `auto` usa búsqueda
nativa cuando el proveedor la ofrece y Exa en los demás casos. El servidor limita
cada resultado a 2.500 caracteres, cinco resultados por búsqueda y ocho en
total. El prompt le proporciona la fecha actual, exige buscar los datos actuales
o posteriores a diciembre de 2023, tratar las páginas como contenido no
confiable y citar las fuentes mediante enlaces Markdown. La variante heredada
`:online` y el plugin `web` no se utilizan.

Referencias oficiales:

- <https://openrouter.ai/docs/guides/routing/model-variants/free>
- <https://openrouter.ai/docs/api/api-reference/models/get-models>
- <https://openrouter.ai/docs/guides/features/server-tools/web-search>

## Comandos

```bash
pnpm test:ai
pnpm smoke:providers     # todos los proveedores configurados
pnpm benchmark:nvidia
pnpm smoke:nvidia
pnpm smoke:openrouter
pnpm scan:client-secrets
```

Los comandos `smoke:*` y `benchmark:*` leen el `.env` raíz, no imprimen claves ni
contenido generado y solo deben ejecutarse en un servidor o CI protegido.
