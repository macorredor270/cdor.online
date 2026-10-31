import {
  ChatStreamEventSchema,
  type ChatStreamEvent
} from "@cdor/contracts";

const encoder = new TextEncoder();

export const SSE_HEADERS = Object.freeze({
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no"
});

export function encodeSse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function encodeChatStreamEvent(event: ChatStreamEvent): Uint8Array {
  const validated = ChatStreamEventSchema.parse(event);
  return encodeSse(validated.event, validated.data);
}

export function sseResponse(
  stream: ReadableStream<Uint8Array>,
  init: ResponseInit = {}
): Response {
  return new Response(stream, {
    ...init,
    headers: {
      ...SSE_HEADERS,
      ...Object.fromEntries(new Headers(init.headers))
    }
  });
}
