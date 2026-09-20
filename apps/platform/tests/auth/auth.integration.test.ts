import { UlidSchema } from "@cdor/contracts";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth } from "../../src/lib/server/auth/config";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { DeviceRepository } from "../../src/lib/server/db/repositories/devices";
import { session, user } from "../../src/lib/server/db/schema";
import { DeviceService } from "../../src/lib/server/services/devices";
import type {
  MailMessage,
  MailTransport
} from "../../src/lib/server/email/transport";
import {
  applyMigrations,
  createTestDatabase,
  databaseUrlFor,
  dropTestDatabase,
  testDatabaseName
} from "../db/helpers";

const databaseName = testDatabaseName("auth");
const ORIGIN = "https://auth-test.cdor.local";
const SECRET = "auth-test-secret-that-is-longer-than-thirty-two-characters";
const EMAIL = "auth-user@example.test";
const PASSWORD = "Valid-password-2026";
const DEVICE_ID = "01J20000000000000000000000";

class MemoryMailTransport implements MailTransport {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}

let client: ReturnType<typeof createDatabaseClient>;
let mail: MemoryMailTransport;
let auth: ReturnType<typeof createAuth>;
let signedBearer: string;

function request(
  path: string,
  body?: Record<string, unknown>,
  headers: HeadersInit = {}
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: ORIGIN,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe.sequential("Better Auth", () => {
  beforeAll(async () => {
    await createTestDatabase(databaseName);
    await applyMigrations(databaseUrlFor(databaseName));
    client = createDatabaseClient(databaseUrlFor(databaseName), {
      connectionLimit: 2
    });
    mail = new MemoryMailTransport();
    auth = createAuth({
      database: client.database,
      secret: SECRET,
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      secureCookies: true,
      signUpEnabled: true,
      mail
    });
  }, 120_000);

  afterAll(async () => {
    await client?.close();
    await dropTestDatabase(databaseName);
  }, 120_000);

  it("mantiene el registro cerrado cuando la configuración lo ordena", async () => {
    const closedAuth = createAuth({
      database: client.database,
      secret: SECRET,
      baseURL: ORIGIN,
      trustedOrigins: [ORIGIN],
      secureCookies: true,
      signUpEnabled: false,
      mail
    });
    const response = await closedAuth.handler(
      request("/api/auth/sign-up/email", {
        name: "Registro cerrado",
        email: "closed@example.test",
        password: PASSWORD
      })
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("crea IDs ULID y envía verificación sin crear sesión", async () => {
    const response = await auth.handler(
      request("/api/auth/sign-up/email", {
        name: "Usuario Auth",
        email: EMAIL,
        password: PASSWORD
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-auth-token")).toBeNull();
    expect(mail.messages).toHaveLength(1);
    expect(mail.messages[0]?.to).toBe(EMAIL);

    const [storedUser] = await client.database
      .select()
      .from(user)
      .where(eq(user.email, EMAIL));
    expect(UlidSchema.safeParse(storedUser?.id).success).toBe(true);
    expect(storedUser?.emailVerified).toBe(false);
  });

  it("verifica, inicia sesión y exige bearer firmado", async () => {
    const verificationUrl = mail.messages[0]?.text.match(
      /https:\/\/\S+/
    )?.[0];
    expect(verificationUrl).toBeDefined();
    const verification = await auth.handler(
      new Request(verificationUrl!, {
        headers: { origin: ORIGIN },
        redirect: "manual"
      })
    );
    expect([200, 302]).toContain(verification.status);

    const response = await auth.handler(
      request("/api/auth/sign-in/email", {
        email: EMAIL,
        password: PASSWORD
      })
    );
    expect(response.status).toBe(200);

    const cookie = response.headers.get("set-cookie") ?? "";
    const bearer = response.headers.get("set-auth-token");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(bearer).toMatch(/^[^.]+\.[^.]+$/);
    signedBearer = bearer!;

    const authenticated = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${bearer}` })
    });
    expect(authenticated?.user.email).toBe(EMAIL);
    expect(UlidSchema.safeParse(authenticated?.session.id).success).toBe(true);

    const unsigned = bearer?.split(".", 1)[0];
    const rejected = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${unsigned}` })
    });
    expect(rejected).toBeNull();
  });

  it("persiste deviceId nullable sin exponer el token en el contrato", async () => {
    const rows = await client.database.select().from(session);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deviceId).toBeNull();
    expect(UlidSchema.safeParse(rows[0]?.id).success).toBe(true);
  });

  it("rechaza un origen no confiable antes de crear una sesión", async () => {
    const response = await auth.handler(
      request(
        "/api/auth/sign-in/email",
        {
          email: EMAIL,
          password: PASSWORD
        },
        {
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
          "sec-fetch-mode": "cors"
        }
      )
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("set-auth-token")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("la recuperación no distingue por código HTTP un correo ausente", async () => {
    const existing = await auth.handler(
      request("/api/auth/request-password-reset", { email: EMAIL })
    );
    const absent = await auth.handler(
      request("/api/auth/request-password-reset", {
        email: "absent@example.test"
      })
    );

    expect(existing.status).toBe(absent.status);
    expect(existing.status).toBe(200);
    expect(await existing.json()).toEqual(await absent.json());
    expect(mail.messages.some((message) => message.to === EMAIL)).toBe(true);
  });

  it("vincula y revoca todas las sesiones de un dispositivo propio", async () => {
    const current = await auth.api.getSession({
      headers: new Headers({
        authorization: `Bearer ${signedBearer}`
      })
    });
    expect(current).not.toBeNull();
    const principal = {
      kind: "user" as const,
      userId: current!.user.id,
      sessionId: current!.session.id,
      deviceId: null
    };
    const service = new DeviceService(
      new DeviceRepository(client.database),
      () => new Date("2026-07-27T21:00:00.000Z"),
      () => DEVICE_ID
    );

    const linked = await service.link(principal, {
      id: DEVICE_ID,
      name: "Xiaomi de pruebas",
      platform: "android",
      appVersion: "0.0.0-test"
    });
    expect(linked).toMatchObject({
      id: DEVICE_ID,
      userId: current!.user.id,
      revokedAt: null
    });
    await expect(service.list(principal)).resolves.toHaveLength(1);
    await expect(
      service.revoke(
        { ...principal, userId: "01J20000000000000000000001" },
        DEVICE_ID
      )
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });

    await service.revoke(principal, DEVICE_ID);
    await expect(service.list(principal)).resolves.toEqual([]);
    await expect(
      auth.api.getSession({
        headers: new Headers({
          authorization: `Bearer ${signedBearer}`
        })
      })
    ).resolves.toBeNull();
  });
});
