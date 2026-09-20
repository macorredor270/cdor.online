import { ChatRegenerateRequestSchema } from "@cdor/contracts";
import { requirePrincipal } from "$lib/server/http/principal";
import { parseJsonRequest } from "$lib/server/http/payload";
import { apiHandler } from "$lib/server/http/response";
import { getChatStreamService } from "$lib/server/services/chat-runtime";
import { streamGeneration } from "$lib/server/stream/generation-response";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, ChatRegenerateRequestSchema);
    const service = getChatStreamService();
    return streamGeneration({
      service,
      principal,
      prepared: await service.prepareRegeneration(principal, input),
      requestSignal: request.signal,
      requestId: locals.requestId
    });
  });
