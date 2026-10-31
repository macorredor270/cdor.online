import type { Handle } from "@sveltejs/kit/hooks";
import { building } from "$app/env";
import { ulid } from "ulid";
import { getAuth } from "#lib/server/auth/runtime.js";
import { applySecurityHeaders } from "#lib/server/http/security.js";
import { logRequest } from "#lib/server/observability/request-log.js";

const CANONICAL_HOST = "cdor.online";

function hasAuthenticationCredentials(request: Request): boolean {
  return (
    request.headers.has("authorization") ||
    request.headers.get("cookie")?.includes("cdor.") === true
  );
}

// Hostinger sirve el apex y www como hosts independientes y no permite
// configurar un redirect en el servidor. Las cookies de Better Auth son
// host-only y el callback OAuth vuelve siempre al apex de BETTER_AUTH_URL, así
// que un flujo iniciado en www perdía su estado y moría con state_not_found.
// El 308 preserva método y cuerpo, necesario para las rutas POST de acceso.
// Se mira la cabecera Host y no url.hostname: con paths.origin configurado,
// adapter-node fija el origen y la URL ya no refleja el host pedido.
function canonicalHostRedirect(url: URL, host: string | null): Response | null {
  const requestedHost = (host ?? url.host).split(":")[0]?.toLowerCase();
  if (requestedHost !== `www.${CANONICAL_HOST}`) {
    return null;
  }
  const target = new URL(url);
  target.hostname = CANONICAL_HOST;
  target.port = "";
  return new Response(null, {
    status: 308,
    headers: { location: target.toString() }
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  const startedAt = performance.now();
  event.locals.requestId = ulid();
  event.locals.principal = null;

  const canonicalRedirect = building
    ? null
    : canonicalHostRedirect(event.url, event.request.headers.get("host"));

  let response: Response;
  if (canonicalRedirect !== null) {
    response = canonicalRedirect;
  } else if (building) {
    response = await resolve(event);
  } else if (event.url.pathname.startsWith("/api/auth/")) {
    response = await getAuth().handler(event.request);
  } else {
    if (
      !event.url.pathname.startsWith("/health") &&
      hasAuthenticationCredentials(event.request)
    ) {
      const authSession = await getAuth()
        .api.getSession({ headers: event.request.headers })
        .catch(() => null);
      if (authSession) {
        event.locals.principal = Object.freeze({
          kind: "user",
          userId: authSession.user.id,
          sessionId: authSession.session.id,
          deviceId: authSession.session.deviceId ?? null,
          user: Object.freeze({
            id: authSession.user.id,
            name: authSession.user.name,
            email: authSession.user.email,
            image: authSession.user.image ?? null
          })
        });
      }
    }
    response = await resolve(event);
  }
  response.headers.set("x-request-id", event.locals.requestId);
  if (
    response.status >= 300 ||
    event.locals.principal !== null ||
    !event.url.pathname.startsWith("/_app/")
  ) {
    response.headers.set(
      "cache-control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    response.headers.set("pragma", "no-cache");
    response.headers.set("expires", "0");
  }
  applySecurityHeaders(response, {
    production: process.env.NODE_ENV === "production"
  });
  if (process.env.NODE_ENV === "production") {
    logRequest({
      requestId: event.locals.requestId,
      method: event.request.method,
      path: event.url.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - startedAt)
    });
  }
  return response;
};
