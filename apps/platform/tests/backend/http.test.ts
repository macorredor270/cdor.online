import { ApiErrorSchema, RequestIdSchema } from "@cdor/contracts";
import { describe, expect, it } from "vitest";
import { handle } from "../../src/hooks.server";
import { requirePrincipal } from "../../src/lib/server/http/principal";
import { readinessResponse } from "../../src/lib/server/http/health";
import {
  apiHandler,
  apiSuccess
} from "../../src/lib/server/http/response";
import { GET as conversationsGet } from "../../src/routes/api/v1/conversations/+server";
import { GET as syncPullGet } from "../../src/routes/api/v1/sync/pull/+server";
import { POST as syncPushPost } from "../../src/routes/api/v1/sync/push/+server";
import { GET as healthGet } from "../../src/routes/health/+server";

const REQUEST_ID = "01J00000000000000000000000";

describe("frontera HTTP del backend", () => {
  it("mantiene el sobre común en liveness", async () => {
    const response = await healthGet({
      locals: { requestId: REQUEST_ID, principal: null }
    } as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { status: "ok" },
      meta: { requestId: REQUEST_ID }
    });
  });

  it("devuelve 401 estable antes de abrir el pool", async () => {
    const response = await conversationsGet({
      locals: { requestId: REQUEST_ID, principal: null },
      url: new URL("https://cdor.online/api/v1/conversations")
    } as never);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(ApiErrorSchema.parse(body)).toMatchObject({
      error: {
        code: "UNAUTHENTICATED",
        requestId: REQUEST_ID,
        details: null
      }
    });
  });

  it("protege pull y push de sincronización antes de abrir el pool", async () => {
    const pullResponse = await syncPullGet({
      locals: { requestId: REQUEST_ID, principal: null },
      url: new URL("https://cdor.online/api/v1/sync/pull")
    } as never);
    const pushResponse = await syncPushPost({
      locals: { requestId: REQUEST_ID, principal: null },
      request: new Request("https://cdor.online/api/v1/sync/push", {
        method: "POST"
      })
    } as never);

    expect(pullResponse.status).toBe(401);
    expect(pushResponse.status).toBe(401);
  });

  it("no permite un Principal ausente", () => {
    expect(() => requirePrincipal(null)).toThrowError(
      "Se necesita una sesión autenticada"
    );
  });

  it("oculta errores inesperados", async () => {
    const privateDetail = "detalle-interno-privado";
    const response = await apiHandler(REQUEST_ID, () => {
      throw new Error(privateDetail);
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(serialized).not.toContain(privateDetail);
    expect(serialized).toContain("INTERNAL_ERROR");
  });

  it("readiness devuelve 503 sin filtrar el error de MySQL", async () => {
    const privateDetail = "mysql://usuario:clave@host/base";
    const response = await readinessResponse(REQUEST_ID, async () => {
      throw new Error(privateDetail);
    });
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(serialized).not.toContain(privateDetail);
    expect(serialized).toContain("INTERNAL_ERROR");
  });

  it("el hook asigna request ID y cabecera", async () => {
    const url = new URL("https://cdor.online/health");
    const event = {
      locals: {} as App.Locals,
      request: new Request(url),
      url
    };
    const response = await handle({
      event,
      resolve: async () => apiSuccess({ status: "ok" }, event.locals.requestId)
    } as never);

    expect(RequestIdSchema.safeParse(event.locals.requestId).success).toBe(true);
    expect(event.locals.principal).toBeNull();
    expect(response.headers.get("x-request-id")).toBe(
      event.locals.requestId
    );
  });

  // El login social se rompía al entrar por www: la cookie de estado es
  // host-only y el callback vuelve siempre al apex fijado por BETTER_AUTH_URL,
  // así que Better Auth respondía state_not_found. El host se canonicaliza
  // antes de tocar la sesión para que el flujo entero ocurra en un solo host.
  it("canonicaliza www al apex antes de resolver la petición", async () => {
    const url = new URL(
      "https://www.cdor.online/api/auth/sign-in/social?next=%2Fchat"
    );
    const event = {
      locals: {} as App.Locals,
      request: new Request(url, { method: "POST" }),
      url
    };
    let resolved = false;

    const response = await handle({
      event,
      resolve: async () => {
        resolved = true;
        return new Response("no debería resolverse");
      }
    } as never);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://cdor.online/api/auth/sign-in/social?next=%2Fchat"
    );
    expect(resolved).toBe(false);
  });

  // Con paths.origin, adapter-node fija event.url al apex aunque el navegador
  // haya pedido www; el host real solo queda en la cabecera Host.
  it("canonicaliza www leyendo la cabecera Host cuando la URL ya es el apex", async () => {
    const url = new URL("https://cdor.online/chat");
    const event = {
      locals: {} as App.Locals,
      request: new Request(url, { headers: { host: "www.cdor.online" } }),
      url
    };

    const response = await handle({
      event,
      resolve: async () => new Response("no debería resolverse")
    } as never);

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://cdor.online/chat");
  });

  it("no redirige cuando la petición ya llega al apex", async () => {
    const url = new URL("https://cdor.online/health");
    const event = {
      locals: {} as App.Locals,
      request: new Request(url),
      url
    };

    const response = await handle({
      event,
      resolve: async () => apiSuccess({ status: "ok" }, event.locals.requestId)
    } as never);

    expect(response.status).toBe(200);
  });
});
