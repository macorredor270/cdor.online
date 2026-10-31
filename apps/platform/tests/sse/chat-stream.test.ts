import type { ErrorCode } from "@cdor/contracts";
import { describe, expect, it, vi } from "vitest";
import { testPrincipal } from "../../src/lib/server/auth/principal";
import type {
  GenerationMessageRow,
  GenerationRow,
  PreparedGeneration
} from "../../src/lib/server/db/repositories/generations";
import { MockAiProvider } from "../../src/lib/server/ai/mock";
import type { AiProvider } from "../../src/lib/server/ai/types";
import { ChatStreamService } from "../../src/lib/server/services/chat-stream";

const NOW = new Date("2026-07-27T22:00:00.000Z");
const USER_ID = "01J70000000000000000000000";
const CONVERSATION_ID = "01J70000000000000000000001";
const USER_MESSAGE_ID = "01J70000000000000000000002";
const ASSISTANT_MESSAGE_ID = "01J70000000000000000000003";
const GENERATION_ID = "01J70000000000000000000004";

const userMessage: GenerationMessageRow = {
  id: USER_MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  clientOperationId: "01J70000000000000000000005",
  role: "user",
  content: "Hola",
  status: "completed",
  modelProvider: null,
  modelId: null,
  inputTokens: null,
  outputTokens: null,
  finishReason: null,
  errorCode: null,
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  syncVersion: 1n
};
const assistantMessage: GenerationMessageRow = {
  ...userMessage,
  id: ASSISTANT_MESSAGE_ID,
  clientOperationId: null,
  role: "assistant",
  content: "",
  status: "streaming",
  modelProvider: "mock",
  modelId: "mock/cdor"
};
const generation: GenerationRow = {
  id: GENERATION_ID,
  userId: USER_ID,
  conversationId: CONVERSATION_ID,
  assistantMessageId: ASSISTANT_MESSAGE_ID,
  provider: "mock",
  modelId: "mock/cdor",
  state: "streaming",
  cancelRequestedAt: null,
  startedAt: NOW,
  completedAt: null,
  latencyFirstTokenMs: null,
  latencyTotalMs: null,
  inputTokens: null,
  outputTokens: null,
  errorCode: null,
  createdAt: NOW
};
const prepared: PreparedGeneration = {
  generation,
  userMessage,
  assistantMessage,
  reused: false
};

function repositoryDouble() {
  return {
    loadPromptContext: vi.fn().mockResolvedValue({
      messages: [],
      memories: []
    }),
    snapshot: vi.fn().mockResolvedValue(true),
    isCancelRequested: vi.fn().mockResolvedValue(false),
    complete: vi.fn().mockImplementation(async (input) => ({
      ...assistantMessage,
      content: input.content,
      status: "completed",
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      finishReason: input.finishReason,
      updatedAt: input.now,
      syncVersion: 2n
    })),
    fail: vi.fn().mockResolvedValue(undefined),
    requestCancel: vi.fn().mockResolvedValue(generation),
    reconcileStale: vi.fn().mockResolvedValue(0),
    prepareRegeneration: vi.fn().mockResolvedValue({
      generation,
      userMessage,
      assistantMessage,
      reused: false
    })
  };
}

const model = {
  id: "mock/cdor",
  displayName: "Mock",
  contextTokens: 4096,
  maximumOutputTokens: 256,
  benchmarkCost: { inputPerMillion: 0, outputPerMillion: 0 }
};

