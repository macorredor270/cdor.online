const MAX_PROVIDER_EVENT_BYTES = 1024 * 1024;

export async function* parseSseData(
  body: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replaceAll("\r\n", "\n");

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data !== "") {
          yield data;
        }
        boundary = buffer.indexOf("\n\n");
      }

      if (Buffer.byteLength(buffer, "utf8") > MAX_PROVIDER_EVENT_BYTES) {
        throw new Error("Evento SSE del proveedor demasiado grande");
      }

      if (done) {
        const data = buffer
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data !== "") {
          yield data;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
