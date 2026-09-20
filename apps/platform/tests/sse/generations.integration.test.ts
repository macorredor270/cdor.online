import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { GenerationRepository } from "../../src/lib/server/db/repositories/generations";
import {
  conversations,
  generationRequests,
  idempotencyKeys,
  messages,
  syncChanges,
  usageEvents,
  user
} from "../../src/lib/server/db/schema";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("sse");
const USER_A = "01J80000000000000000000000";
const USER_B = "01J80000000000000000000001";
const CONVERSATION = "01J80000000000000000000002";
const USER_MESSAGE = "01J80000000000000000000003";
const ASSISTANT_MESSAGE = "01J80000000000000000000004";
const OPERATION = "01J80000000000000000000005";
const GENERATION = "01J80000000000000000000006";
const REGEN_OPERATION = "01J8000000000000000000000F";
const REGEN_GENERATION = "01J8000000000000000000000G";
const REGEN_ASSISTANT_MESSAGE = "01J8000000000000000000000H";
const NOW = new Date("2026-07-27T22:30:00.000Z");
const REGEN_NOW = new Date("2026-07-27T22:40:00.000Z");

let client: ReturnType<typeof createDatabaseClient>;
let repository: GenerationRepository;

describe.sequential("generaciones con MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 2
    });
    await client.database.insert(user).values([
      {
        id: USER_A,
        name: "Usuario SSE A",
        email: "sse-a@example.test",
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW
      },
      {
        id: USER_B,
        name: "Usuario SSE B",
        email: "sse-b@example.test",
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW
      }
    ]);
    await client.database.insert(conversations).values({
      id: CONVERSATION,
      userId: USER_A,
      title: "Chat SSE",
      modelMode: "balanced",
      createdAt: NOW,
      updatedAt: NOW,
      syncVersion: 1n
    });
    repository = new GenerationRepository(client.database);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("crea mensajes, generación, idempotencia y cambios atómicos", async () => {
    const prepared = await repository.prepare({
      generationId: GENERATION,
      userMessageId: USER_MESSAGE,
      assistantMessageId: ASSISTANT_MESSAGE,
      clientOperationId: OPERATION,
      requestHash: "a".repeat(64),
      userId: USER_A,
      conversationId: CONVERSATION,
      content: "Hola",
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      now: NOW
    });
    expect(prepared).toMatchObject({
      reused: false,
      generation: { state: "streaming" },
      userMessage: { status: "completed" },
      assistantMessage: { status: "streaming" }
    });

    const [messageRows, generationRows, keyRows, changes] =
      await Promise.all([
        client.database
          .select()
          .from(messages)
          .where(eq(messages.userId, USER_A)),
        client.database
          .select()
          .from(generationRequests)
          .where(eq(generationRequests.id, GENERATION)),
        client.database
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.idempotencyKey, OPERATION)),
        client.database
          .select()
          .from(syncChanges)
          .where(eq(syncChanges.userId, USER_A))
      ]);
    expect(messageRows).toHaveLength(2);
    expect(generationRows).toHaveLength(1);
    expect(keyRows).toHaveLength(1);
    expect(changes.map(({ entityType }) => entityType).sort()).toEqual([
      "conversation",
      "message",
      "message"
    ]);
  });

  it("devuelve el estado existente y rechaza otro payload", async () => {
    const repeated = await repository.prepare({
      generationId: "01J80000000000000000000007",
      userMessageId: USER_MESSAGE,
      assistantMessageId: "01J80000000000000000000008",
      clientOperationId: OPERATION,
      requestHash: "a".repeat(64),
      userId: USER_A,
      conversationId: CONVERSATION,
      content: "Hola",
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      now: NOW
    });
    expect(repeated).toMatchObject({
      reused: true,
      generation: { id: GENERATION }
    });

    await expect(
      repository.prepare({
        generationId: "01J80000000000000000000009",
        userMessageId: USER_MESSAGE,
        assistantMessageId: "01J8000000000000000000000A",
        clientOperationId: OPERATION,
        requestHash: "b".repeat(64),
        userId: USER_A,
        conversationId: CONVERSATION,
        content: "Distinto",
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: NOW
      })
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("aísla ownership, guarda snapshot y finaliza con uso", async () => {
    await expect(
      repository.prepare({
        generationId: "01J8000000000000000000000B",
        userMessageId: "01J8000000000000000000000C",
        assistantMessageId: "01J8000000000000000000000D",
        clientOperationId: "01J8000000000000000000000E",
        requestHash: "c".repeat(64),
        userId: USER_B,
        conversationId: CONVERSATION,
        content: "No autorizado",
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: NOW
      })
    ).rejects.toThrow("CONVERSATION_NOT_FOUND");

    await expect(
      repository.snapshot(
        USER_A,
        GENERATION,
        "Respuesta parcial",
        new Date(NOW.getTime() + 1_000)
      )
    ).resolves.toBe(true);
    const completed = await repository.complete({
      userId: USER_A,
      generationId: GENERATION,
      content: "Respuesta completa",
      inputTokens: 20,
      outputTokens: 5,
      finishReason: "stop",
      latencyFirstTokenMs: 100,
      latencyTotalMs: 500,
      now: new Date(NOW.getTime() + 2_000)
    });
    expect(completed).toMatchObject({
      status: "completed",
      content: "Respuesta completa",
      syncVersion: 2n
    });

    const [storedGeneration] = await client.database
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, GENERATION));
    expect(storedGeneration).toMatchObject({
      state: "completed",
      inputTokens: 20,
      outputTokens: 5
    });
    const usage = await client.database
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, USER_A),
          eq(usageEvents.generationId, GENERATION)
        )
      );
    expect(usage).toHaveLength(1);
  });

  it("no permite a otro usuario cancelar la generación", async () => {
    await expect(
      repository.requestCancel(USER_B, GENERATION, new Date())
    ).resolves.toBeNull();
  });

  it("el contexto del prompt excluye el mensaje ancla y lo posterior", async () => {
    const context = await repository.loadPromptContext(USER_A, CONVERSATION, {
      id: USER_MESSAGE,
      createdAt: NOW
    });

    expect(context.messages.map(({ id }) => id)).not.toContain(USER_MESSAGE);
    expect(context.messages.map(({ id }) => id)).not.toContain(
      ASSISTANT_MESSAGE
    );
  });

  it("regenerar añade una respuesta nueva sin tocar la anterior", async () => {
    const regenerated = await repository.prepareRegeneration({
      generationId: REGEN_GENERATION,
      assistantMessageId: REGEN_ASSISTANT_MESSAGE,
      clientOperationId: REGEN_OPERATION,
      requestHash: "d".repeat(64),
      userId: USER_A,
      conversationId: CONVERSATION,
      sourceMessageId: ASSISTANT_MESSAGE,
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      now: REGEN_NOW
    });

    // El ancla es el mensaje de usuario original, no el assistant sustituido.
    expect(regenerated).toMatchObject({
      reused: false,
      generation: { id: REGEN_GENERATION, state: "streaming" },
      userMessage: { id: USER_MESSAGE, role: "user" },
      assistantMessage: {
        id: REGEN_ASSISTANT_MESSAGE,
        role: "assistant",
        status: "streaming",
        content: ""
      }
    });

    // Append-only: la respuesta original se conserva intacta.
    const [original] = await client.database
      .select()
      .from(messages)
      .where(eq(messages.id, ASSISTANT_MESSAGE));
    expect(original).toMatchObject({
      status: "completed",
      content: "Respuesta completa"
    });

    const changes = await client.database
      .select()
      .from(syncChanges)
      .where(
        and(
          eq(syncChanges.userId, USER_A),
          eq(syncChanges.entityId, REGEN_ASSISTANT_MESSAGE)
        )
      );
    expect(changes).toHaveLength(1);
  });

  it("el prompt regenerado no incluye la respuesta sustituida", async () => {
    const context = await repository.loadPromptContext(USER_A, CONVERSATION, {
      id: USER_MESSAGE,
      createdAt: NOW
    });

    expect(context.messages.map(({ id }) => id)).not.toContain(
      ASSISTANT_MESSAGE
    );
    expect(context.messages.map(({ id }) => id)).not.toContain(
      REGEN_ASSISTANT_MESSAGE
    );
  });

  it("repetir la operación devuelve la generación existente", async () => {
    const repeated = await repository.prepareRegeneration({
      generationId: "01J8000000000000000000000K",
      assistantMessageId: "01J8000000000000000000000M",
      clientOperationId: REGEN_OPERATION,
      requestHash: "d".repeat(64),
      userId: USER_A,
      conversationId: CONVERSATION,
      sourceMessageId: ASSISTANT_MESSAGE,
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      now: REGEN_NOW
    });
    expect(repeated).toMatchObject({
      reused: true,
      generation: { id: REGEN_GENERATION }
    });

    await expect(
      repository.prepareRegeneration({
        generationId: "01J8000000000000000000000N",
        assistantMessageId: "01J8000000000000000000000P",
        clientOperationId: REGEN_OPERATION,
        requestHash: "e".repeat(64),
        userId: USER_A,
        conversationId: CONVERSATION,
        sourceMessageId: ASSISTANT_MESSAGE,
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: REGEN_NOW
      })
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  });

  it("no regenera una respuesta todavía en curso", async () => {
    await expect(
      repository.prepareRegeneration({
        generationId: "01J8000000000000000000000Q",
        assistantMessageId: "01J8000000000000000000000R",
        clientOperationId: "01J8000000000000000000000S",
        requestHash: "f".repeat(64),
        userId: USER_A,
        conversationId: CONVERSATION,
        sourceMessageId: REGEN_ASSISTANT_MESSAGE,
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: REGEN_NOW
      })
    ).rejects.toThrow("REGENERATION_SOURCE_ACTIVE");
  });

  it("no regenera un mensaje de usuario ni un id inexistente", async () => {
    await expect(
      repository.prepareRegeneration({
        generationId: "01J8000000000000000000000T",
        assistantMessageId: "01J8000000000000000000000V",
        clientOperationId: "01J8000000000000000000000W",
        requestHash: "0".repeat(64),
        userId: USER_A,
        conversationId: CONVERSATION,
        sourceMessageId: USER_MESSAGE,
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: REGEN_NOW
      })
    ).rejects.toThrow("MESSAGE_NOT_FOUND");
  });

  it("otro usuario no puede regenerar la conversación", async () => {
    await expect(
      repository.prepareRegeneration({
        generationId: "01J8000000000000000000000X",
        assistantMessageId: "01J8000000000000000000000Y",
        clientOperationId: "01J8000000000000000000000Z",
        requestHash: "1".repeat(64),
        userId: USER_B,
        conversationId: CONVERSATION,
        sourceMessageId: ASSISTANT_MESSAGE,
        provider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        now: REGEN_NOW
      })
    ).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });
});
