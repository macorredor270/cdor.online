import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  lte,
  or
} from "drizzle-orm";
import type { ErrorCode, FinishReason } from "@cdor/contracts";
import type { Database } from "../client";
import {
  conversations,
  generationRequests,
  idempotencyKeys,
  memories,
  messages,
  syncChanges,
  usageEvents
} from "../schema";
import { user } from "../schema/auth";
import type { DatabaseTransaction } from "./types";

const MAXIMUM_ACTIVE_GENERATIONS_PER_USER = 2;

export type GenerationRow = typeof generationRequests.$inferSelect;
export type GenerationMessageRow = typeof messages.$inferSelect;

export type PreparedGeneration = Readonly<{
  generation: GenerationRow;
  userMessage: GenerationMessageRow;
  assistantMessage: GenerationMessageRow;
  reused: boolean;
}>;

export class GenerationRepository {
  constructor(private readonly database: Database) {}

  async prepare(input: {
    generationId: string;
    userMessageId: string;
    assistantMessageId: string;
    clientOperationId: string;
    requestHash: string;
    userId: string;
    conversationId: string;
    content: string;
    provider: string;
    modelId: string;
    now: Date;
  }): Promise<PreparedGeneration> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, input.userId),
            isNull(conversations.deletedAt)
          )
        )
        .limit(1)
        .for("update");
      if (!conversation) {
        throw new Error("CONVERSATION_NOT_FOUND");
      }
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1)
        .for("update");

      const [existingKey] = await transaction
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, input.userId),
            eq(idempotencyKeys.idempotencyKey, input.clientOperationId)
          )
        )
        .limit(1)
        .for("update");

      if (existingKey) {
        if (
          existingKey.requestHash !== input.requestHash ||
          !existingKey.resourceId
        ) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        const [generation] = await transaction
          .select()
          .from(generationRequests)
          .where(
            and(
              eq(generationRequests.id, existingKey.resourceId),
              eq(generationRequests.userId, input.userId)
            )
          )
          .limit(1);
        const [userMessage] = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.clientOperationId, input.clientOperationId),
              eq(messages.userId, input.userId)
            )
          )
          .limit(1);
        const [assistantMessage] = generation
          ? await transaction
              .select()
              .from(messages)
              .where(
                and(
                  eq(messages.id, generation.assistantMessageId),
                  eq(messages.userId, input.userId)
                )
              )
              .limit(1)
          : [];
        if (!generation || !userMessage || !assistantMessage) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return {
          generation,
          userMessage,
          assistantMessage,
          reused: true
        };
      }

      const activeGenerations = await transaction
        .select({ id: generationRequests.id })
        .from(generationRequests)
        .where(
          and(
            eq(generationRequests.userId, input.userId),
            eq(generationRequests.state, "streaming")
          )
        )
        .limit(MAXIMUM_ACTIVE_GENERATIONS_PER_USER);
      if (
        activeGenerations.length >= MAXIMUM_ACTIVE_GENERATIONS_PER_USER
      ) {
        throw new Error("GENERATION_CONCURRENCY_LIMIT");
      }

      const expiresAt = new Date(input.now.getTime() + 24 * 60 * 60 * 1000);
      await transaction.insert(idempotencyKeys).values({
        userId: input.userId,
        idempotencyKey: input.clientOperationId,
        route: "/api/v1/chat/stream",
        requestHash: input.requestHash,
        state: "processing",
        resourceId: input.generationId,
        createdAt: input.now,
        expiresAt
      });
      await transaction.insert(messages).values([
        {
          id: input.userMessageId,
          conversationId: input.conversationId,
          userId: input.userId,
          clientOperationId: input.clientOperationId,
          role: "user",
          content: input.content,
          status: "completed",
          createdAt: input.now,
          updatedAt: input.now,
          syncVersion: 1n
        },
        {
          id: input.assistantMessageId,
          conversationId: input.conversationId,
          userId: input.userId,
          clientOperationId: null,
          role: "assistant",
          content: "",
          status: "streaming",
          modelProvider: input.provider,
          modelId: input.modelId,
          createdAt: input.now,
          updatedAt: input.now,
          syncVersion: 1n
        }
      ]);
      await transaction.insert(generationRequests).values({
        id: input.generationId,
        userId: input.userId,
        conversationId: input.conversationId,
        assistantMessageId: input.assistantMessageId,
        provider: input.provider,
        modelId: input.modelId,
        state: "streaming",
        startedAt: input.now,
        createdAt: input.now
      });
      await transaction.insert(syncChanges).values([
        {
          userId: input.userId,
          entityType: "message",
          entityId: input.userMessageId,
          operation: "upsert",
          entityVersion: 1n,
          createdAt: input.now
        },
        {
          userId: input.userId,
          entityType: "message",
          entityId: input.assistantMessageId,
          operation: "upsert",
          entityVersion: 1n,
          createdAt: input.now
        }
      ]);

      const conversationVersion = conversation.syncVersion + 1n;
      await transaction
        .update(conversations)
        .set({
          updatedAt: input.now,
          syncVersion: conversationVersion
        })
        .where(eq(conversations.id, conversation.id));
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "conversation",
        entityId: conversation.id,
        operation: "upsert",
        entityVersion: conversationVersion,
        createdAt: input.now
      });

      const [generation] = await transaction
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, input.generationId))
        .limit(1);
      const createdMessages = await transaction
        .select()
        .from(messages)
        .where(
          inArray(messages.id, [
            input.userMessageId,
            input.assistantMessageId
          ])
        );
      const userMessage = createdMessages.find(
        ({ id }) => id === input.userMessageId
      );
      const assistantMessage = createdMessages.find(
        ({ id }) => id === input.assistantMessageId
      );
      if (!generation || !userMessage || !assistantMessage) {
        throw new Error("GENERATION_PREPARE_FAILED");
      }
      return {
        generation,
        userMessage,
        assistantMessage,
        reused: false
      };
    });
  }

  /**
   * Regenera la respuesta de un mensaje assistant existente. Los mensajes son
   * append-only: no se sobrescribe la respuesta anterior, se añade una nueva
   * anclada al mismo mensaje de usuario.
   */
  async prepareRegeneration(input: {
    generationId: string;
    assistantMessageId: string;
    clientOperationId: string;
    requestHash: string;
    userId: string;
    conversationId: string;
    sourceMessageId: string;
    provider: string;
    modelId: string;
    now: Date;
  }): Promise<PreparedGeneration> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.conversationId),
            eq(conversations.userId, input.userId),
            isNull(conversations.deletedAt)
          )
        )
        .limit(1)
        .for("update");
      if (!conversation) {
        throw new Error("CONVERSATION_NOT_FOUND");
      }
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1)
        .for("update");

      const [existingKey] = await transaction
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, input.userId),
            eq(idempotencyKeys.idempotencyKey, input.clientOperationId)
          )
        )
        .limit(1)
        .for("update");

      if (existingKey) {
        if (
          existingKey.requestHash !== input.requestHash ||
          !existingKey.resourceId
        ) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        const [generation] = await transaction
          .select()
          .from(generationRequests)
          .where(
            and(
              eq(generationRequests.id, existingKey.resourceId),
              eq(generationRequests.userId, input.userId)
            )
          )
          .limit(1);
        if (!generation) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        const [assistantMessage] = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, generation.assistantMessageId),
              eq(messages.userId, input.userId)
            )
          )
          .limit(1);
        const [source] = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, input.sourceMessageId),
              eq(messages.userId, input.userId)
            )
          )
          .limit(1);
        if (!assistantMessage || !source) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        const anchor = await this.#findRegenerationAnchor(
          transaction,
          input.userId,
          input.conversationId,
          source
        );
        return {
          generation,
          userMessage: anchor,
          assistantMessage,
          reused: true
        };
      }

      const [source] = await transaction
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, input.sourceMessageId),
            eq(messages.userId, input.userId),
            eq(messages.conversationId, input.conversationId),
            eq(messages.role, "assistant"),
            isNull(messages.deletedAt)
          )
        )
        .limit(1);
      if (!source) {
        throw new Error("MESSAGE_NOT_FOUND");
      }
      if (source.status === "streaming" || source.status === "pending") {
        throw new Error("REGENERATION_SOURCE_ACTIVE");
      }

      const anchor = await this.#findRegenerationAnchor(
        transaction,
        input.userId,
        input.conversationId,
        source
      );

      const activeGenerations = await transaction
        .select({ id: generationRequests.id })
        .from(generationRequests)
        .where(
          and(
            eq(generationRequests.userId, input.userId),
            eq(generationRequests.state, "streaming")
          )
        )
        .limit(MAXIMUM_ACTIVE_GENERATIONS_PER_USER);
      if (activeGenerations.length >= MAXIMUM_ACTIVE_GENERATIONS_PER_USER) {
        throw new Error("GENERATION_CONCURRENCY_LIMIT");
      }

      const expiresAt = new Date(input.now.getTime() + 24 * 60 * 60 * 1000);
      await transaction.insert(idempotencyKeys).values({
        userId: input.userId,
        idempotencyKey: input.clientOperationId,
        route: "/api/v1/chat/regenerate",
        requestHash: input.requestHash,
        state: "processing",
        resourceId: input.generationId,
        createdAt: input.now,
        expiresAt
      });
      await transaction.insert(messages).values({
        id: input.assistantMessageId,
        conversationId: input.conversationId,
        userId: input.userId,
        clientOperationId: null,
        role: "assistant",
        content: "",
        status: "streaming",
        modelProvider: input.provider,
        modelId: input.modelId,
        createdAt: input.now,
        updatedAt: input.now,
        syncVersion: 1n
      });
      await transaction.insert(generationRequests).values({
        id: input.generationId,
        userId: input.userId,
        conversationId: input.conversationId,
        assistantMessageId: input.assistantMessageId,
        provider: input.provider,
        modelId: input.modelId,
        state: "streaming",
        startedAt: input.now,
        createdAt: input.now
      });
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "message",
        entityId: input.assistantMessageId,
        operation: "upsert",
        entityVersion: 1n,
        createdAt: input.now
      });

      const conversationVersion = conversation.syncVersion + 1n;
      await transaction
        .update(conversations)
        .set({
          updatedAt: input.now,
          syncVersion: conversationVersion
        })
        .where(eq(conversations.id, conversation.id));
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "conversation",
        entityId: conversation.id,
        operation: "upsert",
        entityVersion: conversationVersion,
        createdAt: input.now
      });

      const [generation] = await transaction
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.id, input.generationId))
        .limit(1);
      const [assistantMessage] = await transaction
        .select()
        .from(messages)
        .where(eq(messages.id, input.assistantMessageId))
        .limit(1);
      if (!generation || !assistantMessage) {
        throw new Error("GENERATION_PREPARE_FAILED");
      }
      return {
        generation,
        userMessage: anchor,
        assistantMessage,
        reused: false
      };
    });
  }

  /**
   * Último mensaje de usuario completado en o antes del mensaje regenerado.
   * Es el turno que la nueva respuesta debe contestar.
   */
  async #findRegenerationAnchor(
    transaction: DatabaseTransaction,
    userId: string,
    conversationId: string,
    source: GenerationMessageRow
  ): Promise<GenerationMessageRow> {
    const [anchor] = await transaction
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          eq(messages.conversationId, conversationId),
          eq(messages.role, "user"),
          eq(messages.status, "completed"),
          isNull(messages.deletedAt),
          or(
            lt(messages.createdAt, source.createdAt),
            and(
              eq(messages.createdAt, source.createdAt),
              lte(messages.id, source.id)
            )
          )
        )
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(1);
    if (!anchor) {
      throw new Error("REGENERATION_ANCHOR_NOT_FOUND");
    }
    return anchor;
  }

  /**
   * Carga el contexto estrictamente anterior al mensaje ancla. Para un turno
   * normal el ancla es el mensaje recién creado; al regenerar es el mensaje de
   * usuario que originó la respuesta, de modo que la respuesta sustituida y
   * todo lo posterior quedan fuera del prompt.
   */
  async loadPromptContext(
    userId: string,
    conversationId: string,
    anchor: Readonly<{ id: string; createdAt: Date }>
  ) {
    const [messageRows, memoryRows] = await Promise.all([
      this.database
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.userId, userId),
            eq(messages.conversationId, conversationId),
            or(
              lt(messages.createdAt, anchor.createdAt),
              and(
                eq(messages.createdAt, anchor.createdAt),
                lt(messages.id, anchor.id)
              )
            ),
            eq(messages.status, "completed"),
            isNull(messages.deletedAt)
          )
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(30),
      this.database
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.userId, userId),
            eq(memories.enabled, true),
            isNull(memories.deletedAt)
          )
        )
        .orderBy(desc(memories.importance), desc(memories.updatedAt))
        .limit(20)
    ]);
    return {
      messages: messageRows.reverse(),
      memories: memoryRows
    };
  }

  async snapshot(
    userId: string,
    generationId: string,
    content: string,
    now: Date
  ): Promise<boolean> {
    const [generation] = await this.database
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, generationId),
          eq(generationRequests.userId, userId),
          eq(generationRequests.state, "streaming")
        )
      )
      .limit(1);
    if (!generation) {
      return false;
    }
    await this.database
      .update(messages)
      .set({ content, updatedAt: now })
      .where(
        and(
          eq(messages.id, generation.assistantMessageId),
          eq(messages.userId, userId),
          eq(messages.status, "streaming")
        )
      );
    return true;
  }

  async isCancelRequested(
    userId: string,
    generationId: string
  ): Promise<boolean> {
    const [generation] = await this.database
      .select({ cancelRequestedAt: generationRequests.cancelRequestedAt })
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, generationId),
          eq(generationRequests.userId, userId)
        )
      )
      .limit(1);
    return generation?.cancelRequestedAt !== null;
  }

  async requestCancel(
    userId: string,
    generationId: string,
    now: Date
  ): Promise<GenerationRow | null> {
    await this.database
      .update(generationRequests)
      .set({ cancelRequestedAt: now })
      .where(
        and(
          eq(generationRequests.id, generationId),
          eq(generationRequests.userId, userId),
          eq(generationRequests.state, "streaming")
        )
      );
    const [generation] = await this.database
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.id, generationId),
          eq(generationRequests.userId, userId)
        )
      )
      .limit(1);
    return generation ?? null;
  }

  async complete(input: {
    userId: string;
    generationId: string;
    content: string;
    inputTokens: number;
    outputTokens: number;
    finishReason: FinishReason;
    latencyFirstTokenMs: number | null;
    latencyTotalMs: number;
    now: Date;
  }): Promise<GenerationMessageRow> {
    return this.database.transaction(async (transaction) => {
      const [generation] = await transaction
        .select()
        .from(generationRequests)
        .where(
          and(
            eq(generationRequests.id, input.generationId),
            eq(generationRequests.userId, input.userId)
          )
        )
        .limit(1)
        .for("update");
      if (!generation) {
        throw new Error("GENERATION_NOT_FOUND");
      }
      const [current] = await transaction
        .select()
        .from(messages)
        .where(eq(messages.id, generation.assistantMessageId))
        .limit(1)
        .for("update");
      if (!current) {
        throw new Error("MESSAGE_NOT_FOUND");
      }
      if (generation.state !== "streaming") {
        return current;
      }

      const nextVersion = current.syncVersion + 1n;
      await transaction
        .update(messages)
        .set({
          content: input.content,
          status: "completed",
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          finishReason: input.finishReason,
          errorCode: null,
          updatedAt: input.now,
          syncVersion: nextVersion
        })
        .where(eq(messages.id, current.id));
      await transaction
        .update(generationRequests)
        .set({
          state: "completed",
          completedAt: input.now,
          latencyFirstTokenMs: input.latencyFirstTokenMs,
          latencyTotalMs: input.latencyTotalMs,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          errorCode: null
        })
        .where(eq(generationRequests.id, input.generationId));
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "message",
        entityId: current.id,
        operation: "upsert",
        entityVersion: nextVersion,
        createdAt: input.now
      });
      await transaction.insert(usageEvents).values({
        id: input.generationId,
        userId: input.userId,
        generationId: input.generationId,
        kind: "chat",
        provider: generation.provider,
        modelId: generation.modelId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        createdAt: input.now
      });
      await transaction
        .update(idempotencyKeys)
        .set({
          state: "completed",
          responseStatus: 200,
          responseBody: {
            generationId: input.generationId,
            state: "completed"
          }
        })
        .where(
          and(
            eq(idempotencyKeys.userId, input.userId),
            eq(idempotencyKeys.resourceId, input.generationId)
          )
        );

      return {
        ...current,
        content: input.content,
        status: "completed",
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        finishReason: input.finishReason,
        errorCode: null,
        updatedAt: input.now,
        syncVersion: nextVersion
      };
    });
  }

  async fail(input: {
    userId: string;
    generationId: string;
    content: string;
    code: ErrorCode;
    cancelled: boolean;
    now: Date;
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [generation] = await transaction
        .select()
        .from(generationRequests)
        .where(
          and(
            eq(generationRequests.id, input.generationId),
            eq(generationRequests.userId, input.userId)
          )
        )
        .limit(1)
        .for("update");
      if (!generation || generation.state !== "streaming") {
        return;
      }
      const [message] = await transaction
        .select()
        .from(messages)
        .where(eq(messages.id, generation.assistantMessageId))
        .limit(1)
        .for("update");
      if (!message) {
        return;
      }
      const nextVersion = message.syncVersion + 1n;
      const status = input.cancelled ? "cancelled" : "failed";
      await transaction
        .update(messages)
        .set({
          content: input.content,
          status,
          finishReason: input.cancelled ? "cancelled" : "error",
          errorCode: input.code,
          updatedAt: input.now,
          syncVersion: nextVersion
        })
        .where(eq(messages.id, message.id));
      await transaction
        .update(generationRequests)
        .set({
          state: status,
          completedAt: input.now,
          errorCode: input.code
        })
        .where(eq(generationRequests.id, generation.id));
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "message",
        entityId: message.id,
        operation: "upsert",
        entityVersion: nextVersion,
        createdAt: input.now
      });
      await transaction
        .update(idempotencyKeys)
        .set({
          state: "failed",
          responseStatus: input.cancelled ? 409 : 502,
          responseBody: {
            generationId: input.generationId,
            state: status
          }
        })
        .where(
          and(
            eq(idempotencyKeys.userId, input.userId),
            eq(idempotencyKeys.resourceId, input.generationId)
          )
        );
    });
  }

  async reconcileStale(
    userId: string | null,
    olderThan: Date,
    now: Date,
    limit = 50
  ): Promise<number> {
    const stale = await this.database
      .select()
      .from(generationRequests)
      .where(
        and(
          eq(generationRequests.state, "streaming"),
          lt(generationRequests.createdAt, olderThan),
          userId === null
            ? undefined
            : eq(generationRequests.userId, userId)
        )
      )
      .orderBy(generationRequests.createdAt)
      .limit(limit);

    for (const generation of stale) {
      const [message] = await this.database
        .select({ content: messages.content })
        .from(messages)
        .where(eq(messages.id, generation.assistantMessageId))
        .limit(1);
      await this.fail({
        userId: generation.userId,
        generationId: generation.id,
        content: message?.content ?? "",
        code: "AI_PROVIDER_TIMEOUT",
        cancelled: false,
        now
      });
    }
    return stale.length;
  }
}
