import { performance } from "node:perf_hooks";
import { estimateMessagesTokens } from "../../src/lib/server/ai/token-budget";
import type {
  AiChatRequest,
  AiProvider
} from "../../src/lib/server/ai/types";

export type CollectedGeneration = Readonly<{
  text: string;
  latencyFirstTokenMs: number;
  latencyTotalMs: number;
  inputTokens: number;
  outputTokens: number;
}>;

export async function collectGeneration(
  provider: AiProvider,
  request: AiChatRequest
): Promise<CollectedGeneration> {
  const controller = new AbortController();
  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  let text = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let done = false;

  for await (const chunk of provider.streamChat(request, controller.signal)) {
    if (chunk.type === "delta") {
      firstTokenAt ??= performance.now();
      text += chunk.text;
    } else if (chunk.type === "usage") {
      inputTokens = chunk.inputTokens;
      outputTokens = chunk.outputTokens;
    } else {
      done = true;
    }
  }

  if (!done || text.trim() === "") {
    throw new Error("El proveedor no completó una respuesta de texto");
  }

  const completedAt = performance.now();
  return Object.freeze({
    text,
    latencyFirstTokenMs: Math.round((firstTokenAt ?? completedAt) - startedAt),
    latencyTotalMs: Math.round(completedAt - startedAt),
    inputTokens: inputTokens ?? estimateMessagesTokens(request.messages),
    outputTokens:
      outputTokens ?? Math.max(1, Math.ceil([...text].length / 3))
  });
}
