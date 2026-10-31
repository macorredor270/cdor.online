import type { ErrorCode } from "@cdor/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  FallbackProvider,
  type FailoverEvent
} from "../../src/lib/server/ai/fallback";
import { parseRetryAfter } from "../../src/lib/server/ai/nvidia-nim";
import type {
  AiChatRequest,
  AiChunk,
  AiProvider
} from "../../src/lib/server/ai/types";
import { AppError } from "../../src/lib/server/errors/app-error";

const request: AiChatRequest = {
  model: "primary/model",
  messages: [{ role: "user", content: "Hola" }],
  maxOutputTokens: 64
};

type Script =
  | { type: "text"; text: string }
  | { type: "fail"; code: ErrorCode; details?: unknown }
  | { type: "hang" };

/** Proveedor guionizado: emite o falla según una lista de pasos. */
class ScriptedProvider implements AiProvider {
  readonly calls: AiChatRequest[] = [];

  constructor(
    readonly name: string,
    private readonly script: readonly Script[]
  ) {}

  async listModels() {
    return [{ id: `${this.name}/catalog` }];
  }

  async *streamChat(
    chatRequest: AiChatRequest,
    signal: AbortSignal
  ): AsyncIterable<AiChunk> {
    this.calls.push(chatRequest);
    for (const step of this.script) {
      if (step.type === "text") {
        yield { type: "delta", text: step.text };
      } else if (step.type === "fail") {
        throw new AppError(step.code, `fallo ${step.code}`, {
          details: step.details
        });
      } else {
        await new Promise<void>((_, reject) => {
          if (signal.aborted) {
            reject(new AppError("STREAM_CANCELLED", "cancelado"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(new AppError("STREAM_CANCELLED", "cancelado")),
            { once: true }
          );
        });
      }
    }
    yield { type: "usage", inputTokens: 3, outputTokens: 2 };
    yield { type: "done", finishReason: "stop" };
  }
}

async function collect(
  provider: AiProvider,
  signal = new AbortController().signal
): Promise<AiChunk[]> {
  const chunks: AiChunk[] = [];
  for await (const chunk of provider.streamChat(request, signal)) {
    chunks.push(chunk);
  }
  return chunks;
}

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

const ok = (name: string) =>
  new ScriptedProvider(name, [{ type: "text", text: `hola desde ${name}` }]);
const failing = (name: string, code: ErrorCode, details?: unknown) =>
  new ScriptedProvider(name, [{ type: "fail", code, details }]);

describe("FallbackProvider", () => {
  it("con el principal disponible no toca el respaldo y anuncia quién sirve", async () => {
    const primary = ok("nvidia");
    const backup = ok("openrouter");
    const provider = new FallbackProvider([
      { provider: primary },
      { provider: backup, model: "openrouter/free" }
    ]);

    const chunks = await collect(provider);
    expect(chunks.map((chunk) => chunk.type)).toEqual([
      "route",
      "delta",
      "usage",
      "done"
    ]);
    expect(chunks[0]).toEqual({
      type: "route",
      provider: "nvidia",
      model: "primary/model"
    });
    expect(backup.calls).toHaveLength(0);
  });

  it("se presenta con el nombre del principal y su catálogo", async () => {
    const provider = new FallbackProvider([
      { provider: ok("nvidia") },
      { provider: ok("openrouter") }
    ]);
    expect(provider.name).toBe("nvidia");
    expect(await provider.listModels()).toEqual([{ id: "nvidia/catalog" }]);
  });

  it("si el principal falla antes de dar texto, responde el respaldo", async () => {
    const onFailover = vi.fn<(event: FailoverEvent) => void>();
    const primary = failing("nvidia", "RATE_LIMITED");
    const backup = ok("openrouter");
    const provider = new FallbackProvider(
      [{ provider: primary }, { provider: backup, model: "openrouter/free" }],
      { onFailover }
    );

    const chunks = await collect(provider);
    expect(chunks[0]).toEqual({
      type: "route",
      provider: "openrouter",
      model: "openrouter/free"
    });
    expect(chunks.some((chunk) => chunk.type === "delta")).toBe(true);
    // El respaldo recibe su propio modelo, no el del principal.
    expect(backup.calls[0].model).toBe("openrouter/free");
    expect(primary.calls[0].model).toBe("primary/model");
    expect(onFailover).toHaveBeenCalledWith({
      from: "nvidia",
      to: "openrouter",
      code: "RATE_LIMITED"
    });
  });

  it.each<ErrorCode>([
    "AI_PROVIDER_ERROR",
    "AI_PROVIDER_TIMEOUT",
    "MODEL_UNAVAILABLE"
  ])("%s también activa el respaldo", async (code) => {
    const provider = new FallbackProvider([
      { provider: failing("nvidia", code) },
      { provider: ok("openrouter") }
    ]);
    const chunks = await collect(provider);
    expect(chunks.some((chunk) => chunk.type === "delta")).toBe(true);
  });

  it("tras emitir texto no cambia de proveedor: propaga el error", async () => {
    const primary = new ScriptedProvider("nvidia", [
      { type: "text", text: "respuesta a medi" },
      { type: "fail", code: "AI_PROVIDER_ERROR" }
    ]);
    const backup = ok("openrouter");
    const provider = new FallbackProvider([
      { provider: primary },
      { provider: backup }
    ]);

    const received: AiChunk[] = [];
    const consume = async () => {
      for await (const chunk of provider.streamChat(
        request,
        new AbortController().signal
      )) {
        received.push(chunk);
      }
    };
    await expect(consume()).rejects.toMatchObject({ code: "AI_PROVIDER_ERROR" });
    expect(received.map((chunk) => chunk.type)).toEqual(["route", "delta"]);
    expect(backup.calls).toHaveLength(0);
  });

  it("aparta al proveedor que falla y vuelve a él pasado el tiempo indicado", async () => {
    const time = clock();
    const primary = new ScriptedProvider("nvidia", [
      { type: "fail", code: "RATE_LIMITED", details: { retryAfterMs: 5_000 } }
    ]);
    const backup = ok("openrouter");
    const provider = new FallbackProvider(
      [{ provider: primary }, { provider: backup }],
      { now: time.now }
    );

    await collect(provider);
    expect(primary.calls).toHaveLength(1);

    // Dentro del enfriamiento va directo al respaldo, sin probar el principal.
    time.advance(2_000);
    await collect(provider);
    expect(primary.calls).toHaveLength(1);
    expect(backup.calls).toHaveLength(2);

    // Pasado el tiempo se vuelve a intentar con el principal.
    time.advance(4_000);
    await collect(provider);
    expect(primary.calls).toHaveLength(2);
  });

  it("sin Retry-After usa el enfriamiento por defecto", async () => {
    const time = clock();
    const primary = failing("nvidia", "AI_PROVIDER_ERROR");
    const provider = new FallbackProvider(
      [{ provider: primary }, { provider: ok("openrouter") }],
      { now: time.now, cooldownMs: 10_000 }
    );
    await collect(provider);
    time.advance(9_000);
    await collect(provider);
    expect(primary.calls).toHaveLength(1);
    time.advance(2_000);
    await collect(provider);
    expect(primary.calls).toHaveLength(2);
  });

  it("MODEL_UNAVAILABLE no aparta al proveedor: depende de la petición", async () => {
    const primary = failing("nvidia", "MODEL_UNAVAILABLE");
    const provider = new FallbackProvider([
      { provider: primary },
      { provider: ok("openrouter") }
    ]);
    await collect(provider);
    await collect(provider);
    expect(primary.calls).toHaveLength(2);
  });

  it("un éxito levanta el apartado del proveedor", async () => {
    const time = clock();
    let healthy = false;
    const flaky: AiProvider = {
      name: "nvidia",
      listModels: async () => [],
      streamChat: (chatRequest, signal) =>
        (healthy ? ok("nvidia") : failing("nvidia", "RATE_LIMITED")).streamChat(
          chatRequest,
          signal
        )
    };
    const backup = ok("openrouter");
    const provider = new FallbackProvider(
      [{ provider: flaky }, { provider: backup }],
      { now: time.now, cooldownMs: 1_000 }
    );
    await collect(provider);
    healthy = true;
    time.advance(1_500);
    const chunks = await collect(provider);
    expect(chunks[0]).toMatchObject({ type: "route", provider: "nvidia" });
    expect(backup.calls).toHaveLength(1);
  });

  it("si todos fallan propaga el error del principal, no el del último", async () => {
    const provider = new FallbackProvider([
      { provider: failing("nvidia", "RATE_LIMITED") },
      { provider: failing("openrouter", "AI_PROVIDER_ERROR") }
    ]);
    await expect(collect(provider)).rejects.toMatchObject({
      code: "RATE_LIMITED"
    });
  });

  it("si todos están apartados los prueba igualmente, en orden", async () => {
    const time = clock();
    const primary = failing("nvidia", "AI_PROVIDER_ERROR");
    const backup = failing("openrouter", "AI_PROVIDER_ERROR");
    const provider = new FallbackProvider(
      [{ provider: primary }, { provider: backup }],
      { now: time.now, cooldownMs: 60_000 }
    );
    await expect(collect(provider)).rejects.toBeInstanceOf(AppError);
    await expect(collect(provider)).rejects.toBeInstanceOf(AppError);
    expect(primary.calls).toHaveLength(2);
    expect(backup.calls).toHaveLength(2);
  });

  it("no hace respaldo ante errores que no son del proveedor", async () => {
    const backup = ok("openrouter");
    const provider = new FallbackProvider([
      { provider: failing("nvidia", "VALIDATION_ERROR") },
      { provider: backup }
    ]);
    await expect(collect(provider)).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    expect(backup.calls).toHaveLength(0);
  });

  it("una cancelación del usuario no se confunde con un fallo", async () => {
    const backup = ok("openrouter");
    const primary = new ScriptedProvider("nvidia", [{ type: "hang" }]);
    const provider = new FallbackProvider(
      [{ provider: primary }, { provider: backup }],
      { firstTokenTimeoutMs: 5_000 }
    );
    const controller = new AbortController();
    const pending = collect(provider, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "STREAM_CANCELLED" });
    expect(backup.calls).toHaveLength(0);
  });

  it("si el usuario cancela y el proveedor lo reporta como error, no se prueba el respaldo", async () => {
    // Algunos proveedores devuelven un error genérico al abortar la conexión.
    const abrupt: AiProvider = {
      name: "nvidia",
      listModels: async () => [],
      // eslint-disable-next-line require-yield
      async *streamChat(_request, signal) {
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true })
        );
        throw new AppError("AI_PROVIDER_ERROR", "conexión cerrada");
      }
    };
    const backup = ok("openrouter");
    const provider = new FallbackProvider(
      [{ provider: abrupt }, { provider: backup }],
      { firstTokenTimeoutMs: 5_000 }
    );
    const controller = new AbortController();
    const pending = collect(provider, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "AI_PROVIDER_ERROR" });
    expect(backup.calls).toHaveLength(0);
  });

  it("un proveedor que no responde a tiempo pasa el turno al respaldo", async () => {
    const onFailover = vi.fn<(event: FailoverEvent) => void>();
    const backup = ok("openrouter");
    const provider = new FallbackProvider(
      [
        { provider: new ScriptedProvider("nvidia", [{ type: "hang" }]) },
        { provider: backup }
      ],
      { firstTokenTimeoutMs: 20, onFailover }
    );
    const chunks = await collect(provider);
    expect(chunks[0]).toMatchObject({ type: "route", provider: "openrouter" });
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({ from: "nvidia", code: "AI_PROVIDER_TIMEOUT" })
    );
  });

  it("el límite de tiempo no corta una respuesta que ya está llegando", async () => {
    const slowStart = new ScriptedProvider("nvidia", [
      { type: "text", text: "empieza a tiempo" }
    ]);
    const provider = new FallbackProvider(
      [{ provider: slowStart }, { provider: ok("openrouter") }],
      { firstTokenTimeoutMs: 20 }
    );
    const chunks = await collect(provider);
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(chunks.map((chunk) => chunk.type)).toContain("done");
  });

  it("una respuesta vacía no anuncia ruta", async () => {
    const empty = new ScriptedProvider("nvidia", []);
    const provider = new FallbackProvider([{ provider: empty }]);
    expect((await collect(provider)).map((chunk) => chunk.type)).toEqual([
      "usage",
      "done"
    ]);
  });

  it("exige al menos un proveedor", () => {
    expect(() => new FallbackProvider([])).toThrow();
  });
});

