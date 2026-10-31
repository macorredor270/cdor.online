import { requirePrincipal } from "#lib/server/http/principal.js";
import { apiHandler, apiSuccess } from "#lib/server/http/response.js";
import { getModelCatalogService } from "#lib/server/services/chat-runtime.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  apiHandler(locals.requestId, async () => {
    requirePrincipal(locals.principal);
    return apiSuccess(await getModelCatalogService().list(), locals.requestId);
  });
