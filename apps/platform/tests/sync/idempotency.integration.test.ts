import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SyncPushRequest } from "@cdor/contracts";
import { testPrincipal } from "../../src/lib/server/auth/principal";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { SyncRepository } from "../../src/lib/server/db/repositories/sync";
import {
  conversations,
  idempotencyKeys,
  memories,
  messages,
  syncChanges,
  user,
  userPreferences
} from "../../src/lib/server/db/schema";
import { SyncService } from "../../src/lib/server/services/sync";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("sync");
const USER_A = "01J90000000000000000000000";
const USER_B = "01J90000000000000000000001";
const CONVERSATION = "01J90000000000000000000002";
const MESSAGE = "01J90000000000000000000003";
const MEMORY = "01J90000000000000000000004";
const PREFERENCE = "01J90000000000000000000005";
const OP_CONVERSATION = "01J90000000000000000000006";
const OP_MESSAGE = "01J90000000000000000000007";
const OP_MEMORY = "01J90000000000000000000008";
const OP_PREFERENCE = "01J90000000000000000000009";
const OP_CONVERSATION_UPDATE = "01J9000000000000000000000A";
const OP_MEMORY_UPDATE = "01J9000000000000000000000B";
const OP_MEMORY_CONFLICT = "01J9000000000000000000000C";
const OP_MEMORY_DELETE = "01J9000000000000000000000D";
const OP_MEMORY_RESURRECT = "01J9000000000000000000000E";
const DEPENDENT_CONVERSATION = "01J9000000000000000000000F";
const DEPENDENT_MESSAGE = "01J9000000000000000000000G";
const OP_DEPENDENT_MESSAGE = "01J9000000000000000000000H";
const OP_DEPENDENT_CONVERSATION = "01J9000000000000000000000J";
const INITIAL_TIME = new Date("2026-07-29T08:00:00.000Z");
const LATER_TIME = new Date("2026-07-29T08:01:00.000Z");

const initialPush: SyncPushRequest = {
  operations: [
    {
      operationId: OP_CONVERSATION,
      entityId: CONVERSATION,
      entity: "conversation",
      action: "upsert",
      baseVersion: "0",
      payload: {
        title: "Sincronización",
        modelMode: "balanced",
        createdAt: INITIAL_TIME.toISOString()
      }
    },
    {
      operationId: OP_MESSAGE,
      entityId: MESSAGE,
      entity: "message",
      action: "upsert",
      baseVersion: "0",
      payload: {
        conversationId: CONVERSATION,
        clientOperationId: OP_MESSAGE,
        role: "user",
        content: "Mensaje offline",
        createdAt: INITIAL_TIME.toISOString()
      }
    },
    {
      operationId: OP_MEMORY,
      entityId: MEMORY,
      entity: "memory",
      action: "upsert",
      baseVersion: "0",
      payload: {
        content: "Prefiere respuestas breves",
        category: "preference",
        importance: 3,
        enabled: true,
        sourceMessageId: MESSAGE
      }
    },
    {
      operationId: OP_PREFERENCE,
      entityId: PREFERENCE,
      entity: "preference",
      action: "upsert",
      baseVersion: "0",
      payload: {
        locale: "es-ES",
        timezone: "Europe/Madrid",
        theme: "system",
        defaultModelMode: "balanced",
        memoryEnabled: true
      }
    }
  ]
};

let client: ReturnType<typeof createDatabaseClient>;
let repository: SyncRepository;
let service: SyncService;
let clock = INITIAL_TIME;

