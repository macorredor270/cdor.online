import type { UsageSummary } from "@cdor/contracts";
import { apiRequest } from "#lib/client/api.js";
import type { PageLoad } from "./$types";

/**
 * El resumen no se espera aquí: se devuelve la promesa y la página pinta la
 * cabecera al instante con huecos donde irán las cifras. Antes la navegación
 * se quedaba clavada en la pantalla anterior hasta que respondía la API, sin
 * ninguna señal de que algo estuviera pasando.
 */
export const load: PageLoad = ({ fetch }) => ({
  summary: apiRequest<UsageSummary>(fetch, "/api/v1/usage")
});
