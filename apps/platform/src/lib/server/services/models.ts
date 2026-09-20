import {
  ModelCatalogDataSchema,
  type ModelAvailability,
  type ModelCatalogData
} from "@cdor/contracts";
import {
  DEFAULT_MODEL_MODE,
  MODEL_MODES,
  type ModelModeDefinition
} from "../ai/catalog";
import type { AllowedModel } from "../ai/model-router";
import type { AiProvider } from "../ai/types";

const AVAILABILITY_TTL_MS = 5 * 60 * 1000;
const AVAILABILITY_TIMEOUT_MS = 5_000;

export type ModelCatalogOptions = Readonly<{
  availabilityTtlMs?: number;
  availabilityTimeoutMs?: number;
  now?: () => Date;
}>;

/**
 * Publica el catálogo propio de MAC y enriquece cada entrada con la
 * disponibilidad real del proveedor. La consulta al proveedor se cachea y su
 * fallo nunca tumba el endpoint: se conserva el último resultado conocido y,
 * si nunca hubo uno, la disponibilidad se declara `unknown`.
 */
export class ModelCatalogService {
  #availableIds: ReadonlySet<string> | null = null;
  #verifiedAt: Date | null = null;
  #refreshedAt: number | null = null;
  #inFlight: Promise<void> | null = null;

  readonly #ttlMs: number;
  readonly #timeoutMs: number;
  readonly #now: () => Date;

  constructor(
    private readonly provider: AiProvider,
    private readonly model: AllowedModel,
    options: ModelCatalogOptions = {}
  ) {
    this.#ttlMs = options.availabilityTtlMs ?? AVAILABILITY_TTL_MS;
    this.#timeoutMs = options.availabilityTimeoutMs ?? AVAILABILITY_TIMEOUT_MS;
    this.#now = options.now ?? (() => new Date());
  }

  async list(): Promise<ModelCatalogData> {
    await this.#refreshAvailability();
    const availability = this.#availabilityOf(this.model.id);
    return ModelCatalogDataSchema.parse({
      items: MODEL_MODES.map((definition) => this.#entry(definition, availability)),
      defaultMode: DEFAULT_MODEL_MODE,
      verifiedAt: this.#verifiedAt?.toISOString() ?? null
    });
  }

  #entry(definition: ModelModeDefinition, availability: ModelAvailability) {
    return {
      mode: definition.mode,
      displayName: definition.displayName,
      description: definition.description,
      provider: this.provider.name,
      modelId: this.model.id,
      contextTokens: this.model.contextTokens,
      maximumOutputTokens: this.model.maximumOutputTokens,
      isDefault: definition.mode === DEFAULT_MODEL_MODE,
      availability
    };
  }

  #availabilityOf(modelId: string): ModelAvailability {
    if (this.#availableIds === null) {
      return "unknown";
    }
    return this.#availableIds.has(modelId) ? "available" : "unavailable";
  }

  async #refreshAvailability(): Promise<void> {
    const elapsed = this.#refreshedAt;
    if (elapsed !== null && Date.now() - elapsed < this.#ttlMs) {
      return;
    }
    this.#inFlight ??= this.#fetchAvailability().finally(() => {
      this.#inFlight = null;
    });
    await this.#inFlight;
  }

  async #fetchAvailability(): Promise<void> {
    try {
      const models = await this.provider.listModels(
        AbortSignal.timeout(this.#timeoutMs)
      );
      this.#availableIds = new Set(models.map(({ id }) => id));
      this.#verifiedAt = this.#now();
      this.#refreshedAt = Date.now();
    } catch {
      // Un proveedor inalcanzable no invalida el catálogo propio: se mantiene
      // la última verificación y se reintenta en la siguiente ventana.
      this.#refreshedAt = Date.now();
    }
  }
}
