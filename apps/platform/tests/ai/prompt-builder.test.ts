import { buildPrompt } from "../../src/lib/server/ai/prompt-builder";
import {
  estimateMessagesTokens,
  inputTokenBudget
} from "../../src/lib/server/ai/token-budget";
import { describe, expect, it } from "vitest";

describe("presupuesto y construcción de prompt", () => {
  it("reserva salida y conserva el mensaje actual", () => {
    const prompt = buildPrompt({
      systemPrompt: "Eres MAC.",
      memories: [],
      previousMessages: [
        { role: "user", content: "Contexto anterior" },
        { role: "assistant", content: "Respuesta anterior" }
      ],
      currentMessage: "Pregunta actual",
      contextTokens: 256,
      reservedOutputTokens: 64
    });

    expect(prompt.messages.at(-1)).toEqual({
      role: "user",
      content: "Pregunta actual"
    });
    expect(prompt.estimatedInputTokens).toBeLessThanOrEqual(
      inputTokenBudget(256, 64)
    );
    expect(prompt.estimatedInputTokens).toBe(
      estimateMessagesTokens(prompt.messages)
    );
  });

  it("prioriza memorias habilitadas por importancia y actualización", () => {
    const prompt = buildPrompt({
      systemPrompt: "Eres MAC.",
      memories: [
        {
          content: "deshabilitada",
          category: "perfil",
          importance: 5,
          enabled: false,
          updatedAt: new Date("2026-07-27T10:00:00Z")
        },
        {
          content: "importante reciente",
          category: "perfil",
          importance: 5,
          enabled: true,
          updatedAt: new Date("2026-07-27T10:00:00Z")
        },
        {
          content: "menos importante",
          category: "perfil",
          importance: 2,
          enabled: true,
          updatedAt: new Date("2026-07-27T11:00:00Z")
        }
      ],
      previousMessages: [],
      currentMessage: "Hola",
      contextTokens: 256,
      reservedOutputTokens: 64
    });

    expect(prompt.messages.map(({ content }) => content)).toEqual([
      "Eres MAC.",
      "[Memoria:perfil] importante reciente",
      "[Memoria:perfil] menos importante",
      "Hola"
    ]);
  });

  it("descarta contexto antiguo antes que el turno actual", () => {
    const prompt = buildPrompt({
      systemPrompt: "Sistema",
      memories: [],
      previousMessages: [
        { role: "user", content: "x".repeat(500) },
        { role: "assistant", content: "mensaje reciente" }
      ],
      currentMessage: "actual",
      contextTokens: 96,
      reservedOutputTokens: 32
    });

    expect(prompt.includedPreviousMessageCount).toBe(1);
    expect(prompt.messages.some(({ content }) => content === "x".repeat(500)))
      .toBe(false);
    expect(prompt.messages.at(-1)?.content).toBe("actual");
  });

  it("falla si ni siquiera lo obligatorio cabe", () => {
    expect(() =>
      buildPrompt({
        systemPrompt: "s".repeat(500),
        memories: [],
        previousMessages: [],
        currentMessage: "actual",
        contextTokens: 64,
        reservedOutputTokens: 32
      })
    ).toThrowError("no cabe");
  });
});
