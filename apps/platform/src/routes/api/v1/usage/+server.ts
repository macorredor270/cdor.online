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
      await getServices().usage.summarize(principal),
      locals.requestId
    );
  });
