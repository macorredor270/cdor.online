import { describe, expect, it } from "vitest";
import { applySecurityHeaders, SECURITY_POLICY } from "../../src/lib/server/http/security";

describe("hardening HTTP", () => {
  it("aplica cabeceras de aislamiento y CSP", () => {
    const response = applySecurityHeaders(new Response("ok"), {
      production: true
    });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain(
      "max-age=31536000"
    );
    expect(response.headers.get("content-security-policy")).toBe(
      SECURITY_POLICY
    );
    expect(SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(SECURITY_POLICY).toContain("https://avatars.githubusercontent.com");
    expect(SECURITY_POLICY).toContain("https://*.googleusercontent.com");
    // Los medios externos solo por https; nunca http, blob ni data en media.
    expect(SECURITY_POLICY).toContain("media-src 'self' https:");
    expect(SECURITY_POLICY).not.toMatch(/media-src[^;]*(http:|blob:|data:)/);
    expect(SECURITY_POLICY).toContain("object-src 'none'");
  });

  it("no añade HSTS en desarrollo", () => {
    const response = applySecurityHeaders(new Response("ok"), {
      production: false
    });
    expect(response.headers.has("strict-transport-security")).toBe(false);
  });
});
