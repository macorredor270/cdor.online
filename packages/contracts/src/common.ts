import { z } from "zod";
import { CONTRACT_LIMITS } from "./limits";

export const API_VERSION = "v1" as const;
export const API_BASE_PATH = `/api/${API_VERSION}` as const;

export const MAX_UNSIGNED_BIGINT = 18_446_744_073_709_551_615n;

export const UlidSchema = z
  .string()
  .regex(
    /^[0-9A-HJKMNP-TV-Z]{26}$/,
    "Debe ser un ULID Crockford en mayúsculas de 26 caracteres"
  );

export const RequestIdSchema = UlidSchema;
export const IdempotencyKeySchema = UlidSchema;
export const IdempotencyHeadersSchema = z
  .object({
    "idempotency-key": IdempotencyKeySchema
  })
  .strict();

export const IsoDateSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    "Debe ser una fecha UTC ISO 8601 con milisegundos"
  )
  .refine((value) => {
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
  }, "Fecha no válida");

export const UnsignedBigIntStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,19})$/, "Debe ser un entero decimal sin signo")
  .refine(
    (value) => BigInt(value) <= MAX_UNSIGNED_BIGINT,
    "Supera el rango BIGINT UNSIGNED"
  );

export const SyncVersionSchema = UnsignedBigIntStringSchema;
export const SyncCursorSchema = UnsignedBigIntStringSchema;

export const OpaqueCursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, "Cursor opaco no válido");

export function createIntegerQuerySchema(minimum: number, maximum: number) {
  return z
    .union([
      z.number().int(),
      z
        .string()
        .regex(/^(0|[1-9]\d*)$/)
        .transform((value) => Number(value))
    ])
    .pipe(z.number().int().min(minimum).max(maximum));
}

export const PageLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(CONTRACT_LIMITS.MEMORIES_PAGE_MAX);
export const PageLimitQuerySchema = createIntegerQuerySchema(
  1,
  CONTRACT_LIMITS.MEMORIES_PAGE_MAX
);

export const ApiMetaSchema = z
  .object({
    requestId: RequestIdSchema
  })
  .strict();

export const PaginationMetaSchema = ApiMetaSchema.extend({
  nextCursor: OpaqueCursorSchema.nullable(),
  hasMore: z.boolean()
}).strict();

export function createApiSuccessSchema<const TSchema extends z.ZodType>(
  dataSchema: TSchema
) {
  return z
    .object({
      data: dataSchema,
      meta: ApiMetaSchema
    })
    .strict();
}

export type Ulid = z.infer<typeof UlidSchema>;
export type IdempotencyHeaders = z.infer<typeof IdempotencyHeadersSchema>;
export type IsoDate = z.infer<typeof IsoDateSchema>;
export type UnsignedBigIntString = z.infer<
  typeof UnsignedBigIntStringSchema
>;
export type ApiMeta = z.infer<typeof ApiMetaSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
