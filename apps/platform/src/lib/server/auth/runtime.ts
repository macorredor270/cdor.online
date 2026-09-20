import { getAuthEnvironment } from "../config";
import { getDatabaseClient } from "../db/client";
import { SmtpMailTransport } from "../email/smtp";
import { createAuth } from "./config";

let auth: ReturnType<typeof createAuth> | undefined;

function trustedOriginVariants(...origins: string[]): string[] {
  const result = new Set<string>();
  for (const origin of origins) {
    result.add(origin);
    try {
      const url = new URL(origin);
      if (url.hostname === "cdor.online") {
        result.add(new URL(`${url.protocol}//www.cdor.online`).origin);
      } else if (url.hostname === "www.cdor.online") {
        result.add(new URL(`${url.protocol}//cdor.online`).origin);
      }
    } catch {
      // La validación de configuración dará el error legible correspondiente.
    }
  }
  return [...result];
}

export function getAuth() {
  if (!auth) {
    const environment = getAuthEnvironment();
    const mail = new SmtpMailTransport({
      host: environment.SMTP_HOST,
      port: environment.SMTP_PORT,
      user: environment.SMTP_USER,
      password: environment.SMTP_PASSWORD,
      from: environment.SMTP_FROM,
      connectionTimeoutMs: environment.SMTP_CONNECTION_TIMEOUT_MS
    });
    auth = createAuth({
      database: getDatabaseClient().database,
      secret: environment.BETTER_AUTH_SECRET,
      baseURL: environment.BETTER_AUTH_URL,
      trustedOrigins: trustedOriginVariants(
        environment.ORIGIN,
        environment.BETTER_AUTH_URL,
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://localhost:5173",
        "https://cdor.online"
      ),
      secureCookies: environment.NODE_ENV === "production",
      signUpEnabled: environment.AUTH_SIGN_UP_ENABLED,
      socialProviders: {
        ...(environment.GITHUB_CLIENT_ID && environment.GITHUB_CLIENT_SECRET
          ? {
              github: {
                clientId: environment.GITHUB_CLIENT_ID,
                clientSecret: environment.GITHUB_CLIENT_SECRET
              }
            }
          : {}),
        ...(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET
          ? {
              google: {
                clientId: environment.GOOGLE_CLIENT_ID,
                clientSecret: environment.GOOGLE_CLIENT_SECRET
              }
            }
          : {})
      },
      mail
    });
  }
  return auth;
}
