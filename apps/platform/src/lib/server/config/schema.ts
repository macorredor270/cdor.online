import { EmailSchema } from "@cdor/contracts";
import { z } from "zod";

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
  NVIDIA_API_KEY: z.string().min(20).max(512),
  NVIDIA_BASE_URL: z.url(),
  NVIDIA_DEFAULT_MODEL: OptionalModelIdSchema,
  NVIDIA_REQUEST_TIMEOUT_MS: NvidiaRequestTimeoutSchema,
  OPENROUTER_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(20).max(512).optional()
  ),
  OPENROUTER_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  OPENROUTER_DEFAULT_MODEL: OptionalModelIdSchema,
  OPENROUTER_REQUEST_TIMEOUT_MS: NvidiaRequestTimeoutSchema,
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

export const AiEnvironmentSchema = ServerEnvironmentSchema.pick({
  NVIDIA_API_KEY: true,
  NVIDIA_BASE_URL: true,
  NVIDIA_DEFAULT_MODEL: true,
  NVIDIA_REQUEST_TIMEOUT_MS: true
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
