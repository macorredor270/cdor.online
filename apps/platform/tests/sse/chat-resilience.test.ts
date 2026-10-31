import type { ChatStreamRequest } from "@cdor/contracts";
import { describe, expect, it, vi } from "vitest";
import { testPrincipal } from "../../src/lib/server/auth/principal";
import type {
  GenerationMessageRow,
  GenerationRow,
  PreparedGeneration
} from "../../src/lib/server/db/repositories/generations";
import { MockAiProvider } from "../../src/lib/server/ai/mock";
import type {
  AiChatRequest,
  AiChunk,
  AiProvider
} from "../../src/lib/server/ai/types";
import { FallbackProvider } from "../../src/lib/server/ai/fallback";
import { AppError } from "../../src/lib/server/errors/app-error";
import { ChatStreamService } from "../../src/lib/server/services/chat-stream";

const CREATED = new Date("2026-07-27T22:00:00.000Z");
const USER_ID = "01J80000000000000000000000";
const CONVERSATION_ID = "01J80000000000000000000001";
const USER_MESSAGE_ID = "01J80000000000000000000002";
const ASSISTANT_MESSAGE_ID = "01J80000000000000000000003";
const GENERATION_ID = "01J80000000000000000000004";
const REQUEST_ID = "01J80000000000000000000006";

const userMessage: GenerationMessageRow = {
  id: USER_MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  userId: USER_ID,
  clientOperationId: "01J80000000000000000000005",
  role: "user",
  content: "Hola",
  status: "completed",
  modelProvider: null,
  modelId: null,
  inputTokens: null,
  outputTokens: null,
  finishReason: null,
  errorCode: null,
  createdAt: CREATED,
  updatedAt: CREATED,
  deletedAt: null,
  syncVersion: 1n
};
const assistantMessage: GenerationMessageRow = {
  ...userMessage,
  id: ASSISTANT_MESSAGE_ID,
  clientOperationId: null,
  role: "assistant",
  content: "",
  status: "streaming"
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
  startedAt: CREATED,
  completedAt: null,
  latencyFirstTokenMs: null,
  latencyTotalMs: null,
  inputTokens: null,
  outputTokens: null,
  errorCode: null,
  createdAt: CREATED
};
const prepared: PreparedGeneration = {
  generation,
  userMessage,
  assistantMessage,
  reused: false
};

const model = {
  id: "mock/cdor",
  displayName: "Mock",
  contextTokens: 4096,
  maximumOutputTokens: 256,
  benchmarkCost: { inputPerMillion: 0, outputPerMillion: 0 }
};

const request: ChatStreamRequest = {
  conversationId: CONVERSATION_ID,
  message: {
    id: USER_MESSAGE_ID,
    clientOperationId: "01J80000000000000000000005",
    content: "Hola"
  }
};

const reservation = { userId: USER_ID, windowStart: CREATED, counted: true };

function repositoryDouble() {
  return {
    reconcileStale: vi.fn().mockResolvedValue(0),
    prepare: vi.fn().mockResolvedValue(prepared),
    loadPromptContext: vi.fn().mockResolvedValue({ messages: [], memories: [] }),
    snapshot: vi.fn().mockResolvedValue(true),
    isCancelRequested: vi.fn().mockResolvedValue(false),
    complete: vi.fn().mockImplementation(async (input) => ({
      ...assistantMessage,
      content: input.content,
      status: "completed",
      syncVersion: 2n
    })),
    fail: vi.fn().mockResolvedValue(undefined)
  };
}

function quotaDouble() {
  return {
    reserveMessage: vi.fn().mockResolvedValue(reservation),
    refundMessage: vi.fn().mockResolvedValue(undefined),
    refundMessageAt: vi.fn().mockResolvedValue(undefined),
    recordTokens: vi.fn().mockResolvedValue(undefined)
  };
}

/** Proveedor que falla, opcionalmente tras haber dado texto. */
class FailingProvider implements AiProvider {
  readonly name = "mock";

  constructor(private readonly partial = "") {}

  async listModels() {
    return [{ id: "mock/cdor" }];
  }

