import { EmailSchema } from "@cdor/contracts";
import { z } from "zod";
import { BUILT_IN_PROVIDER_IDS } from "../ai/gateway/registry";

export const SERVER_SECRET_ENV_NAMES = Object.freeze([
  "DB_HOST",
  "DB_PORT",
  "DB_POOL_LIMIT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "DATABASE_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_CONNECTION_TIMEOUT_MS",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "BETTER_AUTH_SECRET",
  "AUTH_SIGN_UP_ENABLED",
  "NVIDIA_API_KEY",
  "NVIDIA_BASE_URL",
  "NVIDIA_DEFAULT_MODEL",
  "NVIDIA_REQUEST_TIMEOUT_MS",
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_DEFAULT_MODEL",
  "OPENROUTER_REQUEST_TIMEOUT_MS",
  "QUOTA_USER_DAILY_MESSAGES",
  "QUOTA_USER_DAILY_TOKENS",
  "QUOTA_GLOBAL_DAILY_TOKENS",
  "AI_FALLBACK_OPENROUTER",
  "NVIDIA_RPM",
  "GROQ_API_KEY",
  "GROQ_DEFAULT_MODEL",
  "GROQ_RPM",
  "GEMINI_API_KEY",
  "GEMINI_DEFAULT_MODEL",
  "GEMINI_RPM",
  "MISTRAL_API_KEY",
  "MISTRAL_DEFAULT_MODEL",
  "MISTRAL_RPM",
  "AI_ROUTING",
  "AI_PROVIDER_ORDER",
  "AI_CUSTOM_PROVIDERS",
  "AI_WEB_SEARCH",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STREAM_CANARY_TOKEN"
] as const);

const PortSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

const MysqlUrlSchema = z.url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "mysql:" || protocol === "mysql2:";
}, "Debe utilizar el protocolo mysql");

const OptionalMysqlUrlSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  MysqlUrlSchema.optional()
);

const BooleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const NvidiaRequestTimeoutSchema = z
  .string()
  .regex(/^[1-9]\d{3,5}$/)
  .transform(Number)
  .pipe(z.number().int().min(5_000).max(300_000))
  .default(120_000);

/**
 * Límite diario entero. `0` lo desactiva y una cadena vacía (variable sin
 * rellenar en el panel de hosting) usa el valor por defecto.
 */
function quotaLimit(defaultValue: number) {
  return z.preprocess(
    (value) => (value === "" ? undefined : value),
    z
      .string()
      .regex(/^\d{1,10}$/)
      .transform(Number)
      .pipe(z.number().int().min(0).max(4_000_000_000))
      .default(defaultValue)
  );
}

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const OptionalRpmSchema = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .regex(/^[1-9]\d{0,5}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(100_000))
    .optional()
);

const ProviderIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/);

/**
 * Proveedor propio con API compatible con OpenAI (Ollama, vLLM, LM Studio,
 * Cloudflare Workers AI, Together, un servidor tuyo…). La clave es opcional
 * porque los servidores locales no la usan.
 */
export const CustomProviderSchema = z
  .object({
    id: ProviderIdSchema,
    baseUrl: z.url(),
    apiKey: z.string().min(1).max(512).optional(),
    model: z.string().trim().min(1).max(160),
    rpm: z.number().int().min(1).max(100_000).optional(),
    weight: z.number().positive().max(1_000).optional(),
    contextTokens: z.number().int().min(2_048).max(2_000_000).optional()
  })
  .strict();

export type CustomProviderConfiguration = z.infer<typeof CustomProviderSchema>;

const CustomProvidersSchema = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .transform((raw, context) => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        context.addIssue({ code: "custom", message: "JSON no válido" });
        return z.NEVER;
      }
    })
    .pipe(z.array(CustomProviderSchema).max(8))
    .optional()
);

const ProviderOrderSchema = z.preprocess(
  emptyAsUndefined,
  z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean)
    )
    .pipe(z.array(ProviderIdSchema).max(16))
    .optional()
);

const OptionalModelIdSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).max(160).optional()
);

const OptionalSecretSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).max(512).optional()
);

const OptionalClientIdSchema = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).max(256).optional()
);

