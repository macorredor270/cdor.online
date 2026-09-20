import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { getServices } from "$lib/server/services";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = ({ locals, params }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    await getServices().devices.revoke(principal, params.deviceId);
    return apiSuccess({ revoked: true }, locals.requestId);
  });
