import { describe, expect, it } from "vitest";
import {
  parseAiEnvironment,
  parseDatabaseEnvironment,
  parseOpenRouterEnvironment,
  parseStreamCanaryEnvironment,
  ServerEnvironmentError,
  parseServerEnvironment
} from "../../src/lib/server/config/schema";

const validEnvironment = {
  NODE_ENV: "test",
  ORIGIN: "https://cdor.online",
  DB_HOST: "localhost",
  DB_PORT: "3306",
  DB_NAME: "cdor",
  DB_USER: "cdorapp",
  DB_PASSWORD: "database-password-for-tests",
  BETTER_AUTH_SECRET: "better-auth-secret-at-least-32-characters",
  BETTER_AUTH_URL: "https://cdor.online",
  SMTP_HOST: "smtp.resend.com",
  SMTP_PORT: "465",
  SMTP_USER: "resend",
  SMTP_PASSWORD: "smtp-password-for-tests",
  SMTP_FROM: "NO-REPLY@CDOR.ONLINE",
  NVIDIA_API_KEY: "nvidia-api-key-for-validation-tests",
  NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1"
} as const;

describe("configuración privada del servidor", () => {
  it("acepta contraseñas MySQL válidas de Hostinger desde 8 caracteres", () => {
    expect(
      parseDatabaseEnvironment({
        DB_HOST: "localhost",
        DB_NAME: "cdor",
        DB_USER: "cdorapp",
        DB_PASSWORD: "Abcd123!"
      }).DB_PASSWORD
    ).toBe("Abcd123!");
  });

  it("valida y normaliza una configuración completa", () => {
    expect(parseServerEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      DB_PORT: 3306,
      DB_POOL_LIMIT: 3,
      SMTP_PORT: 465,
      SMTP_USER: "resend",
      SMTP_FROM: "no-reply@cdor.online",
      NVIDIA_REQUEST_TIMEOUT_MS: 120_000
    });
  });

  it("valida NVIDIA de forma aislada sin exigir MySQL o SMTP", () => {
    expect(
      parseAiEnvironment({
        NVIDIA_API_KEY: "nvidia-api-key-for-validation-tests",
        NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
        NVIDIA_REQUEST_TIMEOUT_MS: "5000"
      })
    ).toEqual({
      NVIDIA_API_KEY: "nvidia-api-key-for-validation-tests",
      NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
      NVIDIA_REQUEST_TIMEOUT_MS: 5000
    });
  });

  it("acepta modelos predeterminados vacíos antes del benchmark", () => {
    expect(
      parseAiEnvironment({
        NVIDIA_API_KEY: "nvidia-api-key-for-validation-tests",
        NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
        NVIDIA_DEFAULT_MODEL: ""
      }).NVIDIA_DEFAULT_MODEL
    ).toBeUndefined();
  });

  it("valida OpenRouter por separado y conserva defaults seguros", () => {
    expect(
      parseOpenRouterEnvironment({
        OPENROUTER_API_KEY: "openrouter-api-key-for-validation-tests"
      })
    ).toEqual({
      OPENROUTER_API_KEY: "openrouter-api-key-for-validation-tests",
      OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
      OPENROUTER_DEFAULT_MODEL: undefined,
      OPENROUTER_REQUEST_TIMEOUT_MS: 120_000
    });
  });

  it("mantiene el token de canary en un esquema server-only", () => {
    expect(
      parseStreamCanaryEnvironment({
        STREAM_CANARY_TOKEN: "stream-canary-token-for-validation-tests"
      })
    ).toEqual({
      STREAM_CANARY_TOKEN: "stream-canary-token-for-validation-tests"
    });
    expect(() =>
      parseStreamCanaryEnvironment({
        STREAM_CANARY_TOKEN: "stream-canary-token-for-validation-tests",
        PUBLIC_STREAM_CANARY_TOKEN: "visible"
      })
    ).toThrowError(/PUBLIC_STREAM_CANARY_TOKEN/);
  });

  it("rechaza secretos con prefijo PUBLIC_", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        PUBLIC_NVIDIA_API_KEY: "visible-en-el-cliente"
      })
    ).toThrowError(ServerEnvironmentError);
  });

  it("no incluye valores secretos en el error", () => {
    const exposedValue = "do-not-echo-this-database-password";

    try {
      parseServerEnvironment({
        ...validEnvironment,
        DB_PASSWORD: exposedValue,
        DB_PORT: "70000"
      });
      expect.unreachable("La configuración inválida debía fallar");
    } catch (error) {
      expect(error).toBeInstanceOf(ServerEnvironmentError);
      expect(String(error)).not.toContain(exposedValue);
      expect(String(error)).toContain("DB_PORT");
    }
  });

  it("rechaza DATABASE_URL que no sea MySQL", () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        DATABASE_URL: "postgresql://user:password@localhost/cdor"
      })
    ).toThrowError(/DATABASE_URL/);
  });

  it("trata DATABASE_URL vacía como configuración ausente", () => {
    expect(
      parseServerEnvironment({
        ...validEnvironment,
        DATABASE_URL: ""
      }).DATABASE_URL
    ).toBeUndefined();
  });
});
