import { createNvidiaProvider, createOpenRouterProvider } from "../ai/runtime";
import {
  NVIDIA_MODEL_CANDIDATES,
  type AllowedModel
} from "../ai/model-router";
import { FallbackProvider } from "../ai/fallback";
import {
  getAiEnvironment,
  getFallbackEnvironment,
  getOptionalOpenRouterEnvironment
} from "../config";
import { logProviderFailover } from "../observability/provider-log";
import { getDatabaseClient } from "../db/client";
import { GenerationRepository } from "../db/repositories/generations";
import { AppError } from "../errors/app-error";
import type { AiProvider } from "../ai/types";
import { openRouterModelIdFor } from "../ai/openrouter";
import { ChatStreamService } from "./chat-stream";
import { getQuotaService } from "./quota-runtime";
import { ModelCatalogService } from "./models";

let runtime:
  | Readonly<{
      provider: AiProvider;
      model: AllowedModel;
    }>
  | undefined;
let service: ChatStreamService | undefined;
let catalog: ModelCatalogService | undefined;
let searchRuntime:
  | Readonly<{ provider: AiProvider; model: AllowedModel }>
  | null
  | undefined;

/**
 * Respaldo opcional: si NVIDIA falla antes de dar texto, la petición pasa al
 * router gratuito de OpenRouter. Desactivado por defecto porque los modelos
 * gratuitos pueden registrar los prompts; se activa con AI_FALLBACK_OPENROUTER
 * y requiere OPENROUTER_API_KEY.
 */
function withFallback(primary: AiProvider): AiProvider {
  if (!getFallbackEnvironment().AI_FALLBACK_OPENROUTER) return primary;
  const openRouter = getOptionalOpenRouterEnvironment();
  if (!openRouter) return primary;
  return new FallbackProvider(
    [
      { provider: primary },
      { provider: createOpenRouterProvider(openRouter), model: "openrouter/free" }
    ],
    { onFailover: logProviderFailover }
  );
}

function getAiRuntime() {
  if (!runtime) {
    const environment = getAiEnvironment();
    const model = NVIDIA_MODEL_CANDIDATES.find(
      ({ id }) => id === environment.NVIDIA_DEFAULT_MODEL
    );
    if (!model) {
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "No hay un modelo NVIDIA validado"
      );
    }
    runtime = Object.freeze({
      provider: withFallback(createNvidiaProvider(environment)),
      model
    });
  }
  return runtime;
}

function getSearchRuntime(model: AllowedModel) {
  if (searchRuntime !== undefined) return searchRuntime;
  const environment = getOptionalOpenRouterEnvironment();
  const routedModelId = openRouterModelIdFor(model.id);
  if (!environment || !routedModelId) {
    searchRuntime = null;
    return searchRuntime;
  }
  searchRuntime = Object.freeze({
    provider: createOpenRouterProvider(environment, {
      [model.id]: routedModelId
    }),
    model
  });
  return searchRuntime;
}

export function getChatStreamService(): ChatStreamService {
  if (!service) {
    const { provider, model } = getAiRuntime();
    service = new ChatStreamService(
      new GenerationRepository(getDatabaseClient().database),
      provider,
      model,
      getSearchRuntime(model) ?? undefined,
      getQuotaService()
    );
  }
  return service;
}

export function getModelCatalogService(): ModelCatalogService {
  if (!catalog) {
    const { provider, model } = getAiRuntime();
    catalog = new ModelCatalogService(provider, model);
  }
  return catalog;
}
