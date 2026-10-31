import { describe, expect, it } from "vitest";
import { createScaffoldingFilter } from "../../src/lib/server/ai/output-filter";

function run(chunks: readonly string[]): string {
  const filter = createScaffoldingFilter();
  return chunks.map((chunk) => filter.push(chunk)).join("") + filter.flush();
}

describe("filtro de andamiaje del prompt", () => {
  it("deja intacto el texto normal", () => {
    expect(run(["Hola, ", "¿en qué ", "puedo ayudarte?"])).toBe(
      "Hola, ¿en qué puedo ayudarte?"
    );
  });

  it("elimina el marcador de memoria que el modelo copia", () => {
    expect(run(["[Memoria:personal] Vives en Madrid."])).toBe(
      "Vives en Madrid."
    );
  });

  it("elimina el marcador de resumen de contexto", () => {
    expect(run(["[Resumen de contexto anterior] Hablabais de Rust."])).toBe(
      "Hablabais de Rust."
    );
  });

  it("elimina una llamada a herramienta verbalizada", () => {
    expect(run(["reques:search_openrouter", " El resultado es 42."])).toBe(
      "El resultado es 42."
    );
  });

  it("elimina el nombre real de la herramienta si se filtra como texto", () => {
    expect(run(["openrouter:web_search ", "Madrid tiene 3,2 millones."])).toBe(
      "Madrid tiene 3,2 millones."
    );
  });

  // El proveedor trocea el stream donde quiere: un marcador puede llegar
  // partido en dos deltas y el filtro debe reconocerlo igual.
  it("reconoce un marcador partido entre dos fragmentos", () => {
    expect(run(["[Memo", "ria:trabajo] Eres ingeniero."])).toBe(
      "Eres ingeniero."
    );
  });

  it("no se come un corchete legítimo del contenido", () => {
    expect(run(["Ver [1] y también [nota] al pie."])).toBe(
      "Ver [1] y también [nota] al pie."
    );
  });

  it("devuelve en flush lo retenido que no era un marcador", () => {
    const filter = createScaffoldingFilter();
    const streamed = filter.push("Resultado final [");
    expect(streamed + filter.flush()).toBe("Resultado final [");
  });

  it("no retiene texto indefinidamente por un corchete suelto", () => {
    const filter = createScaffoldingFilter();
    const long = "x".repeat(200);
    const streamed = filter.push(`[${long}`);
    expect(streamed + filter.flush()).toBe(`[${long}`);
  });
});
