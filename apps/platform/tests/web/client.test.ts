import { describe, expect, it } from "vitest";
import { readChatStream } from "../../src/lib/client/api";
import { parseMarkdown } from "../../src/lib/client/markdown";

const ID = "01J00000000000000000000000";

describe("web client", () => {
  // El parser y sus pruebas viven en packages/markdown; aquí solo se comprueba
  // que la web lo consume a través de su reexportación.
  it("reexporta el parser compartido de Markdown", () => {
    expect(parseMarkdown("| a | b |\n| - | - |\n| 1 | 2 |")[0]?.type).toBe("table");
  });

  it("decodes SSE split across arbitrary network chunks", async () => {
    const encoder = new TextEncoder();
    const source = [
      `event: start\ndata: {"generationId":"${ID}","userMessageId":"${ID}","assistantMessageId":"${ID}","requestId":"${ID}"}\n\n`,
      `event: delta\ndata: {"messageId":"${ID}","sequence":0,"text":"Hola"}\n\n`
    ].join("");
    const chunks = [source.slice(0, 19), source.slice(19, 87), source.slice(87)];
    const response = new Response(
      new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        }
      }),
      { headers: { "content-type": "text/event-stream" } }
    );
    const events: string[] = [];
    await readChatStream(response, (event) => events.push(event.event));
    expect(events).toEqual(["start", "delta"]);
  });

  it("keeps parsing work bounded for a 1,000-message conversation", () => {
    const messages = Array.from(
      { length: 1_000 },
      (_, index) => `## Mensaje ${index}\n\nTexto **seguro** con \`código\`.`
    );
    const parsed = messages.map(parseMarkdown);
    expect(parsed).toHaveLength(1_000);
    expect(parsed.every((blocks) => blocks.length === 2)).toBe(true);
  });
});
