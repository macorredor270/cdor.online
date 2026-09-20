// Modos que MAC publica al usuario. El catálogo es propio: nunca se expone
// automáticamente todo lo que devuelva el proveedor. Cada modo se resuelve
// contra el modelo validado en configuración, de forma que `GET /api/v1/models`
// solo anuncia lo que `POST /api/v1/chat/stream` aceptará.

export const DEFAULT_MODEL_MODE = "balanced";

export type ModelModeDefinition = Readonly<{
  mode: string;
  displayName: string;
  description: string;
}>;

export const MODEL_MODES: readonly ModelModeDefinition[] = Object.freeze([
  Object.freeze({
    mode: DEFAULT_MODEL_MODE,
    displayName: "Equilibrado",
    description:
      "Modo único de la versión 1. Equilibra calidad, latencia y coste con el modelo validado por el benchmark de MAC."
  })
]);

export function isSupportedModelMode(mode: string): boolean {
  return MODEL_MODES.some((definition) => definition.mode === mode);
}
