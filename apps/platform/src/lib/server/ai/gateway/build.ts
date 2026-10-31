import type { GatewayEnvironment } from "../../config/schema";
import { NVIDIA_MODEL_CANDIDATES } from "../model-router";
import { NvidiaNimProvider } from "../nvidia-nim";
import { OpenRouterProvider, isFreeOpenRouterModel } from "../openrouter";
import type { FallbackEntry } from "../fallback";
import type { AiProvider } from "../types";
import { DiscoveredModel } from "./discovered-model";
import {
  DEFAULT_PROVIDER_ORDER,
  GENERIC_PROVIDERS,
  NVIDIA_DEFAULT_RPM,
  NVIDIA_PREFER,
  OPENROUTER_DEFAULT_RPM,
  OPENROUTER_FREE_MODEL
} from "./registry";

/** Un proveedor concreto tras el modelo MAC. */
export type Deployment = Readonly<{
  id: string;
  label: string;
  provider: AiProvider;
  entry: FallbackEntry;
}>;

export type BuildOptions = Readonly<{
  fetch?: typeof globalThis.fetch;
  /** Aviso de configuración incorrecta. Nunca recibe claves ni valores. */
  warn?: (message: string) => void;
}>;

const GENERIC_TIMEOUT_MS = 120_000;
const DEFAULT_CONTEXT_TOKENS = 32_768;

type EnvironmentRecord = Readonly<Record<string, unknown>>;

function text(environment: EnvironmentRecord, name: string): string | undefined {
  const value = environment[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function number(environment: EnvironmentRecord, name: string): number | undefined {
  const value = environment[name];
  return typeof value === "number" ? value : undefined;
}

/**
 * Monta los despliegues activos a partir de la configuración. Un proveedor se
 * activa al definir su clave; los proveedores propios (`AI_CUSTOM_PROVIDERS`)
 * no necesitan clave. Los inactivos no existen: no se llaman nunca.
 */
export function buildDeployments(
  environment: GatewayEnvironment,
  options: BuildOptions = {}
): readonly Deployment[] {
  const record = environment as unknown as EnvironmentRecord;
  const warn = options.warn ?? (() => undefined);
  const deployments: Deployment[] = [];

  // NVIDIA: solo modelos de la lista blanca de MAC.
  if (environment.NVIDIA_API_KEY) {
    const provider = new NvidiaNimProvider({
      name: "nvidia",
      apiKey: environment.NVIDIA_API_KEY,
      baseUrl: environment.NVIDIA_BASE_URL,
      requestTimeoutMs: environment.NVIDIA_REQUEST_TIMEOUT_MS,
      fetch: options.fetch
    });
    const configured = environment.NVIDIA_DEFAULT_MODEL;
    const allowed = NVIDIA_MODEL_CANDIDATES.some(({ id }) => id === configured);
    if (configured && !allowed) {
      warn("NVIDIA_DEFAULT_MODEL no pertenece a la lista blanca: NVIDIA desactivada");
    } else {
      deployments.push({
        id: "nvidia",
        label: "NVIDIA NIM",
        provider,
        entry: {
          provider,
          model: configured ?? new DiscoveredModel(provider, NVIDIA_PREFER),
          rpm: environment.NVIDIA_RPM ?? NVIDIA_DEFAULT_RPM,
          contextTokens: DEFAULT_CONTEXT_TOKENS
        }
      });
    }
  }

  for (const descriptor of GENERIC_PROVIDERS) {
    const apiKey = text(record, descriptor.keyEnv);
    if (!apiKey) continue;
    const provider = new NvidiaNimProvider({
      name: descriptor.id,
      apiKey,
      baseUrl: descriptor.baseUrl,
      requestTimeoutMs: GENERIC_TIMEOUT_MS,
      includeUsage: descriptor.includeUsage,
      normalizeModelId: descriptor.normalizeModelId,
      fetch: options.fetch
    });
    deployments.push({
      id: descriptor.id,
      label: descriptor.label,
      provider,
      entry: {
        provider,
        model:
          text(record, descriptor.modelEnv) ??
          new DiscoveredModel(provider, descriptor.prefer),
        rpm: number(record, descriptor.rpmEnv) ?? descriptor.defaultRpm,
        contextTokens: descriptor.contextTokens
      }
    });
  }

  // OpenRouter como proveedor de chat es opt-in: su clave ya se usa para la
  // búsqueda web y los modelos gratuitos pueden registrar los prompts.
  if (environment.AI_FALLBACK_OPENROUTER && environment.OPENROUTER_API_KEY) {
    const configured = environment.OPENROUTER_DEFAULT_MODEL;
    const provider = new OpenRouterProvider({
      apiKey: environment.OPENROUTER_API_KEY,
      baseUrl: environment.OPENROUTER_BASE_URL,
      requestTimeoutMs: environment.OPENROUTER_REQUEST_TIMEOUT_MS,
      fetch: options.fetch
    });
    deployments.push({
      id: "openrouter",
      label: "OpenRouter (gratuito)",
      provider,
      entry: {
        provider,
        model:
          configured && isFreeOpenRouterModel(configured)
            ? configured
            : OPENROUTER_FREE_MODEL,
        rpm: OPENROUTER_DEFAULT_RPM,
        contextTokens: DEFAULT_CONTEXT_TOKENS
      }
    });
  }

  for (const custom of environment.AI_CUSTOM_PROVIDERS ?? []) {
    const provider = new NvidiaNimProvider({
      name: custom.id,
      apiKey: custom.apiKey,
      baseUrl: custom.baseUrl,
      requestTimeoutMs: GENERIC_TIMEOUT_MS,
      fetch: options.fetch
    });
    deployments.push({
      id: custom.id,
      label: custom.id,
      provider,
      entry: {
        provider,
        model: custom.model,
        rpm: custom.rpm,
        weight: custom.weight,
        contextTokens: custom.contextTokens ?? DEFAULT_CONTEXT_TOKENS
      }
    });
  }

  return orderDeployments(deployments, environment.AI_PROVIDER_ORDER);
}

/**
 * Primero los de `AI_PROVIDER_ORDER`, en ese orden; después el resto en el
 * orden por defecto (proveedores conocidos) y, al final, los propios en el
 * orden en que se declararon.
 */
function orderDeployments(
  deployments: readonly Deployment[],
  preferred: readonly string[] | undefined
): readonly Deployment[] {
  const rank = new Map<string, number>();
  [...(preferred ?? []), ...DEFAULT_PROVIDER_ORDER].forEach((id) => {
    if (!rank.has(id)) rank.set(id, rank.size);
  });
  const position = (id: string) => rank.get(id) ?? Number.MAX_SAFE_INTEGER;
  return deployments
    .map((deployment, index) => ({ deployment, index }))
    .sort(
      (left, right) =>
        position(left.deployment.id) - position(right.deployment.id) ||
        left.index - right.index
    )
    .map(({ deployment }) => deployment);
}
