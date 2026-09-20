import {
  CreateMemoryRequestSchema,
  MemoryListQuerySchema
} from "@cdor/contracts";
import { getServices } from "$lib/server/services";
import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { parseJsonRequest } from "$lib/server/http/payload";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, url }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const query = MemoryListQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );
    const data = await getServices().memories.list(principal, query);
    return apiSuccess(data, locals.requestId);
  });

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, CreateMemoryRequestSchema);
    const data = await getServices().memories.create(principal, input);
    return apiSuccess(data, locals.requestId, { status: 201 });
  });
