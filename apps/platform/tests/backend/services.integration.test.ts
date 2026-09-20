import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testPrincipal } from "../../src/lib/server/auth/principal";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { ConversationRepository } from "../../src/lib/server/db/repositories/conversations";
import { MemoryRepository } from "../../src/lib/server/db/repositories/memories";
import { UsageRepository } from "../../src/lib/server/db/repositories/usage";
import {
  conversations,
  syncChanges,
  usageEvents,
  user
} from "../../src/lib/server/db/schema";
import { ConversationService } from "../../src/lib/server/services/conversations";
import { MemoryService } from "../../src/lib/server/services/memories";
import { UsageService } from "../../src/lib/server/services/usage";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("backend");
const USER_A = "01J10000000000000000000000";
const USER_B = "01J10000000000000000000001";
const CONVERSATION_A = "01J10000000000000000000002";
const CONVERSATION_B = "01J10000000000000000000003";
const MEMORY_A = "01J10000000000000000000004";
const MEMORY_B = "01J10000000000000000000005";
const USAGE_A = "01J10000000000000000000006";
const USAGE_OLD = "01J10000000000000000000007";
const USAGE_B = "01J10000000000000000000008";
const INITIAL_TIME = new Date("2026-07-27T20:00:00.000Z");
const UPDATE_TIME = new Date("2026-07-27T20:01:00.000Z");

let client: ReturnType<typeof createDatabaseClient>;
let conversationService: ConversationService;
let memoryService: MemoryService;

describe.sequential("servicios backend con MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 2
    });
    await client.database.insert(user).values([
      {
        id: USER_A,
        name: "Usuario A",
        email: "backend-a@example.test",
        emailVerified: true,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME
      },
      {
        id: USER_B,
        name: "Usuario B",
        email: "backend-b@example.test",
        emailVerified: true,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME
      }
    ]);

    conversationService = new ConversationService(
      new ConversationRepository(client.database),
      () => INITIAL_TIME,
      () => CONVERSATION_A
    );
    memoryService = new MemoryService(
      new MemoryRepository(client.database),
      () => INITIAL_TIME,
      () => MEMORY_A
    );
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("crea, lista y aísla conversaciones por propietario", async () => {
    const principalA = testPrincipal(USER_A);
    const principalB = testPrincipal(USER_B);
    const created = await conversationService.create(principalA, {
      id: CONVERSATION_A,
      title: "Privada A",
      modelMode: "balanced"
    });

    expect(created).toMatchObject({
      id: CONVERSATION_A,
      userId: USER_A,
      syncVersion: "1"
    });
    await expect(
      conversationService.get(principalB, CONVERSATION_A)
    ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
    await expect(
      conversationService.list(principalB, { limit: 30 })
    ).resolves.toMatchObject({ items: [] });
  });

  it("actualiza con versión optimista y rechaza una versión antigua", async () => {
    const service = new ConversationService(
      new ConversationRepository(client.database),
      () => UPDATE_TIME,
      () => CONVERSATION_B
    );
    const principalA = testPrincipal(USER_A);
    const updated = await service.update(principalA, CONVERSATION_A, {
      title: "Actualizada",
      baseVersion: "1"
    });

    expect(updated).toMatchObject({
      title: "Actualizada",
      syncVersion: "2"
    });
    await expect(
      service.update(principalA, CONVERSATION_A, {
        title: "Conflicto",
        baseVersion: "1"
      })
    ).rejects.toMatchObject({
      code: "CONFLICT",
      details: { currentVersion: "2" }
    });
  });

  it("elimina una conversación sin hacerla visible a su propietario", async () => {
    const principalA = testPrincipal(USER_A);
    const deleted = await new ConversationService(
      new ConversationRepository(client.database),
      () => new Date("2026-07-27T20:02:00.000Z"),
      () => CONVERSATION_B
    ).delete(principalA, CONVERSATION_A, "2");

    expect(deleted).toMatchObject({
      id: CONVERSATION_A,
      syncVersion: "3",
      deletedAt: "2026-07-27T20:02:00.000Z"
    });
    await expect(
      conversationService.get(principalA, CONVERSATION_A)
    ).rejects.toMatchObject({ code: "CONVERSATION_NOT_FOUND" });
  });

  it("crea y elimina memorias con changelog atómico", async () => {
    const principalA = testPrincipal(USER_A);
    const created = await memoryService.create(principalA, {
      id: MEMORY_A,
      content: "Prefiere respuestas breves",
      category: "preference",
      importance: 3,
      enabled: true,
      sourceMessageId: null
    });
    expect(created.syncVersion).toBe("1");

    const updateService = new MemoryService(
      new MemoryRepository(client.database),
      () => UPDATE_TIME,
      () => MEMORY_B
    );
    const updated = await updateService.update(principalA, MEMORY_A, {
      content: "Prefiere respuestas muy breves",
      baseVersion: "1"
    });
    expect(updated.syncVersion).toBe("2");

    const deleted = await updateService.delete(principalA, MEMORY_A, "2");
    expect(deleted).toMatchObject({
      id: MEMORY_A,
      deletedAt: UPDATE_TIME.toISOString(),
      syncVersion: "3"
    });
    await expect(memoryService.get(principalA, MEMORY_A)).rejects.toMatchObject({
      code: "MEMORY_NOT_FOUND"
    });

    const changes = await client.database
      .select()
      .from(syncChanges)
      .where(
        and(
          eq(syncChanges.userId, USER_A),
          eq(syncChanges.entityId, MEMORY_A)
        )
      );
    expect(changes.map((change) => change.operation)).toEqual([
      "upsert",
      "upsert",
      "delete"
    ]);
  });

  it("resume 30 días de uso y aísla los datos por propietario", async () => {
    await client.database.insert(usageEvents).values([
      {
        id: USAGE_A,
        userId: USER_A,
        generationId: null,
        kind: "chat",
        provider: "test",
        modelId: "test/model",
        inputTokens: 100,
        outputTokens: 50,
        costMicrousd: 25n,
        createdAt: new Date("2026-07-28T12:00:00.000Z")
      },
      {
        id: USAGE_OLD,
        userId: USER_A,
        generationId: null,
        kind: "chat",
        inputTokens: 200,
        outputTokens: 100,
        createdAt: new Date("2026-05-01T12:00:00.000Z")
      },
      {
        id: USAGE_B,
        userId: USER_B,
        generationId: null,
        kind: "chat",
        inputTokens: 999,
        outputTokens: 999,
        createdAt: new Date("2026-07-28T12:00:00.000Z")
      }
    ]);
    const summary = await new UsageService(
      new UsageRepository(client.database),
      () => new Date("2026-07-29T12:00:00.000Z")
    ).summarize(testPrincipal(USER_A));

    expect(summary).toEqual({
      periodStart: "2026-06-29T12:00:00.000Z",
      periodEnd: "2026-07-29T12:00:00.000Z",
      generations: 1,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      knownCostMicrousd: "25"
    });
  });

  it("el cierre del pool es limpio", async () => {
    const disposable = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 1
    });
    await disposable.pool.query("SELECT 1");
    await disposable.close();
    await expect(disposable.pool.query("SELECT 1")).rejects.toBeDefined();
  });

  it("no crea una conversación de otro usuario por consulta accidental", async () => {
    const rows = await client.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, CONVERSATION_A),
          eq(conversations.userId, USER_B)
        )
      );
    expect(rows).toEqual([]);
  });
});
