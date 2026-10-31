import { and, count, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { usageEvents } from "../schema";

export type UsageAggregate = Readonly<{
  generations: number;
  inputTokens: number;
  outputTokens: number;
  knownCostMicrousd: bigint;
}>;

function safeNumber(value: string | number | bigint | null): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export class UsageRepository {
  constructor(private readonly database: Database) {}

  async summarize(
    userId: string,
    periodStart: Date
  ): Promise<UsageAggregate> {
    const [row] = await this.database
      .select({
        generations: count(),
        inputTokens: sql<string>`COALESCE(SUM(${usageEvents.inputTokens}), 0)`,
        outputTokens: sql<string>`COALESCE(SUM(${usageEvents.outputTokens}), 0)`,
        knownCostMicrousd:
          sql<string>`COALESCE(SUM(${usageEvents.costMicrousd}), 0)`
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.createdAt, periodStart)
        )
      );

    return {
      generations: safeNumber(row?.generations ?? 0),
      inputTokens: safeNumber(row?.inputTokens ?? 0),
      outputTokens: safeNumber(row?.outputTokens ?? 0),
      knownCostMicrousd: BigInt(row?.knownCostMicrousd ?? "0")
    };
  }
}
