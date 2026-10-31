import { LinkDeviceRequestSchema } from "@cdor/contracts";
import { parseJsonRequest } from "#lib/server/http/payload.js";
import { requirePrincipal } from "#lib/server/http/principal.js";
import { apiHandler, apiSuccess } from "#lib/server/http/response.js";
import { getServices } from "#lib/server/services/index.js";
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
