import { AppError } from "../errors/app-error";
import { NvidiaNimProvider } from "./nvidia-nim";
import type {
  AiChatRequest,
  AiChunk,
  AiModel,
  AiProvider
} from "./types";

export type OpenRouterConfiguration = Readonly<{
  apiKey: string;
  baseUrl: string;
  requestTimeoutMs: number;
  fetch?: typeof globalThis.fetch;
  modelAliases?: Readonly<Record<string, string>>;
}>;

const OPENROUTER_MODEL_BY_NVIDIA_ID: Readonly<Record<string, string>> =
  Object.freeze({
    "meta/llama-3.1-8b-instruct": "meta-llama/llama-3.1-8b-instruct",
    "meta/llama-3.3-70b-instruct": "meta-llama/llama-3.3-70b-instruct",
    "nvidia/nemotron-3-super-120b-a12b":
      "nvidia/nemotron-3-super-120b-a12b"
  });

export function openRouterModelIdFor(modelId: string): string | null {
  return OPENROUTER_MODEL_BY_NVIDIA_ID[modelId] ?? null;
}

export function isFreeOpenRouterModel(modelId: string): boolean {
  return modelId === "openrouter/free" || modelId.endsWith(":free");
}

export class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter";
  readonly #delegate: NvidiaNimProvider;
  readonly #modelAliases: Readonly<Record<string, string>>;

  constructor(configuration: OpenRouterConfiguration) {
    this.#delegate = new NvidiaNimProvider(configuration);
    this.#modelAliases = configuration.modelAliases ?? {};
  }

  async listModels(signal?: AbortSignal): Promise<readonly AiModel[]> {
    const models = await this.#delegate.listModels(signal);
    return models.filter(({ id }) => isFreeOpenRouterModel(id));
  }

  streamChat(
    request: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    const routedModel = this.#modelAliases[request.model] ?? request.model;
    if (!isFreeOpenRouterModel(routedModel) && !request.webSearch) {
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "OpenRouter solo admite modelos gratuitos en MAC"
      );
    }
    return this.#delegate.streamChat(
      { ...request, model: routedModel },
      signal
    );
  }
}
