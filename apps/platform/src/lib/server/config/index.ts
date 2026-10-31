import {
  parseFallbackEnvironment,
  parseGatewayEnvironment,
  parseQuotaEnvironment,
  type FallbackEnvironment,
  type GatewayEnvironment,
  type QuotaEnvironment,
  parseAuthEnvironment,
  parseAiEnvironment,
  parseOpenRouterEnvironment,
  parseStreamCanaryEnvironment,
  parseDatabaseEnvironment,
  parseServerEnvironment,
  type AiEnvironment,
  type AuthEnvironment,
  type DatabaseEnvironment,
  type OpenRouterEnvironment,
  type StreamCanaryEnvironment,
  type ServerEnvironment
} from "./schema";

// adapter-node exposes the hosting variables on process.env and
// scripts/dev-local.sh exports the root .env in development.
const env = process.env;

let cachedEnvironment: ServerEnvironment | undefined;
let cachedDatabaseEnvironment: DatabaseEnvironment | undefined;
let cachedAuthEnvironment: AuthEnvironment | undefined;
let cachedAiEnvironment: AiEnvironment | undefined;
let cachedOpenRouterEnvironment: OpenRouterEnvironment | undefined;
let optionalOpenRouterEnvironment: OpenRouterEnvironment | null | undefined;
let cachedGatewayEnvironment: GatewayEnvironment | undefined;
let cachedQuotaEnvironment: QuotaEnvironment | undefined;
let cachedFallbackEnvironment: FallbackEnvironment | undefined;
let cachedStreamCanaryEnvironment: StreamCanaryEnvironment | undefined;

export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= parseServerEnvironment(env);
  return cachedEnvironment;
}

export function getDatabaseEnvironment(): DatabaseEnvironment {
  cachedDatabaseEnvironment ??= parseDatabaseEnvironment(env);
  return cachedDatabaseEnvironment;
}

export function getAuthEnvironment(): AuthEnvironment {
  cachedAuthEnvironment ??= parseAuthEnvironment(env);
  return cachedAuthEnvironment;
}

export function getAiEnvironment(): AiEnvironment {
  cachedAiEnvironment ??= parseAiEnvironment(env);
  return cachedAiEnvironment;
}

export function getOpenRouterEnvironment(): OpenRouterEnvironment {
  cachedOpenRouterEnvironment ??= parseOpenRouterEnvironment(env);
  return cachedOpenRouterEnvironment;
}

export function getOptionalOpenRouterEnvironment(): OpenRouterEnvironment | null {
  if (optionalOpenRouterEnvironment !== undefined) {
    return optionalOpenRouterEnvironment;
  }
  optionalOpenRouterEnvironment = env.OPENROUTER_API_KEY
    ? getOpenRouterEnvironment()
    : null;
  return optionalOpenRouterEnvironment;
}

export function getSocialAuthAvailability() {
  return Object.freeze({
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  });
}

export function isWebSearchEnabled(): boolean {
  // La búsqueda usa una herramienta de pago de OpenRouter: solo con opt-in.
  return Boolean(env.OPENROUTER_API_KEY) && env.AI_WEB_SEARCH === "true";
}

export function getGatewayEnvironment(): GatewayEnvironment {
  cachedGatewayEnvironment ??= parseGatewayEnvironment(env);
  return cachedGatewayEnvironment;
}

export function getQuotaEnvironment(): QuotaEnvironment {
  cachedQuotaEnvironment ??= parseQuotaEnvironment(env);
  return cachedQuotaEnvironment;
}

export function getFallbackEnvironment(): FallbackEnvironment {
  cachedFallbackEnvironment ??= parseFallbackEnvironment(env);
  return cachedFallbackEnvironment;
}

export function getStreamCanaryEnvironment(): StreamCanaryEnvironment {
  cachedStreamCanaryEnvironment ??= parseStreamCanaryEnvironment(env);
  return cachedStreamCanaryEnvironment;
}

/**
 * Si el alta está abierta.
 *
 * Se lee suelto y no a través de `getAuthEnvironment()` a propósito: esa
 * función valida además la base de datos, el SMTP y los secretos, y la
 * portada es la pantalla de acceso. Un SMTP mal puesto no puede tumbar la
 * puerta de entrada por consultar un booleano.
 */
export function isSignUpEnabled(): boolean {
  return env.AUTH_SIGN_UP_ENABLED !== "false";
}

export {
  AiEnvironmentSchema,
  AuthEnvironmentSchema,
  DatabaseEnvironmentSchema,
  OpenRouterEnvironmentSchema,
  SERVER_SECRET_ENV_NAMES,
  ServerEnvironmentError,
  ServerEnvironmentSchema,
  StreamCanaryEnvironmentSchema,
  parseAiEnvironment,
  parseAuthEnvironment,
  parseDatabaseEnvironment,
  parseOpenRouterEnvironment,
  parseServerEnvironment,
  parseStreamCanaryEnvironment,
  type AiEnvironment,
  type AuthEnvironment,
  type DatabaseEnvironment,
  type OpenRouterEnvironment,
  type ServerEnvironment,
  type StreamCanaryEnvironment
} from "./schema";
