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
  /**
   * Quién está generando realmente la respuesta. Solo lo emite el respaldo
   * entre proveedores, justo antes del primer fragmento de texto, para que el
   * uso se anote contra el proveedor que lo sirvió y no contra el principal.
   */
  | Readonly<{ type: "route"; provider: string; model: string }>
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