describe("Retry-After", () => {
  const headers = (value?: string) =>
    new Headers(value === undefined ? {} : { "retry-after": value });

  it("interpreta segundos y fechas HTTP", () => {
    expect(parseRetryAfter(headers("7"))).toBe(7_000);
    const now = Date.parse("2026-07-29T12:00:00Z");
    expect(
      parseRetryAfter(headers("Wed, 29 Jul 2026 12:00:30 GMT"), now)
    ).toBe(30_000);
  });

  it("acota el valor a un rango razonable", () => {
    expect(parseRetryAfter(headers("0"))).toBe(1_000);
    expect(parseRetryAfter(headers("86400"))).toBe(300_000);
    const now = Date.parse("2026-07-29T12:00:00Z");
    expect(
      parseRetryAfter(headers("Wed, 29 Jul 2026 11:00:00 GMT"), now)
    ).toBe(1_000);
  });

  it("ignora cabeceras ausentes o ilegibles", () => {
    expect(parseRetryAfter(headers())).toBeNull();
    expect(parseRetryAfter(headers("pronto"))).toBeNull();
    expect(parseRetryAfter(headers("  "))).toBeNull();
  });
});

/** PRNG determinista (mulberry32) para probar el reparto sin flakiness. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("FallbackProvider como pasarela", () => {
  it("se presenta con el nombre indicado y no con el del principal", () => {
    const provider = new FallbackProvider([{ provider: ok("nvidia") }], {
      name: "mac"
    });
    expect(provider.name).toBe("mac");
  });

  it("agotado el cupo por minuto, las peticiones pasan al siguiente sin llamar al principal", async () => {
    const time = clock();
    const primary = ok("nvidia");
    const backup = ok("groq");
    const provider = new FallbackProvider(
      [{ provider: primary, rpm: 2 }, { provider: backup }],
      { now: time.now }
    );

    await collect(provider);
    await collect(provider);
    expect(primary.calls).toHaveLength(2);

    await collect(provider);
    expect(primary.calls).toHaveLength(2);
    expect(backup.calls).toHaveLength(1);

    // El cupo se recupera al deslizar la ventana de un minuto.
    time.advance(61_000);
    await collect(provider);
    expect(primary.calls).toHaveLength(3);
  });

  it("si todos están sin cupo los prueba igualmente, en orden", async () => {
    const time = clock();
    const primary = ok("nvidia");
    const backup = ok("groq");
    const provider = new FallbackProvider(
      [
        { provider: primary, rpm: 1 },
        { provider: backup, rpm: 1 }
      ],
      { now: time.now }
    );
    await collect(provider);
    await collect(provider);
    // Ambos agotados: la tercera petición no se rechaza, va al principal.
    const chunks = await collect(provider);
    expect(chunks.some((chunk) => chunk.type === "delta")).toBe(true);
    expect(primary.calls).toHaveLength(2);
  });

  it("descarta antes de llamar a los despliegues con ventana de contexto insuficiente", async () => {
    const small = ok("github");
    const large = ok("groq");
    const provider = new FallbackProvider([
      { provider: small, contextTokens: 100 },
      { provider: large, contextTokens: 100_000 }
    ]);
    // El prompt más la salida reservada (64) no cabe en 100 tokens.
    const long: AiChatRequest = {
      ...request,
      messages: [{ role: "user", content: "palabra ".repeat(200) }]
    };
    const chunks: AiChunk[] = [];
    for await (const chunk of provider.streamChat(long, new AbortController().signal)) {
      chunks.push(chunk);
    }
    expect(small.calls).toHaveLength(0);
    expect(large.calls).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "route", provider: "groq" });
  });

  it("si ninguno tiene contexto suficiente los prueba igualmente", async () => {
    const only = ok("github");
    const provider = new FallbackProvider([{ provider: only, contextTokens: 10 }]);
    await collect(provider);
    expect(only.calls).toHaveLength(1);
  });

  it("el reparto ponderado favorece al de más peso sin excluir a los demás", async () => {
    const heavy = ok("nvidia");
    const light = ok("groq");
    const provider = new FallbackProvider(
      [
        { provider: light, weight: 1 },
        { provider: heavy, weight: 9 }
      ],
      { strategy: "weighted", random: seeded(42) }
    );
    for (let index = 0; index < 400; index += 1) await collect(provider);
    const total = heavy.calls.length + light.calls.length;
    expect(total).toBe(400);
    expect(heavy.calls.length / total).toBeGreaterThan(0.84);
    expect(heavy.calls.length / total).toBeLessThan(0.96);
    expect(light.calls.length).toBeGreaterThan(0);
  });

  it("sin peso explícito usa el cupo por minuto como peso", async () => {
    const big = ok("nvidia");
    const small = ok("groq");
    const provider = new FallbackProvider(
      [
        { provider: small, rpm: 10_000 },
        { provider: big, rpm: 90_000 }
      ],
      { strategy: "weighted", random: seeded(7) }
    );
    for (let index = 0; index < 300; index += 1) await collect(provider);
    expect(big.calls.length).toBeGreaterThan(small.calls.length * 5);
  });

  it("el reparto ponderado sigue teniendo respaldo ordenado si el elegido falla", async () => {
    const provider = new FallbackProvider(
      [
        { provider: failing("nvidia", "AI_PROVIDER_ERROR"), weight: 1_000_000 },
        { provider: ok("groq"), weight: 1 }
      ],
      { strategy: "weighted", random: seeded(1) }
    );
    const chunks = await collect(provider);
    expect(chunks[0]).toMatchObject({ type: "route", provider: "groq" });
  });

  it("descubre el modelo con el proveedor y lo anuncia en la ruta", async () => {
    const provider1 = ok("groq");
    const resolve = vi.fn(async (_signal: AbortSignal) => "discovered-model");
    const provider = new FallbackProvider([
      { provider: provider1, model: { resolve } }
    ]);
    const chunks = await collect(provider);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve.mock.calls[0]?.[0]).toBeInstanceOf(AbortSignal);
    expect(provider1.calls[0].model).toBe("discovered-model");
    expect(chunks[0]).toEqual({
      type: "route",
      provider: "groq",
      model: "discovered-model"
    });
  });

  it("si no se puede descubrir el modelo pasa al siguiente despliegue", async () => {
    const backup = ok("mistral");
    const provider = new FallbackProvider([
      {
        provider: ok("groq"),
        model: {
          resolve: async () => {
            throw new AppError("MODEL_UNAVAILABLE", "sin modelo");
          }
        }
      },
      { provider: backup }
    ]);
    const chunks = await collect(provider);
    expect(chunks[0]).toMatchObject({ provider: "mistral" });
  });

  it("si el proveedor rechaza el modelo, se invalida para volver a descubrirlo", async () => {
    const invalidate = vi.fn();
    const provider = new FallbackProvider([
      {
        provider: failing("groq", "MODEL_UNAVAILABLE"),
        model: { resolve: async () => "retired-model", invalidate }
      },
      { provider: ok("mistral") }
    ]);
    await collect(provider);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("la búsqueda del modelo cuenta contra el tiempo máximo del primer texto", async () => {
    const backup = ok("mistral");
    const provider = new FallbackProvider(
      [
        {
          provider: ok("groq"),
          model: {
            resolve: (signal) =>
              new Promise<string>((_, reject) =>
                signal.addEventListener(
                  "abort",
                  () => reject(new AppError("STREAM_CANCELLED", "cancelado")),
                  { once: true }
                )
              )
          }
        },
        { provider: backup }
      ],
      { firstTokenTimeoutMs: 20 }
    );
    const chunks = await collect(provider);
    expect(chunks[0]).toMatchObject({ provider: "mistral" });
  });
});
