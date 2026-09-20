import { conversations, syncChanges } from "../schema";
import type { Database } from "../client";

export type NewConversationWithChange = {
  id: string;
  userId: string;
  title: string;
  modelMode: string;
  createdAt: Date;
  syncVersion: bigint;
};

export async function createConversationWithSyncChange(
  database: Database,
  input: NewConversationWithChange
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.insert(conversations).values({
      id: input.id,
      userId: input.userId,
      title: input.title,
      modelMode: input.modelMode,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      syncVersion: input.syncVersion
    });

    await transaction.insert(syncChanges).values({
      userId: input.userId,
      entityType: "conversation",
      entityId: input.id,
      operation: "upsert",
      entityVersion: input.syncVersion,
      createdAt: input.createdAt
    });
  });
}
