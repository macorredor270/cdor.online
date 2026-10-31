import { describe, expect, it } from "vitest";
import { POST } from "../../src/routes/api/v1/contact/+server";

describe("API Contact Endpoint", () => {
  it("rechaza peticiones con datos incompletos", async () => {
    const request = new Request("http://localhost/api/v1/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "A",
        email: "invalido",
        subject: "",
        message: "corto"
      })
    });

    const response = await POST({
      request,
      locals: { requestId: "01J20000000000000000000000", principal: null }
    } as any);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("acepta solicitudes de ayuda válidas y procesa el envío", async () => {
    const request = new Request("http://localhost/api/v1/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Carlos Gómez",
        email: "carlos@ejemplo.com",
        subject: "Consulta sobre sincronización",
        message: "Hola, quisiera solicitar ayuda sobre cómo vincular mi dispositivo móvil."
      })
    });

    const response = await POST({
      request,
      locals: { requestId: "01J20000000000000000000001", principal: null }
    } as any);

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.sent).toBe(true);
  });
});