export const DatabaseEnvironmentSchema = z.object({
  DB_HOST: z.string().trim().min(1).max(255),
  DB_PORT: PortSchema.default(3306),
  DB_POOL_LIMIT: z
    .string()
    .regex(/^[1-9]\d?$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(10))
    .default(3),
  DB_NAME: z.string().trim().min(1).max(64),
  DB_USER: z.string().trim().min(1).max(64),
  DB_PASSWORD: z.string().min(8).max(512),
  DATABASE_URL: OptionalMysqlUrlSchema
});

export const ServerEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ORIGIN: z.url(),
  ...DatabaseEnvironmentSchema.shape,
  BETTER_AUTH_SECRET: z.string().min(32).max(512),
  BETTER_AUTH_URL: z.url(),
  AUTH_SIGN_UP_ENABLED: BooleanStringSchema.default(true),
  SMTP_HOST: z.string().trim().min(1).max(255),
  SMTP_PORT: PortSchema.default(465),
  SMTP_CONNECTION_TIMEOUT_MS: z
    .string()
    .regex(/^[1-9]\d{2,5}$/)
    .transform(Number)
    .pipe(z.number().int().min(1000).max(60_000))
    .default(10_000),
  SMTP_USER: z.string().trim().min(1).max(320),
  SMTP_PASSWORD: z.string().min(8).max(512),
  SMTP_FROM: EmailSchema,
  // NVIDIA es un proveedor más: la app arranca con cualquiera de los que haya.
  NVIDIA_API_KEY: z.preprocess(
    emptyAsUndefined,
    z.string().min(20).max(512).optional()
  ),
  NVIDIA_BASE_URL: z.preprocess(
    emptyAsUndefined,
    z.url().default("https://integrate.api.nvidia.com/v1")
  ),
  NVIDIA_RPM: OptionalRpmSchema,
  NVIDIA_DEFAULT_MODEL: OptionalModelIdSchema,
  NVIDIA_REQUEST_TIMEOUT_MS: NvidiaRequestTimeoutSchema,
  OPENROUTER_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(20).max(512).optional()
  ),
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_DEFAULT_MODEL: OptionalModelIdSchema,
  OPENROUTER_REQUEST_TIMEOUT_MS: NvidiaRequestTimeoutSchema,
  // Mensajes y tokens por usuario y día UTC; tope global de tokens por día.
  // El global está desactivado por defecto: actívalo al pasar a proveedores de
  // pago para que un pico no se convierta en una factura sin techo.
  QUOTA_USER_DAILY_MESSAGES: quotaLimit(100),
  QUOTA_USER_DAILY_TOKENS: quotaLimit(150_000),
  QUOTA_GLOBAL_DAILY_TOKENS: quotaLimit(0),
  // Respaldo en OpenRouter (modelos gratuitos) cuando NVIDIA falla. Desactivado
  // por defecto: los modelos gratuitos pueden registrar los prompts.
  AI_FALLBACK_OPENROUTER: z.preprocess(
    (value) => (value === "" ? undefined : value),
    BooleanStringSchema.default(false)
  ),
  // Proveedores gratuitos adicionales (ver ai/gateway/registry.ts). Cada uno se
  // activa al definir su clave.
  GROQ_API_KEY: OptionalSecretSchema,
  GROQ_DEFAULT_MODEL: OptionalModelIdSchema,
  GROQ_RPM: OptionalRpmSchema,
  GEMINI_API_KEY: OptionalSecretSchema,
  GEMINI_DEFAULT_MODEL: OptionalModelIdSchema,
  GEMINI_RPM: OptionalRpmSchema,
  MISTRAL_API_KEY: OptionalSecretSchema,
  MISTRAL_DEFAULT_MODEL: OptionalModelIdSchema,
  MISTRAL_RPM: OptionalRpmSchema,
  // Enrutado: `ordered` usa el primero disponible y los demás de respaldo;
  // `weighted` reparte la carga según el cupo de cada proveedor.
  AI_ROUTING: z.preprocess(
    emptyAsUndefined,
    z.enum(["ordered", "weighted"]).default("ordered")
  ),
  AI_PROVIDER_ORDER: ProviderOrderSchema,
  AI_CUSTOM_PROVIDERS: CustomProvidersSchema,
  // La búsqueda web usa la herramienta de pago de OpenRouter: opt-in.
  AI_WEB_SEARCH: z.preprocess(
    emptyAsUndefined,
    BooleanStringSchema.default(false)
  ),
  GITHUB_CLIENT_ID: OptionalClientIdSchema,
  GITHUB_CLIENT_SECRET: OptionalSecretSchema,
  GOOGLE_CLIENT_ID: OptionalClientIdSchema,
  GOOGLE_CLIENT_SECRET: OptionalSecretSchema,
  STREAM_CANARY_TOKEN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).max(512).optional()
  )
});

