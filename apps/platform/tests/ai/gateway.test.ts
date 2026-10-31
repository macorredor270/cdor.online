import { describe, expect, it, vi } from "vitest";
import {
  buildDeployments,
  createGateway,
  GatewayProvider,
  MAC_MODEL
} from "../../src/lib/server/ai/gateway";
import { DiscoveredModel } from "../../src/lib/server/ai/gateway/discovered-model";
import { parseGatewayEnvironment } from "../../src/lib/server/config/schema";
import type { AiChunk, AiProvider } from "../../src/lib/server/ai/types";

const NVIDIA_KEY = "nvapi-test-key-for-gateway-0123456789";

function environment(source: Record<string, string> = {}) {
  return parseGatewayEnvironment(source);
}

type Recorded = { url: string; authorization: string | null; body: unknown };

/**
 * `fetch` falso que se comporta como varios proveedores a la vez, según el
 * host de la URL. Registra cada petición para poder comprobar a quién se llamó
 * y con qué.
 */
function fakeNetwork(
  catalogs: Record<string, string[]> = {},
  failing: Record<string, number> = {}
) {
  const requests: Recorded[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const host = new URL(url).host;
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      authorization: headers.get("authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });
    if (url.endsWith("/models")) {
      const ids = catalogs[host] ?? [];
      return Response.json({ data: ids.map((id) => ({ id })) });
    }
    if (failing[host]) return new Response("error", { status: failing[host] });
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: `hola desde ${host}` } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      "data: [DONE]\n\n"
    ].join("");
    return new Response(body, {
      headers: { "content-type": "text/event-stream" }
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

async function collect(provider: AiProvider): Promise<AiChunk[]> {
  const chunks: AiChunk[] = [];
  for await (const chunk of provider.streamChat(
    {
      model: "ignorado",
      messages: [{ role: "user", content: "Hola" }],
      maxOutputTokens: 64
    },
    new AbortController().signal
  )) {
    chunks.push(chunk);
  }
  return chunks;
}

describe("despliegues a partir de la configuración", () => {
  it("sin ninguna clave no hay pasarela", () => {
    expect(buildDeployments(environment())).toEqual([]);
    expect(createGateway(environment())).toBeNull();
  });

  it("un proveedor se activa solo al definir su clave", () => {
    const ids = (source: Record<string, string>) =>
      buildDeployments(environment(source)).map(({ id }) => id);
    expect(ids({ NVIDIA_API_KEY: NVIDIA_KEY })).toEqual(["nvidia"]);
    expect(ids({ GROQ_API_KEY: "gsk-test-key" })).toEqual(["groq"]);
    expect(ids({ GEMINI_API_KEY: "gemini-test-key" })).toEqual(["gemini"]);
    expect(ids({ MISTRAL_API_KEY: "mistral-test-key" })).toEqual(["mistral"]);
  });

  it("los proveedores conocidos salen en el orden por defecto", () => {
    const deployments = buildDeployments(
      environment({
        MISTRAL_API_KEY: "mistral-test-key",
        GROQ_API_KEY: "gsk-test-key",
        NVIDIA_API_KEY: NVIDIA_KEY
      })
    );
    expect(deployments.map(({ id }) => id)).toEqual(["nvidia", "groq", "mistral"]);
  });

  it("AI_PROVIDER_ORDER pone primero los indicados y deja el resto detrás", () => {
    const deployments = buildDeployments(
      environment({
        NVIDIA_API_KEY: NVIDIA_KEY,
        GROQ_API_KEY: "gsk-test-key",
        MISTRAL_API_KEY: "mistral-test-key",
        AI_PROVIDER_ORDER: "mistral, groq"
      })
    );
    expect(deployments.map(({ id }) => id)).toEqual(["mistral", "groq", "nvidia"]);
  });

  it("los modelos se descubren salvo que se fijen, y el cupo se puede ajustar", () => {
    const [discovered] = buildDeployments(
      environment({ GROQ_API_KEY: "gsk-test-key" })
    );
    expect(discovered?.entry.model).toBeInstanceOf(DiscoveredModel);
    expect(discovered?.entry.rpm).toBe(25);

    const [pinned] = buildDeployments(
      environment({
        GROQ_API_KEY: "gsk-test-key",
        GROQ_DEFAULT_MODEL: "mi-modelo",
        GROQ_RPM: "7"
      })
    );
    expect(pinned?.entry.model).toBe("mi-modelo");
    expect(pinned?.entry.rpm).toBe(7);
  });

  it("NVIDIA solo admite modelos de la lista blanca y avisa sin revelar valores", () => {
    const warn = vi.fn();
    const deployments = buildDeployments(
      environment({
        NVIDIA_API_KEY: NVIDIA_KEY,
        NVIDIA_DEFAULT_MODEL: "otro/modelo-secreto"
      }),
      { warn }
    );
    expect(deployments).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("otro/modelo-secreto");
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(NVIDIA_KEY);

    const [allowed] = buildDeployments(
      environment({
        NVIDIA_API_KEY: NVIDIA_KEY,
        NVIDIA_DEFAULT_MODEL: "meta/llama-3.3-70b-instruct"
      })
    );
    expect(allowed?.entry.model).toBe("meta/llama-3.3-70b-instruct");
  });

  it("OpenRouter solo participa si se pide expresamente y usa su router gratuito", () => {
    const base = { OPENROUTER_API_KEY: "sk-or-test-key-0123456789" };
    expect(buildDeployments(environment(base))).toEqual([]);
    const [deployment] = buildDeployments(
      environment({ ...base, AI_FALLBACK_OPENROUTER: "true" })
    );
    expect(deployment?.id).toBe("openrouter");
    expect(deployment?.entry.model).toBe("openrouter/free");
  });

  it("un modelo de pago de OpenRouter no se usa nunca como chat", () => {
    const [deployment] = buildDeployments(
      environment({
        OPENROUTER_API_KEY: "sk-or-test-key-0123456789",
        AI_FALLBACK_OPENROUTER: "true",
        OPENROUTER_DEFAULT_MODEL: "openai/gpt-4o"
      })
    );
    expect(deployment?.entry.model).toBe("openrouter/free");
  });

  it("los proveedores propios no necesitan clave y conservan su configuración", () => {
    const [custom] = buildDeployments(
      environment({
        AI_CUSTOM_PROVIDERS: JSON.stringify([
          {
            id: "mi-vllm",
            baseUrl: "http://127.0.0.1:8000/v1",
            model: "qwen-72b",
            rpm: 60,
            weight: 3,
            contextTokens: 65_536
          }
        ])
      })
    );
    expect(custom).toMatchObject({
      id: "mi-vllm",
      entry: { model: "qwen-72b", rpm: 60, weight: 3, contextTokens: 65_536 }
    });
  });

  it("los propios van después de los conocidos salvo que se ordenen", () => {
    const source = {
      NVIDIA_API_KEY: NVIDIA_KEY,
      AI_CUSTOM_PROVIDERS: JSON.stringify([
        { id: "mi-vllm", baseUrl: "http://127.0.0.1:8000/v1", model: "m" }
      ])
    };
    expect(buildDeployments(environment(source)).map(({ id }) => id)).toEqual([
      "nvidia",
      "mi-vllm"
    ]);
    expect(
      buildDeployments(environment({ ...source, AI_PROVIDER_ORDER: "mi-vllm" })).map(
        ({ id }) => id
      )
    ).toEqual(["mi-vllm", "nvidia"]);
  });
});

describe("la pasarela MAC", () => {
  it("se presenta como un único proveedor y modelo propios", () => {
    const gateway = createGateway(environment({ GROQ_API_KEY: "gsk-test-key" }));
    expect(gateway).toBeInstanceOf(GatewayProvider);
    expect(gateway?.name).toBe("mac");
    expect(MAC_MODEL.id).toBe("mac");
    expect(MAC_MODEL.displayName).toBe("MAC");
    expect(MAC_MODEL.benchmarkCost).toEqual({ inputPerMillion: 0, outputPerMillion: 0 });
  });

  it("enruta a cada proveedor con su URL, su clave y el modelo descubierto", async () => {
    const network = fakeNetwork({
      "api.groq.com": ["whisper-large-v3", "gpt-oss-120b", "llama-3.1-8b-instant"]
    });
    const gateway = createGateway(environment({ GROQ_API_KEY: "gsk-secret-1" }), {
      fetch: network.fetch
    })!;

    const chunks = await collect(gateway);
    expect(chunks[0]).toEqual({
      type: "route",
      provider: "groq",
      model: "gpt-oss-120b"
    });

    const call = network.requests.find((request) =>
      request.url.endsWith("/chat/completions")
    );
    expect(call?.url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(call?.authorization).toBe("Bearer gsk-secret-1");
    expect(call?.body).toMatchObject({ model: "gpt-oss-120b", stream: true });
    expect(call?.body).toHaveProperty("stream_options");
  });

  it("cada proveedor solo recibe su propia clave", async () => {
    const network = fakeNetwork(
      {
        "api.groq.com": ["gpt-oss-120b"],
        "api.mistral.ai": ["mistral-small-latest"]
      },
      { "api.groq.com": 429 }
    );
    const gateway = createGateway(
      environment({ GROQ_API_KEY: "gsk-secret-1", MISTRAL_API_KEY: "mistral-secret-2" }),
      { fetch: network.fetch }
    )!;
    await collect(gateway);
    for (const request of network.requests) {
      const host = new URL(request.url).host;
      if (host === "api.groq.com") expect(request.authorization).toBe("Bearer gsk-secret-1");
      if (host === "api.mistral.ai") expect(request.authorization).toBe("Bearer mistral-secret-2");
    }
  });

  it("Gemini: normaliza los ids con prefijo models/ y no envía stream_options", async () => {
    const network = fakeNetwork({
      "generativelanguage.googleapis.com": [
        "models/gemini-2.5-pro",
        "models/gemini-2.5-flash",
        "models/gemini-3.0-flash",
        "models/embedding-001"
      ]
    });
    const gateway = createGateway(environment({ GEMINI_API_KEY: "gemini-secret" }), {
      fetch: network.fetch
    })!;
    const chunks = await collect(gateway);
    expect(chunks[0]).toMatchObject({ provider: "gemini", model: "gemini-3.0-flash" });
    const call = network.requests.find((r) => r.url.endsWith("/chat/completions"));
    expect(call?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    );
    expect(call?.body).not.toHaveProperty("stream_options");
  });

  it("si el principal está saturado responde el siguiente proveedor", async () => {
    const network = fakeNetwork(
      { "api.groq.com": ["gpt-oss-120b"], "api.mistral.ai": ["mistral-small-latest"] },
      { "api.groq.com": 429 }
    );
    const gateway = createGateway(
      environment({ GROQ_API_KEY: "gsk-1", MISTRAL_API_KEY: "mistral-1" }),
      { fetch: network.fetch }
    )!;
    const chunks = await collect(gateway);
    expect(chunks[0]).toMatchObject({ provider: "mistral" });
  });

  it("sirve desde un proveedor propio sin clave", async () => {
    const network = fakeNetwork();
    const gateway = createGateway(
      environment({
        AI_CUSTOM_PROVIDERS: JSON.stringify([
          { id: "ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3" }
        ])
      }),
      { fetch: network.fetch }
    )!;
    const chunks = await collect(gateway);
    expect(chunks[0]).toEqual({ type: "route", provider: "ollama", model: "llama3" });
    const call = network.requests.find((r) => r.url.endsWith("/chat/completions"));
    expect(call?.authorization).toBeNull();
  });

  it("el cupo por minuto reparte la carga: agotado el primero, entra el siguiente", async () => {
    const network = fakeNetwork({
      "api.groq.com": ["gpt-oss-120b"],
      "api.mistral.ai": ["mistral-small-latest"]
    });
    const gateway = createGateway(
      environment({
        GROQ_API_KEY: "gsk-1",
        GROQ_RPM: "2",
        MISTRAL_API_KEY: "mistral-1"
      }),
      { fetch: network.fetch }
    )!;
    const served: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      const route = (await collect(gateway)).find((chunk) => chunk.type === "route");
      served.push(route?.type === "route" ? route.provider : "?");
    }
    expect(served).toEqual(["groq", "groq", "mistral", "mistral"]);
  });

  describe("catálogo", () => {
    it("MAC está disponible si lo está algún proveedor", async () => {
      const network = fakeNetwork({ "api.mistral.ai": ["mistral-small-latest"] });
      const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("groq.com")) throw new Error("sin red");
        return network.fetch(input, init);
      }) as unknown as typeof globalThis.fetch;
      const gateway = createGateway(
        environment({ GROQ_API_KEY: "gsk-1", MISTRAL_API_KEY: "mistral-1" }),
        { fetch }
      )!;
      expect(await gateway.listModels()).toEqual([{ id: "mac" }]);
    });

    it("si ninguno responde, falla", async () => {
      const fetch = vi.fn(async () => {
        throw new Error("sin red");
      }) as unknown as typeof globalThis.fetch;
      const gateway = createGateway(environment({ GROQ_API_KEY: "gsk-1" }), { fetch })!;
      await expect(gateway.listModels()).rejects.toMatchObject({
        code: "AI_PROVIDER_ERROR"
      });
    });

    it("nunca expone los modelos reales de los proveedores", async () => {
      const network = fakeNetwork({ "api.groq.com": ["gpt-oss-120b", "llama-3.1-8b-instant"] });
      const gateway = createGateway(environment({ GROQ_API_KEY: "gsk-1" }), {
        fetch: network.fetch
      })!;
      const models = await gateway.listModels();
      expect(JSON.stringify(models)).not.toContain("gpt-oss");
      expect(JSON.stringify(models)).not.toContain("groq");
    });
  });
});

