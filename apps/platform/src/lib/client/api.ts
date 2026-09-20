import {
  ApiErrorSchema,
  ChatStreamEventSchema,
  type ApiErrorBody,
  type ChatStreamEvent
} from "@cdor/contracts";

export class ApiClientError extends Error {
  constructor(
    readonly body: ApiErrorBody,
    readonly status: number
  ) {
    super(body.message);
    this.name = "ApiClientError";
  }
}

type Fetcher = typeof globalThis.fetch;

export async function apiRequest<T>(
  fetcher: Fetcher,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetcher(path, {
    ...init,
    credentials: "same-origin",
    headers
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error, response.status);
    }
    throw new Error("El servidor devolvió una respuesta no válida");
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    !("data" in payload)
  ) {
    throw new Error("La respuesta no contiene datos");
  }
  return (payload as { data: T }).data;
}

function decodeFrame(frame: string): ChatStreamEvent | null {
  let event = "";
  const data: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trimStart());
    }
  }
  if (!event || data.length === 0) {
    return null;
  }
  return ChatStreamEventSchema.parse({
    event,
    data: JSON.parse(data.join("\n"))
  });
}

export async function readChatStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(payload);
    if (parsed.success) {
      throw new ApiClientError(parsed.data.error, response.status);
    }
    throw new Error("No se pudo iniciar el stream");
  }
  if (!response.body) {
    throw new Error("El navegador no admite streaming HTTP");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = decodeFrame(frame);
      if (event) {
        onEvent(event);
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) {
      break;
    }
  }
  const finalEvent = decodeFrame(buffer);
  if (finalEvent) {
    onEvent(finalEvent);
  }
}
