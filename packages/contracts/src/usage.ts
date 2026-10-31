import { z } from "zod";
import { IsoDateSchema, UnsignedBigIntStringSchema } from "./common";

/** `limit` es `null` cuando ese límite está desactivado. */
export const QuotaMeterSchema = z
  .object({
    used: z.number().int().nonnegative(),
    limit: z.number().int().positive().nullable()
  })
  .strict();

/** Cuotas diarias del usuario; se restablecen a las 00:00 UTC (`resetsAt`). */
export const QuotaSnapshotSchema = z
  .object({
    resetsAt: IsoDateSchema,
    messages: QuotaMeterSchema,
    tokens: QuotaMeterSchema
  })
  .strict();

export const UsageSummarySchema = z
  .object({
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    generations: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    knownCostMicrousd: UnsignedBigIntStringSchema,
    quota: QuotaSnapshotSchema
  })
  .strict();

export type QuotaMeter = z.infer<typeof QuotaMeterSchema>;
export type QuotaSnapshot = z.infer<typeof QuotaSnapshotSchema>;
export type UsageSummary = z.infer<typeof UsageSummarySchema>;
