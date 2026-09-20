import { describe, expect, it } from "vitest";
import { readChatStream } from "../../src/lib/client/api";
import {
  parseInline,
  parseMarkdown
} from "../../src/lib/client/markdown";

const ID = "01J00000000000000000000000";

describe("web client", () => {
  it("renders supported Markdown without accepting executable links or HTML", () => {
    const blocks = parseMarkdown(
      "# Título\n\n**seguro** [web](https://cdor.online) " +
        "[ataque](javascript:alert(1)) <script>alert(1)</script>"
    );
    expect(blocks).toHaveLength(2);
    expect(JSON.stringify(blocks)).toContain("https://cdor.online/");
    expect(JSON.stringify(blocks)).not.toContain('"href":"javascript:');
    expect(JSON.stringify(blocks)).toContain("<script>alert(1)</script>");
  });

  it("parses inline code, emphasis and strong text as data", () => {
    expect(parseInline("usa `code`, *énfasis* y **fuerza**")).toEqual([
      { type: "text", value: "usa " },
      { type: "code", value: "code" },
      { type: "text", value: ", " },
      { type: "emphasis", value: "énfasis" },
      { type: "text", value: " y " },
      { type: "strong", value: "fuerza" }
    ]);
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
