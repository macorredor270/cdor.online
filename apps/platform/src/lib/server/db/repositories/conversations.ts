import {
  and,
  desc,
  eq,
  isNull,
  lt,
  or
} from "drizzle-orm";
import type { Database } from "../client";
import { conversations, syncChanges } from "../schema";
import type { CursorPage, MutationResult } from "./types";

export type ConversationRow = typeof conversations.$inferSelect;

export type ConversationCursor = Readonly<{
  updatedAt: Date;
  id: string;
}>;

export class ConversationRepository {
  constructor(private readonly database: Database) {}

  async create(input: {
    id: string;
    userId: string;
    title: string;
    modelMode: string;
    now: Date;
  }): Promise<ConversationRow> {
    const syncVersion = 1n;
    await this.database.transaction(async (transaction) => {
      await transaction.insert(conversations).values({
        id: input.id,
        userId: input.userId,
        title: input.title,
        modelMode: input.modelMode,
        createdAt: input.now,
        updatedAt: input.now,
        syncVersion
      });
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "conversation",
        entityId: input.id,
        operation: "upsert",
        entityVersion: syncVersion,
        createdAt: input.now
      });
    });

    return {
      id: input.id,
      userId: input.userId,
      title: input.title,
      modelMode: input.modelMode,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
      syncVersion
    };
  }

  async findOwned(
    userId: string,
    conversationId: string
  ): Promise<ConversationRow | null> {
    const [row] = await this.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          eq(conversations.id, conversationId),
          isNull(conversations.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async listOwned(
    userId: string,
    limit: number,
    cursor?: ConversationCursor
  ): Promise<CursorPage<ConversationRow>> {
    const cursorPredicate = cursor
      ? or(
          lt(conversations.updatedAt, cursor.updatedAt),
          and(
            eq(conversations.updatedAt, cursor.updatedAt),
            lt(conversations.id, cursor.id)
          )
        )
      : undefined;

    const rows = await this.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
          cursorPredicate
        )
      )
      .orderBy(desc(conversations.updatedAt), desc(conversations.id))
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
    title?: string;
    modelMode?: string;
    now: Date;
  }): Promise<MutationResult<ConversationRow>> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, input.userId),
            isNull(conversations.deletedAt)
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
      const entity: ConversationRow = {
        ...current,
        title: input.title ?? current.title,
        modelMode: input.modelMode ?? current.modelMode,
        updatedAt: input.now,
        syncVersion: nextVersion
      };

      await transaction
        .update(conversations)
        .set({
          title: entity.title,
          modelMode: entity.modelMode,
          updatedAt: entity.updatedAt,
          syncVersion: nextVersion
        })
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, input.userId)
          )
        );
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "conversation",
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
  }): Promise<MutationResult<ConversationRow>> {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, input.userId),
            isNull(conversations.deletedAt)
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
      const entity: ConversationRow = {
        ...current,
        updatedAt: input.now,
        deletedAt: input.now,
        syncVersion: nextVersion
      };

      await transaction
        .update(conversations)
        .set({
          updatedAt: input.now,
          deletedAt: input.now,
          syncVersion: nextVersion
        })
        .where(
          and(
            eq(conversations.id, input.id),
            eq(conversations.userId, input.userId)
          )
        );
      await transaction.insert(syncChanges).values({
        userId: input.userId,
        entityType: "conversation",
        entityId: input.id,
        operation: "delete",
        entityVersion: nextVersion,
        createdAt: input.now
      });

      return { kind: "ok", entity };
    });
  }
}
