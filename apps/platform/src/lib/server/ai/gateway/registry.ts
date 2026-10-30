/**
 * Proveedores de IA conocidos por la pasarela de MAC.
 *
 * Solo se incluyen los que tienen nivel gratuito permanente con API
 * compatible con OpenAI y que no exigen datos de pago. Un proveedor se activa
 * al definir su clave; nada se llama sin ella.
 *
 * Los modelos NO se fijan aquí: los proveedores retiran y renombran modelos
 * gratuitos con frecuencia (Groq retiró Llama 3.3 70B y Google apagó Gemini 2.0
 * Flash en 2026), así que cada despliegue descubre el modelo disponible en su
 * catálogo según una lista de preferencias y se puede fijar con
 * `<ID>_DEFAULT_MODEL`. Los límites de cada nivel gratuito cambian y los
 * publica cada proveedor: `rpm` es solo una estimación conservadora para
 * repartir la carga, ajustable con `<ID>_RPM`. El 429 real del proveedor
 * manda siempre.
 *
 * Para añadir otro proveedor propio sin tocar código, ver
 * `AI_CUSTOM_PROVIDERS` en docs/ai.md.
 */

import { stripModelsPrefix } from "./model-pick";

export type ProviderDescriptor = Readonly<{
  id: string;
  label: string;
  baseUrl: string;
  /** Variable de entorno con la clave de API. */
  keyEnv: string;
  /** Variable para fijar el modelo en vez de descubrirlo. */
  modelEnv: string;
  /** Variable para ajustar el cupo de peticiones por minuto. */
  rpmEnv: string;
  /** Patrones de preferencia para descubrir el modelo, de mejor a peor. */
  prefer: readonly RegExp[];
  /** Estimación conservadora de peticiones por minuto del nivel gratuito. */
  defaultRpm?: number;
  contextTokens: number;
  /**
   * Si acepta `stream_options.include_usage`. Omitirlo siempre es válido (el
   * consumo se estima); enviarlo a quien no lo conoce puede provocar un 400.
   */
  includeUsage: boolean;
  /** Normaliza los ids del catálogo al formato que aceptan las peticiones. */
  normalizeModelId?: (id: string) => string;
  /** Qué hay que saber del nivel gratuito (para la documentación). */
  freeTier: string;
}>;

export const GENERIC_PROVIDERS: readonly ProviderDescriptor[] = Object.freeze([
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_DEFAULT_MODEL",
    rpmEnv: "GROQ_RPM",
    prefer: [/gpt-oss-120b/, /llama-3\.3-70b/, /gpt-oss-20b/, /llama-3\.1-8b/],
    defaultRpm: 25,
    contextTokens: 32_768,
    includeUsage: true,
    freeTier:
      "Nivel gratuito permanente, sin tarjeta; unas 30 peticiones por minuto y un tope diario por modelo."
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_DEFAULT_MODEL",
    rpmEnv: "GEMINI_RPM",
    prefer: [/^gemini-[\d.]+-flash$/, /^gemini-[\d.]+-flash-lite$/],
    contextTokens: 32_768,
    includeUsage: false,
    normalizeModelId: stripModelsPrefix,
    freeTier:
      "Nivel gratuito en Google AI Studio; los límites no se publican por modelo y Google puede usar los prompts del nivel gratuito para mejorar sus productos."
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_DEFAULT_MODEL",
    rpmEnv: "MISTRAL_RPM",
    prefer: [
      /^mistral-small-latest$/,
      /^mistral-medium-latest$/,
      /^open-mistral-nemo$/
    ],
    contextTokens: 32_768,
    includeUsage: false,
    freeTier:
      "Plan gratuito «Experiment» con verificación de teléfono y límites bajos; los datos del plan gratuito pueden usarse para entrenar."
  }
]);

/** Identificadores reservados: un proveedor propio no puede reutilizarlos. */
export const BUILT_IN_PROVIDER_IDS = Object.freeze([
  "nvidia",
  ...GENERIC_PROVIDERS.map(({ id }) => id),
  "openrouter"
] as const);

/** Orden de preferencia por defecto cuando `AI_PROVIDER_ORDER` no lo cambia. */
export const DEFAULT_PROVIDER_ORDER: readonly string[] = BUILT_IN_PROVIDER_IDS;

/** Preferencias de NVIDIA: los candidatos de la lista blanca, de mejor a peor. */
export const NVIDIA_PREFER: readonly RegExp[] = Object.freeze([
  /^meta\/llama-3\.3-70b-instruct$/,
  /^nvidia\/nemotron-3-super-120b-a12b$/,
  /^meta\/llama-3\.1-8b-instruct$/
]);

/** Estimaciones de cupo de NVIDIA y OpenRouter (ajustables con `NVIDIA_RPM`). */
export const NVIDIA_DEFAULT_RPM = 40;
export const OPENROUTER_DEFAULT_RPM = 20;
export const OPENROUTER_FREE_MODEL = "openrouter/free";

/** Todas las variables de entorno que declara el registro, para auditarlas. */
export function registryEnvNames(): readonly string[] {
  return GENERIC_PROVIDERS.flatMap(({ keyEnv, modelEnv, rpmEnv }) => [
    keyEnv,
    modelEnv,
    rpmEnv
  ]);
}
