import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { AccountRepository } from "../../src/lib/server/db/repositories/account";
import {
  conversations,
  generationRequests,
  idempotencyKeys,
  memories,
  messages,
  syncChanges,
  usageEvents,
  user,
  userPreferences
} from "../../src/lib/server/db/schema";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("account");
const OWNER = "01J90000000000000000000000";
const OTHER = "01J90000000000000000000001";
const OWNER_CONVERSATION = "01J90000000000000000000002";
const OTHER_CONVERSATION = "01J90000000000000000000003";
const OWNER_MESSAGE = "01J90000000000000000000004";
const OWNER_ASSISTANT = "01J90000000000000000000005";
const OWNER_MEMORY = "01J90000000000000000000006";
const OWNER_GENERATION = "01J90000000000000000000007";
const OWNER_PREFERENCES = "01J90000000000000000000008";
const NOW = new Date("2026-07-31T10:00:00.000Z");

let client: ReturnType<typeof createDatabaseClient>;
let repository: AccountRepository;

describe.sequential("eliminación de cuenta con MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 2
    });

    await client.database.insert(user).values([
      {
        id: OWNER,
        name: "Titular",
        email: "titular@example.test",
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW
      },
      {
        id: OTHER,
        name: "Ajeno",
        email: "ajeno@example.test",
        emailVerified: true,
        createdAt: NOW,
        updatedAt: NOW
      }
    ]);
    await client.database.insert(conversations).values([
      {
        id: OWNER_CONVERSATION,
        userId: OWNER,
        title: "Del titular",
        modelMode: "balanced",
        createdAt: NOW,
        updatedAt: NOW,
        syncVersion: 1n
      },
      {
        id: OTHER_CONVERSATION,
        userId: OTHER,
        title: "De otra cuenta",
        modelMode: "balanced",
        createdAt: NOW,
        updatedAt: NOW,
        syncVersion: 1n
      }
    ]);
    await client.database.insert(messages).values([
      {
        id: OWNER_MESSAGE,
        conversationId: OWNER_CONVERSATION,
        userId: OWNER,
        clientOperationId: null,
        role: "user",
        content: "Hola",
        status: "completed",
        createdAt: NOW,
        updatedAt: NOW,
        syncVersion: 1n
      },
      {
        id: OWNER_ASSISTANT,
        conversationId: OWNER_CONVERSATION,
        userId: OWNER,
        clientOperationId: null,
        role: "assistant",
        content: "Respuesta",
        status: "completed",
        modelProvider: "nvidia",
        modelId: "meta/llama-3.1-8b-instruct",
        createdAt: NOW,
        updatedAt: NOW,
        syncVersion: 1n
      }
    ]);
    await client.database.insert(memories).values({
      id: OWNER_MEMORY,
      userId: OWNER,
      content: "Prefiere respuestas breves",
      category: "preferencia",
      importance: 3,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
      syncVersion: 1n
    });
    await client.database.insert(userPreferences).values({
      id: OWNER_PREFERENCES,
      userId: OWNER,
      createdAt: NOW,
      updatedAt: NOW,
      syncVersion: 1n
    });
    await client.database.insert(generationRequests).values({
      id: OWNER_GENERATION,
      userId: OWNER,
      conversationId: OWNER_CONVERSATION,
      assistantMessageId: OWNER_ASSISTANT,
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      state: "completed",
      startedAt: NOW,
      completedAt: NOW,
      createdAt: NOW
    });
    await client.database.insert(usageEvents).values({
      id: OWNER_GENERATION,
      userId: OWNER,
      generationId: OWNER_GENERATION,
      kind: "chat",
      provider: "nvidia",
      modelId: "meta/llama-3.1-8b-instruct",
      inputTokens: 10,
      outputTokens: 5,
      createdAt: NOW
    });
    await client.database.insert(syncChanges).values({
      userId: OWNER,
      entityType: "message",
      entityId: OWNER_MESSAGE,
      operation: "upsert",
      entityVersion: 1n,
      createdAt: NOW
    });
    await client.database.insert(idempotencyKeys).values({
      userId: OWNER,
      idempotencyKey: OWNER_GENERATION,
      route: "/api/v1/chat/stream",
      requestHash: "a".repeat(64),
      state: "completed",
      resourceId: OWNER_GENERATION,
      createdAt: NOW,
      expiresAt: new Date(NOW.getTime() + 86_400_000)
    });

    repository = new AccountRepository(client.database);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("elimina en cascada todo el contenido del titular", async () => {
    await expect(repository.deleteUser(OWNER)).resolves.toBe(true);

    const [
      remainingUsers,
      remainingConversations,
      remainingMessages,
      remainingMemories,
      remainingPreferences,
      remainingGenerations,
      remainingUsage,
      remainingChanges,
      remainingKeys
    ] = await Promise.all([
      client.database.select().from(user).where(eq(user.id, OWNER)),
      client.database
        .select()
        .from(conversations)
        .where(eq(conversations.userId, OWNER)),
      client.database.select().from(messages).where(eq(messages.userId, OWNER)),
      client.database.select().from(memories).where(eq(memories.userId, OWNER)),
      client.database
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, OWNER)),
      client.database
        .select()
        .from(generationRequests)
        .where(eq(generationRequests.userId, OWNER)),
      client.database
        .select()
        .from(usageEvents)
        .where(eq(usageEvents.userId, OWNER)),
      client.database
        .select()
        .from(syncChanges)
        .where(eq(syncChanges.userId, OWNER)),
      client.database
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, OWNER))
    ]);

    expect(remainingUsers).toHaveLength(0);
    expect(remainingConversations).toHaveLength(0);
    expect(remainingMessages).toHaveLength(0);
    expect(remainingMemories).toHaveLength(0);
    expect(remainingPreferences).toHaveLength(0);
    expect(remainingGenerations).toHaveLength(0);
    expect(remainingUsage).toHaveLength(0);
    expect(remainingChanges).toHaveLength(0);
    expect(remainingKeys).toHaveLength(0);
  });

  it("no toca los datos de otra cuenta", async () => {
    const survivors = await client.database
      .select()
      .from(conversations)
      .where(eq(conversations.userId, OTHER));

    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.id).toBe(OTHER_CONVERSATION);
  });

  it("repetir la eliminación informa de que ya no existe", async () => {
    await expect(repository.deleteUser(OWNER)).resolves.toBe(false);
  });
});
