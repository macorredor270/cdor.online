import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { load as pageLoad } from "../../src/routes/+page.server";
import { load as layoutLoad } from "../../src/routes/(app)/+layout.server";
import { testPrincipal } from "../../src/lib/server/auth/principal";

const root = resolve(import.meta.dirname, "../..");

describe("web routes", () => {
  it("never renders model output through raw HTML", async () => {
    const markdown = await readFile(
      resolve(root, "src/lib/components/Markdown.svelte"),
      "utf8"
    );
    const chat = await readFile(
      resolve(root, "src/routes/(app)/chat/[conversationId]/+page.svelte"),
      "utf8"
    );
    expect(markdown).not.toContain("{@html");
    expect(chat).not.toContain("{@html");
  });

  it("provides labels, landmarks and keyboard submission", async () => {
    const login = await readFile(resolve(root, "src/routes/+page.svelte"), "utf8");
    const publicShell = await readFile(
      resolve(root, "src/lib/components/PublicShell.svelte"),
      "utf8"
    );
    const chat = await readFile(
      resolve(root, "src/routes/(app)/chat/[conversationId]/+page.svelte"),
      "utf8"
    );
    const composer = await readFile(
      resolve(root, "src/lib/components/Composer.svelte"),
      "utf8"
    );
    expect(login).toContain('label for="email"');
    expect(login).toContain('label for="password"');
    expect(login).toContain('href="/register"');
    expect(publicShell).toContain("<main");
    expect(composer).toContain('label class="sr-only" for="composer-field"');
    expect(chat).toContain('event.key === "Enter"');
    expect(chat).toContain('aria-live="polite"');
  });

  it("activa la búsqueda por defecto y avisa antes de usar conocimiento antiguo", async () => {
    const emptyChat = await readFile(
      resolve(root, "src/routes/(app)/chat/+page.svelte"),
      "utf8"
    );
    const conversation = await readFile(
      resolve(root, "src/routes/(app)/chat/[conversationId]/+page.svelte"),
      "utf8"
    );
    const composer = await readFile(
      resolve(root, "src/lib/components/Composer.svelte"),
      "utf8"
    );

    expect(emptyChat).toContain("$state(untrack(() => Boolean(data.webSearchEnabled)))");
    expect(conversation).toContain("$state(untrack(() => Boolean(data.webSearchEnabled)))");
    expect(composer).toContain("webSearch = $bindable(true)");
    expect(composer).toContain("Búsqueda web desactivada.");
    expect(composer).toContain("desactualizado desde diciembre de 2023");
  });

  it("redirige al usuario autenticado de la raíz a /chat sin bucles", () => {
    const principal = testPrincipal("user-123");
    expect(() => pageLoad({ locals: { principal } } as never)).toThrow();
    expect(pageLoad({ locals: { principal: null } } as never)).toEqual({
      signUpEnabled: true,
      socialProviders: { github: false, google: false }
    });
  });

  it("protege el layout (app) redirigiendo solo cuando no hay principal", () => {
    const principal = testPrincipal("user-123");
    const result = layoutLoad({ locals: { principal } } as never);
    expect(result).toEqual({
      webSearchEnabled: false,
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        image: null
      }
    });

    expect(() => layoutLoad({ locals: { principal: null } } as never)).toThrow();
  });

  it("entrega el avatar OAuth al layout de la cuenta", async () => {
    const image = "https://avatars.githubusercontent.com/u/123?v=4";
    const result = await layoutLoad({
      locals: {
        principal: {
          kind: "user",
          userId: "user-123",
          sessionId: "session-123",
          deviceId: null,
          user: {
            id: "user-123",
            name: "OAuth User",
            email: "oauth@example.com",
            image
          }
        }
      }
    } as never);

    if (!result) throw new Error("El layout no devolvió datos");
    expect(result.user.image).toBe(image);
  });

  // El componente recibía `providers` desde getSocialAuthAvailability y no lo
  // usaba, así que ofrecía proveedores sin credenciales configuradas y el
  // usuario solo descubría el fallo tras pulsar.
  it("solo ofrece los proveedores sociales configurados", async () => {
    const buttons = await readFile(
      resolve(root, "src/lib/components/OAuthButtons.svelte"),
      "utf8"
    );
    expect(buttons).toContain("{#if providers.github}");
    expect(buttons).toContain("{#if providers.google}");
  });

  // La web y la app deben leerse como el mismo producto: los controles de
  // acción del compositor comparten gradiente y violeta de realce.
  it("comparte con la app los tokens de acento del compositor", async () => {
    const webTokens = await readFile(resolve(root, "src/app.css"), "utf8");
    const mobileTokens = await readFile(
      resolve(root, "../mobile/src/app.css"),
      "utf8"
    );
    const composer = await readFile(
      resolve(root, "src/lib/components/Composer.svelte"),
      "utf8"
    );

    for (const token of ["--accent-button", "--accent-light"]) {
      expect(webTokens).toContain(token);
      expect(mobileTokens).toContain(token);
    }
    expect(composer).toContain("background: var(--accent-button)");
  });
});
