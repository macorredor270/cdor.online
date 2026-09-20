import type {
  AiChatRequest,
  AiChunk,
  AiModel,
  AiProvider
} from "./types";

export type MockAiProviderConfiguration = Readonly<{
  models?: readonly string[];
  response?: string;
  inputTokens?: number;
  outputTokens?: number;
}>;

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly #models: readonly AiModel[];
  readonly #response: string;
  readonly #inputTokens: number;
  readonly #outputTokens: number;

  constructor(configuration: MockAiProviderConfiguration = {}) {
    this.#models = (configuration.models ?? ["mock/cdor"]).map((id) => ({
      id
    }));
    this.#response = configuration.response ?? "Respuesta simulada";
    this.#inputTokens = configuration.inputTokens ?? 8;
    this.#outputTokens = configuration.outputTokens ?? 3;
  }

  async listModels(): Promise<readonly AiModel[]> {
    return this.#models;
  }

  async *streamChat(
    _request: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    if (signal.aborted) {
      return;
    }
    yield { type: "delta", text: this.#response };
    yield {
      type: "usage",
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens
    };
    yield { type: "done", finishReason: "stop" };
  }
}
