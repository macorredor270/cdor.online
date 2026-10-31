import {
  and,
  desc,
  eq,
  isNull,
  lt,
  or
} from "drizzle-orm";
import type { Database } from "../client";
import { memories, messages, syncChanges } from "../schema";
import type { CursorPage, MutationResult } from "./types";

export type MemoryRow = typeof memories.$inferSelect;
export type MemoryCursor = Readonly<{ updatedAt: Date; id: string }>;

export class MemoryRepository {
  constructor(private readonly database: Database) {}

  async isSourceMessageOwned(
    userId: string,
    sourceMessageId: string
  ): Promise<boolean> {
    const [row] = await this.database
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          eq(messages.id, sourceMessageId),
          isNull(messages.deletedAt)
        )
      )
      .limit(1);
    return row !== undefined;
  }

  async create(input: {
    id: string;
    userId: string;
    content: string;
    category: string;
    importance: number;
    enabled: boolean;
    sourceMessageId: string | null;
    now: Date;
  }): Promise<MemoryRow> {
    const syncVersion = 1n;
    await this.database.transaction(async (transaction) => {
      await transaction.insert(memories).values({
        ...input,
        createdAt: input.now,
        updatedAt: input.now,
        syncVersion
      });
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "memory",
        entityId: input.id,
        operation: "upsert",
        entityVersion: syncVersion,
        createdAt: input.now
      });
    });

    return {
      id: input.id,
      userId: input.userId,
      content: input.content,
      category: input.category,
      importance: input.importance,
      enabled: input.enabled,
      sourceMessageId: input.sourceMessageId,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      syncVersion
    };
  }

  async findOwned(userId: string, memoryId: string): Promise<MemoryRow | null> {
    const [row] = await this.database
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          eq(memories.id, memoryId),
          isNull(memories.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async listOwned(
    userId: string,
    limit: number,
    options: { cursor?: MemoryCursor; enabled?: boolean } = {}
  ): Promise<CursorPage<MemoryRow>> {
    const cursorPredicate = options.cursor
      ? or(
          lt(memories.updatedAt, options.cursor.updatedAt),
          and(
            eq(memories.updatedAt, options.cursor.updatedAt),
            lt(memories.id, options.cursor.id)
          )
        )
      : undefined;
    const enabledPredicate =
      options.enabled === undefined
        ? undefined
        : eq(memories.enabled, options.enabled);

    const rows = await this.database
      .select()
      .from(memories)
      .where(
        and(
          eq(memories.userId, userId),
          isNull(memories.deletedAt),
          enabledPredicate,
          cursorPredicate
        )
      )
      .orderBy(desc(memories.updatedAt), desc(memories.id))
      .limit(limit + 1);

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit
    };
  }

  async updateOwned(input: {
    id: string;
    userId: string;
    baseVersion: bigint;
    content?: string;
    category?: string;
    importance?: number;
    enabled?: boolean;
    now: Date;
  }): Promise<MutationResult<MemoryRow>> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.id, input.id),
            eq(memories.userId, input.userId),
            isNull(memories.deletedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!current) {
        return { kind: "not_found" };
      }
      if (current.syncVersion !== input.baseVersion) {
        return {
          kind: "conflict",
          currentVersion: current.syncVersion
        };
      }

      const nextVersion = current.syncVersion + 1n;
      const entity: MemoryRow = {
        ...current,
        content: input.content ?? current.content,
        category: input.category ?? current.category,
        importance: input.importance ?? current.importance,
        enabled: input.enabled ?? current.enabled,
        updatedAt: input.now,
        syncVersion: nextVersion
      };

      await transaction
        .update(memories)
        .set({
          content: entity.content,
          category: entity.category,
          importance: entity.importance,
          enabled: entity.enabled,
          updatedAt: entity.updatedAt,
          syncVersion: nextVersion
        })
        .where(
          and(eq(memories.id, input.id), eq(memories.userId, input.userId))
        );
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "memory",
        entityId: input.id,
        operation: "upsert",
        entityVersion: nextVersion,
        createdAt: input.now
      });

      return { kind: "ok", entity };
    });
  }

  async deleteOwned(input: {
    id: string;
    userId: string;
    baseVersion: bigint;
    now: Date;
  }): Promise<MutationResult<MemoryRow>> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(memories)
        .where(
          and(
            eq(memories.id, input.id),
            eq(memories.userId, input.userId),
            isNull(memories.deletedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!current) {
        return { kind: "not_found" };
      }
      if (current.syncVersion !== input.baseVersion) {
        return {
          kind: "conflict",
          currentVersion: current.syncVersion
        };
      }

      const nextVersion = current.syncVersion + 1n;
      const entity: MemoryRow = {
        ...current,
        updatedAt: input.now,
        deletedAt: input.now,
        syncVersion: nextVersion
      };
      await transaction
        .update(memories)
        .set({
          updatedAt: input.now,
          deletedAt: input.now,
          syncVersion: nextVersion
        })
        .where(
          and(eq(memories.id, input.id), eq(memories.userId, input.userId))
        );
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "memory",
        entityId: input.id,
        operation: "delete",
        entityVersion: nextVersion,
        createdAt: input.now
      });

      return { kind: "ok", entity };
    });
  }
}
