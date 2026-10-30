import type { ErrorCode } from "@cdor/contracts";
import { AppError } from "../errors/app-error";
import type { AiChatRequest, AiChunk, AiModel, AiProvider } from "./types";

/** Un proveedor de la cadena, con el modelo que debe pedírsele. */
export type FallbackEntry = Readonly<{
  provider: AiProvider;
  /** Modelo para este proveedor; sin él se usa el de la petición. */
  model?: string;
}>;

export type FallbackOptions = Readonly<{
  /**
   * Tiempo máximo hasta el primer texto de un proveedor antes de pasar al
   * siguiente. Sin él, un proveedor colgado haría esperar hasta su propio
   * timeout (minutos) antes de probar el respaldo.
   */
  firstTokenTimeoutMs?: number;
  /** Cuánto se aparta a un proveedor que falla, si no dice cuánto. */
  cooldownMs?: number;
  now?: () => number;
  /** Aviso de cada cambio de proveedor. Nunca recibe contenido del chat. */
  onFailover?: (event: FailoverEvent) => void;
}>;

export type FailoverEvent = Readonly<{
  from: string;
  to: string | null;
  code: ErrorCode;
}>;

/**
 * Errores tras los cuales tiene sentido probar otro proveedor. Una
 * cancelación del usuario o un error propio de MAC (validación…) no.
 */
const FAILOVER_CODES: ReadonlySet<ErrorCode> = new Set([
  "RATE_LIMITED",
  "AI_PROVIDER_ERROR",
  "AI_PROVIDER_TIMEOUT",
  "MODEL_UNAVAILABLE"
]);

/**
 * Códigos que apartan al proveedor durante un tiempo. `MODEL_UNAVAILABLE` no:
 * suele depender de esta petición (por ejemplo, un prompt demasiado largo) y
 * no de que el proveedor esté caído.
 */
const COOLDOWN_CODES: ReadonlySet<ErrorCode> = new Set([
  "RATE_LIMITED",
  "AI_PROVIDER_ERROR",
  "AI_PROVIDER_TIMEOUT"
]);

const DEFAULT_FIRST_TOKEN_TIMEOUT_MS = 25_000;
const DEFAULT_COOLDOWN_MS = 20_000;

function retryAfterMs(error: AppError): number | null {
  const details = error.details;
  if (details && typeof details === "object" && "retryAfterMs" in details) {
    const value = (details as { retryAfterMs: unknown }).retryAfterMs;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return null;
}

/**
 * Cadena de proveedores con respaldo automático.
 *
 * Prueba los proveedores en orden y pasa al siguiente si uno falla **antes de
 * entregar texto**. Una vez emitido el primer fragmento no se cambia: la
 * respuesta empezada con un modelo no puede continuarla otro sin duplicar o
 * contradecir lo ya mostrado, así que el error se propaga.
 *
 * Un proveedor que falla queda apartado un tiempo (el `Retry-After` que
 * indique, o el predeterminado): las siguientes peticiones van directas al
 * respaldo en lugar de esperar otro fallo. Si todos están apartados se prueban
 * igualmente, en orden: nunca se rechaza una petición sin intentarla.
 *
 * Se presenta con el nombre del principal para no alterar lo que ya se
 * registra; el proveedor que realmente sirvió se anuncia con un fragmento
 * `route`.
 */
export class FallbackProvider implements AiProvider {
  readonly name: string;
  readonly #entries: readonly FallbackEntry[];
  readonly #unavailableUntil = new Map<AiProvider, number>();
  readonly #firstTokenTimeoutMs: number;
  readonly #cooldownMs: number;
  readonly #now: () => number;
  readonly #onFailover: (event: FailoverEvent) => void;

  constructor(
    entries: readonly FallbackEntry[],
    options: FallbackOptions = {}
  ) {
    const [primary] = entries;
    if (!primary) {
      throw new Error("FallbackProvider necesita al menos un proveedor");
    }
    this.name = primary.provider.name;
    this.#entries = entries;
    this.#firstTokenTimeoutMs =
      options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS;
    this.#cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.#now = options.now ?? Date.now;
    this.#onFailover = options.onFailover ?? (() => undefined);
  }

  /** El catálogo es el del proveedor principal. */
  listModels(signal?: AbortSignal): Promise<readonly AiModel[]> {
    return this.#entries[0].provider.listModels(signal);
  }

  async *streamChat(
    request: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    const attempts = this.#order();
    let firstError: AppError | null = null;

    for (const [position, entry] of attempts.entries()) {
      const next = attempts[position + 1];
      try {
        yield* this.#attempt(entry, request, signal);
        this.#unavailableUntil.delete(entry.provider);
        return;
      } catch (error) {
        if (error instanceof CommittedError) throw error.cause;
        if (
          signal.aborted ||
          !(error instanceof AppError) ||
          !FAILOVER_CODES.has(error.code)
        ) {
          throw error;
        }
        firstError ??= error;
        this.#penalize(entry.provider, error);
        this.#onFailover({
          from: entry.provider.name,
          to: next?.provider.name ?? null,
          code: error.code
        });
      }
    }
    throw firstError ?? new AppError(
      "AI_PROVIDER_ERROR",
      "El proveedor de IA no pudo completar la solicitud"
    );
  }

  /** Primero los disponibles; si no queda ninguno, todos en su orden. */
  #order(): readonly FallbackEntry[] {
    const now = this.#now();
    const available = this.#entries.filter(
      ({ provider }) => (this.#unavailableUntil.get(provider) ?? 0) <= now
    );
    return available.length > 0 ? available : this.#entries;
  }

  #penalize(provider: AiProvider, error: AppError): void {
    if (!COOLDOWN_CODES.has(error.code)) return;
    this.#unavailableUntil.set(
      provider,
      this.#now() + (retryAfterMs(error) ?? this.#cooldownMs)
    );
  }

  async *#attempt(
    entry: FallbackEntry,
    request: AiChatRequest,
    callerSignal: AbortSignal
  ): AsyncIterable<AiChunk> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(callerSignal.reason);
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener("abort", abortFromCaller, { once: true });

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#firstTokenTimeoutMs);
    const stopTimer = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    let committed = false;
    const model = entry.model ?? request.model;
    try {
      for await (const chunk of entry.provider.streamChat(
        { ...request, model },
        controller.signal
      )) {
        if (chunk.type === "delta" && !committed) {
          committed = true;
          stopTimer();
          yield { type: "route", provider: entry.provider.name, model };
        }
        yield chunk;
      }
    } catch (error) {
      // Pasado el primer texto ya no se puede cambiar de proveedor.
      if (committed) throw new CommittedError(error);
      // Nuestro propio corte por lentitud llega como cancelación: es un
      // timeout del proveedor, no una cancelación del usuario.
      if (timedOut && !callerSignal.aborted) {
        throw new AppError(
          "AI_PROVIDER_TIMEOUT",
          "El proveedor de IA tardó demasiado en responder"
        );
      }
      throw error;
    } finally {
      stopTimer();
      callerSignal.removeEventListener("abort", abortFromCaller);
    }
  }
}

/** Marca un error ocurrido tras entregar texto, que no admite respaldo. */
class CommittedError extends Error {
  constructor(override readonly cause: unknown) {
    super("committed");
  }
}
