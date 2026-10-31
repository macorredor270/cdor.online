import type { ErrorCode } from "@cdor/contracts";
import { AppError } from "../errors/app-error";
import { RateWindow } from "./gateway/limiter";
import { estimateMessagesTokens } from "./token-budget";
import type { AiChatRequest, AiChunk, AiModel, AiProvider } from "./types";

/**
 * Modelo que se pide a un proveedor cuando no es fijo: se descubre en su
 * catálogo. `invalidate` se llama si el proveedor dice que ya no lo tiene, para
 * que el siguiente intento vuelva a descubrirlo.
 */
export type ModelSource = Readonly<{
  resolve: (signal: AbortSignal) => Promise<string>;
  invalidate?: () => void;
}>;

/** Un despliegue de la cadena: un proveedor con el modelo que se le pide. */
export type FallbackEntry = Readonly<{
  provider: AiProvider;
  /** Modelo para este proveedor; sin él se usa el de la petición. */
  model?: string | ModelSource;
  /** Peticiones por minuto que admite. Sin valor, sin límite propio. */
  rpm?: number;
  /** Peso en el reparto `weighted`. Por defecto `rpm`, o 1 si tampoco hay. */
  weight?: number;
  /** Ventana de contexto en tokens. Por defecto, la admite todo. */
  contextTokens?: number;
}>;

