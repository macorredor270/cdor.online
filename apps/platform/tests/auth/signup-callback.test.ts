import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createAuth } from "../../src/lib/server/auth/config";
import { createDatabaseClient } from "../../src/lib/server/db/client";
import { user } from "../../src/lib/server/db/schema";
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

const databaseName = testDatabaseName("signupcb");
const ORIGIN = "https://signup-test.cdor.local";
const SECRET = "signup-test-secret-that-is-longer-than-thirty-two-chars";
const PASSWORD = "Valid-password-2026";

class MemoryMailTransport implements MailTransport {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}

let client: ReturnType<typeof createDatabaseClient>;
let mail: MemoryMailTransport;
let auth: ReturnType<typeof createAuth>;

function signUp(email: string, callbackURL?: string) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Alta web",
        email,
        password: PASSWORD,
        ...(callbackURL === undefined ? {} : { callbackURL })
      })
    })
  );
}

describe.sequential("alta con callbackURL como la envía la web", () => {
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

  it("sin callbackURL envía la verificación", async () => {
    const before = mail.messages.length;
    const response = await signUp("sin-callback@example.test");

    expect(response.status).toBe(200);
    expect(mail.messages.length).toBe(before + 1);
  });

  it("con callbackURL relativa envía la verificación", async () => {
    const before = mail.messages.length;
    const response = await signUp("con-callback@example.test", "/chat");

    expect(response.status).toBe(200);
    // Si el alta responde 200 pero no sale correo, la persona se queda con una
    // cuenta que nunca podrá activar y sin ninguna señal de que algo falló.
    expect(mail.messages.length).toBe(before + 1);
  });

  it("un correo ya registrado no puede crear una segunda cuenta", async () => {
    const email = "duplicado@example.test";
    const first = await signUp(email, "/chat");
    expect(first.status).toBe(200);

    const before = mail.messages.length;
    const second = await signUp(email, "/chat");

    // Lo que importa es la fila, no el código: Better Auth puede responder 200
    // para no revelar si un correo está registrado. Lo inaceptable sería una
    // segunda cuenta con el mismo correo y un login ambiguo.
    const rows = await client.database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email));
    expect(rows).toHaveLength(1);

    // Y si no se creó cuenta, tampoco debe salir un correo de verificación
    // que prometa activar algo que no existe.
    if (second.status === 200) {
      expect(mail.messages.length).toBe(before);
    }
  });

  it("el enlace de verificación apunta al origen configurado", async () => {
    const message = mail.messages.at(-1);
    expect(message).toBeDefined();
    const link = message?.text.match(/https?:\/\/\S+/)?.[0] ?? "";
    expect(link.startsWith(ORIGIN)).toBe(true);
  });
});