  async *streamChat(
    _request: AiChatRequest,
    _signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    if (this.partial) yield { type: "delta", text: this.partial };
    throw new AppError("AI_PROVIDER_ERROR", "El proveedor falló");
  }
}

function build(
  provider: AiProvider,
  repository = repositoryDouble(),
  quota = quotaDouble()
) {
  return {
    repository,
    quota,
    service: new ChatStreamService(
      repository as never,
      provider,
      model,
      undefined,
      quota as never
    )
  };
}

async function run(service: ChatStreamService) {
  const events: Array<{ event: string }> = [];
  await service.generate(
    testPrincipal(USER_ID),
    prepared,
    new AbortController().signal,
    REQUEST_ID,
    { isClosed: () => false, emit: (event) => events.push(event) }
  );
  return events.map(({ event }) => event);
}

describe("cuotas en el servicio de chat", () => {
  it("una cuota agotada corta antes de tocar la base de datos", async () => {
    const { service, repository, quota } = build(new MockAiProvider());
    quota.reserveMessage.mockRejectedValue(
      new AppError("RATE_LIMITED", "Has alcanzado el límite")
    );

    await expect(
      service.prepare(testPrincipal(USER_ID), request)
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(repository.reconcileStale).not.toHaveBeenCalled();
    expect(repository.prepare).not.toHaveBeenCalled();
    expect(quota.refundMessage).not.toHaveBeenCalled();
  });

  it("cuenta el mensaje al preparar y no lo devuelve si todo va bien", async () => {
    const { service, quota } = build(new MockAiProvider());
    await service.prepare(testPrincipal(USER_ID), request);
    expect(quota.reserveMessage).toHaveBeenCalledWith(USER_ID);
    expect(quota.refundMessage).not.toHaveBeenCalled();
  });

  it("devuelve el mensaje si la preparación falla", async () => {
    const { service, repository, quota } = build(new MockAiProvider());
    repository.prepare.mockRejectedValue(new Error("CONVERSATION_NOT_FOUND"));

    await expect(
      service.prepare(testPrincipal(USER_ID), request)
    ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    expect(quota.refundMessage).toHaveBeenCalledWith(reservation);
  });

  it("devuelve el mensaje si la petición es una repetición idempotente", async () => {
    const { service, repository, quota } = build(new MockAiProvider());
    repository.prepare.mockResolvedValue({ ...prepared, reused: true });

    await expect(
      service.prepare(testPrincipal(USER_ID), request)
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(quota.refundMessage).toHaveBeenCalledTimes(1);
  });

  it("suma los tokens reales al completar la respuesta", async () => {
    const { service, quota } = build(
      new MockAiProvider({ response: "Hola", inputTokens: 12, outputTokens: 4 })
    );
    expect(await run(service)).toEqual(["start", "delta", "usage", "done"]);
    expect(quota.recordTokens).toHaveBeenCalledWith(USER_ID, 16);
    expect(quota.refundMessageAt).not.toHaveBeenCalled();
  });

  it("un fallo al anotar la cuota no rompe una respuesta ya entregada", async () => {
    const { service, quota } = build(new MockAiProvider({ response: "Hola" }));
    quota.recordTokens.mockRejectedValue(new Error("base de datos caída"));
    expect(await run(service)).toEqual(["start", "delta", "usage", "done"]);
  });

  it("si el proveedor falla sin dar nada, el mensaje no cuesta cuota", async () => {
    const { service, repository, quota } = build(new FailingProvider());
    expect(await run(service)).toEqual(["start", "error"]);
    expect(quota.refundMessageAt).toHaveBeenCalledWith(USER_ID, CREATED);
    expect(quota.recordTokens).not.toHaveBeenCalled();
    expect(repository.fail).toHaveBeenCalledTimes(1);
  });

  it("si el proveedor corta a mitad, se cobra lo generado y no se devuelve", async () => {
    const { service, quota } = build(new FailingProvider("respuesta a medias"));
    expect(await run(service)).toContain("error");
    expect(quota.refundMessageAt).not.toHaveBeenCalled();
    expect(quota.recordTokens).toHaveBeenCalledTimes(1);
    const [, tokens] = quota.recordTokens.mock.calls[0] as [string, number];
    expect(tokens).toBeGreaterThan(0);
  });

  it("un error al devolver el mensaje no oculta el error del proveedor", async () => {
    const { service, quota } = build(new FailingProvider());
    quota.refundMessageAt.mockRejectedValue(new Error("base de datos caída"));
    expect(await run(service)).toEqual(["start", "error"]);
  });

  it("si piden búsqueda web y no está activada, se atiende sin ella", async () => {
    const { service, repository } = build(new MockAiProvider());
    await expect(
      service.prepare(testPrincipal(USER_ID), { ...request, webSearch: true })
    ).resolves.toBe(prepared);
    expect(repository.prepare).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "mock", modelId: "mock/cdor" })
    );
  });

  it("sin servicio de cuotas el chat funciona igual", async () => {
    const repository = repositoryDouble();
    const service = new ChatStreamService(
      repository as never,
      new MockAiProvider({ response: "Hola" }),
      model
    );
    await expect(
      service.prepare(testPrincipal(USER_ID), request)
    ).resolves.toBe(prepared);
    expect(await run(service)).toEqual(["start", "delta", "usage", "done"]);
  });
});

