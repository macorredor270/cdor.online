import { createOpenRouterProvider } from "../ai/runtime";
import { MAC_MODEL, createGateway } from "../ai/gateway";
import type { AllowedModel } from "../ai/model-router";
import {
  getGatewayEnvironment,
  getOptionalOpenRouterEnvironment
} from "../config";
import { getDatabaseClient } from "../db/client";
import { GenerationRepository } from "../db/repositories/generations";
import { AppError } from "../errors/app-error";
import type { AiProvider } from "../ai/types";
import { openRouterModelIdFor } from "../ai/openrouter";
import { ChatStreamService } from "./chat-stream";
import { getQuotaService } from "./quota-runtime";
import { ModelCatalogService } from "./models";

/**
 * Modelo de OpenRouter para la búsqueda web cuando no se fija otro. La
 * herramienta solo existe en OpenRouter y es de pago: está desactivada salvo
 * `AI_WEB_SEARCH=true`.
 */
const WEB_SEARCH_MODEL = "meta-llama/llama-3.3-70b-instruct";

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

function warnAboutConfiguration(message: string): void {
  // Solo texto fijo: nunca claves ni valores de configuración.
  console.warn(`CDOR_GATEWAY_CONFIG ${message}`);
}

/**
 * El modelo «MAC»: una pasarela que reparte entre los proveedores de IA
 * configurados, con respaldo automático. Ver docs/ai.md.
 */
function getAiRuntime() {
  if (!runtime) {
    const gateway = createGateway(getGatewayEnvironment(), {
      warn: warnAboutConfiguration
    });
    if (!gateway) {
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "No hay ningún proveedor de IA configurado"
      );
    }
    runtime = Object.freeze({ provider: gateway, model: MAC_MODEL });
  }
  return runtime;
}

function getSearchRuntime(model: AllowedModel) {
  if (searchRuntime !== undefined) return searchRuntime;
  const gateway = getGatewayEnvironment();
  const environment = getOptionalOpenRouterEnvironment();
  if (!gateway.AI_WEB_SEARCH || !environment) {
    searchRuntime = null;
    return searchRuntime;
  }
  const routedModelId =
    openRouterModelIdFor(gateway.NVIDIA_DEFAULT_MODEL ?? "") ?? WEB_SEARCH_MODEL;
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
