import { getAuth } from "#lib/server/auth/runtime.js";
import { getServices } from "#lib/server/services/index.js";
import type { RequestHandler } from "./$types";

const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function deepLink(state: string, parameters: Record<string, string>): URL {
  const target = new URL("mac://oauth/callback");
  target.searchParams.set("state", state);
  for (const [key, value] of Object.entries(parameters))
    target.searchParams.set(key, value);
  return target;
}

function redirectToApp(target: URL): Response {
  const href = target.toString();
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Volviendo a MAC</title></head><body style="margin:0;background:#090011;color:#f8f4ff;font:16px system-ui;display:grid;min-height:100vh;place-items:center;text-align:center">
<main><h1>Acceso completado</h1><p>Volviendo a la aplicación MAC…</p><p><a style="color:#c77dff" href="${href}">Abrir MAC</a></p></main>
<script>location.replace(${JSON.stringify(href)})</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache"
    }
  });
}

export const GET: RequestHandler = async ({ locals, request, url }) => {
  const state = url.searchParams.get("state") ?? "";
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!STATE_PATTERN.test(state))
    return new Response("Estado OAuth no válido", { status: 400 });
  if (!CHALLENGE_PATTERN.test(challenge)) {
    return redirectToApp(deepLink(state, { error: "challenge_invalid" }));
  }
  if (url.searchParams.has("oauthError") || !locals.principal) {
    return redirectToApp(deepLink(state, { error: "oauth_failed" }));
  }

  const context = await getAuth().$context;
  const cookieName = context.authCookies.sessionToken.name;
  const cookies = new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator < 0
          ? [part, ""]
          : [
              part.slice(0, separator),
              decodeCookieValue(part.slice(separator + 1))
            ];
      })
  );
  const token = cookies.get(cookieName);
  if (!token)
    return redirectToApp(deepLink(state, { error: "session_missing" }));

  const code = await getServices().mobileOAuth.create(token, challenge);
  return redirectToApp(deepLink(state, { code }));
};
