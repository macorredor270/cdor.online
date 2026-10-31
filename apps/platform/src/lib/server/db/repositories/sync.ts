import { createHash } from "node:crypto";
import type {
  ErrorCode,
  SyncEntityType,
  SyncPushOperation,
  SyncPushResult
} from "@cdor/contracts";
import { SyncPushResultSchema } from "@cdor/contracts";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or
} from "drizzle-orm";
import type { Database } from "../client";
import {
  conversations,
  idempotencyKeys,
  memories,
  messages,
  syncChanges,
  user,
  userPreferences
} from "../schema";

const SYNC_PUSH_ROUTE = "/api/v1/sync/push";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1_000;

export type SyncChangeRow = typeof syncChanges.$inferSelect;
export type SyncCurrentEntities = Readonly<{
  conversations: Map<
    string,
    typeof conversations.$inferSelect
  >;
  messages: Map<string, typeof messages.$inferSelect>;
  memories: Map<string, typeof memories.$inferSelect>;
  preferences: Map<
    string,
    typeof userPreferences.$inferSelect
  >;
}>;

function requestHash(operation: SyncPushOperation): string {
  return createHash("sha256")
    .update(JSON.stringify(operation))
    .digest("hex");
}

function result(
  operation: SyncPushOperation,
  status: SyncPushResult["status"],
  serverVersion: bigint | null,
  errorCode: ErrorCode | null
): SyncPushResult {
  return {
    operationId: operation.operationId,
    entityId: operation.entityId,
    status,
    serverVersion: serverVersion?.toString() ?? null,
    errorCode
  };
}

export class SyncRepository {
  constructor(private readonly database: Database) {}

  async cursorBounds(
    userId: string
  ): Promise<{ minimum: bigint | null; maximum: bigint | null }> {
    const [minimumRows, maximumRows] = await Promise.all([
      this.database
        .select({ changeId: syncChanges.changeId })
        .from(syncChanges)
        .where(eq(syncChanges.userId, userId))
        .orderBy(asc(syncChanges.changeId))
        .limit(1),
      this.database
        .select({ changeId: syncChanges.changeId })
        .from(syncChanges)
        .where(eq(syncChanges.userId, userId))
        .orderBy(desc(syncChanges.changeId))
        .limit(1)
    ]);
    return {
      minimum: minimumRows[0]?.changeId ?? null,
      maximum: maximumRows[0]?.changeId ?? null
    };
  }

  async changePage(
    userId: string,
    cursor: bigint,
    limit: number
  ): Promise<{
    rows: SyncChangeRow[];
    hasMore: boolean;
    scannedCursor: bigint;
  }> {
    const rows = await this.database
      .select()
      .from(syncChanges)
      .where(
        and(
          eq(syncChanges.userId, userId),
          gt(syncChanges.changeId, cursor)
        )
      )
      .orderBy(asc(syncChanges.changeId))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return {
      rows: page,
      hasMore: rows.length > limit,
      scannedCursor: page.at(-1)?.changeId ?? cursor
    };
  }

