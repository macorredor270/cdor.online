import type { MemoryListData } from "@cdor/contracts";
import { apiRequest } from "#lib/client/api.js";
import type { PageLoad } from "./$types";

/**
 * La lista se transmite sin esperarla: el formulario de alta se puede usar
 * mientras llegan las memorias existentes, en vez de bloquear la navegación
 * entera hasta que responda la API.
 */
export const load: PageLoad = ({ fetch }) => ({
  list: apiRequest<MemoryListData>(fetch, "/api/v1/memories?limit=100")
});
