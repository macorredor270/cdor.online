import { z } from "zod";
import { IsoDateSchema } from "./common";
import { ModelModeSchema } from "./conversation";

export const MODEL_CATALOG_MAX_ENTRIES = 32;

// El proveedor puede dejar de publicar un modelo o quedar inalcanzable. El
// catálogo distingue las tres situaciones en vez de mentir con un booleano.
export const ModelAvailabilitySchema = z.enum([
  "available",
  "unavailable",
  "unknown"
]);

export const ModelCatalogEntrySchema = z
  .object({
    mode: ModelModeSchema,
    displayName: z.string().min(1).max(120),
    description: z.string().min(1).max(280),
    provider: z.string().min(1).max(32),
    modelId: z.string().min(1).max(160),
    contextTokens: z.number().int().positive(),
    maximumOutputTokens: z.number().int().positive(),
    isDefault: z.boolean(),
    availability: ModelAvailabilitySchema
  })
  .strict();

export const ModelCatalogDataSchema = z
  .object({
    items: z.array(ModelCatalogEntrySchema).max(MODEL_CATALOG_MAX_ENTRIES),
    defaultMode: ModelModeSchema,
    // Instante en el que el proveedor confirmó por última vez la
    // disponibilidad. `null` mientras no se haya podido verificar nunca.
    verifiedAt: IsoDateSchema.nullable()
  })
  .strict()
  .refine(
    (value) => value.items.some((item) => item.mode === value.defaultMode),
    "El modo por defecto debe pertenecer al catálogo"
  )
  .refine(
    (value) => value.items.filter((item) => item.isDefault).length === 1,
    "El catálogo debe declarar exactamente un modo por defecto"
  )
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.mode)).size === value.items.length,
    "Los modos del catálogo no pueden repetirse"
  );

export type ModelAvailability = z.infer<typeof ModelAvailabilitySchema>;
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;
export type ModelCatalogData = z.infer<typeof ModelCatalogDataSchema>;
