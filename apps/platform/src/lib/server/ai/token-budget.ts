import { AppError } from "../errors/app-error";
import type { AiMessage } from "./types";

const MESSAGE_OVERHEAD_TOKENS = 6;
const CONSERVATIVE_CHARACTERS_PER_TOKEN = 3;

export function estimateTextTokens(value: string): number {
  return Math.max(
    1,
    Math.ceil([...value].length / CONSERVATIVE_CHARACTERS_PER_TOKEN)
  );
}

export function estimateMessageTokens(message: AiMessage): number {
  return (
    MESSAGE_OVERHEAD_TOKENS +
    estimateTextTokens(message.role) +
    estimateTextTokens(message.content)
  );
}

export function estimateMessagesTokens(messages: readonly AiMessage[]): number {
  return messages.reduce(
    (total, message) => total + estimateMessageTokens(message),
    0
  );
}

export function inputTokenBudget(
  contextTokens: number,
  reservedOutputTokens: number
): number {
  if (
    !Number.isInteger(contextTokens) ||
    !Number.isInteger(reservedOutputTokens) ||
    contextTokens <= 0 ||
    reservedOutputTokens <= 0 ||
    reservedOutputTokens >= contextTokens
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "El presupuesto de tokens no es válido"
    );
  }
  return contextTokens - reservedOutputTokens;
}