describe.sequential("sync e idempotencia con MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 2
    });
    await client.database.insert(user).values([
      {
        id: USER_A,
        name: "Sync A",
        email: "sync-a@example.test",
        emailVerified: true,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME
      },
      {
        id: USER_B,
        name: "Sync B",
        email: "sync-b@example.test",
        emailVerified: true,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME
      }
    ]);
    repository = new SyncRepository(client.database);
    service = new SyncService(repository, () => clock);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("aplica un lote atómico y materializa payloads tipados", async () => {
    const pushed = await service.push(testPrincipal(USER_A), initialPush);
    expect(pushed.results.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
      "applied",
      "applied"
    ]);
    expect(BigInt(pushed.nextCursor)).toBeGreaterThanOrEqual(5n);

    const pulled = await service.pull(testPrincipal(USER_A), {
      cursor: "0",
      limit: 500
    });
    expect(pulled.hasMore).toBe(false);
    expect(pulled.changes.some((change) =>
      change.entityType === "conversation" &&
      change.operation === "upsert" &&
      change.payload.title === "Sincronización"
    )).toBe(true);
    expect(pulled.changes.some((change) =>
      change.entityType === "message" &&
      change.operation === "upsert" &&
      change.payload.content === "Mensaje offline"
    )).toBe(true);
    expect(pulled.changes.some((change) =>
      change.entityType === "memory" &&
      change.operation === "upsert" &&
      change.payload.importance === 3
    )).toBe(true);
    expect(pulled.changes.some((change) =>
      change.entityType === "preference" &&
      change.operation === "upsert" &&
      change.payload.timezone === "Europe/Madrid"
    )).toBe(true);
  });

  it("reintenta exactamente una vez y rechaza reutilizar otra carga", async () => {
    const before = await client.database
      .select()
      .from(syncChanges)
      .where(eq(syncChanges.userId, USER_A));
    const retried = await service.push(testPrincipal(USER_A), initialPush);
    expect(retried.results.map(({ status }) => status)).toEqual([
      "duplicate",
      "duplicate",
      "duplicate",
      "duplicate"
    ]);
    const after = await client.database
      .select()
      .from(syncChanges)
      .where(eq(syncChanges.userId, USER_A));
    expect(after).toHaveLength(before.length);

    const changedPayload: SyncPushRequest = {
      operations: [
        {
          operationId: OP_CONVERSATION,
          entityId: CONVERSATION,
          entity: "conversation",
          action: "upsert",
          baseVersion: "0",
          payload: {
            title: "Carga distinta",
            modelMode: "balanced",
            createdAt: INITIAL_TIME.toISOString()
          }
        }
      ]
    };
    const conflict = await service.push(
      testPrincipal(USER_A),
      changedPayload
    );
    expect(conflict.results).toEqual([
      expect.objectContaining({
        operationId: OP_CONVERSATION,
        status: "rejected",
        errorCode: "IDEMPOTENCY_CONFLICT"
      })
    ]);

    const [entityCounts] = await Promise.all([
      Promise.all([
        client.database.select().from(conversations),
        client.database.select().from(messages),
        client.database.select().from(memories),
        client.database.select().from(userPreferences)
      ])
    ]);
    expect(entityCounts.map((rows) => rows.length)).toEqual([1, 1, 1, 1]);
  });

  it("reintenta un mensaje cuando su conversación llega después", async () => {
    const dependentMessage: SyncPushRequest = {
      operations: [
        {
          operationId: OP_DEPENDENT_MESSAGE,
          entityId: DEPENDENT_MESSAGE,
          entity: "message",
          action: "upsert",
          baseVersion: "0",
          payload: {
            conversationId: DEPENDENT_CONVERSATION,
            clientOperationId: OP_DEPENDENT_MESSAGE,
            role: "user",
            content: "Dependencia retrasada",
            createdAt: INITIAL_TIME.toISOString()
          }
        }
      ]
    };
    const rejected = await service.push(
      testPrincipal(USER_A),
      dependentMessage
    );
    expect(rejected.results[0]).toMatchObject({
      status: "rejected",
      errorCode: "CONVERSATION_NOT_FOUND"
    });

    await service.push(testPrincipal(USER_A), {
      operations: [
        {
          operationId: OP_DEPENDENT_CONVERSATION,
          entityId: DEPENDENT_CONVERSATION,
          entity: "conversation",
          action: "upsert",
          baseVersion: "0",
          payload: {
            title: "Padre retrasado",
            modelMode: "balanced",
            createdAt: INITIAL_TIME.toISOString()
          }
        }
      ]
    });

    const applied = await service.push(
      testPrincipal(USER_A),
      dependentMessage
    );
    expect(applied.results[0]).toMatchObject({
      status: "applied",
      errorCode: null
    });
    const duplicate = await service.push(
      testPrincipal(USER_A),
      dependentMessage
    );
    expect(duplicate.results[0]).toMatchObject({
      status: "duplicate",
      errorCode: null
    });
  });

  it("aplica orden del servidor, conflicto explícito y delete dominante", async () => {
    clock = LATER_TIME;
    const conversationUpdate = await service.push(
      testPrincipal(USER_A),
      {
        operations: [
          {
            operationId: OP_CONVERSATION_UPDATE,
            entityId: CONVERSATION,
            entity: "conversation",
            action: "upsert",
            baseVersion: "0",
            payload: {
              title: "Último recibido",
              modelMode: "balanced",
              createdAt: INITIAL_TIME.toISOString()
            }
          }
        ]
      }
    );
    expect(conversationUpdate.results[0]).toMatchObject({
      status: "applied",
      serverVersion: "3"
    });

    const memoryUpdate = await service.push(testPrincipal(USER_A), {
      operations: [
        {
          operationId: OP_MEMORY_UPDATE,
          entityId: MEMORY,
          entity: "memory",
          action: "upsert",
          baseVersion: "1",
          payload: {
            content: "Prefiere respuestas muy breves",
            category: "preference",
            importance: 4,
            enabled: true,
            sourceMessageId: MESSAGE
          }
        }
      ]
    });
    expect(memoryUpdate.results[0]).toMatchObject({
      status: "applied",
      serverVersion: "2"
    });

    const staleMemory = await service.push(testPrincipal(USER_A), {
      operations: [
        {
          operationId: OP_MEMORY_CONFLICT,
          entityId: MEMORY,
          entity: "memory",
          action: "upsert",
          baseVersion: "1",
          payload: {
            content: "Edición móvil incompatible",
            category: "preference",
            importance: 2,
            enabled: true,
            sourceMessageId: MESSAGE
          }
        }
      ]
    });
    expect(staleMemory.results[0]).toMatchObject({
      status: "conflict",
      serverVersion: "2",
      errorCode: "CONFLICT"
    });

    const deleted = await service.push(testPrincipal(USER_A), {
      operations: [
        {
          operationId: OP_MEMORY_DELETE,
          entityId: MEMORY,
          entity: "memory",
          action: "delete",
          baseVersion: "1",
          payload: null
        }
      ]
    });
    expect(deleted.results[0]).toMatchObject({
      status: "applied",
      serverVersion: "3"
    });

    const resurrection = await service.push(testPrincipal(USER_A), {
      operations: [
        {
          operationId: OP_MEMORY_RESURRECT,
          entityId: MEMORY,
          entity: "memory",
          action: "upsert",
          baseVersion: "3",
          payload: {
            content: "No debe revivir",
            category: "preference",
            importance: 5,
            enabled: true,
            sourceMessageId: MESSAGE
          }
        }
      ]
    });
    expect(resurrection.results[0]).toMatchObject({
      status: "conflict",
      serverVersion: "3"
    });
  });

  it("hace converger dos clientes y aísla otro usuario", async () => {
    const clientA = await service.pull(testPrincipal(USER_A), {
      cursor: "0",
      limit: 500
    });
    const clientB = await service.pull(testPrincipal(USER_A), {
      cursor: "0",
      limit: 500
    });
    expect(clientB).toEqual(clientA);
    expect(clientA.changes.some((change) =>
      change.entityType === "memory" &&
      change.operation === "delete"
    )).toBe(true);

    const otherUser = await service.pull(testPrincipal(USER_B), {
      cursor: "0",
      limit: 500
    });
    expect(otherUser).toEqual({
      nextCursor: "0",
      hasMore: false,
      changes: []
    });
  });

  it("caduca cursores sin romper la resincronización completa", async () => {
    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    const maintenanceTime = new Date("2026-07-29T09:00:00.000Z");
    const cutoff = new Date("2026-04-30T09:00:00.000Z");
    await client.database
      .update(syncChanges)
      .set({ createdAt: oldTime })
      .where(eq(syncChanges.userId, USER_A));
    await client.database
      .update(idempotencyKeys)
      .set({ expiresAt: oldTime })
      .where(eq(idempotencyKeys.userId, USER_A));

    while (true) {
      const old = await repository.oldChanges(cutoff, 3);
      if (old.length === 0) break;
      await repository.refreshAndRemoveOldChanges(
        old,
        cutoff,
        maintenanceTime
      );
    }
    while (
      (await repository.pruneExpiredIdempotency(maintenanceTime, 3)) === 3
    ) {
      // Continúa por lotes explícitos, sin worker permanente.
    }

    await expect(
      service.pull(testPrincipal(USER_A), {
        cursor: "1",
        limit: 500
      })
    ).rejects.toMatchObject({ code: "SYNC_CURSOR_INVALID" });

    const fullResync = await service.pull(testPrincipal(USER_A), {
      cursor: "0",
      limit: 500
    });
    expect(fullResync.changes.length).toBeGreaterThan(0);
    expect(fullResync.changes.some((change) =>
      change.entityType === "memory" &&
      change.operation === "delete"
    )).toBe(true);
    expect(
      await client.database
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, USER_A))
    ).toEqual([]);
  });
});
