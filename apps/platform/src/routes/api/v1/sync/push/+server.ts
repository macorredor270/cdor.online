import { SyncPushRequestSchema } from "@cdor/contracts";
import { parseJsonRequest } from "$lib/server/http/payload";
import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { getServices } from "$lib/server/services";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(
      request,
      SyncPushRequestSchema
    );
    return apiSuccess(
      await getServices().sync.push(principal, input),
      locals.requestId
    );
  });
