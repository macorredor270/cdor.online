import {
  filterAllowedModels,
  resolveConfiguredModel
} from "../../src/lib/server/ai/model-router";
import { MockAiProvider } from "../../src/lib/server/ai/mock";
import { describe, expect, it } from "vitest";

describe("allowlist y router de modelos", () => {
  it("no expone modelos arbitrarios del proveedor", () => {
    expect(
      filterAllowedModels([
        { id: "proveedor/modelo-no-aprobado" },
        { id: "meta/llama-3.1-8b-instruct" }
      ])
    ).toEqual([
      expect.objectContaining({ id: "meta/llama-3.1-8b-instruct" })
    ]);
  });

  it("resuelve solo un modelo configurado y disponible", async () => {
    const provider = new MockAiProvider({
      models: ["meta/llama-3.1-8b-instruct"]
    });
    await expect(
      resolveConfiguredModel(provider, "meta/llama-3.1-8b-instruct")
    ).resolves.toMatchObject({ id: "meta/llama-3.1-8b-instruct" });
    await expect(
      resolveConfiguredModel(provider, "proveedor/modelo-no-aprobado")
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
});
