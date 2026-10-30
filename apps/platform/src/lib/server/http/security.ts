const SECURITY_HEADERS = Object.freeze({
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin"
});

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Avatares de OAuth y, tras un clic del usuario, imágenes y medios externos
  // enlazados por el modelo (ver MediaEmbed: nunca se cargan solos).
  "img-src 'self' data: https://avatars.githubusercontent.com https://*.googleusercontent.com https:",
  "media-src 'self' https:",
  "font-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'"
].join("; ");

export function applySecurityHeaders(
  response: Response,
  options: { production: boolean }
): Response {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  if (options.production) {
    response.headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains"
    );
  }
  return response;
}

export const SECURITY_POLICY = CONTENT_SECURITY_POLICY;
