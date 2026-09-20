import {
  CreateMemoryRequestSchema,
  MemoryListDataSchema,
  MemoryListQuerySchema,
  MemorySchema,
  UpdateMemoryRequestSchema,
  type CreateMemoryRequest,
  type Memory,
  type MemoryListData,
  type MemoryListQuery,
  type UpdateMemoryRequest
} from "@cdor/contracts";
import { ulid } from "ulid";
import type { Principal } from "../auth/principal";
import {
  MemoryRepository,
  type MemoryRow
} from "../db/repositories/memories";
import { AppError } from "../errors/app-error";
import {
  decodeTimestampCursor,
  encodeTimestampCursor
} from "./cursor";

function serializeMemory(row: MemoryRow): Memory {
  return MemorySchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: row.deletedAt?.toISOString() ?? null,
    syncVersion: row.syncVersion.toString()
  });
}

export class MemoryService {
  constructor(
    private readonly repository: MemoryRepository,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = ulid
  ) {}

  async create(
    principal: Principal,
    rawInput: CreateMemoryRequest
  ): Promise<Memory> {
    const input = CreateMemoryRequestSchema.parse(rawInput);
    if (
      input.sourceMessageId &&
      !(await this.repository.isSourceMessageOwned(
        principal.userId,
        input.sourceMessageId
      ))
    ) {
      throw new AppError(
        "MESSAGE_NOT_FOUND",
        "El mensaje de origen no existe"
      );
    }
    const row = await this.repository.create({
      id: input.id ?? this.createId(),
      userId: principal.userId,
      content: input.content,
      category: input.category,
      importance: input.importance,
      enabled: input.enabled,
      sourceMessageId: input.sourceMessageId ?? null,
      now: this.now()
    });
    return serializeMemory(row);
  }

  async get(principal: Principal, id: string): Promise<Memory> {
    const row = await this.repository.findOwned(principal.userId, id);
    if (!row) {
      throw new AppError("MEMORY_NOT_FOUND", "La memoria no existe");
    }
    return serializeMemory(row);
  }

  async list(
    principal: Principal,
    rawQuery: MemoryListQuery
  ): Promise<MemoryListData> {
    const query = MemoryListQuerySchema.parse(rawQuery);
    const page = await this.repository.listOwned(
      principal.userId,
      query.limit,
      {
        cursor: query.cursor
          ? decodeTimestampCursor(query.cursor)
          : undefined,
        enabled: query.enabled
      }
    );
    const last = page.items.at(-1);

    return MemoryListDataSchema.parse({
      items: page.items.map(serializeMemory),
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
    rawInput: UpdateMemoryRequest
  ): Promise<Memory> {
    const input = UpdateMemoryRequestSchema.parse(rawInput);
    const result = await this.repository.updateOwned({
      id,
      userId: principal.userId,
      baseVersion: BigInt(input.baseVersion),
      content: input.content,
      category: input.category,
      importance: input.importance,
      enabled: input.enabled,
      now: this.now()
    });
    return this.resolveMutation(result);
  }

  async delete(
    principal: Principal,
    id: string,
    baseVersion: string
  ): Promise<Memory> {
    const result = await this.repository.deleteOwned({
      id,
      userId: principal.userId,
      baseVersion: BigInt(baseVersion),
      now: this.now()
    });
    return this.resolveMutation(result);
  }

  private resolveMutation(
    result: Awaited<ReturnType<MemoryRepository["updateOwned"]>>
  ): Memory {
    if (result.kind === "not_found") {
      throw new AppError("MEMORY_NOT_FOUND", "La memoria no existe");
    }
    if (result.kind === "conflict") {
      throw new AppError("CONFLICT", "La memoria cambió en el servidor", {
        details: { currentVersion: result.currentVersion.toString() }
      });
    }
    return serializeMemory(result.entity);
  }
}
