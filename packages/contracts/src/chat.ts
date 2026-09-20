import { z } from "zod";
import {
  IdempotencyKeySchema,
  IsoDateSchema,
  RequestIdSchema,
  SyncVersionSchema,
  UlidSchema,
  createIntegerQuerySchema
} from "./common";
import { ModelModeSchema } from "./conversation";
import { ErrorCodeSchema } from "./errors";
import { CONTRACT_LIMITS, hasMaxUtf8Bytes } from "./limits";

export const MessageRoleSchema = z.enum([
  "user",
  "assistant",
  "system",
  "tool"
]);

export const MessageStatusSchema = z.enum([
  "pending",
  "streaming",
  "completed",
  "cancelled",
  "failed"
]);

export const FinishReasonSchema = z.enum([
  "stop",
  "length",
  "cancelled",
  "error"
]);

export const UserMessageContentSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      hasMaxUtf8Bytes(value, CONTRACT_LIMITS.USER_MESSAGE_MAX_BYTES),
    "Supera el límite UTF-8 del mensaje de usuario"
  );
export const StoredMessageContentSchema = z.string().refine(
  (value) => hasMaxUtf8Bytes(value, CONTRACT_LIMITS.STORED_MESSAGE_MAX_BYTES),
  "Supera el límite UTF-8 del mensaje persistido"
);

export const ChatMessageSchema = z
  .object({
    id: UlidSchema,
    conversationId: UlidSchema,
    userId: UlidSchema,
    clientOperationId: UlidSchema.nullable(),
    role: MessageRoleSchema,
    content: StoredMessageContentSchema,
    status: MessageStatusSchema,
    modelProvider: z.string().min(1).max(32).nullable(),
    modelId: z.string().min(1).max(160).nullable(),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    finishReason: FinishReasonSchema.nullable(),
    errorCode: ErrorCodeSchema.nullable(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    deletedAt: IsoDateSchema.nullable(),
    syncVersion: SyncVersionSchema
  })
  .strict();

export const NewUserMessageSchema = z
  .object({
    id: UlidSchema,
    clientOperationId: UlidSchema,
    content: UserMessageContentSchema
  })
  .strict();

export const ChatStreamRequestSchema = z
  .object({
    conversationId: UlidSchema,
    message: NewUserMessageSchema,
    modelMode: ModelModeSchema.optional(),
    webSearch: z.boolean().optional()
  })
  .strict();

export const ChatCancelRequestSchema = z
  .object({
    generationId: UlidSchema
  })
  .strict();

export const ChatRegenerateRequestSchema = z
  .object({
    conversationId: UlidSchema,
    sourceMessageId: UlidSchema,
    clientOperationId: IdempotencyKeySchema,
    modelMode: ModelModeSchema.optional(),
    webSearch: z.boolean().optional()
  })
  .strict();

export const MessageListQuerySchema = z
  .object({
    before: UlidSchema.optional(),
    limit: createIntegerQuerySchema(
      1,
      CONTRACT_LIMITS.MESSAGES_PAGE_MAX
    ).default(CONTRACT_LIMITS.MESSAGES_PAGE_MAX)
  })
  .strict();

export const MessageListDataSchema = z
  .object({
    items: z.array(ChatMessageSchema).max(CONTRACT_LIMITS.MESSAGES_PAGE_MAX),
    nextCursor: UlidSchema.nullable(),
    hasMore: z.boolean()
  })
  .strict();

export const StreamStartEventSchema = z
  .object({
    event: z.literal("start"),
    data: z
      .object({
        generationId: UlidSchema,
        userMessageId: UlidSchema,
        assistantMessageId: UlidSchema,
        requestId: RequestIdSchema
      })
      .strict()
  })
  .strict();

export const StreamDeltaEventSchema = z
  .object({
    event: z.literal("delta"),
    data: z
      .object({
        messageId: UlidSchema,
        sequence: z.number().int().nonnegative(),
        text: z
          .string()
          .min(1)
          .refine(
            (value) =>
              hasMaxUtf8Bytes(value, CONTRACT_LIMITS.STREAM_DELTA_MAX_BYTES),
            "Supera el límite UTF-8 del delta"
          )
      })
      .strict()
  })
  .strict();

export const StreamUsageEventSchema = z
  .object({
    event: z.literal("usage"),
    data: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative()
      })
      .strict()
  })
  .strict();

export const StreamDoneEventSchema = z
  .object({
    event: z.literal("done"),
    data: z
      .object({
        finishReason: FinishReasonSchema,
        message: ChatMessageSchema
      })
      .strict()
  })
  .strict();

export const StreamErrorEventSchema = z
  .object({
    event: z.literal("error"),
    data: z
      .object({
        code: ErrorCodeSchema,
        message: z.string().min(1).max(512),
        requestId: RequestIdSchema,
        details: z.unknown().nullable()
      })
      .strict()
  })
  .strict();

export const ChatStreamEventSchema = z.discriminatedUnion("event", [
  StreamStartEventSchema,
  StreamDeltaEventSchema,
  StreamUsageEventSchema,
  StreamDoneEventSchema,
  StreamErrorEventSchema
]);

export type MessageRole = z.infer<typeof MessageRoleSchema>;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;
export type FinishReason = z.infer<typeof FinishReasonSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type NewUserMessage = z.infer<typeof NewUserMessageSchema>;
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;
export type ChatCancelRequest = z.infer<typeof ChatCancelRequestSchema>;
export type ChatRegenerateRequest = z.infer<
  typeof ChatRegenerateRequestSchema
>;
export type MessageListQuery = z.infer<typeof MessageListQuerySchema>;
export type MessageListData = z.infer<typeof MessageListDataSchema>;
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;