export const AuthEnvironmentSchema = ServerEnvironmentSchema.pick({
  NODE_ENV: true,
  ORIGIN: true,
  DB_HOST: true,
  DB_PORT: true,
  DB_POOL_LIMIT: true,
  DB_NAME: true,
  DB_USER: true,
  DB_PASSWORD: true,
  DATABASE_URL: true,
  BETTER_AUTH_SECRET: true,
  BETTER_AUTH_URL: true,
  AUTH_SIGN_UP_ENABLED: true,
  SMTP_HOST: true,
  SMTP_PORT: true,
  SMTP_CONNECTION_TIMEOUT_MS: true,
  SMTP_USER: true,
  SMTP_PASSWORD: true,
  SMTP_FROM: true,
  GITHUB_CLIENT_ID: true,
  GITHUB_CLIENT_SECRET: true,
  GOOGLE_CLIENT_ID: true,
  GOOGLE_CLIENT_SECRET: true
});

// Configuración exclusiva de NVIDIA para los scripts de smoke y benchmark, que
// sí necesitan la clave.
export const AiEnvironmentSchema = ServerEnvironmentSchema.pick({
  NVIDIA_API_KEY: true,
  NVIDIA_BASE_URL: true,
  NVIDIA_DEFAULT_MODEL: true,
  NVIDIA_REQUEST_TIMEOUT_MS: true
}).required({ NVIDIA_API_KEY: true });

/** Todo lo que necesita la pasarela de IA para montar sus despliegues. */
export const GatewayEnvironmentSchema = ServerEnvironmentSchema.pick({
  NVIDIA_API_KEY: true,
  NVIDIA_BASE_URL: true,
  NVIDIA_DEFAULT_MODEL: true,
  NVIDIA_REQUEST_TIMEOUT_MS: true,
  NVIDIA_RPM: true,
  OPENROUTER_API_KEY: true,
  OPENROUTER_BASE_URL: true,
  OPENROUTER_DEFAULT_MODEL: true,
  OPENROUTER_REQUEST_TIMEOUT_MS: true,
  GROQ_API_KEY: true,
  GROQ_DEFAULT_MODEL: true,
  GROQ_RPM: true,
  GEMINI_API_KEY: true,
  GEMINI_DEFAULT_MODEL: true,
  GEMINI_RPM: true,
  MISTRAL_API_KEY: true,
  MISTRAL_DEFAULT_MODEL: true,
  MISTRAL_RPM: true,
  AI_ROUTING: true,
  AI_PROVIDER_ORDER: true,
  AI_CUSTOM_PROVIDERS: true,
  AI_FALLBACK_OPENROUTER: true,
  AI_WEB_SEARCH: true
});

export const QuotaEnvironmentSchema = ServerEnvironmentSchema.pick({
  QUOTA_USER_DAILY_MESSAGES: true,
  QUOTA_USER_DAILY_TOKENS: true,
  QUOTA_GLOBAL_DAILY_TOKENS: true
});

export const FallbackEnvironmentSchema = ServerEnvironmentSchema.pick({
  AI_FALLBACK_OPENROUTER: true
});

export const OpenRouterEnvironmentSchema = ServerEnvironmentSchema.pick({
  OPENROUTER_API_KEY: true,
  OPENROUTER_BASE_URL: true,
  OPENROUTER_DEFAULT_MODEL: true,
  OPENROUTER_REQUEST_TIMEOUT_MS: true
}).required({ OPENROUTER_API_KEY: true });

export const StreamCanaryEnvironmentSchema = ServerEnvironmentSchema.pick({
  STREAM_CANARY_TOKEN: true
}).required({ STREAM_CANARY_TOKEN: true });

