import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, oauthPopup } from "better-auth/plugins";
import { ulid } from "ulid";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import {
  sendPasswordResetMessage,
  sendVerificationMessage
} from "../email/auth-messages";
import type { MailTransport } from "../email/transport";

export type AuthConfiguration = Readonly<{
  database: Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  secureCookies: boolean;
  signUpEnabled: boolean;
  mail: MailTransport;
  socialProviders?: Readonly<{
    github?: Readonly<{ clientId: string; clientSecret: string }>;
    google?: Readonly<{ clientId: string; clientSecret: string }>;
  }>;
  extraPlugins?: BetterAuthPlugin[];
}>;

export function createAuth(configuration: AuthConfiguration) {
  return betterAuth({
    appName: "MAC",
    baseURL: configuration.baseURL,
    secret: configuration.secret,
    trustedOrigins: configuration.trustedOrigins,
    database: drizzleAdapter(configuration.database, {
      provider: "mysql",
      schema,
      transaction: true
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !configuration.signUpEnabled,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendPasswordResetMessage(configuration.mail, user.email, url, user.name)
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        sendVerificationMessage(configuration.mail, user.email, url, user.name)
    },
    socialProviders: {
      ...(configuration.socialProviders?.github
        ? {
            github: {
              ...configuration.socialProviders.github,
              disableSignUp: !configuration.signUpEnabled,
              overrideUserInfoOnSignIn: true
            }
          }
        : {}),
      ...(configuration.socialProviders?.google
        ? {
            google: {
              ...configuration.socialProviders.google,
              disableSignUp: !configuration.signUpEnabled,
              overrideUserInfoOnSignIn: true
            }
          }
        : {})
    },
    account: {
      accountLinking: {
        updateUserInfoOnLink: true
      }
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        deviceId: {
          type: "string",
          required: false,
          input: false,
          returned: true
        }
      }
    },
    advanced: {
      cookiePrefix: "cdor",
      useSecureCookies: configuration.secureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: configuration.secureCookies,
        sameSite: "lax",
        path: "/"
      },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      database: {
        generateId: () => ulid()
      }
    },
    plugins: [
      bearer({ requireSignature: true }),
      oauthPopup(),
      ...(configuration.extraPlugins ?? [])
    ],
    telemetry: { enabled: false }
  });
}
