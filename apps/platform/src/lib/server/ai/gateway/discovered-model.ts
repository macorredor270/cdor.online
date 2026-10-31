import { AppError } from "../../errors/app-error";
import type { ModelSource } from "../fallback";
import type { AiProvider } from "../types";
import { pickModel } from "./model-pick";

export type DiscoveredModelOptions = Readonly<{
  /** Cuánto se confía en un modelo ya descubierto. */
  ttlMs?: number;
  /** Cuánto se recuerda que no había ninguno, para no insistir en cada petición. */
  negativeTtlMs?: number;
  /** Tiempo máximo de la consulta al catálogo. */
  listTimeoutMs?: number;
  now?: () => number;
}>;

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_NEGATIVE_TTL_MS = 60 * 1000;
const DEFAULT_LIST_TIMEOUT_MS = 10_000;

/**
 * Descubre el modelo de un proveedor consultando su catálogo y eligiendo según
 * una lista de preferencias (ver `pickModel`). Cachea el resultado, comparte
 * una única consulta entre peticiones simultáneas y se puede invalidar cuando
 * el proveedor deja de reconocer el modelo.
 *
 * La consulta compartida no depende de la cancelación de ninguna petición
 * concreta: si quien la inició se va, las demás siguen esperando el mismo
 * resultado.
 */
export class DiscoveredModel implements ModelSource {
  #cached: { id: string | null; at: number } | null = null;
  #inFlight: Promise<string> | null = null;

  readonly #ttlMs: number;
  readonly #negativeTtlMs: number;
  readonly #listTimeoutMs: number;
  readonly #now: () => number;

  constructor(
    private readonly provider: AiProvider,
    private readonly prefer: readonly RegExp[],
    options: DiscoveredModelOptions = {}
  ) {
    this.#ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.#negativeTtlMs = options.negativeTtlMs ?? DEFAULT_NEGATIVE_TTL_MS;
    this.#listTimeoutMs = options.listTimeoutMs ?? DEFAULT_LIST_TIMEOUT_MS;
    this.#now = options.now ?? Date.now;
  }

  resolve(signal: AbortSignal): Promise<string> {
    return abortable(this.#load(), signal);
  }

  invalidate(): void {
    this.#cached = null;
  }

  #load(): Promise<string> {
    const cached = this.#cached;
    if (cached) {
      const age = this.#now() - cached.at;
      if (cached.id !== null && age < this.#ttlMs) {
        return Promise.resolve(cached.id);
      }
      if (cached.id === null && age < this.#negativeTtlMs) {
        return Promise.reject(noModel());
      }
    }
    this.#inFlight ??= this.#discover().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #discover(): Promise<string> {
    const models = await this.provider.listModels(
      AbortSignal.timeout(this.#listTimeoutMs)
    );
    const id = pickModel(
      models.map((model) => model.id),
      this.prefer
    );
    this.#cached = { id, at: this.#now() };
    if (id === null) throw noModel();
    return id;
  }
}

function noModel(): AppError {
  return new AppError(
    "MODEL_UNAVAILABLE",
    "El proveedor no publica ningún modelo reconocido"
  );
}

/** Espera la promesa, pero se rinde en cuanto se cancela la petición. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(
      new AppError("STREAM_CANCELLED", "La generación fue cancelada")
    );
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () =>
      reject(new AppError("STREAM_CANCELLED", "La generación fue cancelada"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
