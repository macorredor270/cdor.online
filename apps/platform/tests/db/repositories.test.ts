import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { createConversationWithSyncChange } from "../../src/lib/server/db/repositories/conversation-write";
import { MobileOAuthRepository } from "../../src/lib/server/db/repositories/mobile-oauth";
import {
  conversations,
  syncChanges,
  user
} from "../../src/lib/server/db/schema";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "./helpers";

const databaseName = testDatabaseName("repositories");
const USER_A = "01J00000000000000000000000";
const USER_B = "01J00000000000000000000001";
const CONVERSATION_A = "01J00000000000000000000002";
const CONVERSATION_B = "01J00000000000000000000003";
const ROLLBACK_CONVERSATION = "01J00000000000000000000004";
const now = new Date("2026-07-27T19:05:03.000Z");

let client: ReturnType<typeof createDatabaseClient>;

describe.sequential("repositorios MySQL", () => {
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
        email: "a@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now
      },
      {
        id: USER_B,
        name: "Usuario B",
        email: "b@example.test",
        emailVerified: true,
        createdAt: now,
        updatedAt: now
      }
    ]);
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("escribe entidad y sync_changes en la misma operación", async () => {
    await createConversationWithSyncChange(client.database, {
      id: CONVERSATION_A,
      userId: USER_A,
      title: "Primera conversación",
      modelMode: "balanced",
      createdAt: now,
      syncVersion: 1n
    });

    const [storedConversation] = await client.database
      .select()
      .from(conversations)
      .where(eq(conversations.id, CONVERSATION_A));
    const [storedChange] = await client.database
      .select()
      .from(syncChanges)
      .where(eq(syncChanges.entityId, CONVERSATION_A));

    expect(storedConversation).toMatchObject({
      userId: USER_A,
      syncVersion: 1n
    });
    expect(storedChange).toMatchObject({
      userId: USER_A,
      entityType: "conversation",
      operation: "upsert",
      entityVersion: 1n
    });
  });

  it("obliga a filtrar por propietario", async () => {
    await createConversationWithSyncChange(client.database, {
      id: CONVERSATION_B,
      userId: USER_B,
      title: "Conversación privada B",
      modelMode: "balanced",
      createdAt: now,
      syncVersion: 1n
    });

    const rows = await client.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, CONVERSATION_B),
          eq(conversations.userId, USER_A)
        )
      );

    expect(rows).toEqual([]);
  });

  it("revierte entidad y changelog si la transacción falla", async () => {
    await expect(
      client.database.transaction(async (transaction) => {
        await transaction.insert(conversations).values({
          id: ROLLBACK_CONVERSATION,
          userId: USER_A,
          title: "No debe persistir",
          modelMode: "balanced",
          createdAt: now,
          updatedAt: now,
          syncVersion: 1n
        });
        await transaction.insert(syncChanges).values({
          userId: USER_A,
          entityType: "conversation",
          entityId: ROLLBACK_CONVERSATION,
          operation: "upsert",
          entityVersion: 1n,
          createdAt: now
        });
        throw new Error("fallo simulado");
      })
    ).rejects.toThrow("fallo simulado");

    const entityRows = await client.database
      .select()
      .from(conversations)
      .where(eq(conversations.id, ROLLBACK_CONVERSATION));
    const changeRows = await client.database
      .select()
      .from(syncChanges)
      .where(eq(syncChanges.entityId, ROLLBACK_CONVERSATION));

    expect(entityRows).toEqual([]);
    expect(changeRows).toEqual([]);
  });

  it("consume una sola vez el intercambio OAuth móvil", async () => {
    const repository = new MobileOAuthRepository(client.database);
    const identifierHash = "oauth-handoff-hash";
    await repository.store(
      identifierHash,
      "signed-session-token",
      new Date(Date.now() + 60_000)
    );

    await expect(repository.consume(identifierHash, new Date())).resolves.toBe(
      "signed-session-token"
    );
    await expect(repository.consume(identifierHash, new Date())).resolves.toBeNull();
  });
});
