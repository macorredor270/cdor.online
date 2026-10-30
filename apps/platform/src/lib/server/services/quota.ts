import type { QuotaMeter, QuotaSnapshot } from "@cdor/contracts";
import { AppError } from "../errors/app-error";
import {
  GLOBAL_SUBJECT,
  type QuotaRepository
} from "../db/repositories/quota";

/** `0` desactiva el límite correspondiente. */
export type QuotaLimits = Readonly<{
  userMessagesPerDay: number;
  userTokensPerDay: number;
  globalTokensPerDay: number;
}>;

/** Prueba de que un mensaje se contó, para devolverlo si la petición falla. */
export type MessageReservation = Readonly<{
  userId: string;
  windowStart: Date;
  counted: boolean;
}>;

const DAY_MS = 24 * 60 * 60 * 1000;
const GLOBAL_CACHE_MS = 15_000;
const PURGE_INTERVAL_MS = 60 * 60 * 1000;

/** Inicio (00:00 UTC) del día de `now`. */
export function windowStartFor(now: Date): Date {
  return new Date(Math.floor(now.getTime() / DAY_MS) * DAY_MS);
}

function meter(used: number, limit: number): QuotaMeter {
  return { used, limit: limit > 0 ? limit : null };
}

/**
 * Cuotas diarias (día UTC) de uso de IA.
 *
 * - Mensajes por usuario: límite estricto, contado antes de generar y
 *   devuelto si la generación falla sin dar contenido.
 * - Tokens por usuario y globales: se suman al terminar cada respuesta, cuando
 *   se conoce el consumo real, y se comprueban antes de la siguiente. Pueden
 *   rebasarse como mucho por las generaciones simultáneas ya en curso.
 *
 * El tope global protege el gasto: cuando se alcanza, nadie genera más hasta
 * el día siguiente.
 */
export class QuotaService {
  #globalCache: { used: number; at: number } | null = null;
  #lastPurge = 0;

  constructor(
    private readonly repository: QuotaRepository,
    private readonly limits: QuotaLimits,
    private readonly now: () => Date = () => new Date()
  ) {}

  async reserveMessage(userId: string): Promise<MessageReservation> {
    const now = this.now();
    const windowStart = windowStartFor(now);
    void this.#purgeOccasionally(now);

    const { userMessagesPerDay, userTokensPerDay, globalTokensPerDay } =
      this.limits;

    if (globalTokensPerDay > 0) {
      const used = await this.#globalUsed(windowStart, now);
      if (used >= globalTokensPerDay) {
        throw new AppError(
          "RATE_LIMITED",
          "MAC ha alcanzado su capacidad de hoy. Vuelve a intentarlo mañana: el contador se restablece a medianoche UTC.",
          { details: { quota: "global" } }
        );
      }
    }

    if (userTokensPerDay > 0) {
      const used = await this.repository.read(
        "user_tokens",
        userId,
        windowStart
      );
      if (used >= userTokensPerDay) {
        throw new AppError(
          "RATE_LIMITED",
          "Has alcanzado tu límite diario de uso de IA. Se restablece a medianoche UTC.",
          { details: { quota: "tokens" } }
        );
      }
    }

    if (userMessagesPerDay > 0) {
      const consumed = await this.repository.tryConsume(
        "user_messages",
        userId,
        windowStart,
        1,
        userMessagesPerDay
      );
      if (!consumed) {
        throw new AppError(
          "RATE_LIMITED",
          `Has alcanzado el límite de ${userMessagesPerDay} mensajes de hoy. Se restablece a medianoche UTC.`,
          { details: { quota: "messages" } }
        );
      }
    }

    return { userId, windowStart, counted: userMessagesPerDay > 0 };
  }

  /** Devuelve el mensaje contado: la petición no llegó a generar nada. */
  async refundMessage(reservation: MessageReservation): Promise<void> {
    if (!reservation.counted) return;
    await this.repository.refund(
      "user_messages",
      reservation.userId,
      reservation.windowStart,
      1
    );
  }

  /**
   * Igual que `refundMessage`, para cuando ya no se conserva la reserva: la
   * ventana es la del día en que se creó la generación, no la de hoy.
   */
  async refundMessageAt(userId: string, at: Date): Promise<void> {
    if (this.limits.userMessagesPerDay <= 0) return;
    await this.repository.refund(
      "user_messages",
      userId,
      windowStartFor(at),
      1
    );
  }

  /** Suma el consumo real de una respuesta ya completada. */
  async recordTokens(userId: string, tokens: number): Promise<void> {
    if (!Number.isFinite(tokens) || tokens <= 0) return;
    const amount = Math.ceil(tokens);
    const windowStart = windowStartFor(this.now());
    await this.repository.add("user_tokens", userId, windowStart, amount);
    await this.repository.add(
      "global_tokens",
      GLOBAL_SUBJECT,
      windowStart,
      amount
    );
    if (this.#globalCache) this.#globalCache.used += amount;
  }

  /** Estado actual de las cuotas de un usuario, para mostrarlo en la interfaz. */
  async snapshot(userId: string): Promise<QuotaSnapshot> {
    const windowStart = windowStartFor(this.now());
    const [messages, tokens] = await Promise.all([
      this.repository.read("user_messages", userId, windowStart),
      this.repository.read("user_tokens", userId, windowStart)
    ]);
    return {
      resetsAt: new Date(windowStart.getTime() + DAY_MS).toISOString(),
      messages: meter(messages, this.limits.userMessagesPerDay),
      tokens: meter(tokens, this.limits.userTokensPerDay)
    };
  }

  async #globalUsed(windowStart: Date, now: Date): Promise<number> {
    const cached = this.#globalCache;
    if (cached && now.getTime() - cached.at < GLOBAL_CACHE_MS) {
      return cached.used;
    }
    const used = await this.repository.read(
      "global_tokens",
      GLOBAL_SUBJECT,
      windowStart
    );
    this.#globalCache = { used, at: now.getTime() };
    return used;
  }

  async #purgeOccasionally(now: Date): Promise<void> {
    if (now.getTime() - this.#lastPurge < PURGE_INTERVAL_MS) return;
    this.#lastPurge = now.getTime();
    try {
      await this.repository.purgeExpired(now);
    } catch {
      // La limpieza es oportunista: un fallo no debe afectar al mensaje.
    }
  }
}
