import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MODEL_MODE, isSupportedModelMode } from "../../src/lib/server/ai/catalog";
import { NVIDIA_MODEL_CANDIDATES } from "../../src/lib/server/ai/model-router";
import type { AiChunk, AiProvider } from "../../src/lib/server/ai/types";
import { ModelCatalogService } from "../../src/lib/server/services/models";

const MODEL = NVIDIA_MODEL_CANDIDATES[0]!;

function providerDouble(
  listModels: AiProvider["listModels"]
): AiProvider {
  return {
    name: "nvidia",
    listModels,
    // eslint-disable-next-line require-yield
    async *streamChat(): AsyncIterable<AiChunk> {
      throw new Error("no usado");
    }
  };
}

describe("catálogo de modelos servido", () => {
  it("publica solo los modos propios de MAC", async () => {
    const provider = providerDouble(
      vi.fn().mockResolvedValue([{ id: MODEL.id }, { id: "otro/modelo" }])
    );
    const catalog = new ModelCatalogService(provider, MODEL);

    const data = await catalog.list();

    expect(data.items.map(({ mode }) => mode)).toEqual([DEFAULT_MODEL_MODE]);
    expect(data.defaultMode).toBe(DEFAULT_MODEL_MODE);
    expect(data.items[0]?.modelId).toBe(MODEL.id);
    expect(data.items[0]?.availability).toBe("available");
    expect(data.verifiedAt).not.toBeNull();
  });

  it("no expone el catálogo completo del proveedor", async () => {
    const provider = providerDouble(
      vi
        .fn()
        .mockResolvedValue([{ id: MODEL.id }, { id: "proveedor/experimental" }])
    );

    const data = await new ModelCatalogService(provider, MODEL).list();

    expect(JSON.stringify(data)).not.toContain("proveedor/experimental");
  });

  it("marca el modelo como no disponible si el proveedor deja de publicarlo", async () => {
    const provider = providerDouble(
      vi.fn().mockResolvedValue([{ id: "otro/modelo" }])
    );

    const data = await new ModelCatalogService(provider, MODEL).list();

    expect(data.items[0]?.availability).toBe("unavailable");
  });

  it("declara la disponibilidad desconocida si el proveedor nunca respondió", async () => {
    const provider = providerDouble(
      vi.fn().mockRejectedValue(new Error("red caída"))
    );

    const data = await new ModelCatalogService(provider, MODEL).list();

    expect(data.items[0]?.availability).toBe("unknown");
    expect(data.verifiedAt).toBeNull();
  });

  it("conserva la última verificación cuando el proveedor cae después", async () => {
    const listModels = vi
      .fn()
      .mockResolvedValueOnce([{ id: MODEL.id }])
      .mockRejectedValue(new Error("red caída"));
    const catalog = new ModelCatalogService(providerDouble(listModels), MODEL, {
      availabilityTtlMs: 0
    });

    const first = await catalog.list();
    const second = await catalog.list();

    expect(listModels).toHaveBeenCalledTimes(2);
    expect(second.items[0]?.availability).toBe("available");
    expect(second.verifiedAt).toBe(first.verifiedAt);
  });

  it("cachea la consulta al proveedor durante la ventana TTL", async () => {
    const listModels = vi.fn().mockResolvedValue([{ id: MODEL.id }]);
    const catalog = new ModelCatalogService(providerDouble(listModels), MODEL, {
      availabilityTtlMs: 60_000
    });

    await catalog.list();
    await catalog.list();
    await catalog.list();

    expect(listModels).toHaveBeenCalledTimes(1);
  });

  it("no lanza consultas duplicadas en paralelo", async () => {
    let resolveList: (value: { id: string }[]) => void = () => {};
    const listModels = vi.fn().mockImplementation(
      () =>
        new Promise<{ id: string }[]>((resolve) => {
          resolveList = resolve;
        })
    );
    const catalog = new ModelCatalogService(providerDouble(listModels), MODEL);

    const pending = Promise.all([catalog.list(), catalog.list()]);
    resolveList([{ id: MODEL.id }]);
    await pending;

    expect(listModels).toHaveBeenCalledTimes(1);
  });

  it("solo reconoce los modos que el streaming aceptará", () => {
    expect(isSupportedModelMode(DEFAULT_MODEL_MODE)).toBe(true);
    expect(isSupportedModelMode("creative")).toBe(false);
  });
});
