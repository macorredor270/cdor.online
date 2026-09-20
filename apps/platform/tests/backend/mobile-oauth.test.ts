import { describe, expect, it, vi } from "vitest";
import { MobileOAuthService } from "../../src/lib/server/services/mobile-oauth";

describe("mobile OAuth handoff", () => {
  it("genera un código opaco y almacena solo su hash durante dos minutos", async () => {
    const store = vi.fn(
      async (_identifierHash: string, _token: string, _expiresAt: Date) => undefined
    );
    const service = new MobileOAuthService({
      store,
      consume: vi.fn(async (_identifierHash: string, _now: Date) => null)
    });
    const before = Date.now();
    const challenge = "B".repeat(43);
    const code = await service.create("signed-session-token", challenge);

    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store).toHaveBeenCalledOnce();
    const [hash, token, expiresAt] = store.mock.calls[0]!;
    expect(hash).toMatch(/^[A-Za-z0-9_-]{43}:[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain(code);
    expect(hash).toContain(`:${challenge}`);
    expect(token).toBe("signed-session-token");
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 119_000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 120_000);
  });

  it("entrega al repositorio únicamente el hash del código", async () => {
    const consume = vi.fn(
      async (_identifierHash: string, _now: Date) => "signed-session-token"
    );
    const service = new MobileOAuthService({
      store: vi.fn(
        async (_identifierHash: string, _token: string, _expiresAt: Date) => undefined
      ),
      consume
    });
    const code = "A".repeat(43);

    const verifier = "C".repeat(43);
    await expect(service.consume(code, verifier)).resolves.toBe("signed-session-token");
    expect(consume).toHaveBeenCalledOnce();
    expect(consume.mock.calls[0]?.[0]).not.toBe(code);
    expect(consume.mock.calls[0]?.[0]).not.toContain(verifier);
  });
});
