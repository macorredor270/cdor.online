import { z } from "zod";
import { RequestIdSchema } from "./common";

export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "RESOURCE_NOT_FOUND",
  "CONVERSATION_NOT_FOUND",
  "MESSAGE_NOT_FOUND",
  "MEMORY_NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "MODEL_UNAVAILABLE",
  "AI_PROVIDER_TIMEOUT",
  "AI_PROVIDER_ERROR",
  "STREAM_CANCELLED",
  "SYNC_CURSOR_INVALID",
  "INTERNAL_ERROR"
]);

export const ApiErrorBodySchema = z
  .object({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    requestId: RequestIdSchema,
    details: z.unknown().nullable()
  })
  .strict();

export const ApiErrorSchema = z
  .object({
    error: ApiErrorBodySchema
  })
  .strict();

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
