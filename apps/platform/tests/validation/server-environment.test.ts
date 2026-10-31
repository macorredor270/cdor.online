import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseGatewayEnvironment,
  parseFallbackEnvironment,
  parseQuotaEnvironment,
  parseAiEnvironment,
  parseDatabaseEnvironment,
  parseOpenRouterEnvironment,
  parseStreamCanaryEnvironment,
  ServerEnvironmentError,
  parseServerEnvironment,
  SERVER_SECRET_ENV_NAMES
} from "../../src/lib/server/config/schema";
import { registryEnvNames } from "../../src/lib/server/ai/gateway/registry";

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

  it("las cuotas tienen valores por defecto y el tope global está apagado", () => {
    expect(parseQuotaEnvironment({})).toEqual({
      QUOTA_USER_DAILY_MESSAGES: 100,
      QUOTA_USER_DAILY_TOKENS: 150_000,
      QUOTA_GLOBAL_DAILY_TOKENS: 0
    });
  });

  it("las cuotas aceptan 0 para desactivar y tratan la cadena vacía como ausente", () => {
    expect(
      parseQuotaEnvironment({
        QUOTA_USER_DAILY_MESSAGES: "0",
        QUOTA_USER_DAILY_TOKENS: "",
        QUOTA_GLOBAL_DAILY_TOKENS: "2500000"
      })
    ).toEqual({
      QUOTA_USER_DAILY_MESSAGES: 0,
      QUOTA_USER_DAILY_TOKENS: 150_000,
      QUOTA_GLOBAL_DAILY_TOKENS: 2_500_000
    });
  });

  it("las cuotas rechazan valores que no son enteros no negativos", () => {
    for (const value of ["-1", "1.5", "cien", "10 000", "99999999999"]) {
      expect(() =>
        parseQuotaEnvironment({ QUOTA_USER_DAILY_MESSAGES: value })
      ).toThrow(ServerEnvironmentError);
    }
  });

  it("el respaldo en OpenRouter está desactivado salvo que se pida", () => {
    expect(parseFallbackEnvironment({})).toEqual({ AI_FALLBACK_OPENROUTER: false });
    expect(parseFallbackEnvironment({ AI_FALLBACK_OPENROUTER: "" })).toEqual({
      AI_FALLBACK_OPENROUTER: false
    });
    expect(
      parseFallbackEnvironment({ AI_FALLBACK_OPENROUTER: "true" })
    ).toEqual({ AI_FALLBACK_OPENROUTER: true });
    expect(() =>
      parseFallbackEnvironment({ AI_FALLBACK_OPENROUTER: "yes" })
    ).toThrow(ServerEnvironmentError);
  });

  it("las variables de cuota y respaldo no admiten prefijo PUBLIC_", () => {
    for (const name of [
      "PUBLIC_QUOTA_USER_DAILY_MESSAGES",
      "PUBLIC_QUOTA_GLOBAL_DAILY_TOKENS"
    ]) {
      expect(() => parseQuotaEnvironment({ [name]: "5" })).toThrow(
        ServerEnvironmentError
      );
    }
    expect(() =>
      parseFallbackEnvironment({ PUBLIC_AI_FALLBACK_OPENROUTER: "true" })
    ).toThrow(ServerEnvironmentError);
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

describe("configuración de la pasarela de IA", () => {
  it("NVIDIA ya no es obligatoria: la aplicación arranca con cualquier proveedor", () => {
    const { NVIDIA_API_KEY: _ignored, NVIDIA_BASE_URL: _ignoredUrl, ...withoutNvidia } =
      validEnvironment;
    const parsed = parseServerEnvironment({
      ...withoutNvidia,
      GROQ_API_KEY: "gsk-test-key"
    });
    expect(parsed.NVIDIA_API_KEY).toBeUndefined();
    expect(parsed.NVIDIA_BASE_URL).toBe("https://integrate.api.nvidia.com/v1");
    expect(parsed.GROQ_API_KEY).toBe("gsk-test-key");
  });

  it("los scripts de NVIDIA siguen exigiendo la clave", () => {
    expect(() => parseAiEnvironment({})).toThrow(ServerEnvironmentError);
  });

  it("valores por defecto: enrutado ordenado, búsqueda web apagada, sin proveedores", () => {
    const parsed = parseGatewayEnvironment({});
    expect(parsed.AI_ROUTING).toBe("ordered");
    expect(parsed.AI_WEB_SEARCH).toBe(false);
    expect(parsed.AI_FALLBACK_OPENROUTER).toBe(false);
    expect(parsed.AI_PROVIDER_ORDER).toBeUndefined();
    expect(parsed.AI_CUSTOM_PROVIDERS).toBeUndefined();
    expect(parsed.GROQ_API_KEY).toBeUndefined();
  });

  it("trata las variables vacías del panel de hosting como ausentes", () => {
    const parsed = parseGatewayEnvironment({
      GROQ_API_KEY: "",
      GROQ_RPM: "",
      GROQ_DEFAULT_MODEL: "",
      AI_ROUTING: "",
      AI_WEB_SEARCH: "",
      AI_PROVIDER_ORDER: "",
      AI_CUSTOM_PROVIDERS: "",
      NVIDIA_API_KEY: ""
    });
    expect(parsed.GROQ_API_KEY).toBeUndefined();
    expect(parsed.GROQ_RPM).toBeUndefined();
    expect(parsed.AI_ROUTING).toBe("ordered");
    expect(parsed.NVIDIA_API_KEY).toBeUndefined();
  });

  it("acepta el enrutado ponderado y rechaza otros", () => {
    expect(parseGatewayEnvironment({ AI_ROUTING: "weighted" }).AI_ROUTING).toBe(
      "weighted"
    );
    expect(() => parseGatewayEnvironment({ AI_ROUTING: "random" })).toThrow(
      ServerEnvironmentError
    );
  });

  it("valida el cupo por minuto", () => {
    expect(parseGatewayEnvironment({ GROQ_RPM: "30" }).GROQ_RPM).toBe(30);
    for (const value of ["0", "-1", "1.5", "muchas", "999999999"]) {
      expect(() => parseGatewayEnvironment({ GROQ_RPM: value })).toThrow(
        ServerEnvironmentError
      );
    }
  });

  it("normaliza AI_PROVIDER_ORDER y rechaza ids desconocidos", () => {
    expect(
      parseGatewayEnvironment({ AI_PROVIDER_ORDER: " Groq , nvidia " })
        .AI_PROVIDER_ORDER
    ).toEqual(["groq", "nvidia"]);
    expect(() =>
      parseGatewayEnvironment({ AI_PROVIDER_ORDER: "groq,inventado" })
    ).toThrow(ServerEnvironmentError);
  });

  it("AI_PROVIDER_ORDER puede nombrar un proveedor propio declarado", () => {
    const custom = JSON.stringify([
      { id: "mi-vllm", baseUrl: "http://127.0.0.1:8000/v1", model: "m" }
    ]);
    expect(
      parseGatewayEnvironment({
        AI_CUSTOM_PROVIDERS: custom,
        AI_PROVIDER_ORDER: "mi-vllm,groq"
      }).AI_PROVIDER_ORDER
    ).toEqual(["mi-vllm", "groq"]);
  });

  it("valida los proveedores propios", () => {
    const valid = {
      id: "mi-vllm",
      baseUrl: "http://127.0.0.1:8000/v1",
      model: "qwen-72b"
    };
    const parse = (value: unknown) =>
      parseGatewayEnvironment({ AI_CUSTOM_PROVIDERS: JSON.stringify(value) });

    expect(parse([valid]).AI_CUSTOM_PROVIDERS).toEqual([valid]);
    expect(() => parse([{ ...valid, id: "Mi VLLM" }])).toThrow(ServerEnvironmentError);
    expect(() => parse([{ ...valid, baseUrl: "no-es-una-url" }])).toThrow(
      ServerEnvironmentError
    );
    expect(() => parse([{ ...valid, model: "" }])).toThrow(ServerEnvironmentError);
    expect(() => parse([{ ...valid, rpm: 0 }])).toThrow(ServerEnvironmentError);
    expect(() => parse([{ ...valid, extra: true }])).toThrow(ServerEnvironmentError);
    expect(() => parse("no es una lista")).toThrow(ServerEnvironmentError);
    expect(() => parse(Array.from({ length: 9 }, (_, i) => ({ ...valid, id: `p${i}` })))).toThrow(
      ServerEnvironmentError
    );
  });

  it("rechaza ids propios repetidos o que choquen con un proveedor conocido", () => {
    const base = { baseUrl: "http://127.0.0.1:8000/v1", model: "m" };
    const parse = (ids: string[]) =>
      parseGatewayEnvironment({
        AI_CUSTOM_PROVIDERS: JSON.stringify(ids.map((id) => ({ ...base, id })))
      });
    expect(() => parse(["a", "a"])).toThrow(ServerEnvironmentError);
    expect(() => parse(["groq"])).toThrow(ServerEnvironmentError);
    expect(() => parse(["nvidia"])).toThrow(ServerEnvironmentError);
    expect(parse(["a", "b"]).AI_CUSTOM_PROVIDERS).toHaveLength(2);
  });

  it("un JSON roto o inválido no filtra su contenido en el error", () => {
    const secret = "sk-secreto-que-no-debe-salir";
    for (const value of [
      `[{"id":"x","apiKey":"${secret}", este no es json`,
      JSON.stringify([{ id: "X X", apiKey: secret, baseUrl: "no-url", model: "m" }])
    ]) {
      try {
        parseGatewayEnvironment({ AI_CUSTOM_PROVIDERS: value });
        expect.unreachable("debía fallar");
      } catch (error) {
        expect(error).toBeInstanceOf(ServerEnvironmentError);
        expect(String(error)).toContain("AI_CUSTOM_PROVIDERS");
        expect(String(error)).not.toContain(secret);
      }
    }
  });

  it("las variables de la pasarela no admiten prefijo PUBLIC_", () => {
    for (const name of [
      "PUBLIC_GROQ_API_KEY",
      "PUBLIC_GEMINI_API_KEY",
      "PUBLIC_AI_CUSTOM_PROVIDERS",
      "PUBLIC_NVIDIA_RPM"
    ]) {
      expect(() => parseGatewayEnvironment({ [name]: "x" })).toThrow(
        ServerEnvironmentError
      );
    }
  });

  it("toda variable del registro consta en la lista de variables privadas", () => {
    const registered = new Set<string>(SERVER_SECRET_ENV_NAMES);
    for (const name of registryEnvNames()) {
      expect(registered.has(name), `${name} falta en SERVER_SECRET_ENV_NAMES`).toBe(true);
    }
    for (const name of [
      "NVIDIA_RPM",
      "AI_ROUTING",
      "AI_PROVIDER_ORDER",
      "AI_CUSTOM_PROVIDERS",
      "AI_WEB_SEARCH",
      "AI_FALLBACK_OPENROUTER"
    ]) {
      expect(registered.has(name), `${name} falta en SERVER_SECRET_ENV_NAMES`).toBe(true);
    }
  });

  it("el escáner de secretos del cliente vigila las mismas variables", async () => {
    // Se lee como texto: es un módulo .mjs fuera del proyecto TypeScript.
    const source = await readFile(
      resolve(import.meta.dirname, "../../../../scripts/scan-client-secrets.mjs"),
      "utf8"
    );
    const block = /SENSITIVE_SERVER_NAMES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(
      source
    );
    expect(block, "no se encontró SENSITIVE_SERVER_NAMES").not.toBeNull();
    const watched = new Set([...block![1].matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1]));
    // Las variables de OAuth se vigilan por su valor en otra parte del escáner.
    const missing = SERVER_SECRET_ENV_NAMES.filter(
      (name) => !watched.has(name) && !/^(GITHUB|GOOGLE)_CLIENT_/.test(name)
    );
    expect(missing).toEqual([]);
  });
});
