import type { ErrorCode } from "@cdor/contracts";

const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = Object.freeze({
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  RESOURCE_NOT_FOUND: 404,
  CONVERSATION_NOT_FOUND: 404,
  MESSAGE_NOT_FOUND: 404,
  MEMORY_NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  MODEL_UNAVAILABLE: 503,
  AI_PROVIDER_TIMEOUT: 504,
  AI_PROVIDER_ERROR: 502,
  STREAM_CANCELLED: 409,
  SYNC_CURSOR_INVALID: 409,
  INTERNAL_ERROR: 500
});

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown | null;

  constructor(
    code: ErrorCode,
    message: string,
    options: { status?: number; details?: unknown | null } = {}
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? STATUS_BY_CODE[code];
    this.details = options.details ?? null;
  }
}