export type FallbackOptions = Readonly<{
  /** Nombre con el que se presenta. Por defecto, el del primer proveedor. */
  name?: string;
  /**
   * `ordered`: se usa el primero disponible y los demás son respaldo.
   * `weighted`: se reparte la carga al azar según el peso de cada despliegue.
   */
  strategy?: "ordered" | "weighted";
  /**
   * Tiempo máximo hasta el primer texto de un proveedor antes de pasar al
   * siguiente. Sin él, un proveedor colgado haría esperar hasta su propio
   * timeout (minutos) antes de probar el respaldo.
   */
  firstTokenTimeoutMs?: number;
  /** Cuánto se aparta a un proveedor que falla, si no dice cuánto. */
  cooldownMs?: number;
  now?: () => number;
  random?: () => number;
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
 * Cadena de proveedores con respaldo automático y reparto de carga, a partir
 * de las ideas del Router de LiteLLM: un grupo de despliegues tras un único
 * nombre, límite de peticiones por despliegue, enfriamiento individual,
 * descarte previo por ventana de contexto y respaldo ante errores.
 *
 * Prueba los despliegues y pasa al siguiente si uno falla **antes de entregar
 * texto**. Una vez emitido el primer fragmento no se cambia: la respuesta
 * empezada con un modelo no puede continuarla otro sin duplicar o contradecir
 * lo ya mostrado, así que el error se propaga.
 *
 * Un despliegue que falla queda apartado un tiempo (el `Retry-After` que
 * indique, o el predeterminado): las siguientes peticiones van directas a los
 * demás en lugar de esperar otro fallo. Si todos están apartados, sin cupo o
 * sin contexto suficiente se prueban igualmente, en orden: nunca se rechaza una
 * petición sin intentarla.
 *
 * El estado (cupos y enfriamientos) vive en memoria del proceso. Sin Redis, con
 * varias instancias cada una llevaría su cuenta; el 429 real del proveedor
 * sigue siendo la red de seguridad.
 *
 * El proveedor que realmente sirvió se anuncia con un fragmento `route`.
 */
export class FallbackProvider implements AiProvider {
  readonly name: string;
  readonly #entries: readonly FallbackEntry[];
  readonly #windows = new Map<FallbackEntry, RateWindow>();
  readonly #unavailableUntil = new Map<FallbackEntry, number>();
  readonly #strategy: "ordered" | "weighted";
  readonly #firstTokenTimeoutMs: number;
  readonly #cooldownMs: number;
  readonly #now: () => number;
  readonly #random: () => number;
  readonly #onFailover: (event: FailoverEvent) => void;

  constructor(
    entries: readonly FallbackEntry[],
    options: FallbackOptions = {}
  ) {
    const [primary] = entries;
    if (!primary) {
      throw new Error("FallbackProvider necesita al menos un proveedor");
    }
    this.name = options.name ?? primary.provider.name;
    this.#entries = entries;
    for (const entry of entries) {
      this.#windows.set(entry, new RateWindow(entry.rpm));
    }
    this.#strategy = options.strategy ?? "ordered";
    this.#firstTokenTimeoutMs =
      options.firstTokenTimeoutMs ?? DEFAULT_FIRST_TOKEN_TIMEOUT_MS;
    this.#cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.#now = options.now ?? Date.now;
    this.#random = options.random ?? Math.random;
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
    const attempts = this.#order(request);
    let firstError: AppError | null = null;

    for (const [position, entry] of attempts.entries()) {
      const next = attempts[position + 1];
      this.#windows.get(entry)?.record(this.#now());
      try {
        yield* this.#attempt(entry, request, signal);
        this.#unavailableUntil.delete(entry);
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
        if (error.code === "MODEL_UNAVAILABLE") {
          // Puede que el proveedor haya retirado el modelo: que se vuelva a
          // descubrir en el siguiente intento.
          const source = modelSource(entry);
          source?.invalidate?.();
        }
        this.#penalize(entry, error);
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

  /**
   * Despliegues utilizables, en el orden en que se probarán: sin enfriamiento,
   * con cupo y con ventana de contexto suficiente. Si no queda ninguno se
   * prueban todos, en su orden.
   */
  #order(request: AiChatRequest): readonly FallbackEntry[] {
    const now = this.#now();
    const needed =
      estimateMessagesTokens(request.messages) + request.maxOutputTokens;
    const usable = this.#entries.filter(
      (entry) =>
        (this.#unavailableUntil.get(entry) ?? 0) <= now &&
        (this.#windows.get(entry)?.hasCapacity(now) ?? true) &&
        (entry.contextTokens === undefined || entry.contextTokens >= needed)
    );
    if (usable.length === 0) return this.#entries;
    return this.#strategy === "weighted" ? this.#shuffle(usable) : usable;
  }

  /**
   * Orden aleatorio ponderado sin repetición (Efraimidis–Spirakis): cada
   * despliegue recibe una clave `u^(1/peso)` y se ordena de mayor a menor, de
   * modo que el de más peso sale primero con más frecuencia, pero los demás
   * siguen disponibles como respaldo.
   */
  #shuffle(entries: readonly FallbackEntry[]): readonly FallbackEntry[] {
    return entries
      .map((entry) => {
        const weight = Math.max(entry.weight ?? entry.rpm ?? 1, 1e-6);
        // `1 - random()` evita u = 0, para el que la clave sería 0 siempre.
        return { entry, key: Math.pow(1 - this.#random(), 1 / weight) };
      })
      .sort((left, right) => right.key - left.key)
      .map(({ entry }) => entry);
  }

  #penalize(entry: FallbackEntry, error: AppError): void {
    if (!COOLDOWN_CODES.has(error.code)) return;
    this.#unavailableUntil.set(
      entry,
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
    try {
      // Descubrir el modelo también cuenta contra el tiempo máximo: es una
      // petición de red más al mismo proveedor.
      const model = await this.#modelFor(entry, request, controller.signal);
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

  async #modelFor(
    entry: FallbackEntry,
    request: AiChatRequest,
    signal: AbortSignal
  ): Promise<string> {
    const { model } = entry;
    if (model === undefined) return request.model;
    if (typeof model === "string") return model;
    return model.resolve(signal);
  }
}

function modelSource(entry: FallbackEntry): ModelSource | null {
  return entry.model !== undefined && typeof entry.model !== "string"
    ? entry.model
    : null;
}

/** Marca un error ocurrido tras entregar texto, que no admite respaldo. */
class CommittedError extends Error {
  constructor(override readonly cause: unknown) {
    super("committed");
  }
}