export type ServerEnvironment = Readonly<
  z.output<typeof ServerEnvironmentSchema>
>;
export type DatabaseEnvironment = Readonly<
  z.output<typeof DatabaseEnvironmentSchema>
>;
export type AuthEnvironment = Readonly<z.output<typeof AuthEnvironmentSchema>>;
export type AiEnvironment = Readonly<z.output<typeof AiEnvironmentSchema>>;
export type QuotaEnvironment = Readonly<
  z.output<typeof QuotaEnvironmentSchema>
>;
export type FallbackEnvironment = Readonly<
  z.output<typeof FallbackEnvironmentSchema>
>;
export type GatewayEnvironment = Readonly<
  z.output<typeof GatewayEnvironmentSchema>
>;
export type OpenRouterEnvironment = Readonly<
  z.output<typeof OpenRouterEnvironmentSchema>
>;
export type StreamCanaryEnvironment = Readonly<
  z.output<typeof StreamCanaryEnvironmentSchema>
>;

export class ServerEnvironmentError extends Error {
  readonly variables: readonly string[];

  constructor(variables: readonly string[]) {
    const uniqueVariables = [...new Set(variables)].sort();
    super(
      `Configuración de servidor inválida: ${uniqueVariables.join(", ")}`
    );
    this.name = "ServerEnvironmentError";
    this.variables = uniqueVariables;
  }
}

function findPublicSecretNames(
  source: Readonly<Record<string, string | undefined>>
): string[] {
  return SERVER_SECRET_ENV_NAMES.map((name) => `PUBLIC_${name}`).filter(
    (name) => source[name] !== undefined && source[name] !== ""
  );
}

export function parseServerEnvironment(
  source: Readonly<Record<string, string | undefined>>
): ServerEnvironment {
  const publicSecretNames = findPublicSecretNames(source);

  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = ServerEnvironmentSchema.safeParse(source);

  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }

  return Object.freeze(result.data);
}

export function parseDatabaseEnvironment(
  source: Readonly<Record<string, string | undefined>>
): DatabaseEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = DatabaseEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }

  return Object.freeze(result.data);
}

export function parseAuthEnvironment(
  source: Readonly<Record<string, string | undefined>>
): AuthEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = AuthEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}

export function parseAiEnvironment(
  source: Readonly<Record<string, string | undefined>>
): AiEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = AiEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}

export function parseGatewayEnvironment(
  source: Readonly<Record<string, string | undefined>>
): GatewayEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = GatewayEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }

  // Validaciones entre variables. Solo se nombra la variable, nunca su valor.
  const failing: string[] = [];
  const custom = result.data.AI_CUSTOM_PROVIDERS ?? [];
  const customIds = custom.map(({ id }) => id);
  if (
    new Set(customIds).size !== customIds.length ||
    customIds.some((id) => (BUILT_IN_PROVIDER_IDS as readonly string[]).includes(id))
  ) {
    failing.push("AI_CUSTOM_PROVIDERS");
  }
  const known = new Set<string>([...BUILT_IN_PROVIDER_IDS, ...customIds]);
  if ((result.data.AI_PROVIDER_ORDER ?? []).some((id) => !known.has(id))) {
    failing.push("AI_PROVIDER_ORDER");
  }
  if (failing.length > 0) throw new ServerEnvironmentError(failing);

  return Object.freeze(result.data);
}

export function parseQuotaEnvironment(
  source: Readonly<Record<string, string | undefined>>
): QuotaEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = QuotaEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}

export function parseFallbackEnvironment(
  source: Readonly<Record<string, string | undefined>>
): FallbackEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = FallbackEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}

export function parseOpenRouterEnvironment(
  source: Readonly<Record<string, string | undefined>>
): OpenRouterEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = OpenRouterEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}

export function parseStreamCanaryEnvironment(
  source: Readonly<Record<string, string | undefined>>
): StreamCanaryEnvironment {
  const publicSecretNames = findPublicSecretNames(source);
  if (publicSecretNames.length > 0) {
    throw new ServerEnvironmentError(publicSecretNames);
  }

  const result = StreamCanaryEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new ServerEnvironmentError(
      result.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))
    );
  }
  return Object.freeze(result.data);
}
