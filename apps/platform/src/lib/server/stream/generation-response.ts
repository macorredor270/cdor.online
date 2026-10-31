import type { Principal } from "../auth/principal";
import type { PreparedGeneration } from "../db/repositories/generations";
import type { ChatStreamService } from "../services/chat-stream";
import { encodeChatStreamEvent, sseResponse } from "./sse";

/**
 * Plumbing SSE compartido por `/chat/stream` y `/chat/regenerate`: emite los
 * eventos propios de MAC y aborta la generación upstream en cuanto el cliente
 * se desconecta o cancela la lectura.
 */
export function streamGeneration(input: {
  service: ChatStreamService;
  principal: Principal;
  prepared: PreparedGeneration;
  requestSignal: AbortSignal;
  requestId: string;
}): Response {
  const { service, principal, prepared, requestSignal, requestId } = input;
  let closed = false;
  const disconnectController = new AbortController();
  const abortFromRequest = () => disconnectController.abort();
  requestSignal.addEventListener("abort", abortFromRequest, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void service
        .generate(
          principal,
          prepared,
          disconnectController.signal,
          requestId,
          {
            isClosed: () => closed,
            emit: (event) => controller.enqueue(encodeChatStreamEvent(event))
          }
        )
        .finally(() => {
          requestSignal.removeEventListener("abort", abortFromRequest);
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
    cancel() {
      closed = true;
      disconnectController.abort();
    }
  });

  return sseResponse(stream);
}
