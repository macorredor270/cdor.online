import { ChatStreamRequestSchema } from "@cdor/contracts";
import { requirePrincipal } from "#lib/server/http/principal.js";
import { parseJsonRequest } from "#lib/server/http/payload.js";
import { apiHandler } from "#lib/server/http/response.js";
import { getChatStreamService } from "#lib/server/services/chat-runtime.js";
import { streamGeneration } from "#lib/server/stream/generation-response.js";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, ChatStreamRequestSchema);
    const service = getChatStreamService();
    return streamGeneration({
      service,
      principal,
      prepared: await service.prepare(principal, input),
      requestSignal: request.signal,
      requestId: locals.requestId
    });
  });
