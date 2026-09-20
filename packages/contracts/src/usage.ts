import { z } from "zod";
import { IsoDateSchema, UnsignedBigIntStringSchema } from "./common";

export const UsageSummarySchema = z
  .object({
    periodStart: IsoDateSchema,
    periodEnd: IsoDateSchema,
    generations: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
    knownCostMicrousd: UnsignedBigIntStringSchema
  })
  .strict();

export type UsageSummary = z.infer<typeof UsageSummarySchema>;
