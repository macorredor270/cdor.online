import {
  SyncVersionSchema,
  UlidSchema,
  UpdateMemoryRequestSchema
} from "@cdor/contracts";
import { getServices } from "#lib/server/services/index.js";
import { requirePrincipal } from "#lib/server/http/principal.js";
import { apiHandler, apiSuccess } from "#lib/server/http/response.js";
import { parseJsonRequest } from "#lib/server/http/payload.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, params }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const id = UlidSchema.parse(params.memoryId);
    const data = await getServices().memories.get(principal, id);
    return apiSuccess(data, locals.requestId);
  });

export const PATCH: RequestHandler = ({ locals, params, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const id = UlidSchema.parse(params.memoryId);
    const input = await parseJsonRequest(request, UpdateMemoryRequestSchema);
    const data = await getServices().memories.update(principal, id, input);
    return apiSuccess(data, locals.requestId);
  });

export const DELETE: RequestHandler = ({ locals, params, url }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const id = UlidSchema.parse(params.memoryId);
    const baseVersion = SyncVersionSchema.parse(
      url.searchParams.get("baseVersion")
    );
    const data = await getServices().memories.delete(
      principal,
      id,
      baseVersion
    );
    return apiSuccess(data, locals.requestId);
  });
