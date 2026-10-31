import {
  UsageSummarySchema,
  type UsageSummary
} from "@cdor/contracts";
import type { Principal } from "../auth/principal";
import { UsageRepository } from "../db/repositories/usage";
import type { QuotaService } from "./quota";

const PERIOD_DAYS = 30;

export class UsageService {
  constructor(
    private readonly repository: UsageRepository,
    private readonly quota: QuotaService,
    private readonly now: () => Date = () => new Date()
  ) {}

  async summarize(principal: Principal): Promise<UsageSummary> {
    const periodEnd = this.now();
    const periodStart = new Date(
      periodEnd.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1_000
    );
    const [aggregate, quota] = await Promise.all([
      this.repository.summarize(principal.userId, periodStart),
      this.quota.snapshot(principal.userId)
    ]);
    return UsageSummarySchema.parse({
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      generations: aggregate.generations,
      inputTokens: aggregate.inputTokens,
      outputTokens: aggregate.outputTokens,
      totalTokens: aggregate.inputTokens + aggregate.outputTokens,
      knownCostMicrousd: aggregate.knownCostMicrousd.toString(),
      quota
    });
  }
}
