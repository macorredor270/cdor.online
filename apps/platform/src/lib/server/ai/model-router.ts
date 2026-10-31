import { AppError } from "../errors/app-error";
import type { AiModel, AiProvider } from "./types";

export type AllowedModel = Readonly<{
  id: string;
  displayName: string;
  contextTokens: number;
  maximumOutputTokens: number;
  benchmarkCost: Readonly<{
    inputPerMillion: number;
    outputPerMillion: number;
  }>;
}>;

// Candidatos explícitos del catálogo oficial. Ninguno se publica al usuario
// ni se convierte en predeterminado hasta superar el benchmark real.
export const NVIDIA_MODEL_CANDIDATES: readonly AllowedModel[] = Object.freeze([
  Object.freeze({
    id: "meta/llama-3.1-8b-instruct",
    displayName: "Llama 3.1 8B Instruct",
    contextTokens: 32_768,
    maximumOutputTokens: 2_048,
    benchmarkCost: Object.freeze({
      inputPerMillion: 1,
      outputPerMillion: 1
    })
  }),
  Object.freeze({
    id: "meta/llama-3.3-70b-instruct",
    displayName: "Llama 3.3 70B Instruct",
    contextTokens: 32_768,
    maximumOutputTokens: 2_048,
    benchmarkCost: Object.freeze({
      inputPerMillion: 1,
      outputPerMillion: 1
    })
  }),
  Object.freeze({
    id: "nvidia/nemotron-3-super-120b-a12b",
    displayName: "Nemotron 3 Super 120B",
    contextTokens: 32_768,
    maximumOutputTokens: 2_048,
    benchmarkCost: Object.freeze({
      inputPerMillion: 1,
      outputPerMillion: 1
    })
  })
]);

const CANDIDATE_BY_ID = new Map(
  NVIDIA_MODEL_CANDIDATES.map((model) => [model.id, model])
);

export function filterAllowedModels(
  providerModels: readonly AiModel[]
): readonly AllowedModel[] {
  const available = new Set(providerModels.map(({ id }) => id));
  return NVIDIA_MODEL_CANDIDATES.filter(({ id }) => available.has(id));
}

export async function resolveConfiguredModel(
  provider: AiProvider,
  configuredModelId: string,
  signal?: AbortSignal
): Promise<AllowedModel> {
  const configured = CANDIDATE_BY_ID.get(configuredModelId);
  if (configured === undefined) {
    throw new AppError(
      "MODEL_UNAVAILABLE",
      "El modelo configurado no pertenece a la allowlist de MAC"
    );
  }

  const available = await provider.listModels(signal);
  if (!available.some(({ id }) => id === configuredModelId)) {
    throw new AppError(
      "MODEL_UNAVAILABLE",
      "El modelo configurado no está disponible en NVIDIA"
    );
  }
  return configured;
}
