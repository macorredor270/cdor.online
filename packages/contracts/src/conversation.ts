import { z } from "zod";
import {
  createIntegerQuerySchema,
  IsoDateSchema,
  OpaqueCursorSchema,
  SyncVersionSchema,
  UlidSchema
} from "./common";
import { CONTRACT_LIMITS } from "./limits";

export const ConversationTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(CONTRACT_LIMITS.TITLE_MAX_CHARACTERS);

export const ModelModeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/);

export const ConversationSchema = z
  .object({
    id: UlidSchema,
    userId: UlidSchema,
    title: ConversationTitleSchema,
    modelMode: ModelModeSchema,
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    deletedAt: IsoDateSchema.nullable(),
    syncVersion: SyncVersionSchema
  })
  .strict();

export const CreateConversationRequestSchema = z
  .object({
    id: UlidSchema.optional(),
    title: ConversationTitleSchema.optional(),
    modelMode: ModelModeSchema
  })
  .strict();

export const UpdateConversationRequestSchema = z
  .object({
    title: ConversationTitleSchema.optional(),
    modelMode: ModelModeSchema.optional(),
    baseVersion: SyncVersionSchema
  })
  .strict()
  .refine(
    (value) => value.title !== undefined || value.modelMode !== undefined,
    "Debe cambiarse al menos un campo"
  );

export const ConversationListQuerySchema = z
  .object({
    cursor: OpaqueCursorSchema.optional(),
    limit: createIntegerQuerySchema(
      1,
      CONTRACT_LIMITS.CONVERSATIONS_PAGE_MAX
    ).default(CONTRACT_LIMITS.CONVERSATIONS_PAGE_MAX)
  })
  .strict();

export const ConversationListDataSchema = z
  .object({
    items: z
      .array(ConversationSchema)
      .max(CONTRACT_LIMITS.CONVERSATIONS_PAGE_MAX),
    nextCursor: OpaqueCursorSchema.nullable(),
    hasMore: z.boolean()
  })
  .strict();

export type Conversation = z.infer<typeof ConversationSchema>;
export type CreateConversationRequest = z.infer<
  typeof CreateConversationRequestSchema
>;
export type UpdateConversationRequest = z.infer<
  typeof UpdateConversationRequestSchema
>;
export type ConversationListQuery = z.infer<
  typeof ConversationListQuerySchema
>;
export type ConversationListData = z.infer<
  typeof ConversationListDataSchema
>;
