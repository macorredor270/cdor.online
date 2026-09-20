import { SyncPullQuerySchema } from "@cdor/contracts";
import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { getServices } from "$lib/server/services";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, url }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const query = SyncPullQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );
    return apiSuccess(
      await getServices().sync.pull(principal, query),
      locals.requestId
    );
  });