describe("respaldo entre proveedores en el servicio de chat", () => {
  class NamedProvider implements AiProvider {
    constructor(
      readonly name: string,
      private readonly behaviour: "ok" | "rate-limited"
    ) {}

    async listModels() {
      return [{ id: "mock/cdor" }];
    }

    async *streamChat(): AsyncIterable<AiChunk> {
      if (this.behaviour === "rate-limited") {
        throw new AppError("RATE_LIMITED", "saturado", {
          details: { retryAfterMs: 5_000 }
        });
      }
      yield { type: "delta", text: "respuesta del respaldo" };
      yield { type: "usage", inputTokens: 10, outputTokens: 5 };
      yield { type: "done", finishReason: "stop" };
    }
  }

  it("si el principal está saturado responde el respaldo y se anota quién sirvió", async () => {
    const repository = repositoryDouble();
    const quota = quotaDouble();
    const service = new ChatStreamService(
      repository as never,
      new FallbackProvider([
        { provider: new NamedProvider("nvidia", "rate-limited") },
        { provider: new NamedProvider("openrouter", "ok"), model: "openrouter/free" }
      ]),
      model,
      undefined,
      quota as never
    );

    const events = await run(service);
    expect(events).toEqual(["start", "delta", "usage", "done"]);
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "respuesta del respaldo",
        served: { provider: "openrouter", modelId: "openrouter/free" }
      })
    );
    // El usuario no paga cuota por el fallo del proveedor principal.
    expect(quota.recordTokens).toHaveBeenCalledWith(USER_ID, 15);
    expect(quota.refundMessageAt).not.toHaveBeenCalled();
  });

  it("si todos los proveedores fallan, el usuario ve el error y no gasta cuota", async () => {
    const repository = repositoryDouble();
    const quota = quotaDouble();
    const service = new ChatStreamService(
      repository as never,
      new FallbackProvider([
        { provider: new NamedProvider("nvidia", "rate-limited") },
        { provider: new NamedProvider("openrouter", "rate-limited") }
      ]),
      model,
      undefined,
      quota as never
    );

    const errors: string[] = [];
    await service.generate(
      testPrincipal(USER_ID),
      prepared,
      new AbortController().signal,
      REQUEST_ID,
      {
        isClosed: () => false,
        emit: (event) => {
          if (event.event === "error") errors.push(event.data.code);
        }
      }
    );
    expect(errors).toEqual(["RATE_LIMITED"]);
    expect(quota.refundMessageAt).toHaveBeenCalledWith(USER_ID, CREATED);
    expect(repository.complete).not.toHaveBeenCalled();
  });

  it("sin respaldo, un servicio no registra ruta", async () => {
    const repository = repositoryDouble();
    const service = new ChatStreamService(
      repository as never,
      new MockAiProvider({ response: "Hola" }),
      model
    );
    await run(service);
    expect(repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({ served: undefined })
    );
  });
});
