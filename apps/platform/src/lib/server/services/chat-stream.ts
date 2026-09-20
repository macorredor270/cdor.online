import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  ChatMessageSchema,
  ChatRegenerateRequestSchema,
  ChatStreamRequestSchema,
  CONTRACT_LIMITS,
  type ChatMessage,
  type ChatRegenerateRequest,
  type ChatStreamEvent,
  type ChatStreamRequest,
  type ErrorCode
} from "@cdor/contracts";
import { ulid } from "ulid";
import type { Principal } from "../auth/principal";
import {
  GenerationRepository,
  type GenerationMessageRow,
  type PreparedGeneration
} from "../db/repositories/generations";
import { AppError } from "../errors/app-error";
import { isSupportedModelMode } from "../ai/catalog";
import { createScaffoldingFilter } from "../ai/output-filter";
import { buildPrompt } from "../ai/prompt-builder";
import { estimateMessagesTokens } from "../ai/token-budget";
import type { AiProvider } from "../ai/types";
import type { AllowedModel } from "../ai/model-router";
import { DeltaBatcher } from "../stream/delta-batcher";
import {
  abortLocalGeneration,
  registerGeneration,
  unregisterGeneration
} from "../stream/generation-registry";

const SNAPSHOT_INTERVAL_MS = 1_000;
const SNAPSHOT_BYTES = 4 * 1024;
const DELTA_BATCH_WINDOW_MS = 30;
const DELTA_BATCH_BYTES = 512;
const CANCEL_POLL_INTERVAL_MS = 1_000;
const STALE_GENERATION_MS = 5 * 60 * 1000;
// El prompt describe explícitamente su propio andamiaje. Sin esta parte, un
// modelo pequeño trata los bloques `[Memoria:…]` como un patrón de estilo y los
// reproduce en la respuesta, y verbaliza el nombre de la herramienta de
// búsqueda en vez de invocarla. `output-filter.ts` es la defensa posterior.
const SYSTEM_PROMPT =
  "Eres MAC, un asistente útil. Responde con precisión y no inventes hechos. " +
  "Los bloques que empiezan por [Memoria:…] o [Resumen de contexto anterior] " +
  "son contexto interno del sistema, no mensajes del usuario ni ejemplos de " +
  "formato: aprovéchalos si ayudan, pero nunca los repitas, cites ni menciones. " +
  "No escribas nombres de herramientas ni llamadas a herramientas como texto; " +
  "responde solo con el contenido dirigido a la persona.";

export type StreamSink = Readonly<{
  emit: (event: ChatStreamEvent) => void;
  isClosed: () => boolean;
}>;

function serializeMessage(row: GenerationMessageRow): ChatMessage {
  return ChatMessageSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    syncVersion: row.syncVersion.toString()
  });
}

function requestHash(request: ChatStreamRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        conversationId: request.conversationId,
        messageId: request.message.id,
        content: request.message.content,
        modelMode: request.modelMode ?? null,
        webSearch: request.webSearch ?? false
      })
    )
    .digest("hex");
}

function regenerateHash(request: ChatRegenerateRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        route: "regenerate",
        conversationId: request.conversationId,
        sourceMessageId: request.sourceMessageId,
        modelMode: request.modelMode ?? null,
        webSearch: request.webSearch ?? false
      })
    )
    .digest("hex");
}

function mapRepositoryError(error: unknown): never {
  if (error instanceof Error) {
    if (error.message === "CONVERSATION_NOT_FOUND") {
      throw new AppError(
        "CONVERSATION_NOT_FOUND",
        "La conversación no existe"
      );
    }
    if (error.message === "IDEMPOTENCY_CONFLICT") {
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "La operación idempotente no coincide"
      );
    }
    if (error.message === "GENERATION_CONCURRENCY_LIMIT") {
      throw new AppError(
        "RATE_LIMITED",
        "Hay demasiadas generaciones activas"
      );
    }
    if (error.message === "MESSAGE_NOT_FOUND") {
      throw new AppError(
        "MESSAGE_NOT_FOUND",
        "El mensaje que se intenta regenerar no existe"
      );
    }
    if (error.message === "REGENERATION_SOURCE_ACTIVE") {
      throw new AppError(
        "CONFLICT",
        "La respuesta todavía se está generando"
      );
    }
    if (error.message === "REGENERATION_ANCHOR_NOT_FOUND") {
      throw new AppError(
        "MESSAGE_NOT_FOUND",
        "La respuesta no tiene un mensaje de usuario que regenerar"
      );
    }
  }
  throw error;
}

function stableError(error: unknown, aborted: boolean): {
  code: ErrorCode;
  message: string;
  cancelled: boolean;
} {
  if (aborted) {
    return {
      code: "STREAM_CANCELLED",
      message: "La generación fue cancelada",
      cancelled: true
    };
  }
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      cancelled: error.code === "STREAM_CANCELLED"
    };
  }
  return {
    code: "AI_PROVIDER_ERROR",
    message: "El proveedor de IA no pudo completar la generación",
    cancelled: false
  };
}

