import {
  ChatStreamEventSchema
} from "@cdor/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanaryStream } from "../../src/lib/server/stream/canary";
import { DeltaBatcher } from "../../src/lib/server/stream/delta-batcher";
import {
  encodeChatStreamEvent,
  SSE_HEADERS
} from "../../src/lib/server/stream/sse";
import { POST as chatStreamPost } from "../../src/routes/api/v1/chat/stream/+server";

async function readStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      return output;
    }
    output += decoder.decode(value, { stream: true });
  }
}

describe("frontera SSE", () => {
  afterEach(() => vi.useRealTimers());

  it("serializa solo eventos válidos del contrato MAC", () => {
    const event = ChatStreamEventSchema.parse({
      event: "usage",
      data: { inputTokens: 10, outputTokens: 4 }
    });
    expect(new TextDecoder().decode(encodeChatStreamEvent(event))).toBe(
      'event: usage\ndata: {"inputTokens":10,"outputTokens":4}\n\n'
    );
    expect(SSE_HEADERS["cache-control"]).toContain("no-transform");
    expect(SSE_HEADERS["x-accel-buffering"]).toBe("no");
  });

  it("agrupa por ventana temporal", () => {
    vi.useFakeTimers();
    const flushed: string[] = [];
    const batcher = new DeltaBatcher({
      maximumBytes: 512,
      windowMs: 30,
      flush: (text) => flushed.push(text)
    });
    batcher.write("Ho");
    batcher.write("la");
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(29);
    expect(flushed).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(flushed).toEqual(["Hola"]);
  });

  it("agrupa por máximo de bytes sin esperar", () => {
    const flushed: string[] = [];
    const batcher = new DeltaBatcher({
      maximumBytes: 4,
      windowMs: 30,
      flush: (text) => flushed.push(text)
    });
    batcher.write("áá");
    expect(flushed).toEqual(["áá"]);
  });

  it("la canary emite ticks incrementales y cierre", async () => {
    const output = await readStream(
      createCanaryStream({ durationMs: 35, intervalMs: 10 })
    );
    expect(output).toContain("event: tick");
    expect(output).toContain('"sequence":0');
    expect(output).toContain("event: done");
  });

  it("chat/stream permanece cerrado sin Principal", async () => {
    const response = await chatStreamPost({
      locals: {
        requestId: "01J70000000000000000000006",
        principal: null
      },
      request: new Request("https://cdor.online/api/v1/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      })
    } as never);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UNAUTHENTICATED" }
    });
  });
});
