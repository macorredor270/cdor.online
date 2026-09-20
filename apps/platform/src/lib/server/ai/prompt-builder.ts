import { AppError } from "../errors/app-error";
import {
  estimateMessageTokens,
  estimateMessagesTokens,
  inputTokenBudget
} from "./token-budget";
import type { AiMessage } from "./types";

export type PromptMemory = Readonly<{
  content: string;
  category: string;
  importance: number;
  enabled: boolean;
  updatedAt: Date;
}>;

export type PromptBuildInput = Readonly<{
  systemPrompt: string;
  memories: readonly PromptMemory[];
  summary?: string | null;
  previousMessages: readonly AiMessage[];
  currentMessage: string;
  contextTokens: number;
  reservedOutputTokens: number;
}>;

export type BuiltPrompt = Readonly<{
  messages: readonly AiMessage[];
  estimatedInputTokens: number;
  includedMemoryCount: number;
  includedPreviousMessageCount: number;
  summaryIncluded: boolean;
}>;

function asMemoryMessage(memory: PromptMemory): AiMessage {
  return {
    role: "system",
    content: `[Memoria:${memory.category}] ${memory.content}`
  };
}

export function buildPrompt(input: PromptBuildInput): BuiltPrompt {
  const maximumInputTokens = inputTokenBudget(
    input.contextTokens,
    input.reservedOutputTokens
  );
  const system: AiMessage = {
    role: "system",
    content: input.systemPrompt
  };
  const current: AiMessage = {
    role: "user",
    content: input.currentMessage
  };
  const mandatoryTokens = estimateMessagesTokens([system, current]);

  if (mandatoryTokens > maximumInputTokens) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El mensaje actual no cabe en el contexto del modelo"
    );
  }

  let remaining = maximumInputTokens - mandatoryTokens;
  const selectedPrevious: AiMessage[] = [];
  for (const message of [...input.previousMessages].reverse()) {
    const tokens = estimateMessageTokens(message);
    if (tokens > remaining) {
      break;
    }
    selectedPrevious.unshift(message);
    remaining -= tokens;
  }

  const selectedMemories: AiMessage[] = [];
  const relevantMemories = input.memories
    .filter(({ enabled }) => enabled)
    .sort(
      (left, right) =>
        right.importance - left.importance ||
        right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  for (const memory of relevantMemories) {
    const message = asMemoryMessage(memory);
    const tokens = estimateMessageTokens(message);
    if (tokens <= remaining) {
      selectedMemories.push(message);
      remaining -= tokens;
    }
  }

  let summaryMessage: AiMessage | undefined;
  if (input.summary) {
    const candidate: AiMessage = {
      role: "system",
      content: `[Resumen de contexto anterior] ${input.summary}`
    };
    const tokens = estimateMessageTokens(candidate);
    if (tokens <= remaining) {
      summaryMessage = candidate;
    }
  }

  const messages = [
    system,
    ...selectedMemories,
    ...(summaryMessage ? [summaryMessage] : []),
    ...selectedPrevious,
    current
  ];

  return Object.freeze({
    messages: Object.freeze(messages),
    estimatedInputTokens: estimateMessagesTokens(messages),
    includedMemoryCount: selectedMemories.length,
    includedPreviousMessageCount: selectedPrevious.length,
    summaryIncluded: summaryMessage !== undefined
  });
}
