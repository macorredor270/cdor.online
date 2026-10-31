import { describe, expect, it } from "vitest";
import {
  ModelCatalogDataSchema,
  ModelCatalogEntrySchema
} from "../src/model";

const entry = {
  mode: "balanced",
  displayName: "Equilibrado",
  description: "Modo por defecto",
  provider: "nvidia",
  modelId: "meta/llama-3.1-8b-instruct",
  contextTokens: 32_768,
  maximumOutputTokens: 2_048,
  isDefault: true,
  availability: "available"
} as const;

describe("catálogo de modelos", () => {
  it("acepta una entrada completa", () => {
    expect(ModelCatalogEntrySchema.parse(entry)).toEqual(entry);
  });

  it("rechaza campos desconocidos", () => {
    expect(() =>
      ModelCatalogEntrySchema.parse({ ...entry, apiKey: "secreto" })
    ).toThrow();
  });

  it("solo admite las tres disponibilidades declaradas", () => {
    for (const availability of ["available", "unavailable", "unknown"]) {
      expect(
        ModelCatalogEntrySchema.parse({ ...entry, availability }).availability
      ).toBe(availability);
    }
    expect(() =>
      ModelCatalogEntrySchema.parse({ ...entry, availability: "maybe" })
    ).toThrow();
  });

  it("acepta un catálogo coherente", () => {
    const data = ModelCatalogDataSchema.parse({
      items: [entry],
      defaultMode: "balanced",
      verifiedAt: "2026-07-30T10:00:00.000Z"
    });
    expect(data.items).toHaveLength(1);
    expect(data.verifiedAt).toBe("2026-07-30T10:00:00.000Z");
  });

  it("permite que la disponibilidad nunca se haya verificado", () => {
    const data = ModelCatalogDataSchema.parse({
      items: [{ ...entry, availability: "unknown" }],
      defaultMode: "balanced",
      verifiedAt: null
    });
    expect(data.verifiedAt).toBeNull();
  });

  it("rechaza un modo por defecto ausente del catálogo", () => {
    expect(() =>
      ModelCatalogDataSchema.parse({
        items: [entry],
        defaultMode: "creative",
        verifiedAt: null
      })
    ).toThrow();
  });

  it("exige exactamente un modo por defecto", () => {
    expect(() =>
      ModelCatalogDataSchema.parse({
        items: [entry, { ...entry, mode: "creative" }],
        defaultMode: "balanced",
        verifiedAt: null
      })
    ).toThrow();
  });

  it("rechaza modos repetidos", () => {
    expect(() =>
      ModelCatalogDataSchema.parse({
        items: [entry, { ...entry, isDefault: false }],
        defaultMode: "balanced",
        verifiedAt: null
      })
    ).toThrow();
  });
});
