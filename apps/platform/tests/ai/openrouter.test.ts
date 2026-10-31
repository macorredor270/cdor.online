import {
  isFreeOpenRouterModel,
  openRouterModelIdFor,
  OpenRouterProvider
} from "../../src/lib/server/ai/openrouter";
import { describe, expect, it, vi } from "vitest";

describe("OpenRouter gratuito", () => {
  it("solo considera gratuitos el router y las variantes :free", () => {
    expect(isFreeOpenRouterModel("openrouter/free")).toBe(true);
    expect(isFreeOpenRouterModel("organization/model:free")).toBe(true);
    expect(isFreeOpenRouterModel("organization/model")).toBe(false);
  });

  it("mantiene el mismo modelo al traducir el ID de NVIDIA", () => {
    expect(openRouterModelIdFor("meta/llama-3.1-8b-instruct")).toBe(
      "meta-llama/llama-3.1-8b-instruct"
    );
    expect(openRouterModelIdFor("meta/llama-3.3-70b-instruct")).toBe(
      "meta-llama/llama-3.3-70b-instruct"
    );
    expect(openRouterModelIdFor("nvidia/nemotron-3-super-120b-a12b")).toBe(
      "nvidia/nemotron-3-super-120b-a12b"
    );
  });

  it("filtra el catálogo y bloquea un modelo de pago antes de llamar", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: "organization/free-model:free" },
          { id: "organization/paid-model" }
        ]
      })
    );
    const provider = new OpenRouterProvider({
      apiKey: "openrouter-test-private-key",
      baseUrl: "https://openrouter.invalid/api/v1",
      requestTimeoutMs: 5_000,
      fetch
    });

    await expect(provider.listModels()).resolves.toEqual([
      { id: "organization/free-model:free" }
    ]);
    expect(() =>
      provider.streamChat(
        {
          model: "organization/paid-model",
          messages: [{ role: "user", content: "Hola" }],
          maxOutputTokens: 32
        },
        new AbortController().signal
      )
    ).toThrowError("solo admite modelos gratuitos");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("activa la búsqueda sobre el equivalente del mismo modelo", async () => {
    const encoder = new TextEncoder();
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'data: {"choices":[{"delta":{"content":"Resultado"},"finish_reason":"stop"}]}' +
                  "\n\n"
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          }
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      )
    );
    const provider = new OpenRouterProvider({
      apiKey: "openrouter-test-private-key",
      baseUrl: "https://openrouter.invalid/api/v1",
      requestTimeoutMs: 5_000,
      fetch,
      modelAliases: {
        "meta/llama-3.1-8b-instruct":
          "meta-llama/llama-3.1-8b-instruct"
      }
    });
    const chunks = [];

    for await (const chunk of provider.streamChat(
      {
        model: "meta/llama-3.1-8b-instruct",
        messages: [{ role: "user", content: "Qué ha pasado hoy" }],
        maxOutputTokens: 32,
        webSearch: true
      },
      new AbortController().signal
    )) {
      chunks.push(chunk);
    }

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.model).toBe("meta-llama/llama-3.1-8b-instruct");
    expect(body.tools).toEqual([
      {
        type: "openrouter:web_search",
        parameters: {
          engine: "auto",
          max_results: 5,
          max_characters: 2_500,
          max_total_results: 8
        }
      }
    ]);
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0].content).toContain(
      "hechos actuales o posteriores a diciembre de 2023"
    );
    expect(body.messages[0].content).toContain(
      "No respondas con una disculpa por el corte de conocimiento"
    );
    expect(body.messages[0].content).toContain("enlaces Markdown directos");
    expect(chunks).toEqual([
      { type: "delta", text: "Resultado" },
      { type: "done", finishReason: "stop" }
    ]);
  });
});
