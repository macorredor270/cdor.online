import {
  ConversationListDataSchema,
  ConversationListQuerySchema,
  ConversationSchema,
  CreateConversationRequestSchema,
  UpdateConversationRequestSchema,
  type Conversation,
  type ConversationListData,
  type ConversationListQuery,
  type CreateConversationRequest,
  type UpdateConversationRequest
} from "@cdor/contracts";
import { ulid } from "ulid";
import type { Principal } from "../auth/principal";
import {
  ConversationRepository,
  type ConversationRow
} from "../db/repositories/conversations";
import { AppError } from "../errors/app-error";
import {
  decodeTimestampCursor,
  encodeTimestampCursor
} from "./cursor";

function serializeConversation(row: ConversationRow): Conversation {
  return ConversationSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    syncVersion: row.syncVersion.toString()
  });
}

export class ConversationService {
  constructor(
    private readonly repository: ConversationRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = ulid
  ) {}

  async create(
    principal: Principal,
    rawInput: CreateConversationRequest
  ): Promise<Conversation> {
    const input = CreateConversationRequestSchema.parse(rawInput);
    const row = await this.repository.create({
      id: input.id ?? this.createId(),
      userId: principal.userId,
      title: input.title ?? "Nueva conversación",
      modelMode: input.modelMode,
      now: this.now()
    });
    return serializeConversation(row);
  }

  async get(principal: Principal, id: string): Promise<Conversation> {
    const row = await this.repository.findOwned(principal.userId, id);
    if (!row) {
      throw new AppError(
        "CONVERSATION_NOT_FOUND",
        "La conversación no existe"
      );
    }
    return serializeConversation(row);
  }

  async list(
    principal: Principal,
    rawQuery: ConversationListQuery
  ): Promise<ConversationListData> {
    const query = ConversationListQuerySchema.parse(rawQuery);
    const page = await this.repository.listOwned(
      principal.userId,
      query.limit,
      query.cursor ? decodeTimestampCursor(query.cursor) : undefined
    );
    const last = page.items.at(-1);

    return ConversationListDataSchema.parse({
      items: page.items.map(serializeConversation),
      nextCursor:
        page.hasMore && last
          ? encodeTimestampCursor({ updatedAt: last.updatedAt, id: last.id })
          : null,
      hasMore: page.hasMore
    });
  }

  async update(
    principal: Principal,
    id: string,
    rawInput: UpdateConversationRequest
  ): Promise<Conversation> {
    const input = UpdateConversationRequestSchema.parse(rawInput);
    const result = await this.repository.updateOwned({
      id,
      userId: principal.userId,
      baseVersion: BigInt(input.baseVersion),
      title: input.title,
      modelMode: input.modelMode,
      now: this.now()
    });
    return this.resolveMutation(result);
  }

  async delete(
    principal: Principal,
    id: string,
    baseVersion: string
  ): Promise<Conversation> {
    const result = await this.repository.deleteOwned({
      id,
      userId: principal.userId,
      baseVersion: BigInt(baseVersion),
      now: this.now()
    });
    return this.resolveMutation(result);
  }

  private resolveMutation(
    result: Awaited<ReturnType<ConversationRepository["updateOwned"]>>
  ): Conversation {
    if (result.kind === "not_found") {
      throw new AppError(
        "CONVERSATION_NOT_FOUND",
        "La conversación no existe"
      );
    }
    if (result.kind === "conflict") {
      throw new AppError("CONFLICT", "La conversación cambió en el servidor", {
        details: { currentVersion: result.currentVersion.toString() }
      });
    }
    return serializeConversation(result.entity);
  }
}
