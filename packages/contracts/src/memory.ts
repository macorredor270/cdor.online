import { z } from "zod";
import {
  createIntegerQuerySchema,
  IsoDateSchema,
  OpaqueCursorSchema,
  SyncVersionSchema,
  UlidSchema
} from "./common";
import { CONTRACT_LIMITS, hasMaxUtf8Bytes } from "./limits";

export const MemoryCategorySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const MemoryContentSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => hasMaxUtf8Bytes(value, CONTRACT_LIMITS.MEMORY_MAX_BYTES),
    "Supera el límite UTF-8 de la memoria"
  );
export const MemoryImportanceSchema = z.number().int().min(1).max(5);

export const MemorySchema = z
  .object({
    id: UlidSchema,
    userId: UlidSchema,
    content: MemoryContentSchema,
    category: MemoryCategorySchema,
    importance: MemoryImportanceSchema,
    enabled: z.boolean(),
    sourceMessageId: UlidSchema.nullable(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    deletedAt: IsoDateSchema.nullable(),
    syncVersion: SyncVersionSchema
  })
  .strict();

export const CreateMemoryRequestSchema = z
  .object({
    id: UlidSchema.optional(),
    content: MemoryContentSchema,
    category: MemoryCategorySchema,
    importance: MemoryImportanceSchema.default(1),
    enabled: z.boolean().default(true),
    sourceMessageId: UlidSchema.nullable().optional()
  })
  .strict();

export const UpdateMemoryRequestSchema = z
  .object({
    content: MemoryContentSchema.optional(),
    category: MemoryCategorySchema.optional(),
    importance: MemoryImportanceSchema.optional(),
    enabled: z.boolean().optional(),
    baseVersion: SyncVersionSchema
  })
  .strict()
  .refine(
    (value) =>
      value.content !== undefined ||
      value.category !== undefined ||
      value.importance !== undefined ||
      value.enabled !== undefined,
    "Debe cambiarse al menos un campo"
  );

export const MemoryListQuerySchema = z
  .object({
    cursor: OpaqueCursorSchema.optional(),
    limit: createIntegerQuerySchema(
      1,
      CONTRACT_LIMITS.MEMORIES_PAGE_MAX
    ).default(50),
    enabled: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional()
  })
  .strict();

export const MemoryListDataSchema = z
  .object({
    items: z.array(MemorySchema).max(CONTRACT_LIMITS.MEMORIES_PAGE_MAX),
    nextCursor: OpaqueCursorSchema.nullable(),
    hasMore: z.boolean()
  })
  .strict();

export type Memory = z.infer<typeof MemorySchema>;
export type CreateMemoryRequest = z.infer<typeof CreateMemoryRequestSchema>;
export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;
export type MemoryListQuery = z.infer<typeof MemoryListQuerySchema>;
export type MemoryListData = z.infer<typeof MemoryListDataSchema>;
