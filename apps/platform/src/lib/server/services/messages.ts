import {
  ChatMessageSchema,
  MessageListDataSchema,
  MessageListQuerySchema,
  type ChatMessage,
  type MessageListData,
  type MessageListQuery
} from "@cdor/contracts";
import type { Principal } from "../auth/principal";
import {
  MessageRepository,
  type MessageRow
} from "../db/repositories/messages";
import { AppError } from "../errors/app-error";

function serializeMessage(row: MessageRow): ChatMessage {
  return ChatMessageSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    syncVersion: row.syncVersion.toString()
  });
}

export class MessageService {
  constructor(private readonly repository: MessageRepository) {}

  async list(
    principal: Principal,
    conversationId: string,
    rawQuery: MessageListQuery
  ): Promise<MessageListData> {
    const query = MessageListQuerySchema.parse(rawQuery);
    const boundary = query.before
      ? await this.repository.findOwned(
          principal.userId,
          conversationId,
          query.before
        )
      : null;
    if (query.before && !boundary) {
      throw new AppError("MESSAGE_NOT_FOUND", "El mensaje cursor no existe");
    }

    const page = await this.repository.listOwned(
      principal.userId,
      conversationId,
      query.limit,
      boundary
        ? { createdAt: boundary.createdAt, id: boundary.id }
        : undefined
    );
    const last = page.items.at(-1);

    return MessageListDataSchema.parse({
      items: page.items.map(serializeMessage),
      nextCursor: page.hasMore && last ? last.id : null,
      hasMore: page.hasMore
    });
  }
}
