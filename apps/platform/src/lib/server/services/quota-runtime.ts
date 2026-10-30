import { getQuotaEnvironment } from "../config";
import { getDatabaseClient } from "../db/client";
import { QuotaRepository } from "../db/repositories/quota";
import { QuotaService } from "./quota";

let quota: QuotaService | undefined;

/**
 * Una sola instancia por proceso: la caché del contador global y la limpieza
 * periódica deben compartirse entre el chat y el resumen de uso.
 */
export function getQuotaService(): QuotaService {
  if (!quota) {
    const environment = getQuotaEnvironment();
    quota = new QuotaService(new QuotaRepository(getDatabaseClient().database), {
      userMessagesPerDay: environment.QUOTA_USER_DAILY_MESSAGES,
      userTokensPerDay: environment.QUOTA_USER_DAILY_TOKENS,
      globalTokensPerDay: environment.QUOTA_GLOBAL_DAILY_TOKENS
    });
  }
  return quota;
}
