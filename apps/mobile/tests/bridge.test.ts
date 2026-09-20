import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn()
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { mobileBridge } from "../src/bridge";

describe("bridge móvil", () => {
  beforeEach(() => {
    invoke.mockReset();
    listen.mockReset();
  });

  it("envía credenciales al command Rust sin aceptar un bearer desde JS", async () => {
    invoke.mockResolvedValue({
      authenticated: true,
      userId: "01JA0000000000000000000000"
    });
    await expect(
      mobileBridge.authSignIn("user@example.test", "password")
    ).resolves.toEqual({
      authenticated: true,
      userId: "01JA0000000000000000000000"
    });
    expect(invoke).toHaveBeenCalledWith("auth_sign_in", {
      input: {
        email: "user@example.test",
        password: "password"
      }
    });
    expect(Object.keys(mobileBridge)).not.toContain("storeToken");
  });

  it("lista caché por usuario sin exponer SQL", async () => {
    invoke.mockResolvedValue([]);
    await mobileBridge.conversationList("01JA0000000000000000000000");
    await mobileBridge.memoryList("01JA0000000000000000000000");
    expect(invoke).toHaveBeenNthCalledWith(1, "conversation_list", {
      userId: "01JA0000000000000000000000"
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "memory_list", {
      userId: "01JA0000000000000000000000"
    });
    expect(Object.keys(mobileBridge)).not.toContain("query");
  });

  it("cachea el mensaje optimista sin fabricar una operación de outbox", async () => {
    invoke.mockResolvedValue(undefined);
    const message = {
      id: "01JA0000000000000000000001",
      conversationId: "01JA0000000000000000000002",
      userId: "01JA0000000000000000000000",
      clientOperationId: "01JA0000000000000000000003",
      role: "user" as const,
      content: "Hola",
      status: "pending" as const,
      modelProvider: null,
      modelId: null,
      inputTokens: null,
      outputTokens: null,
      finishReason: null,
      errorCode: null,
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
      deletedAt: null,
      syncVersion: "0"
    };
    await mobileBridge.messageCache(message);
    expect(invoke).toHaveBeenCalledWith("message_cache", { message });
  });

  it("normaliza una operación para el outbox nativo", async () => {
    invoke.mockResolvedValue(undefined);
    await mobileBridge.conversationSave(
      {
        id: "01JA0000000000000000000001",
        userId: "01JA0000000000000000000000",
        title: "Offline",
        modelMode: "balanced",
        createdAt: "2026-07-29T10:00:00.000Z",
        updatedAt: "2026-07-29T10:00:00.000Z",
        deletedAt: null,
        syncVersion: "0"
      },
      {
        operationId: "01JA0000000000000000000002",
        entityId: "01JA0000000000000000000001",
        entity: "conversation",
        action: "upsert",
        baseVersion: "0",
        payload: {
          title: "Offline",
          modelMode: "balanced",
          createdAt: "2026-07-29T10:00:00.000Z"
        }
      },
      123
    );
    expect(invoke).toHaveBeenCalledWith(
      "conversation_save",
      expect.objectContaining({
        operation: expect.objectContaining({
          entityType: "conversation",
          nextAttemptAtMs: 123,
          attempts: 0
        })
      })
    );
  });

  it("agrupa el evento sync detrás de una única suscripción", async () => {
    const unlisten = vi.fn();
    listen.mockImplementation(async (_event, handler) => {
      handler({ payload: { cursor: "8", pushed: 1 } });
      return unlisten;
    });
    const handler = vi.fn();
    await expect(mobileBridge.onSyncState(handler)).resolves.toBe(unlisten);
    expect(handler).toHaveBeenCalledWith({ cursor: "8", pushed: 1 });
  });

  it("expone deltas agrupados como eventos y no como callbacks de invoke", async () => {
    const unlisten = vi.fn();
    listen.mockImplementation(async (event, handler) => {
      expect(event).toBe("chat://delta");
      handler({
        payload: {
          messageId: "01JA0000000000000000000001",
          sequence: 4,
          text: "hola"
        }
      });
      return unlisten;
    });
    const handler = vi.fn();
    await expect(mobileBridge.onChatDelta(handler)).resolves.toBe(unlisten);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ sequence: 4, text: "hola" })
    );
  });
});
