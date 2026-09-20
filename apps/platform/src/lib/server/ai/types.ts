import type { FinishReason } from "@cdor/contracts";

export type AiMessage = Readonly<{
  role: "system" | "user" | "assistant";
  content: string;
}>;

export type AiModel = Readonly<{
  id: string;
}>;

export type AiChatRequest = Readonly<{
  model: string;
  messages: readonly AiMessage[];
  maxOutputTokens: number;
  temperature?: number;
  webSearch?: boolean;
}>;

export type AiChunk =
  | Readonly<{ type: "delta"; text: string }>
  | Readonly<{
      type: "usage";
      inputTokens: number;
      outputTokens: number;
    }>
  | Readonly<{ type: "done"; finishReason: FinishReason }>;

export interface AiProvider {
  readonly name: string;
  listModels(signal?: AbortSignal): Promise<readonly AiModel[]>;
  streamChat(
    request: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk>;
}
