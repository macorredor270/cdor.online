import { describe, expect, it } from "vitest";
import {
  ChatStreamEventSchema,
  ChatStreamRequestSchema,
  StreamDeltaEventSchema,
  UserMessageContentSchema
} from "../src";

const ID_A = "01J00000000000000000000000";
const ID_B = "01J00000000000000000000001";
const ID_C = "01J00000000000000000000002";

describe("chat", () => {
  it("acepta mensajes del cliente con identidad idempotente", () => {
    expect(
      ChatStreamRequestSchema.safeParse({
        conversationId: ID_A,
        message: {
          id: ID_B,
          clientOperationId: ID_C,
          content: "Hola"
        },
        modelMode: "balanced"
      }).success
    ).toBe(true);
  });

  it("aplica el límite de 32 KiB al mensaje de usuario", () => {
    expect(UserMessageContentSchema.safeParse("x".repeat(32 * 1024)).success).toBe(
      true
    );
    expect(
      UserMessageContentSchema.safeParse("x".repeat(32 * 1024 + 1)).success
    ).toBe(false);
  });

  it("discrimina eventos SSE propios y limita deltas", () => {
    const delta = {
      event: "delta",
      data: {
        messageId: ID_A,
        sequence: 0,
        text: "Respuesta parcial"
      }
    };

    expect(ChatStreamEventSchema.parse(delta)).toEqual(delta);
    expect(
      StreamDeltaEventSchema.safeParse({
        ...delta,
        data: { ...delta.data, text: "x".repeat(8193) }
      }).success
    ).toBe(false);
    expect(
      ChatStreamEventSchema.safeParse({
        event: "provider_delta",
        data: delta.data
      }).success
    ).toBe(false);
  });
});
