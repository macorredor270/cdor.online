import type { FailoverEvent } from "../ai/fallback";

export function logProviderFailover(event: FailoverEvent): void {
  // Solo nombres de proveedor y código de error: nunca prompts, respuestas ni
  // identificadores de usuario.
  console.warn(`CDOR_PROVIDER_FAILOVER ${JSON.stringify(event)}`);
}
