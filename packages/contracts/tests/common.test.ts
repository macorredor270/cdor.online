import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  ConversationListQuerySchema,
  IdempotencyHeadersSchema,
  IsoDateSchema,
  UlidSchema,
  UnsignedBigIntStringSchema,
  createApiSuccessSchema
} from "../src";

const ID = "01J00000000000000000000000";

describe("formatos comunes", () => {
  it("acepta ULID Crockford en mayúsculas y rechaza formatos ambiguos", () => {
    expect(UlidSchema.parse(ID)).toBe(ID);
    expect(UlidSchema.safeParse(ID.toLowerCase()).success).toBe(false);
    expect(UlidSchema.safeParse("01I00000000000000000000000").success).toBe(
      false
    );
  });

  it("exige fechas UTC con milisegundos", () => {
    expect(IsoDateSchema.parse("2026-07-27T19:05:03.000Z")).toBe(
      "2026-07-27T19:05:03.000Z"
    );
    expect(IsoDateSchema.safeParse("2026-07-27T19:05:03Z").success).toBe(false);
    expect(IsoDateSchema.safeParse("2026-02-30T00:00:00.000Z").success).toBe(
      false
    );
  });

  it("conserva BIGINT UNSIGNED como texto decimal sin pérdida", () => {
    const beyondSafeInteger = "9007199254740993";

    expect(UnsignedBigIntStringSchema.parse(beyondSafeInteger)).toBe(
      beyondSafeInteger
    );
    expect(
      UnsignedBigIntStringSchema.parse("18446744073709551615")
    ).toBe("18446744073709551615");
    expect(
      UnsignedBigIntStringSchema.safeParse("18446744073709551616").success
    ).toBe(false);
    expect(UnsignedBigIntStringSchema.safeParse("01").success).toBe(false);
  });

  it("normaliza límites de query y rechaza campos desconocidos", () => {
    expect(ConversationListQuerySchema.parse({ limit: "30" })).toEqual({
      limit: 30
    });
    expect(
      ConversationListQuerySchema.safeParse({ limit: 31 }).success
    ).toBe(false);
    expect(
      ConversationListQuerySchema.safeParse({ limit: 10, extra: true }).success
    ).toBe(false);
  });

  it("aplica el sobre común de éxito y error", () => {
    const SuccessSchema = createApiSuccessSchema(UlidSchema);
    expect(
      SuccessSchema.parse({
        data: ID,
        meta: { requestId: ID }
      })
    ).toEqual({ data: ID, meta: { requestId: ID } });

    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "UNAUTHENTICATED",
          message: "Autenticación requerida",
          requestId: ID,
          details: null
        }
      }).success
    ).toBe(true);
  });

  it("normaliza el contrato del header de idempotencia", () => {
    expect(
      IdempotencyHeadersSchema.parse({ "idempotency-key": ID })
    ).toEqual({ "idempotency-key": ID });
    expect(
      IdempotencyHeadersSchema.safeParse({ "Idempotency-Key": ID }).success
    ).toBe(false);
  });
});
