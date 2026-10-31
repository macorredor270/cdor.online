import { randomBytes } from "node:crypto";
import https from "node:https";
import path from "node:path";
import { loadEnvFile } from "node:process";
import {
  ChatStreamEventSchema,
  UlidSchema,
  type ChatStreamEvent
} from "@cdor/contracts";
import { drizzle } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import mysql from "mysql2/promise";
import { ulid } from "ulid";
import { z } from "zod";
import { createAuth } from "../../src/lib/server/auth/config";
import * as databaseSchema from "../../src/lib/server/db/schema";
import {
  generationRequests,
  idempotencyKeys,
  messages,
  user
} from "../../src/lib/server/db/schema";
import type {
  MailMessage,
  MailTransport
} from "../../src/lib/server/email/transport";

try {
  loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

const EnvironmentSchema = z.object({
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65_535).default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(8),
  BETTER_AUTH_SECRET: z.string().min(32),
  REAL_STREAM_CANARY_ORIGIN: z
    .url()
    .default("https://cdor.online"),
  REAL_STREAM_CANARY_CANCEL_TRANSPORT: z
    .enum(["fetch", "http1"])
    .default("http1"),
  CDOR_CONFIRM_REAL_STREAM_CANARY: z.string().min(1)
});

const parsedEnvironment = EnvironmentSchema.safeParse(process.env);
if (!parsedEnvironment.success) {
  throw new Error(
    "Falta configuración para la canary real; revisa DB_*, BETTER_AUTH_SECRET y CDOR_CONFIRM_REAL_STREAM_CANARY"
  );
}
const environment = parsedEnvironment.data;
const targetOrigin = new URL(environment.REAL_STREAM_CANARY_ORIGIN).origin;
const expectedConfirmation = `${targetOrigin}/${environment.DB_NAME}`;
if (environment.CDOR_CONFIRM_REAL_STREAM_CANARY !== expectedConfirmation) {
  throw new Error(
    `Canary real bloqueada. Confirma exactamente ${expectedConfirmation}`
  );
}
if (
  ["localhost", "127.0.0.1", "::1"].includes(environment.DB_HOST) ||
  new URL(targetOrigin).hostname !== "cdor.online"
) {
  throw new Error("La canary real solo admite la producción explícita de MAC");
}

const databaseUrl = new URL("mysql://placeholder/");
databaseUrl.hostname = environment.DB_HOST;
databaseUrl.port = String(environment.DB_PORT);
databaseUrl.username = environment.DB_USER;
databaseUrl.password = environment.DB_PASSWORD;
databaseUrl.pathname = `/${environment.DB_NAME}`;

class MemoryMailTransport implements MailTransport {
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }
}