export class ChatStreamService {
  constructor(
    private readonly repository: GenerationRepository,
    private readonly provider: AiProvider,
    private readonly model: AllowedModel,
    private readonly webSearchRuntime?: Readonly<{
      provider: AiProvider;
      model: AllowedModel;
    }>
  ) {}

  async prepare(
    principal: Principal,
    rawRequest: ChatStreamRequest
  ): Promise<PreparedGeneration> {
    const request = ChatStreamRequestSchema.parse(rawRequest);
    this.#assertSupportedMode(request.modelMode);
    const runtime = this.#runtimeFor(request.webSearch);
    try {
      const now = new Date();
      await this.repository.reconcileStale(
        principal.userId,
        new Date(now.getTime() - STALE_GENERATION_MS),
        now,
        10
      );
      const prepared = await this.repository.prepare({
        generationId: ulid(),
        userMessageId: request.message.id,
        assistantMessageId: ulid(),
        clientOperationId: request.message.clientOperationId,
        requestHash: requestHash(request),
        userId: principal.userId,
        conversationId: request.conversationId,
        content: request.message.content,
        provider: runtime.provider.name,
        modelId: runtime.model.id,
        now
      });
      if (prepared.reused) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La generación ya existe",
          {
            details: {
              generationId: prepared.generation.id,
              state: prepared.generation.state
            }
          }
        );
      }
      return prepared;
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async prepareRegeneration(
    principal: Principal,
    rawRequest: ChatRegenerateRequest
  ): Promise<PreparedGeneration> {
    const request = ChatRegenerateRequestSchema.parse(rawRequest);
    this.#assertSupportedMode(request.modelMode);
    const runtime = this.#runtimeFor(request.webSearch);
    try {
      const now = new Date();
      await this.repository.reconcileStale(
        principal.userId,
        new Date(now.getTime() - STALE_GENERATION_MS),
        now,
        10
      );
      const prepared = await this.repository.prepareRegeneration({
        generationId: ulid(),
        assistantMessageId: ulid(),
        clientOperationId: request.clientOperationId,
        requestHash: regenerateHash(request),
        userId: principal.userId,
        conversationId: request.conversationId,
        sourceMessageId: request.sourceMessageId,
        provider: runtime.provider.name,
        modelId: runtime.model.id,
        now
      });
      if (prepared.reused) {
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La regeneración ya existe",
          {
            details: {
              generationId: prepared.generation.id,
              state: prepared.generation.state
            }
          }
        );
      }
      return prepared;
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  #assertSupportedMode(modelMode: string | undefined): void {
    if (modelMode !== undefined && !isSupportedModelMode(modelMode)) {
      throw new AppError(
        "MODEL_UNAVAILABLE",
        "El modo solicitado aún no tiene un modelo validado"
      );
    }
  }

