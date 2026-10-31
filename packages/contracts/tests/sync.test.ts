import { describe, expect, it } from "vitest";
import {
  MessagePushAppendSchema,
  SyncPullDataSchema,
  SyncPullQuerySchema,
  SyncPushRequestSchema
} from "../src";

const ID_A = "01J00000000000000000000000";
const ID_B = "01J00000000000000000000001";
const ID_C = "01J00000000000000000000002";
const NOW = "2026-07-27T19:05:03.000Z";

const messageOperation = {
  operationId: ID_A,
  entityId: ID_B,
  baseVersion: "0",
  entity: "message",
  action: "upsert",
  payload: {
    conversationId: ID_C,
    clientOperationId: ID_A,
    role: "user",
    content: "Mensaje offline",
    createdAt: NOW
  }
} as const;

describe("sincronización", () => {
  it("usa cursor decimal y límites deterministas", () => {
    expect(SyncPullQuerySchema.parse({})).toEqual({
      cursor: "0",
      limit: 500
    });
    expect(
      SyncPullQuerySchema.safeParse({ cursor: "1", limit: 501 }).success
    ).toBe(false);
  });

  it("solo permite append de mensajes de usuario desde el cliente", () => {
    expect(MessagePushAppendSchema.safeParse(messageOperation).success).toBe(
      true
    );
    expect(
      MessagePushAppendSchema.safeParse({
        ...messageOperation,
        payload: { ...messageOperation.payload, role: "assistant" }
      }).success
    ).toBe(false);
  });

  it("limita el push a 100 operaciones y no permite borrar mensajes", () => {
    expect(
      SyncPushRequestSchema.safeParse({
        operations: Array.from({ length: 100 }, () => messageOperation)
      }).success
    ).toBe(true);
    expect(
      SyncPushRequestSchema.safeParse({
        operations: Array.from({ length: 101 }, () => messageOperation)
      }).success
    ).toBe(false);
    expect(
      SyncPushRequestSchema.safeParse({
        operations: [
          {
            operationId: ID_A,
            entityId: ID_B,
            baseVersion: "1",
            entity: "message",
            action: "delete",
            payload: null
          }
        ]
      }).success
    ).toBe(false);
  });

  it("conserva cursores mayores que Number.MAX_SAFE_INTEGER", () => {
    expect(
      SyncPullDataSchema.parse({
        nextCursor: "9007199254740993",
        hasMore: false,
        changes: []
      }).nextCursor
    ).toBe("9007199254740993");
  });
});
