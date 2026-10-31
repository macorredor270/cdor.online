import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../client";
import { messages } from "../schema";
import type { CursorPage } from "./types";

export type MessageRow = typeof messages.$inferSelect;

export class MessageRepository {
  constructor(private readonly database: Database) {}

  async findOwned(
    userId: string,
    conversationId: string,
    messageId: string
  ): Promise<MessageRow | null> {
    const [row] = await this.database
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          eq(messages.conversationId, conversationId),
          eq(messages.id, messageId),
          isNull(messages.deletedAt)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async listOwned(
    userId: string,
    conversationId: string,
    limit: number,
    before?: { createdAt: Date; id: string }
  ): Promise<CursorPage<MessageRow>> {
    const beforePredicate = before
      ? or(
          lt(messages.createdAt, before.createdAt),
          and(
            eq(messages.createdAt, before.createdAt),
            lt(messages.id, before.id)
          )
        )
      : undefined;

    const rows = await this.database
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.userId, userId),
          eq(messages.conversationId, conversationId),
          isNull(messages.deletedAt),
          beforePredicate
        )
      )
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(limit + 1);

    return {
      items: rows.slice(0, limit),
      hasMore: rows.length > limit
    };
  }
}
