import {
  MessageListQuerySchema,
  UlidSchema
} from "@cdor/contracts";
import { getServices } from "$lib/server/services";
import { requirePrincipal } from "$lib/server/http/principal";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, params, url }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const conversationId = UlidSchema.parse(params.conversationId);
    const query = MessageListQuerySchema.parse(
      Object.fromEntries(url.searchParams)
    );
    const data = await getServices().messages.list(
      principal,
      conversationId,
      query
    );
    return apiSuccess(data, locals.requestId);
  });
