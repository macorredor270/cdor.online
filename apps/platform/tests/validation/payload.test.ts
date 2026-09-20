import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  HttpInputError,
  parseJsonRequest
} from "../../src/lib/server/http/payload";

const PayloadSchema = z
  .object({
    title: z.string().min(1).max(10)
  })
  .strict();

function jsonRequest(body: string, headers: HeadersInit = {}): Request {
  return new Request("https://cdor.online/api/v1/test", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    },
    body
  });
}

describe("frontera JSON", () => {
  it("devuelve la salida validada", async () => {
    await expect(
      parseJsonRequest(jsonRequest('{"title":"válido"}'), PayloadSchema)
    ).resolves.toEqual({ title: "válido" });
  });

  it("rechaza JSON inválido con un código estable", async () => {
    await expect(
      parseJsonRequest(jsonRequest("{"), PayloadSchema)
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      details: null
    });
  });

  it("expone únicamente path y código de los issues", async () => {
    const secretInput = "valor-privado-que-no-debe-aparecer";

    try {
      await parseJsonRequest(
        jsonRequest(JSON.stringify({ title: secretInput })),
        PayloadSchema
      );
      expect.unreachable("El contrato inválido debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpInputError);
      expect(JSON.stringify(error)).not.toContain(secretInput);
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        details: {
          issues: [{ path: ["title"], code: "too_big" }]
        }
      });
    }
  });

  it("rechaza por Content-Length antes de leer", async () => {
    await expect(
      parseJsonRequest(
        jsonRequest('{"title":"ok"}', { "content-length": "33" }),
        PayloadSchema,
        { maximumBytes: 32 }
      )
    ).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE"
    });
  });

  it("limita los bytes reales aunque falte Content-Length", async () => {
    await expect(
      parseJsonRequest(
        jsonRequest(JSON.stringify({ title: "x".repeat(40) })),
        PayloadSchema,
        { maximumBytes: 32 }
      )
    ).rejects.toMatchObject({
      status: 413,
      code: "PAYLOAD_TOO_LARGE"
    });
  });

  it("rechaza payloads comprimidos y media types ajenos", async () => {
    await expect(
      parseJsonRequest(
        jsonRequest('{"title":"ok"}', { "content-encoding": "gzip" }),
        PayloadSchema
      )
    ).rejects.toMatchObject({ status: 415, code: "VALIDATION_ERROR" });

    await expect(
      parseJsonRequest(
        new Request("https://cdor.online/api/v1/test", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: '{"title":"ok"}'
        }),
        PayloadSchema
      )
    ).rejects.toMatchObject({ status: 415, code: "VALIDATION_ERROR" });
  });
});