describe("DiscoveredModel", () => {
  function providerWith(listModels: AiProvider["listModels"]): AiProvider {
    return {
      name: "p",
      listModels,
      // eslint-disable-next-line require-yield
      async *streamChat() {
        throw new Error("no usado");
      }
    };
  }
  const signal = () => new AbortController().signal;

  it("descubre una vez y reutiliza el resultado mientras no caduque", async () => {
    let now = 0;
    const list = vi.fn().mockResolvedValue([{ id: "gpt-oss-120b" }]);
    const source = new DiscoveredModel(providerWith(list), [/gpt-oss/], {
      ttlMs: 1_000,
      now: () => now
    });
    expect(await source.resolve(signal())).toBe("gpt-oss-120b");
    expect(await source.resolve(signal())).toBe("gpt-oss-120b");
    expect(list).toHaveBeenCalledTimes(1);
    now = 1_500;
    await source.resolve(signal());
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("peticiones simultáneas comparten una sola consulta al catálogo", async () => {
    const list = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ id: "m1" }]), 20))
      );
    const source = new DiscoveredModel(providerWith(list), [/m1/]);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => source.resolve(signal()))
    );
    expect(new Set(results)).toEqual(new Set(["m1"]));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("invalidar fuerza a volver a descubrir", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([{ id: "old-1" }])
      .mockResolvedValueOnce([{ id: "new-2" }]);
    const source = new DiscoveredModel(providerWith(list), [/-\d/]);
    expect(await source.resolve(signal())).toBe("old-1");
    source.invalidate();
    expect(await source.resolve(signal())).toBe("new-2");
  });

  it("si no hay ningún modelo reconocido falla y lo recuerda un tiempo", async () => {
    let now = 0;
    const list = vi.fn().mockResolvedValue([{ id: "whisper" }]);
    const source = new DiscoveredModel(providerWith(list), [/gpt/], {
      negativeTtlMs: 1_000,
      now: () => now
    });
    await expect(source.resolve(signal())).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE"
    });
    await expect(source.resolve(signal())).rejects.toMatchObject({
      code: "MODEL_UNAVAILABLE"
    });
    expect(list).toHaveBeenCalledTimes(1);
    now = 1_500;
    await expect(source.resolve(signal())).rejects.toBeDefined();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("un fallo del catálogo no se cachea: se reintenta en la siguiente petición", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("sin red"))
      .mockResolvedValueOnce([{ id: "gpt-1" }]);
    const source = new DiscoveredModel(providerWith(list), [/gpt/]);
    await expect(source.resolve(signal())).rejects.toBeDefined();
    expect(await source.resolve(signal())).toBe("gpt-1");
  });

  it("cancelar una petición no estropea la consulta que esperan las demás", async () => {
    const list = vi
      .fn()
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([{ id: "gpt-1" }]), 30))
      );
    const source = new DiscoveredModel(providerWith(list), [/gpt/]);
    const cancelled = new AbortController();
    const first = source.resolve(cancelled.signal);
    const second = source.resolve(signal());
    cancelled.abort();
    await expect(first).rejects.toMatchObject({ code: "STREAM_CANCELLED" });
    expect(await second).toBe("gpt-1");
  });

  it("una petición ya cancelada ni siquiera espera", async () => {
    const source = new DiscoveredModel(
      providerWith(vi.fn().mockResolvedValue([{ id: "gpt-1" }])),
      [/gpt/]
    );
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(source.resolve(cancelled.signal)).rejects.toMatchObject({
      code: "STREAM_CANCELLED"
    });
  });
});
