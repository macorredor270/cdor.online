import { ChatCancelRequestSchema } from "@cdor/contracts";
import { requirePrincipal } from "$lib/server/http/principal";
import { parseJsonRequest } from "$lib/server/http/payload";
import {
  apiHandler,
  apiSuccess
} from "$lib/server/http/response";
import { getChatStreamService } from "$lib/server/services/chat-runtime";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, ChatCancelRequestSchema);
    return apiSuccess(
      await getChatStreamService().cancel(principal, input.generationId),
      locals.requestId
    );
  });
