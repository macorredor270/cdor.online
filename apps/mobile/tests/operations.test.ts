import {
  ChatMessageSchema,
  ConversationSchema,
  MemorySchema,
  SyncPushOperationSchema
} from "@cdor/contracts";
import { describe, expect, it } from "vitest";
import {
  createConversation,
  createMemory,
  createUserMessage,
  updateMemory
} from "../src/operations";

const USER = "01JA0000000000000000000000";
const NOW = new Date("2026-07-29T10:00:00.000Z");

describe("operaciones móviles offline", () => {
  it("crea conversación y mensaje compatibles con el wire format", () => {
    const conversation = createConversation(USER, NOW);
    expect(ConversationSchema.parse(conversation.entity)).toEqual(
      conversation.entity
    );
    expect(SyncPushOperationSchema.parse(conversation.operation)).toEqual(
      conversation.operation
    );

    const message = createUserMessage(conversation.entity, "Hola", NOW);
    expect(ChatMessageSchema.parse(message.entity)).toEqual(message.entity);
    expect(SyncPushOperationSchema.parse(message.operation)).toEqual(
      message.operation
    );
    expect(message.entity.clientOperationId).toBe(
      message.operation.operationId
    );
  });

  it("crea y actualiza una memoria conservando su versión base", () => {
    const created = createMemory(USER, "Prefiero respuestas breves", "preferencia", NOW);
    expect(MemorySchema.parse(created.entity)).toEqual(created.entity);
    const remote = { ...created.entity, syncVersion: "4" };
    const updated = updateMemory(remote, { enabled: false }, NOW);
    expect(MemorySchema.parse(updated.entity)).toEqual(updated.entity);
    expect(SyncPushOperationSchema.parse(updated.operation)).toEqual(
      updated.operation
    );
    expect(updated.operation.baseVersion).toBe("4");
  });
});
