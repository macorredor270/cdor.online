import { LinkDeviceRequestSchema } from "@cdor/contracts";
import { parseJsonRequest } from "$lib/server/http/payload";
import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { getServices } from "$lib/server/services";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    return apiSuccess(
      await getServices().devices.list(principal),
      locals.requestId
    );
  });

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, LinkDeviceRequestSchema);
    return apiSuccess(
      await getServices().devices.link(principal, input),
      locals.requestId,
      { status: 201 }
    );
  });
