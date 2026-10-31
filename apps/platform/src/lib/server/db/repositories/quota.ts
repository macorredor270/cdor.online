import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { rateLimitBuckets } from "../schema";

/**
 * Contadores diarios sobre `rate_limit_buckets`.
 *
 * Cada contador es una fila (ámbito, sujeto, inicio de ventana). Los sujetos se
 * guardan como hash para que la tabla no contenga identificadores de usuario
 * legibles. Las operaciones son sentencias únicas, de modo que dos peticiones
 * simultáneas nunca leen el mismo valor y escriben por encima una de otra.
 */
export type QuotaScope = "user_messages" | "user_tokens" | "global_tokens";

/** Las filas caducan pasado un día de margen sobre el fin de su ventana. */
const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

export const GLOBAL_SUBJECT = "global";
const MAXIMUM_COUNT = 4_294_967_295;

function hashSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

export class QuotaRepository {
  constructor(private readonly database: Database) {}

  async #ensureRow(
    scope: QuotaScope,
    subject: string,
    windowStart: Date
  ): Promise<void> {
    await this.database
      .insert(rateLimitBuckets)
      .ignore()
      .values({
        scope,
        subjectHash: hashSubject(subject),
        windowStartedAt: windowStart,
        requestCount: 0,
        expiresAt: new Date(windowStart.getTime() + RETENTION_MS)
      });
  }

  #where(scope: QuotaScope, subject: string, windowStart: Date) {
    return and(
      eq(rateLimitBuckets.scope, scope),
      eq(rateLimitBuckets.subjectHash, hashSubject(subject)),
      eq(rateLimitBuckets.windowStartedAt, windowStart)
    );
  }

  async read(
    scope: QuotaScope,
    subject: string,
    windowStart: Date
  ): Promise<number> {
    const [row] = await this.database
      .select({ count: rateLimitBuckets.requestCount })
      .from(rateLimitBuckets)
      .where(this.#where(scope, subject, windowStart))
      .limit(1);
    return row?.count ?? 0;
  }

  /**
   * Suma `amount` solo si el total no supera `limit`. Devuelve `false` sin
   * modificar nada cuando ya no cabe. Es atómico: la comprobación y la suma
   * ocurren en la misma sentencia.
   */
  async tryConsume(
    scope: QuotaScope,
    subject: string,
    windowStart: Date,
    amount: number,
    limit: number
  ): Promise<boolean> {
    await this.#ensureRow(scope, subject, windowStart);
    const [result] = await this.database
      .update(rateLimitBuckets)
      .set({
        requestCount: sql`${rateLimitBuckets.requestCount} + ${amount}`
      })
      .where(
        and(
          this.#where(scope, subject, windowStart),
          sql`${rateLimitBuckets.requestCount} + ${amount} <= ${limit}`
        )
      );
    return result.affectedRows > 0;
  }

  /** Suma sin límite: el consumo real de tokens se conoce al terminar. */
  async add(
    scope: QuotaScope,
    subject: string,
    windowStart: Date,
    amount: number
  ): Promise<void> {
    if (amount <= 0) return;
    await this.#ensureRow(scope, subject, windowStart);
    await this.database
      .update(rateLimitBuckets)
      .set({
        // LEAST evita un desbordamiento de INT UNSIGNED si el contador
        // global llegara a su máximo: mejor saturar que fallar la petición.
        requestCount: sql`LEAST(${rateLimitBuckets.requestCount} + ${amount}, ${MAXIMUM_COUNT})`
      })
      .where(this.#where(scope, subject, windowStart));
  }

  /** Devuelve `amount` sin bajar de cero. */
  async refund(
    scope: QuotaScope,
    subject: string,
    windowStart: Date,
    amount: number
  ): Promise<void> {
    if (amount <= 0) return;
    await this.database
      .update(rateLimitBuckets)
      .set({
        requestCount: sql`GREATEST(CAST(${rateLimitBuckets.requestCount} AS SIGNED) - ${amount}, 0)`
      })
      .where(this.#where(scope, subject, windowStart));
  }

  /** Borra los contadores caducados. Devuelve cuántos eliminó. */
  async purgeExpired(now: Date, limit = 500): Promise<number> {
    const [result] = await this.database
      .delete(rateLimitBuckets)
      .where(lt(rateLimitBuckets.expiresAt, now))
      .limit(limit);
    return result.affectedRows;
  }
}