function authRequest(
  pathname: string,
  body?: Readonly<Record<string, unknown>>
): Request {
  return new Request(`${targetOrigin}${pathname}`, {
    method: body ? "POST" : "GET",
    headers: {
      origin: targetOrigin,
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual"
  });
}

async function requireSuccessfulJson<T>(
  response: Response,
  operation: string
): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${operation} falló con HTTP ${response.status}`);
  }
  return body as T;
}

function parseSseFrame(frame: string): ChatStreamEvent | null {
  const lines = frame.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!event || !data) {
    return null;
  }
  return ChatStreamEventSchema.parse({
    event,
    data: JSON.parse(data) as unknown
  });
}

function requestCancellation(
  generationId: string,
  bearer: string
): Promise<{
  generationId: string;
  state: string;
  cancelRequested: boolean;
}> {
  const endpoint = new URL("/api/v1/chat/cancel", targetOrigin);
  const payload = JSON.stringify({ generationId });

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || 443,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        agent: false,
        headers: {
          authorization: `Bearer ${bearer}`,
          origin: targetOrigin,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload)
        },
        timeout: 15_000
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          let body: unknown;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            reject(
              new Error(`Cancelación devolvió JSON inválido: HTTP ${status}`)
            );
            return;
          }
          if (status < 200 || status >= 300) {
            reject(new Error(`Cancelación falló con HTTP ${status}`));
            return;
          }
          const parsed = z
            .object({
              data: z.object({
                generationId: UlidSchema,
                state: z.string().min(1),
                cancelRequested: z.boolean()
              })
            })
            .safeParse(body);
          if (!parsed.success) {
            reject(new Error("Cancelación devolvió un contrato inválido"));
            return;
          }
          resolve(parsed.data.data);
        });
      }
    );
    request.on("timeout", () =>
      request.destroy(new Error("Timeout solicitando cancelación"))
    );
    request.on("error", reject);
    request.end(payload);
  });
}

async function requestCancellationWithFetch(
  generationId: string,
  bearer: string
): Promise<{
  generationId: string;
  state: string;
  cancelRequested: boolean;
}> {
  const response = await fetch(`${targetOrigin}/api/v1/chat/cancel`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      origin: targetOrigin,
      "content-type": "application/json"
    },
    body: JSON.stringify({ generationId }),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await requireSuccessfulJson<{
    data: {
      generationId: string;
      state: string;
      cancelRequested: boolean;
    };
  }>(response, "Cancelación");
  return body.data;
}

async function readAndCancelStream(
  response: Response,
  bearer: string
): Promise<{
  events: ChatStreamEvent[];
  generationId: string;
  cancelResult: {
    generationId: string;
    state: string;
    cancelRequested: boolean;
  };
}> {
  if (!response.ok || !response.body) {
    throw new Error(`Stream real inválido: HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    throw new Error(`Content-Type SSE inválido: ${contentType}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: ChatStreamEvent[] = [];
  let buffer = "";
  let generationId: string | undefined;
  let cancelResultPromise:
    | Promise<{
        generationId: string;
        state: string;
        cancelRequested: boolean;
      } | null>
    | undefined;
  let cancelError: unknown;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder
      .decode(value, { stream: true })
      .replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const parsed = parseSseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (parsed) {
        events.push(parsed);
        if (parsed.event === "start" && !generationId) {
          generationId = parsed.data.generationId;
          process.stderr.write(
            `Canary real: start recibido; solicitando cancelación ${generationId}\n`
          );
          const cancellation =
            environment.REAL_STREAM_CANARY_CANCEL_TRANSPORT === "fetch"
              ? requestCancellationWithFetch(generationId, bearer)
              : requestCancellation(generationId, bearer);
          cancelResultPromise = cancellation
            .then((data) => {
              process.stderr.write(
                `Canary real: cancelación confirmada; requested=${data.cancelRequested} state=${data.state}\n`
              );
              return data;
            })
            .catch((error: unknown) => {
              cancelError = error;
              return null;
            });
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (!generationId || !cancelResultPromise) {
    throw new Error("El stream terminó sin start o sin respuesta de cancelación");
  }
  const cancelResult = await cancelResultPromise;
  if (!cancelResult) {
    throw cancelError ?? new Error("La cancelación no devolvió resultado");
  }
  return { events, generationId, cancelResult };
}

const pool = mysql.createPool({
  uri: databaseUrl.href,
  connectionLimit: 2,
  enableKeepAlive: true,
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: true
});
const database = drizzle({
  client: pool,
  schema: databaseSchema,
  mode: "default"
});
const mail = new MemoryMailTransport();
const auth = createAuth({
  database,
  secret: environment.BETTER_AUTH_SECRET,
  baseURL: targetOrigin,
  trustedOrigins: [targetOrigin],
  secureCookies: true,
  signUpEnabled: true,
  mail
});

const suffix = ulid().toLowerCase();
const email = `m7-canary+${suffix}@cdor.online`;
const password = `${randomBytes(24).toString("base64url")}aA1!`;
let userId: string | undefined;
let bearer: string | undefined;
let cancelBearer: string | undefined;
let generationId: string | undefined;

try {
  const signUpResponse = await auth.handler(
    authRequest("/api/auth/sign-up/email", {
      name: "CDOR M7 Canary",
      email,
      password
    })
  );
  await requireSuccessfulJson(signUpResponse, "Alta canary interna");

  const verificationUrl = mail.messages[0]?.text.match(/https:\/\/\S+/)?.[0];
  if (!verificationUrl) {
    throw new Error("Better Auth no generó el enlace de verificación canary");
  }
  const verificationResponse = await auth.handler(
    new Request(verificationUrl, {
      headers: { origin: targetOrigin },
      redirect: "manual"
    })
  );
  if (![200, 302].includes(verificationResponse.status)) {
    throw new Error(
      `Verificación canary falló con HTTP ${verificationResponse.status}`
    );
  }

  const signInResponse = await auth.handler(
    authRequest("/api/auth/sign-in/email", { email, password })
  );
  await requireSuccessfulJson(signInResponse, "Acceso canary interno");
  bearer = signInResponse.headers.get("set-auth-token") ?? undefined;
  if (!bearer) {
    throw new Error("Better Auth no emitió el bearer firmado");
  }
  const secondSignInResponse = await auth.handler(
    authRequest("/api/auth/sign-in/email", { email, password })
  );
  await requireSuccessfulJson(
    secondSignInResponse,
    "Segundo acceso canary interno"
  );
  cancelBearer =
    secondSignInResponse.headers.get("set-auth-token") ?? undefined;
  if (!cancelBearer) {
    throw new Error("Better Auth no emitió el segundo bearer firmado");
  }
  const [canaryUser] = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  userId = UlidSchema.parse(canaryUser?.id);

  const conversationResponse = await fetch(
    `${targetOrigin}/api/v1/conversations`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        origin: targetOrigin,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        title: "Canary M7",
        modelMode: "balanced"
      })
    }
  );
  const conversationBody = await requireSuccessfulJson<{
    data: { id: string };
  }>(conversationResponse, "Creación de conversación");
  const conversationId = UlidSchema.parse(conversationBody.data.id);
  const messageId = ulid();
  const clientOperationId = ulid();

  const streamResponse = await fetch(`${targetOrigin}/api/v1/chat/stream`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      origin: targetOrigin,
      accept: "text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      conversationId,
      modelMode: "balanced",
      message: {
        id: messageId,
        clientOperationId,
        content:
          "Escribe una explicación extensa de al menos 2.000 palabras sobre sincronización distribuida."
      }
    })
  });
  const streamed = await readAndCancelStream(streamResponse, cancelBearer);
  generationId = streamed.generationId;

  const errorEvent = streamed.events.find((event) => event.event === "error");
  if (
    errorEvent?.event !== "error" ||
    errorEvent.data.code !== "STREAM_CANCELLED"
  ) {
    const observed = streamed.events
      .map((event) =>
        event.event === "error"
          ? `${event.event}:${event.data.code}`
          : event.event
      )
      .join(",");
    throw new Error(
      `El stream no terminó con STREAM_CANCELLED; eventos=${observed || "ninguno"} cancelRequested=${streamed.cancelResult.cancelRequested}`
    );
  }
  if (
    streamed.cancelResult.generationId !== generationId ||
    !streamed.cancelResult.cancelRequested
  ) {
    throw new Error("La ruta de cancelación no confirmó la solicitud");
  }

  const [generation] = await database
    .select()
    .from(generationRequests)
    .where(
      and(
        eq(generationRequests.id, generationId),
        eq(generationRequests.userId, userId)
      )
    )
    .limit(1);
  const [assistant] = await database
    .select()
    .from(messages)
    .where(eq(messages.id, generation?.assistantMessageId ?? ""))
    .limit(1);
  const [idempotency] = await database
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.userId, userId),
        eq(idempotencyKeys.idempotencyKey, clientOperationId)
      )
    )
    .limit(1);

  if (
    generation?.state !== "cancelled" ||
    !generation.cancelRequestedAt ||
    !generation.completedAt ||
    generation.errorCode !== "STREAM_CANCELLED" ||
    assistant?.status !== "cancelled" ||
    assistant.finishReason !== "cancelled" ||
    assistant.errorCode !== "STREAM_CANCELLED" ||
    idempotency?.state !== "failed" ||
    idempotency.responseStatus !== 409
  ) {
    throw new Error("MySQL no conservó un estado final coherente");
  }

  process.stdout.write(
    `Canary NVIDIA Hostinger OK: generation=${generationId} events=${streamed.events
      .map(({ event }) => event)
      .join(",")} state=${generation.state} message=${assistant.status} idempotency=${idempotency.state}\n`
  );
} finally {
  if (bearer && generationId) {
    await fetch(`${targetOrigin}/api/v1/chat/cancel`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${bearer}`,
        origin: targetOrigin,
        "content-type": "application/json"
      },
      body: JSON.stringify({ generationId })
    }).catch(() => undefined);
  }
  if (!userId) {
    const [canaryUser] = await database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    userId = canaryUser?.id;
  }
  if (userId) {
    await database.delete(user).where(eq(user.id, userId));
  }
  await pool.end();
}
