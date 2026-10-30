import { getAuth } from "#lib/server/auth/runtime.js";
import { getAuthEnvironment } from "#lib/server/config/index.js";
import type { RequestHandler } from "./$types";

const PROVIDERS = new Set(["github", "google"]);
const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function appRedirect(state: string, error: string): Response {
  const target = new URL("mac://oauth/callback");
  target.searchParams.set("state", state);
  target.searchParams.set("error", error);
  return new Response(null, {
    status: 302,
    headers: { location: target.toString(), "cache-control": "no-store" }
  });
}

export const GET: RequestHandler = async ({ request, url }) => {
  // The public origin comes from configuration, not from the request: behind
  // the hosting proxy the request may arrive as plain http.
  const origin = new URL(getAuthEnvironment().ORIGIN).origin;
  const provider = url.searchParams.get("provider") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const challenge = url.searchParams.get("challenge") ?? "";
  if (!STATE_PATTERN.test(state))
    return new Response("Estado OAuth no válido", { status: 400 });
  if (!CHALLENGE_PATTERN.test(challenge))
    return appRedirect(state, "challenge_invalid");
  if (!PROVIDERS.has(provider))
    return appRedirect(state, "provider_not_supported");

  const callback = new URL("/mobile-auth/complete", origin);
  callback.searchParams.set("state", state);
  callback.searchParams.set("challenge", challenge);
  const errorCallback = new URL(callback);
  errorCallback.searchParams.set("oauthError", "provider_error");

  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.set("origin", origin);
  const response = await getAuth().handler(
    new Request(new URL("/api/auth/sign-in/social", origin), {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider,
        callbackURL: callback.toString(),
        errorCallbackURL: errorCallback.toString(),
        requestSignUp: true,
        disableRedirect: true
      })
    })
  );
  if (!response.ok) return appRedirect(state, "oauth_start_failed");

  const payload = (await response.json().catch(() => null)) as {
    url?: unknown;
  } | null;
  if (typeof payload?.url !== "string")
    return appRedirect(state, "oauth_start_failed");

  const redirectHeaders = new Headers({
    location: payload.url,
    "cache-control": "no-store"
  });
  for (const cookie of response.headers.getSetCookie()) {
    redirectHeaders.append("set-cookie", cookie);
  }
  return new Response(null, { status: 302, headers: redirectHeaders });
};