  async loadCurrentEntities(
    userId: string,
    changes: readonly SyncChangeRow[]
  ): Promise<SyncCurrentEntities> {
    const ids = (
      entityType: SyncEntityType
    ): string[] => [
      ...new Set(
        changes
          .filter((change) => change.entityType === entityType)
          .map((change) => change.entityId)
      )
    ];
    const conversationIds = ids("conversation");
    const messageIds = ids("message");
    const memoryIds = ids("memory");
    const preferenceIds = ids("preference");

    const [
      conversationRows,
      messageRows,
      memoryRows,
      preferenceRows
    ] = await Promise.all([
      conversationIds.length
        ? this.database
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.userId, userId),
                inArray(conversations.id, conversationIds)
              )
            )
        : [],
      messageIds.length
        ? this.database
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.userId, userId),
                inArray(messages.id, messageIds)
              )
            )
        : [],
      memoryIds.length
        ? this.database
            .select()
            .from(memories)
            .where(
              and(
                eq(memories.userId, userId),
                inArray(memories.id, memoryIds)
              )
            )
        : [],
      preferenceIds.length
        ? this.database
            .select()
            .from(userPreferences)
            .where(
              and(
                eq(userPreferences.userId, userId),
                inArray(userPreferences.id, preferenceIds)
              )
            )
        : []
    ]);

    return {
      conversations: new Map(
        conversationRows.map((row) => [row.id, row])
      ),
      messages: new Map(messageRows.map((row) => [row.id, row])),
      memories: new Map(memoryRows.map((row) => [row.id, row])),
      preferences: new Map(
        preferenceRows.map((row) => [row.id, row])
      )
    };
  }

  async apply(
    userId: string,
    operation: SyncPushOperation,
    now: Date
  ): Promise<SyncPushResult> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
        .for("update");

      const hash = requestHash(operation);
      const [existingKey] = await transaction
        .select()
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(
              idempotencyKeys.idempotencyKey,
              operation.operationId
            )
          )
        )
        .limit(1)
        .for("update");
      if (existingKey) {
        if (
          existingKey.route !== SYNC_PUSH_ROUTE ||
          existingKey.requestHash !== hash
        ) {
          return result(
            operation,
            "rejected",
            null,
            "IDEMPOTENCY_CONFLICT"
          );
        }
        let stored: unknown = existingKey.responseBody;
        if (typeof stored === "string") {
          try {
            stored = JSON.parse(stored) as unknown;
          } catch {
            stored = null;
          }
        }
        const parsed = SyncPushResultSchema.safeParse(stored);
        if (!parsed.success) {
          return result(
            operation,
            "rejected",
            null,
            "IDEMPOTENCY_CONFLICT"
          );
        }
        if (
          parsed.data.status === "rejected" &&
          parsed.data.errorCode === "CONVERSATION_NOT_FOUND"
        ) {
          await transaction.delete(idempotencyKeys).where(
            and(
              eq(idempotencyKeys.userId, userId),
              eq(
                idempotencyKeys.idempotencyKey,
                operation.operationId
              )
            )
          );
        } else if (
          parsed.data.status === "applied" ||
          parsed.data.status === "duplicate"
        ) {
          return { ...parsed.data, status: "duplicate" };
        } else {
          return parsed.data;
        }
      }

      await transaction.insert(idempotencyKeys).values({
        userId,
        idempotencyKey: operation.operationId,
        route: SYNC_PUSH_ROUTE,
        requestHash: hash,
        state: "processing",
        resourceId: operation.entityId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS)
      });

      let applied: SyncPushResult;
      if (operation.action === "delete") {
        if (operation.entity === "conversation") {
          const [current] = await transaction
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.id, operation.entityId),
                eq(conversations.userId, userId)
              )
            )
            .limit(1)
            .for("update");
          if (!current) {
            applied = result(
              operation,
              "rejected",
              null,
              "CONVERSATION_NOT_FOUND"
            );
          } else if (current.deletedAt) {
            applied = result(
              operation,
              "applied",
              current.syncVersion,
              null
            );
          } else if (BigInt(operation.baseVersion) > current.syncVersion) {
            applied = result(
              operation,
              "conflict",
              current.syncVersion,
              "CONFLICT"
            );
          } else {
            const nextVersion = current.syncVersion + 1n;
            await transaction
              .update(conversations)
              .set({
                deletedAt: now,
                updatedAt: now,
                syncVersion: nextVersion
              })
              .where(eq(conversations.id, current.id));
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "conversation",
              entityId: current.id,
              operation: "delete",
              entityVersion: nextVersion,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              nextVersion,
              null
            );
          }
        } else if (operation.entity === "memory") {
          const [current] = await transaction
            .select()
            .from(memories)
            .where(
              and(
                eq(memories.id, operation.entityId),
                eq(memories.userId, userId)
              )
            )
            .limit(1)
            .for("update");
          if (!current) {
            applied = result(
              operation,
              "rejected",
              null,
              "MEMORY_NOT_FOUND"
            );
          } else if (current.deletedAt) {
            applied = result(
              operation,
              "applied",
              current.syncVersion,
              null
            );
          } else if (BigInt(operation.baseVersion) > current.syncVersion) {
            applied = result(
              operation,
              "conflict",
              current.syncVersion,
              "CONFLICT"
            );
          } else {
            const nextVersion = current.syncVersion + 1n;
            await transaction
              .update(memories)
              .set({
                deletedAt: now,
                updatedAt: now,
                syncVersion: nextVersion
              })
              .where(eq(memories.id, current.id));
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "memory",
              entityId: current.id,
              operation: "delete",
              entityVersion: nextVersion,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              nextVersion,
              null
            );
          }
        } else {
          const [current] = await transaction
            .select()
            .from(userPreferences)
            .where(
              and(
                eq(userPreferences.id, operation.entityId),
                eq(userPreferences.userId, userId)
              )
            )
            .limit(1)
            .for("update");
          if (!current) {
            applied = result(
              operation,
              "rejected",
              null,
              "RESOURCE_NOT_FOUND"
            );
          } else if (current.deletedAt) {
            applied = result(
              operation,
              "applied",
              current.syncVersion,
              null
            );
          } else if (BigInt(operation.baseVersion) > current.syncVersion) {
            applied = result(
              operation,
              "conflict",
              current.syncVersion,
              "CONFLICT"
            );
          } else {
            const nextVersion = current.syncVersion + 1n;
            await transaction
              .update(userPreferences)
              .set({
                deletedAt: now,
                updatedAt: now,
                syncVersion: nextVersion
              })
              .where(eq(userPreferences.id, current.id));
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "preference",
              entityId: current.id,
              operation: "delete",
              entityVersion: nextVersion,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              nextVersion,
              null
            );
          }
        }
      } else if (operation.entity === "conversation") {
        const [current] = await transaction
          .select()
          .from(conversations)
          .where(
            and(
              eq(conversations.id, operation.entityId),
              eq(conversations.userId, userId)
            )
          )
          .limit(1)
          .for("update");
        if (!current) {
          if (operation.baseVersion !== "0") {
            applied = result(
              operation,
              "conflict",
              null,
              "CONFLICT"
            );
          } else {
            const version = 1n;
            await transaction.insert(conversations).values({
              id: operation.entityId,
              userId,
              title: operation.payload.title,
              modelMode: operation.payload.modelMode,
              createdAt: now,
              updatedAt: now,
              syncVersion: version
            });
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "conversation",
              entityId: operation.entityId,
              operation: "upsert",
              entityVersion: version,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              version,
              null
            );
          }
        } else if (current.deletedAt) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else if (BigInt(operation.baseVersion) > current.syncVersion) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else {
          const nextVersion = current.syncVersion + 1n;
          await transaction
            .update(conversations)
            .set({
              title: operation.payload.title,
              modelMode: operation.payload.modelMode,
              updatedAt: now,
              syncVersion: nextVersion
            })
            .where(eq(conversations.id, current.id));
          await transaction.insert(syncChanges).values({
            userId,
            entityType: "conversation",
            entityId: current.id,
            operation: "upsert",
            entityVersion: nextVersion,
            createdAt: now
          });
          applied = result(
            operation,
            "applied",
            nextVersion,
            null
          );
        }
      } else if (operation.entity === "message") {
        const [current] = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.id, operation.entityId),
              eq(messages.userId, userId)
            )
          )
          .limit(1)
          .for("update");
        const [clientOperation] = await transaction
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.userId, userId),
              eq(
                messages.clientOperationId,
                operation.payload.clientOperationId
              )
            )
          )
          .limit(1);
        if (current) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else if (clientOperation) {
          applied = result(
            operation,
            "rejected",
            clientOperation.syncVersion,
            "IDEMPOTENCY_CONFLICT"
          );
        } else if (operation.baseVersion !== "0") {
          applied = result(
            operation,
            "conflict",
            null,
            "CONFLICT"
          );
        } else {
          const [conversation] = await transaction
            .select()
            .from(conversations)
            .where(
              and(
                eq(conversations.id, operation.payload.conversationId),
                eq(conversations.userId, userId),
                isNull(conversations.deletedAt)
              )
            )
            .limit(1)
            .for("update");
          if (!conversation) {
            applied = result(
              operation,
              "rejected",
              null,
              "CONVERSATION_NOT_FOUND"
            );
          } else {
            const version = 1n;
            await transaction.insert(messages).values({
              id: operation.entityId,
              conversationId: conversation.id,
              userId,
              clientOperationId:
                operation.payload.clientOperationId,
              role: "user",
              content: operation.payload.content,
              status: "completed",
              createdAt: now,
              updatedAt: now,
              syncVersion: version
            });
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "message",
              entityId: operation.entityId,
              operation: "upsert",
              entityVersion: version,
              createdAt: now
            });
            const conversationVersion =
              conversation.syncVersion + 1n;
            await transaction
              .update(conversations)
              .set({
                updatedAt: now,
                syncVersion: conversationVersion
              })
              .where(eq(conversations.id, conversation.id));
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "conversation",
              entityId: conversation.id,
              operation: "upsert",
              entityVersion: conversationVersion,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              version,
              null
            );
          }
        }
      } else if (operation.entity === "memory") {
        const [current] = await transaction
          .select()
          .from(memories)
          .where(
            and(
              eq(memories.id, operation.entityId),
              eq(memories.userId, userId)
            )
          )
          .limit(1)
          .for("update");
        const sourceMessageId = operation.payload.sourceMessageId;
        const [sourceMessage] = sourceMessageId
          ? await transaction
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.id, sourceMessageId),
                  eq(messages.userId, userId),
                  isNull(messages.deletedAt)
                )
              )
              .limit(1)
          : [];
        if (sourceMessageId && !sourceMessage) {
          applied = result(
            operation,
            "rejected",
            current?.syncVersion ?? null,
            "MESSAGE_NOT_FOUND"
          );
        } else if (!current) {
          if (operation.baseVersion !== "0") {
            applied = result(
              operation,
              "conflict",
              null,
              "CONFLICT"
            );
          } else {
            const version = 1n;
            await transaction.insert(memories).values({
              id: operation.entityId,
              userId,
              content: operation.payload.content,
              category: operation.payload.category,
              importance: operation.payload.importance,
              enabled: operation.payload.enabled,
              sourceMessageId,
              createdAt: now,
              updatedAt: now,
              syncVersion: version
            });
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "memory",
              entityId: operation.entityId,
              operation: "upsert",
              entityVersion: version,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              version,
              null
            );
          }
        } else if (
          current.deletedAt ||
          current.syncVersion !== BigInt(operation.baseVersion)
        ) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else {
          const nextVersion = current.syncVersion + 1n;
          await transaction
            .update(memories)
            .set({
              content: operation.payload.content,
              category: operation.payload.category,
              importance: operation.payload.importance,
              enabled: operation.payload.enabled,
              sourceMessageId,
              updatedAt: now,
              syncVersion: nextVersion
            })
            .where(eq(memories.id, current.id));
          await transaction.insert(syncChanges).values({
            userId,
            entityType: "memory",
            entityId: current.id,
            operation: "upsert",
            entityVersion: nextVersion,
            createdAt: now
          });
          applied = result(
            operation,
            "applied",
            nextVersion,
            null
          );
        }
      } else {
        const [current] = await transaction
          .select()
          .from(userPreferences)
          .where(
            and(
              eq(userPreferences.id, operation.entityId),
              eq(userPreferences.userId, userId)
            )
          )
          .limit(1)
          .for("update");
        const [otherPreference] = await transaction
          .select()
          .from(userPreferences)
          .where(
            and(
              eq(userPreferences.userId, userId),
              isNull(userPreferences.deletedAt)
            )
          )
          .limit(1);
        if (!current && otherPreference) {
          applied = result(
            operation,
            "conflict",
            otherPreference.syncVersion,
            "CONFLICT"
          );
        } else if (!current) {
          if (operation.baseVersion !== "0") {
            applied = result(
              operation,
              "conflict",
              null,
              "CONFLICT"
            );
          } else {
            const version = 1n;
            await transaction.insert(userPreferences).values({
              id: operation.entityId,
              userId,
              locale: operation.payload.locale,
              timezone: operation.payload.timezone,
              theme: operation.payload.theme,
              defaultModelMode:
                operation.payload.defaultModelMode,
              memoryEnabled: operation.payload.memoryEnabled,
              createdAt: now,
              updatedAt: now,
              syncVersion: version
            });
            await transaction.insert(syncChanges).values({
              userId,
              entityType: "preference",
              entityId: operation.entityId,
              operation: "upsert",
              entityVersion: version,
              createdAt: now
            });
            applied = result(
              operation,
              "applied",
              version,
              null
            );
          }
        } else if (current.deletedAt) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else if (BigInt(operation.baseVersion) > current.syncVersion) {
          applied = result(
            operation,
            "conflict",
            current.syncVersion,
            "CONFLICT"
          );
        } else {
          const nextVersion = current.syncVersion + 1n;
          await transaction
            .update(userPreferences)
            .set({
              locale: operation.payload.locale,
              timezone: operation.payload.timezone,
              theme: operation.payload.theme,
              defaultModelMode:
                operation.payload.defaultModelMode,
              memoryEnabled: operation.payload.memoryEnabled,
              updatedAt: now,
              syncVersion: nextVersion
            })
            .where(eq(userPreferences.id, current.id));
          await transaction.insert(syncChanges).values({
            userId,
            entityType: "preference",
            entityId: current.id,
            operation: "upsert",
            entityVersion: nextVersion,
            createdAt: now
          });
          applied = result(
            operation,
            "applied",
            nextVersion,
            null
          );
        }
      }

      await transaction
        .update(idempotencyKeys)
        .set({
          state: "completed",
          responseStatus: 200,
          responseBody: applied
        })
        .where(
          and(
            eq(idempotencyKeys.userId, userId),
            eq(
              idempotencyKeys.idempotencyKey,
              operation.operationId
            )
          )
        );
      return applied;
    });
  }

  async currentCursor(userId: string): Promise<bigint> {
    const [row] = await this.database
      .select({ changeId: syncChanges.changeId })
      .from(syncChanges)
      .where(eq(syncChanges.userId, userId))
      .orderBy(desc(syncChanges.changeId))
      .limit(1);
    return row?.changeId ?? 0n;
  }

  async oldChanges(
    cutoff: Date,
    limit: number
  ): Promise<SyncChangeRow[]> {
    return this.database
      .select()
      .from(syncChanges)
      .where(lt(syncChanges.createdAt, cutoff))
      .orderBy(asc(syncChanges.changeId))
      .limit(limit);
  }

  async refreshAndRemoveOldChanges(
    changes: readonly SyncChangeRow[],
    cutoff: Date,
    now: Date
  ): Promise<{ refreshed: number; removed: number }> {
    if (changes.length === 0) {
      return { refreshed: 0, removed: 0 };
    }
    return this.database.transaction(async (transaction) => {
      const keys = new Map<string, SyncChangeRow>();
      for (const change of changes) {
        keys.set(
          `${change.userId}:${change.entityType}:${change.entityId}`,
          change
        );
      }
      let refreshed = 0;
      for (const change of keys.values()) {
        const [latest] = await transaction
          .select()
          .from(syncChanges)
          .where(
            and(
              eq(syncChanges.userId, change.userId),
              eq(syncChanges.entityType, change.entityType),
              eq(syncChanges.entityId, change.entityId)
            )
          )
          .orderBy(desc(syncChanges.changeId))
          .limit(1);
        if (!latest || latest.createdAt >= cutoff) {
          continue;
        }
        const metadata = await this.currentEntityMetadata(
          transaction as never,
          latest
        );
        if (!metadata) {
          continue;
        }
        await transaction.insert(syncChanges).values({
          userId: latest.userId,
          entityType: latest.entityType,
          entityId: latest.entityId,
          operation: metadata.operation,
          entityVersion: metadata.version,
          createdAt: now
        });
        refreshed += 1;
      }
      await transaction
        .delete(syncChanges)
        .where(
          inArray(
            syncChanges.changeId,
            changes.map(({ changeId }) => changeId)
          )
        );
      return { refreshed, removed: changes.length };
    });
  }

  private async currentEntityMetadata(
    transaction: Database,
    change: SyncChangeRow
  ): Promise<{
    operation: "upsert" | "delete";
    version: bigint;
  } | null> {
    if (change.entityType === "conversation") {
      const [row] = await transaction
        .select({
          deletedAt: conversations.deletedAt,
          version: conversations.syncVersion
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.userId, change.userId),
            eq(conversations.id, change.entityId)
          )
        )
        .limit(1);
      return row
        ? {
            operation: row.deletedAt ? "delete" : "upsert",
            version: row.version
          }
        : null;
    }
    if (change.entityType === "message") {
      const [row] = await transaction
        .select({
          deletedAt: messages.deletedAt,
          version: messages.syncVersion
        })
        .from(messages)
        .where(
          and(
            eq(messages.userId, change.userId),
            eq(messages.id, change.entityId)
          )
        )
        .limit(1);
      return row
        ? {
            operation: row.deletedAt ? "delete" : "upsert",
            version: row.version
          }
        : null;
    }
    if (change.entityType === "memory") {
      const [row] = await transaction
        .select({
          deletedAt: memories.deletedAt,
          version: memories.syncVersion
        })
        .from(memories)
        .where(
          and(
            eq(memories.userId, change.userId),
            eq(memories.id, change.entityId)
          )
        )
        .limit(1);
      return row
        ? {
            operation: row.deletedAt ? "delete" : "upsert",
            version: row.version
          }
        : null;
    }
    const [row] = await transaction
      .select({
        deletedAt: userPreferences.deletedAt,
        version: userPreferences.syncVersion
      })
      .from(userPreferences)
      .where(
        and(
          eq(userPreferences.userId, change.userId),
          eq(userPreferences.id, change.entityId)
        )
      )
      .limit(1);
    return row
      ? {
          operation: row.deletedAt ? "delete" : "upsert",
          version: row.version
        }
      : null;
  }

  async pruneExpiredIdempotency(
    now: Date,
    limit: number
  ): Promise<number> {
    const rows = await this.database
      .select({
        userId: idempotencyKeys.userId,
        idempotencyKey: idempotencyKeys.idempotencyKey
      })
      .from(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, now))
      .limit(limit);
    if (rows.length === 0) {
      return 0;
    }
    await this.database.delete(idempotencyKeys).where(
      or(
        ...rows.map((row) =>
          and(
            eq(idempotencyKeys.userId, row.userId),
            eq(
              idempotencyKeys.idempotencyKey,
              row.idempotencyKey
            )
          )
        )
      )
    );
    return rows.length;
  }
}