describe("orquestación del stream", () => {
  it("emite start, deltas agrupados, usage y done persistido", async () => {
    const repository = repositoryDouble();
    const service = new ChatStreamService(
      repository as never,
      new MockAiProvider({
        response: "Hola desde mock",
        inputTokens: 12,
        outputTokens: 4
      }),
      model
    );
    const events: Array<{ event: string }> = [];

    await service.generate(
      testPrincipal(USER_ID),
      prepared,
      new AbortController().signal,
      "01J70000000000000000000006",
      {
        isClosed: () => false,
        emit: (event) => events.push(event)
      }
    );

    expect(events.map(({ event }) => event)).toEqual([
      "start",
      "delta",
      "usage",
      "done"
    ]);
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId: GENERATION_ID,
        content: "Hola desde mock",
        inputTokens: 12,
        outputTokens: 4
      })
    );
  });

  it("cancelar aborta el proveedor local y persiste cancelled", async () => {
    const repository = repositoryDouble();
    const waitingProvider: AiProvider = {
      name: "mock",
      async listModels() {
        return [{ id: "mock/cdor" }];
      },
      async *streamChat(_request, signal) {
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true }
          );
        });
        if (false) {
          yield { type: "done", finishReason: "stop" };
        }
      }
    };
    const service = new ChatStreamService(
      repository as never,
      waitingProvider,
      model
    );
    const errors: ErrorCode[] = [];
    const running = service.generate(
      testPrincipal(USER_ID),
      prepared,
      new AbortController().signal,
      "01J70000000000000000000006",
      {
        isClosed: () => false,
        emit: (event) => {
          if (event.event === "error") {
            errors.push(event.data.code);
          }
        }
      }
    );
    await Promise.resolve();

    await expect(
      service.cancel(testPrincipal(USER_ID), GENERATION_ID)
    ).resolves.toMatchObject({
      generationId: GENERATION_ID,
      cancelRequested: true,
      abortedLocally: true
    });
    await running;

    expect(errors).toEqual(["STREAM_CANCELLED"]);
    expect(repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "STREAM_CANCELLED",
        cancelled: true
      })
    );
  });

  it("ancla el prompt en el mensaje de usuario, no en el mensaje regenerado", async () => {
    const repository = repositoryDouble();
    const service = new ChatStreamService(
      repository as never,
      new MockAiProvider({ response: "ok", inputTokens: 1, outputTokens: 1 }),
      model
    );

    await service.generate(
      testPrincipal(USER_ID),
      prepared,
      new AbortController().signal,
      "01J70000000000000000000006",
      { isClosed: () => false, emit: () => {} }
    );

    expect(repository.loadPromptContext).toHaveBeenCalledWith(
      USER_ID,
      CONVERSATION_ID,
      { id: USER_MESSAGE_ID, createdAt: NOW }
    );
  });

  it("usa la herramienta web sin cambiar el modelo de la conversación", async () => {
    const repository = repositoryDouble();
    let receivedRequest: Parameters<AiProvider["streamChat"]>[0] | undefined;
    const searchProvider: AiProvider = {
      name: "openrouter",
      async listModels() {
        return [{ id: "openai/search-model" }];
      },
      async *streamChat(request) {
        receivedRequest = request;
        yield { type: "delta", text: "Resultado con fuentes" };
        yield { type: "done", finishReason: "stop" };
      }
    };
    const service = new ChatStreamService(
      repository as never,
      new MockAiProvider({ response: "sin búsqueda" }),
      model,
      { provider: searchProvider, model }
    );
    const searchPrepared: PreparedGeneration = {
      ...prepared,
      generation: {
        ...generation,
        provider: "openrouter",
        modelId: model.id
      },
      assistantMessage: {
        ...assistantMessage,
        modelProvider: "openrouter",
        modelId: model.id
      }
    };

    await service.generate(
      testPrincipal(USER_ID),
      searchPrepared,
      new AbortController().signal,
      "01J70000000000000000000006",
      { isClosed: () => false, emit: () => {} }
    );

    expect(receivedRequest).toMatchObject({
      model: model.id,
      webSearch: true
    });
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Resultado con fuentes" })
    );
  });
});

describe("preparación de la regeneración", () => {
  const request = {
    conversationId: CONVERSATION_ID,
    sourceMessageId: ASSISTANT_MESSAGE_ID,
    clientOperationId: "01J70000000000000000000007"
  };

  function serviceWith(repository: ReturnType<typeof repositoryDouble>) {
    return new ChatStreamService(
      repository as never,
      new MockAiProvider({ response: "ok", inputTokens: 1, outputTokens: 1 }),
      model
    );
  }

  it("crea una generación anclada al mensaje de usuario original", async () => {
    const repository = repositoryDouble();

    const result = await serviceWith(repository).prepareRegeneration(
      testPrincipal(USER_ID),
      request
    );

    expect(result.userMessage.id).toBe(USER_MESSAGE_ID);
    expect(repository.prepareRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        sourceMessageId: ASSISTANT_MESSAGE_ID,
        clientOperationId: request.clientOperationId,
        modelId: model.id
      })
    );
  });

  it("no reutiliza el hash del stream para la misma conversación", async () => {
    const repository = repositoryDouble();
    await serviceWith(repository).prepareRegeneration(
      testPrincipal(USER_ID),
      request
    );
    const [first] = repository.prepareRegeneration.mock.calls[0] as [
      { requestHash: string }
    ];

    const other = repositoryDouble();
    await serviceWith(other).prepareRegeneration(testPrincipal(USER_ID), {
      ...request,
      sourceMessageId: "01J70000000000000000000008"
    });
    const [second] = other.prepareRegeneration.mock.calls[0] as [
      { requestHash: string }
    ];

    expect(first.requestHash).not.toBe(second.requestHash);
  });

  it("rechaza un modo sin modelo validado", async () => {
    await expect(
      serviceWith(repositoryDouble()).prepareRegeneration(
        testPrincipal(USER_ID),
        { ...request, modelMode: "creative" }
      )
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });

  it("traduce una repetición idempotente a IDEMPOTENCY_CONFLICT", async () => {
    const repository = repositoryDouble();
    repository.prepareRegeneration.mockResolvedValue({
      generation,
      userMessage,
      assistantMessage,
      reused: true
    });

    await expect(
      serviceWith(repository).prepareRegeneration(
        testPrincipal(USER_ID),
        request
      )
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("traduce un mensaje ausente a MESSAGE_NOT_FOUND", async () => {
    const repository = repositoryDouble();
    repository.prepareRegeneration.mockRejectedValue(
      new Error("MESSAGE_NOT_FOUND")
    );

    await expect(
      serviceWith(repository).prepareRegeneration(
        testPrincipal(USER_ID),
        request
      )
    ).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND" });
  });

  it("traduce una respuesta todavía activa a CONFLICT", async () => {
    const repository = repositoryDouble();
    repository.prepareRegeneration.mockRejectedValue(
      new Error("REGENERATION_SOURCE_ACTIVE")
    );

    await expect(
      serviceWith(repository).prepareRegeneration(
        testPrincipal(USER_ID),
        request
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
