import {
  ChatMessageSchema,
  ConversationSchema,
  MemorySchema,
  SyncPullDataSchema,
  SyncPullQuerySchema,
  SyncPushDataSchema,
  SyncPushRequestSchema,
  UserPreferencesSchema,
  type SyncChange,
  type SyncPullData,
  type SyncPullQuery,
  type SyncPushData,
  type SyncPushRequest
} from "@cdor/contracts";
import type { Principal } from "../auth/principal";
import {
  SyncRepository,
  type SyncChangeRow,
  type SyncCurrentEntities
} from "../db/repositories/sync";
import { AppError } from "../errors/app-error";

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function materializeChange(
  row: SyncChangeRow,
  current: SyncCurrentEntities
): SyncChange | null {
  const base = {
    changeId: row.changeId.toString(),
    entityId: row.entityId,
    changedAt: row.createdAt.toISOString()
  };

  if (row.entityType === "conversation") {
    const entity = current.conversations.get(row.entityId);
    if (!entity) return null;
    const entityVersion = entity.syncVersion.toString();
    if (entity.deletedAt) {
      return {
        ...base,
        entityType: "conversation",
        operation: "delete",
        entityVersion,
        payload: null
      };
    }
    return {
      ...base,
      entityType: "conversation",
      operation: "upsert",
      entityVersion,
      payload: ConversationSchema.parse({
        ...entity,
        createdAt: iso(entity.createdAt),
        updatedAt: iso(entity.updatedAt),
        deletedAt: iso(entity.deletedAt),
        syncVersion: entityVersion
      })
    };
  }

  if (row.entityType === "message") {
    const entity = current.messages.get(row.entityId);
    if (!entity) return null;
    const entityVersion = entity.syncVersion.toString();
    if (entity.deletedAt) {
      return {
        ...base,
        entityType: "message",
        operation: "delete",
        entityVersion,
        payload: null
      };
    }
    return {
      ...base,
      entityType: "message",
      operation: "upsert",
      entityVersion,
      payload: ChatMessageSchema.parse({
        ...entity,
        createdAt: iso(entity.createdAt),
        updatedAt: iso(entity.updatedAt),
        deletedAt: iso(entity.deletedAt),
        syncVersion: entityVersion
      })
    };
  }

  if (row.entityType === "memory") {
    const entity = current.memories.get(row.entityId);
    if (!entity) return null;
    const entityVersion = entity.syncVersion.toString();
    if (entity.deletedAt) {
      return {
        ...base,
        entityType: "memory",
        operation: "delete",
        entityVersion,
        payload: null
      };
    }
    return {
      ...base,
      entityType: "memory",
      operation: "upsert",
      entityVersion,
      payload: MemorySchema.parse({
        ...entity,
        createdAt: iso(entity.createdAt),
        updatedAt: iso(entity.updatedAt),
        deletedAt: iso(entity.deletedAt),
        syncVersion: entityVersion
      })
    };
  }

  if (row.entityType === "preference") {
    const entity = current.preferences.get(row.entityId);
    if (!entity) return null;
    const entityVersion = entity.syncVersion.toString();
    if (entity.deletedAt) {
      return {
        ...base,
        entityType: "preference",
        operation: "delete",
        entityVersion,
        payload: null
      };
    }
    return {
      ...base,
      entityType: "preference",
      operation: "upsert",
      entityVersion,
      payload: UserPreferencesSchema.parse({
        ...entity,
        createdAt: iso(entity.createdAt),
        updatedAt: iso(entity.updatedAt),
        deletedAt: iso(entity.deletedAt),
        syncVersion: entityVersion
      })
    };
  }

  return null;
}

export class SyncService {
  constructor(
    private readonly repository: SyncRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async pull(
    principal: Principal,
    rawQuery: SyncPullQuery
  ): Promise<SyncPullData> {
    const query = SyncPullQuerySchema.parse(rawQuery);
    const cursor = BigInt(query.cursor);
    const bounds = await this.repository.cursorBounds(principal.userId);

    const cursorIsInvalid =
      (bounds.maximum === null && cursor !== 0n) ||
      (bounds.maximum !== null && cursor > bounds.maximum) ||
      (cursor !== 0n &&
        bounds.minimum !== null &&
        cursor < bounds.minimum - 1n);
    if (cursorIsInvalid) {
      throw new AppError(
        "SYNC_CURSOR_INVALID",
        "El cursor ya no está disponible; se requiere resincronización completa",
        {
          details: {
            minimumCursor:
              bounds.minimum === null
                ? "0"
                : (bounds.minimum - 1n).toString()
          }
        }
      );
    }

    const page = await this.repository.changePage(
      principal.userId,
      cursor,
      query.limit
    );
    const entities = await this.repository.loadCurrentEntities(
      principal.userId,
      page.rows
    );
    const changes = page.rows
      .map((row) => materializeChange(row, entities))
      .filter((change): change is SyncChange => change !== null);

    return SyncPullDataSchema.parse({
      nextCursor: page.scannedCursor.toString(),
      hasMore: page.hasMore,
      changes
    });
  }

  async push(
    principal: Principal,
    rawInput: SyncPushRequest
  ): Promise<SyncPushData> {
    const input = SyncPushRequestSchema.parse(rawInput);
    const results = [];
    for (const operation of input.operations) {
      results.push(
        await this.repository.apply(
          principal.userId,
          operation,
          this.now()
        )
      );
    }
    return SyncPushDataSchema.parse({
      results,
      nextCursor: (
        await this.repository.currentCursor(principal.userId)
      ).toString()
    });
  }
}
