import { describe, expect, it } from "vitest";
import {
  CreateMemoryRequestSchema,
  EmailSchema,
  SignInRequestSchema,
  UpdateConversationRequestSchema,
  UpdateMemoryRequestSchema
} from "../src";

const BASE_VERSION = "9007199254740993";

describe("autenticación", () => {
  it("normaliza correo y no admite propiedades adicionales", () => {
    expect(EmailSchema.parse("USER@Example.COM")).toBe("user@example.com");
    expect(
      SignInRequestSchema.safeParse({
        email: "user@example.com",
        password: "correct horse battery staple",
        bearerToken: "no-debe-viajar"
      }).success
    ).toBe(false);
  });

  it("aplica los límites de contraseña", () => {
    expect(
      SignInRequestSchema.safeParse({
        email: "user@example.com",
        password: "short"
      }).success
    ).toBe(false);
  });
});

describe("mutaciones versionadas", () => {
  it("exige un cambio además de baseVersion en conversaciones", () => {
    expect(
      UpdateConversationRequestSchema.safeParse({
        baseVersion: BASE_VERSION
      }).success
    ).toBe(false);
    expect(
      UpdateConversationRequestSchema.safeParse({
        title: "Nuevo título",
        baseVersion: BASE_VERSION
      }).success
    ).toBe(true);
  });

  it("aplica defaults de memoria y exige cambios en updates", () => {
    expect(
      CreateMemoryRequestSchema.parse({
        content: "Prefiere respuestas breves",
        category: "preference"
      })
    ).toMatchObject({ importance: 1, enabled: true });

    expect(
      UpdateMemoryRequestSchema.safeParse({
        baseVersion: BASE_VERSION
      }).success
    ).toBe(false);
  });
});
