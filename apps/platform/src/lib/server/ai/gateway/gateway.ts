import { PUBLIC_MODEL } from "@cdor/contracts";
import { AppError } from "../../errors/app-error";
import type { AllowedModel } from "../model-router";
import { FallbackProvider, type FallbackOptions } from "../fallback";
import type { AiChatRequest, AiChunk, AiModel, AiProvider } from "../types";
import type { Deployment } from "./build";

/**
 * El modelo que MAC publica. No corresponde a ningún modelo real: es un grupo
 * de despliegues. Los límites son los de la ventana conservadora que admiten
 * todos los proveedores gratuitos; cada despliegue declara además la suya.
 */
export const MAC_MODEL: AllowedModel = Object.freeze({
  id: PUBLIC_MODEL.id,
  displayName: "MAC",
  contextTokens: 32_768,
  maximumOutputTokens: 2_048,
  benchmarkCost: Object.freeze({ inputPerMillion: 0, outputPerMillion: 0 })
});

/**
 * Proveedor único de cara al resto de la aplicación: «mac». Detrás reparte las
 * peticiones entre los despliegues configurados con respaldo automático (ver
 * `FallbackProvider`). Ni el catálogo ni los mensajes revelan qué proveedor o
 * modelo concreto responde; eso solo se anota en las tablas operativas.
 */
export class GatewayProvider implements AiProvider {
  readonly name = PUBLIC_MODEL.provider;
  readonly #inner: FallbackProvider;

  constructor(
    readonly deployments: readonly Deployment[],
    options: Omit<FallbackOptions, "name"> = {}
  ) {
    this.#inner = new FallbackProvider(
      deployments.map(({ entry }) => entry),
      { ...options, name: PUBLIC_MODEL.provider }
    );
  }

  /**
   * MAC está disponible si lo está algún despliegue. Se consulta a todos a la
   * vez: no importa cuál conteste primero, solo que alguno lo haga.
   */
  async listModels(signal?: AbortSignal): Promise<readonly AiModel[]> {
    const results = await Promise.allSettled(
      this.deployments.map(({ provider }) => provider.listModels(signal))
    );
    if (results.some((result) => result.status === "fulfilled")) {
      return [Object.freeze({ id: PUBLIC_MODEL.id })];
    }
    throw new AppError(
      "AI_PROVIDER_ERROR",
      "Ningún proveedor de IA respondió"
    );
  }

  streamChat(
    request: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    return this.#inner.streamChat(request, signal);
  }
}
