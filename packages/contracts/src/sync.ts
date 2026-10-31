import { z } from "zod";
import { ChatMessageSchema, UserMessageContentSchema } from "./chat";
import {
  createIntegerQuerySchema,
  IsoDateSchema,
  SyncCursorSchema,
  SyncVersionSchema,
  UlidSchema
} from "./common";
import {
  ConversationSchema,
  ConversationTitleSchema,
  ModelModeSchema
} from "./conversation";
import { ErrorCodeSchema } from "./errors";
import {
  MemoryCategorySchema,
  MemoryContentSchema,
  MemoryImportanceSchema,
  MemorySchema
} from "./memory";
import { CONTRACT_LIMITS } from "./limits";

export const SyncEntityTypeSchema = z.enum([
  "conversation",
  "message",
  "memory",
  "preference"
]);

export const SyncOperationSchema = z.enum(["upsert", "delete"]);

export const UserPreferencesSchema = z
  .object({
    id: UlidSchema,
    userId: UlidSchema,
    locale: z.string().min(2).max(16),
    timezone: z.string().min(1).max(64),
    theme: z.enum(["system", "light", "dark"]),
    defaultModelMode: ModelModeSchema,
    memoryEnabled: z.boolean(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    deletedAt: IsoDateSchema.nullable(),
    syncVersion: SyncVersionSchema
  })
  .strict();

const SyncChangeBaseSchema = z
  .object({
    changeId: SyncCursorSchema,
    entityId: UlidSchema,
    entityVersion: SyncVersionSchema,
    changedAt: IsoDateSchema
  })
  .strict();

export const ConversationUpsertChangeSchema = SyncChangeBaseSchema.extend({
  entityType: z.literal("conversation"),
  operation: z.literal("upsert"),
  payload: ConversationSchema
}).strict();

export const MessageUpsertChangeSchema = SyncChangeBaseSchema.extend({
  entityType: z.literal("message"),
  operation: z.literal("upsert"),
  payload: ChatMessageSchema
}).strict();

export const MemoryUpsertChangeSchema = SyncChangeBaseSchema.extend({
  entityType: z.literal("memory"),
  operation: z.literal("upsert"),
  payload: MemorySchema
}).strict();

export const PreferenceUpsertChangeSchema = SyncChangeBaseSchema.extend({
  entityType: z.literal("preference"),
  operation: z.literal("upsert"),
  payload: UserPreferencesSchema
}).strict();

export const DeleteChangeSchema = SyncChangeBaseSchema.extend({
  entityType: SyncEntityTypeSchema,
  operation: z.literal("delete"),
  payload: z.null()
}).strict();

export const SyncChangeSchema = z.union([
  ConversationUpsertChangeSchema,
  MessageUpsertChangeSchema,
  MemoryUpsertChangeSchema,
  PreferenceUpsertChangeSchema,
  DeleteChangeSchema
]);

export const SyncPullQuerySchema = z
  .object({
    cursor: SyncCursorSchema.default("0"),
    limit: createIntegerQuerySchema(
      1,
      CONTRACT_LIMITS.SYNC_PULL_MAX_CHANGES
    ).default(CONTRACT_LIMITS.SYNC_PULL_MAX_CHANGES)
  })
  .strict();

export const SyncPullDataSchema = z
  .object({
    nextCursor: SyncCursorSchema,
    hasMore: z.boolean(),
    changes: z
      .array(SyncChangeSchema)
      .max(CONTRACT_LIMITS.SYNC_PULL_MAX_CHANGES)
  })
  .strict();

const PushOperationBaseSchema = z
  .object({
    operationId: UlidSchema,
    entityId: UlidSchema,
    baseVersion: SyncVersionSchema
  })
  .strict();

export const ConversationPushUpsertSchema = PushOperationBaseSchema.extend({
  entity: z.literal("conversation"),
  action: z.literal("upsert"),
  payload: z
    .object({
      title: ConversationTitleSchema,
      modelMode: ModelModeSchema,
      createdAt: IsoDateSchema
    })
    .strict()
}).strict();

export const MessagePushAppendSchema = PushOperationBaseSchema.extend({
  entity: z.literal("message"),
  action: z.literal("upsert"),
  payload: z
    .object({
      conversationId: UlidSchema,
      clientOperationId: UlidSchema,
      role: z.literal("user"),
      content: UserMessageContentSchema,
      createdAt: IsoDateSchema
    })
    .strict()
}).strict();

export const MemoryPushUpsertSchema = PushOperationBaseSchema.extend({
  entity: z.literal("memory"),
  action: z.literal("upsert"),
  payload: z
    .object({
      content: MemoryContentSchema,
      category: MemoryCategorySchema,
      importance: MemoryImportanceSchema,
      enabled: z.boolean(),
      sourceMessageId: UlidSchema.nullable()
    })
    .strict()
}).strict();

export const PreferencePushUpsertSchema = PushOperationBaseSchema.extend({
  entity: z.literal("preference"),
  action: z.literal("upsert"),
  payload: z
    .object({
      locale: z.string().min(2).max(16),
      timezone: z.string().min(1).max(64),
      theme: z.enum(["system", "light", "dark"]),
      defaultModelMode: ModelModeSchema,
      memoryEnabled: z.boolean()
    })
    .strict()
}).strict();

export const DeletePushOperationSchema = PushOperationBaseSchema.extend({
  entity: SyncEntityTypeSchema.exclude(["message"]),
  action: z.literal("delete"),
  payload: z.null()
}).strict();

export const SyncPushOperationSchema = z.union([
  ConversationPushUpsertSchema,
  MessagePushAppendSchema,
  MemoryPushUpsertSchema,
  PreferencePushUpsertSchema,
  DeletePushOperationSchema
]);

export const SyncPushRequestSchema = z
  .object({
    operations: z
      .array(SyncPushOperationSchema)
      .min(1)
      .max(CONTRACT_LIMITS.SYNC_PUSH_MAX_OPERATIONS)
  })
  .strict();

export const SyncPushResultStatusSchema = z.enum([
  "applied",
  "duplicate",
  "conflict",
  "rejected"
]);

export const SyncPushResultSchema = z
  .object({
    operationId: UlidSchema,
    entityId: UlidSchema,
    status: SyncPushResultStatusSchema,
    serverVersion: SyncVersionSchema.nullable(),
    errorCode: ErrorCodeSchema.nullable()
  })
  .strict();

export const SyncPushDataSchema = z
  .object({
    results: z
      .array(SyncPushResultSchema)
      .max(CONTRACT_LIMITS.SYNC_PUSH_MAX_OPERATIONS),
    nextCursor: SyncCursorSchema
  })
  .strict();

export type SyncEntityType = z.infer<typeof SyncEntityTypeSchema>;
export type SyncOperation = z.infer<typeof SyncOperationSchema>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type SyncChange = z.infer<typeof SyncChangeSchema>;
export type SyncPullQuery = z.infer<typeof SyncPullQuerySchema>;
export type SyncPullData = z.infer<typeof SyncPullDataSchema>;
export type SyncPushOperation = z.infer<typeof SyncPushOperationSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResult = z.infer<typeof SyncPushResultSchema>;
export type SyncPushData = z.infer<typeof SyncPushDataSchema>;