  #runtimeFor(webSearch: boolean | undefined) {
    if (webSearch) {
      if (!this.webSearchRuntime) {
        throw new AppError(
          "MODEL_UNAVAILABLE",
          "La búsqueda web no está configurada en este entorno"
        );
      }
      return this.webSearchRuntime;
    }
    return { provider: this.provider, model: this.model };
  }

  async generate(
    principal: Principal,
    prepared: PreparedGeneration,
    requestSignal: AbortSignal,
    requestId: string,
    sink: StreamSink
  ): Promise<void> {
    const abortController = new AbortController();
    const abortFromRequest = () => abortController.abort();
    requestSignal.addEventListener("abort", abortFromRequest, { once: true });
    registerGeneration(prepared.generation.id, abortController);
    let cancellationCheckRunning = false;
    const cancellationPoll = setInterval(() => {
      if (cancellationCheckRunning || abortController.signal.aborted) {
        return;
      }
      cancellationCheckRunning = true;
      void this.repository
        .isCancelRequested(principal.userId, prepared.generation.id)
        .then((requested) => {
          if (requested) {
            abortController.abort();
          }
        })
        .finally(() => {
          cancellationCheckRunning = false;
        });
    }, CANCEL_POLL_INTERVAL_MS);

    const startedAt = performance.now();
    let firstTokenAt: number | null = null;
    let content = "";
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let finishReason: "stop" | "length" = "stop";
    let sequence = 0;
    let lastSnapshotAt = performance.now();
    let lastSnapshotBytes = 0;
    const emit = (event: ChatStreamEvent) => {
      if (!sink.isClosed()) {
        sink.emit(event);
      }
    };
    const batcher = new DeltaBatcher({
      maximumBytes: DELTA_BATCH_BYTES,
      windowMs: DELTA_BATCH_WINDOW_MS,
      flush: (text) => {
        emit({
          event: "delta",
          data: {
            messageId: prepared.assistantMessage.id,
            sequence,
            text
          }
        });
        sequence += 1;
      }
    });

    emit({
      event: "start",
      data: {
        generationId: prepared.generation.id,
        userMessageId: prepared.userMessage.id,
        assistantMessageId: prepared.assistantMessage.id,
        requestId
      }
    });

    try {
      const runtime =
        this.webSearchRuntime?.provider.name === prepared.generation.provider
          ? this.webSearchRuntime
          : { provider: this.provider, model: this.model };
      const context = await this.repository.loadPromptContext(
        principal.userId,
        prepared.generation.conversationId,
        {
          id: prepared.userMessage.id,
          createdAt: prepared.userMessage.createdAt
        }
      );
      const prompt = buildPrompt({
        systemPrompt: SYSTEM_PROMPT,
        memories: context.memories.map((memory) => ({
          content: memory.content,
          category: memory.category,
          importance: memory.importance,
          enabled: memory.enabled,
          updatedAt: memory.updatedAt
        })),
        previousMessages: context.messages
          .filter(
            (message) =>
              message.role === "user" || message.role === "assistant"
          )
          .map((message) => ({
            role: message.role as "user" | "assistant",
            content: message.content
          })),
        currentMessage: prepared.userMessage.content,
        contextTokens: runtime.model.contextTokens,
        reservedOutputTokens: runtime.model.maximumOutputTokens
      });

      const outputFilter = createScaffoldingFilter();

      for await (const chunk of runtime.provider.streamChat(
        {
          model: runtime.model.id,
          messages: prompt.messages,
          maxOutputTokens: runtime.model.maximumOutputTokens,
          temperature: 0.2,
          webSearch: runtime.provider.name === this.webSearchRuntime?.provider.name
        },
        abortController.signal
      )) {
        if (chunk.type === "delta") {
          firstTokenAt ??= performance.now();
          const text = outputFilter.push(chunk.text);
          if (text.length === 0) {
            continue;
          }
          content += text;
          const contentBytes = Buffer.byteLength(content, "utf8");
          if (contentBytes > CONTRACT_LIMITS.STORED_MESSAGE_MAX_BYTES) {
            throw new AppError(
              "AI_PROVIDER_ERROR",
              "La respuesta supera el límite de almacenamiento"
            );
          }
          batcher.write(text);

          const now = performance.now();
          if (
            now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS ||
            contentBytes - lastSnapshotBytes >= SNAPSHOT_BYTES
          ) {
            await this.repository.snapshot(
              principal.userId,
              prepared.generation.id,
              content,
              new Date()
            );
            lastSnapshotAt = now;
            lastSnapshotBytes = contentBytes;
          }
        } else if (chunk.type === "usage") {
          inputTokens = chunk.inputTokens;
          outputTokens = chunk.outputTokens;
        } else {
          finishReason = chunk.finishReason === "length" ? "length" : "stop";
        }
      }

      const trailing = outputFilter.flush();
      if (trailing.length > 0) {
        content += trailing;
        batcher.write(trailing);
      }

      batcher.close();
      const finalInputTokens =
        inputTokens ?? estimateMessagesTokens(prompt.messages);
      const finalOutputTokens =
        outputTokens ?? Math.max(1, Math.ceil([...content].length / 3));
      const completed = await this.repository.complete({
        userId: principal.userId,
        generationId: prepared.generation.id,
        content,
        inputTokens: finalInputTokens,
        outputTokens: finalOutputTokens,
        finishReason,
        latencyFirstTokenMs:
          firstTokenAt === null ? null : Math.round(firstTokenAt - startedAt),
        latencyTotalMs: Math.round(performance.now() - startedAt),
        now: new Date()
      });
      emit({
        event: "usage",
        data: {
          inputTokens: finalInputTokens,
          outputTokens: finalOutputTokens
        }
      });
      emit({
        event: "done",
        data: {
          finishReason,
          message: serializeMessage(completed)
        }
      });
    } catch (error) {
      batcher.close();
      const stable = stableError(error, abortController.signal.aborted);
      await this.repository.fail({
        userId: principal.userId,
        generationId: prepared.generation.id,
        content,
        code: stable.code,
        cancelled: stable.cancelled,
        now: new Date()
      });
      emit({
        event: "error",
        data: {
          code: stable.code,
          message: stable.message,
          requestId,
          details: null
        }
      });
    } finally {
      unregisterGeneration(prepared.generation.id, abortController);
      clearInterval(cancellationPoll);
      requestSignal.removeEventListener("abort", abortFromRequest);
    }
  }

  async cancel(principal: Principal, generationId: string) {
    const generation = await this.repository.requestCancel(
      principal.userId,
      generationId,
      new Date()
    );
    if (!generation) {
      throw new AppError(
        "MESSAGE_NOT_FOUND",
        "La generación no existe"
      );
    }
    const abortedLocally = abortLocalGeneration(generationId);
    return Object.freeze({
      generationId,
      state: generation.state,
      cancelRequested: generation.state === "streaming",
      abortedLocally
    });
  }
}
