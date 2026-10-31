import { describe, expect, it } from "vitest";
import { RateWindow } from "../../src/lib/server/ai/gateway/limiter";
import {
  pickModel,
  stripModelsPrefix
} from "../../src/lib/server/ai/gateway/model-pick";

describe("pickModel", () => {
  it("respeta el orden de preferencia entre patrones", () => {
    const available = ["llama-3.1-8b-instant", "gpt-oss-120b", "whisper-large"];
    expect(pickModel(available, [/gpt-oss-120b/, /llama-3\.1-8b/])).toBe(
      "gpt-oss-120b"
    );
    expect(pickModel(available, [/llama-3\.1-8b/, /gpt-oss-120b/])).toBe(
      "llama-3.1-8b-instant"
    );
  });

  it("prueba el siguiente patrón cuando el anterior no coincide", () => {
    expect(pickModel(["b-model"], [/a-model/, /b-model/])).toBe("b-model");
  });

  it("dentro de un patrón elige la versión más reciente, no la última alfabética", () => {
    const available = ["gemini-2.5-flash", "gemini-10.0-flash", "gemini-3.1-flash"];
    expect(pickModel(available, [/^gemini-[\d.]+-flash$/])).toBe(
      "gemini-10.0-flash"
    );
  });

  it("devuelve null si nada coincide y no inventa un modelo", () => {
    expect(pickModel(["whisper", "embed"], [/gpt/, /llama/])).toBeNull();
    expect(pickModel([], [/gpt/])).toBeNull();
    expect(pickModel(["gpt"], [])).toBeNull();
  });

  it("no modifica la lista de entrada", () => {
    const available = ["b", "a"];
    pickModel(available, [/./]);
    expect(available).toEqual(["b", "a"]);
  });

  it("quita el prefijo models/ de los catálogos que lo usan", () => {
    expect(stripModelsPrefix("models/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(stripModelsPrefix("gpt-oss-120b")).toBe("gpt-oss-120b");
  });
});

describe("RateWindow", () => {
  it("sin límite siempre hay capacidad y no acumula", () => {
    const window = new RateWindow(undefined);
    for (let i = 0; i < 1_000; i += 1) window.record(i);
    expect(window.hasCapacity(1_000)).toBe(true);
    expect(window.used(1_000)).toBe(0);
  });

  it("agota la capacidad al llegar al límite y la recupera al deslizar la ventana", () => {
    const window = new RateWindow(3, 60_000);
    window.record(0);
    window.record(10_000);
    window.record(20_000);
    expect(window.hasCapacity(30_000)).toBe(false);
    // La primera sale de la ventana a los 60 s.
    expect(window.hasCapacity(60_000)).toBe(true);
    expect(window.used(60_000)).toBe(2);
    expect(window.hasCapacity(80_001)).toBe(true);
    expect(window.used(80_001)).toBe(0);
  });

  it("consultar la capacidad no consume ninguna petición", () => {
    const window = new RateWindow(1);
    for (let i = 0; i < 10; i += 1) expect(window.hasCapacity(0)).toBe(true);
    expect(window.used(0)).toBe(0);
  });
});
