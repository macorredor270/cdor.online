import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  CONTRACT_LIMITS,
  ContractOutputValidationError,
  MemoryContentSchema,
  PageLimitQuerySchema,
  UserMessageContentSchema,
  createApiSuccessSchema,
  parseContractOutput,
  utf8ByteLength,
  validateContract
} from "../src";

const ID = "01J00000000000000000000000";

describe("límites compartidos", () => {
  it("mide bytes UTF-8 y no unidades UTF-16", () => {
    const exactMessage = "😀".repeat(
      CONTRACT_LIMITS.USER_MESSAGE_MAX_BYTES / 4
    );
    const oversizedMessage = `${exactMessage}😀`;

    expect(utf8ByteLength(exactMessage)).toBe(
      CONTRACT_LIMITS.USER_MESSAGE_MAX_BYTES
    );
    expect(UserMessageContentSchema.safeParse(exactMessage).success).toBe(true);
    expect(UserMessageContentSchema.safeParse(oversizedMessage).success).toBe(
      false
    );
  });

  it("aplica 4 KiB reales a las memorias", () => {
    expect(MemoryContentSchema.safeParse("é".repeat(2048)).success).toBe(true);
    expect(MemoryContentSchema.safeParse("é".repeat(2049)).success).toBe(false);
  });

  it("solo permite enteros decimales explícitos en queries", () => {
    expect(PageLimitQuerySchema.parse("30")).toBe(30);
    expect(PageLimitQuerySchema.safeParse(true).success).toBe(false);
    expect(PageLimitQuerySchema.safeParse("1e1").success).toBe(false);
    expect(PageLimitQuerySchema.safeParse(" 10 ").success).toBe(false);
    expect(PageLimitQuerySchema.safeParse("01").success).toBe(false);
  });
});

describe("errores de frontera", () => {
  it("normaliza fallos sin copiar valores de entrada", () => {
    const privateValue = "contenido-privado-que-no-debe-volver";
    const result = validateContract(
      z.object({ content: z.string().max(2) }).strict(),
      { content: privateValue }
    );

    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain(privateValue);

    if (!result.success) {
      expect(result.error).toEqual({
        code: "VALIDATION_ERROR",
        details: {
          issues: [{ path: ["content"], code: "too_big" }]
        }
      });
    }
  });

  it("limita la cantidad de issues devueltos", () => {
    const schema = z.array(z.number()).length(30);
    const result = validateContract(schema, Array.from({ length: 30 }, () => "x"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.details.issues).toHaveLength(
        CONTRACT_LIMITS.VALIDATION_MAX_ISSUES
      );
    }
  });

  it("distingue un fallo de salida sin revelar el objeto", () => {
    const schema = createApiSuccessSchema(z.object({ id: z.literal(ID) }));
    const privateValue = "salida-privada";

    expect(() =>
      parseContractOutput(schema, {
        data: { id: privateValue },
        meta: { requestId: ID }
      })
    ).toThrowError(ContractOutputValidationError);

    try {
      parseContractOutput(schema, {
        data: { id: privateValue },
        meta: { requestId: ID }
      });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain(privateValue);
    }
  });
});
