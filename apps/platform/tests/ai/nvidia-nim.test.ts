import { AppError } from "../../src/lib/server/errors/app-error";
import { NvidiaNimProvider } from "../../src/lib/server/ai/nvidia-nim";
import { describe, expect, it, vi } from "vitest";

function streamResponse(parts: readonly string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) {
          controller.enqueue(encoder.encode(part));
        }
        controller.close();
      }
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" }
    }
  );
}

describe("NvidiaNimProvider", () => {
  it("lista modelos sin devolver metadatos internos", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        object: "list",
        data: [
          { id: "meta/model-a", owned_by: "organization-private" },
          { id: "meta/model-b" }
        ]
      })
    );
    const provider = new NvidiaNimProvider({
      apiKey: "nvapi-test-private-key",
      baseUrl: "https://nvidia.invalid/v1/",
      requestTimeoutMs: 5_000,
      fetch
    });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "meta/model-a" },
      { id: "meta/model-b" }
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://nvidia.invalid/v1/models",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("traduce el SSE de NVIDIA al protocolo interno", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        streamResponse([
          'data: {"choices":[{"delta":{"content":"Ho"},"finish_reason":null}]}\n\n',
          'data: {"choices":[{"delta":{"content":"la"},"finish_reason":"stop"}]}\n\n',
          'data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2}}\n\n',
          "data: [DONE]\n\n"
        ])
      );
    const provider = new NvidiaNimProvider({
      apiKey: "nvapi-test-private-key",
      baseUrl: "https://nvidia.invalid/v1",
      requestTimeoutMs: 5_000,
      fetch
    });
    const chunks = [];

    for await (const chunk of provider.streamChat(
      {
        model: "meta/model-a",
        messages: [{ role: "user", content: "Hola" }],
        maxOutputTokens: 32
      },
      new AbortController().signal
    )) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual([
      { type: "delta", text: "Ho" },
      { type: "delta", text: "la" },
      { type: "usage", inputTokens: 7, outputTokens: 2 },
      { type: "done", finishReason: "stop" }
    ]);
  });

  it("convierte el timeout en un error estable sin filtrar detalles", async () => {
    const privateDetail = "private-provider-body";
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new Error(privateDetail)),
            { once: true }
          );
        })
    );
    const provider = new NvidiaNimProvider({
      apiKey: "nvapi-test-private-key",
      baseUrl: "https://nvidia.invalid/v1",
      requestTimeoutMs: 5,
      fetch
    });

    try {
      await provider.listModels();
      expect.unreachable("La petición debía agotar su timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ code: "AI_PROVIDER_TIMEOUT" });
      expect(String(error)).not.toContain(privateDetail);
    }
  });

  it("distingue un 429 del resto de fallos y conserva Retry-After", async () => {
    const provider = new NvidiaNimProvider({
      apiKey: "nvapi-test-private-key",
      baseUrl: "https://nvidia.invalid/v1",
      requestTimeoutMs: 5_000,
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "7" }
        })
      )
    });
    const consume = async () => {
      for await (const _chunk of provider.streamChat(
        {
          model: "meta/model-a",
          messages: [{ role: "user", content: "Hola" }],
          maxOutputTokens: 32
        },
        new AbortController().signal
      )) {
        // Consumir todo el stream.
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      details: { retryAfterMs: 7_000 }
    });
  });

  it("rechaza fragmentos inválidos del proveedor", async () => {
    const provider = new NvidiaNimProvider({
      apiKey: "nvapi-test-private-key",
      baseUrl: "https://nvidia.invalid/v1",
      requestTimeoutMs: 5_000,
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(streamResponse(["data: {invalid}\n\n"]))
    });

    const consume = async () => {
      for await (const _chunk of provider.streamChat(
        {
          model: "meta/model-a",
          messages: [{ role: "user", content: "Hola" }],
          maxOutputTokens: 32
        },
        new AbortController().signal
      )) {
        // Consumir todo el stream.
      }
    };
    await expect(consume()).rejects.toMatchObject({
      code: "AI_PROVIDER_ERROR"
    });
  });
});
