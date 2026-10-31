import { scoreBenchmark } from "../../src/lib/server/ai/benchmark";
import { describe, expect, it } from "vitest";

describe("puntuación del benchmark", () => {
  it("aplica 50% calidad, 30% latencia y 20% coste", () => {
    const scores = scoreBenchmark([
      {
        modelId: "quality",
        quality: 1,
        latencyMs: 1_000,
        costUnits: 2
      },
      {
        modelId: "fast-cheap",
        quality: 0.5,
        latencyMs: 100,
        costUnits: 1
      }
    ]);

    expect(scores[0]).toMatchObject({
      modelId: "fast-cheap",
      qualityScore: 0.5,
      latencyScore: 1,
      costScore: 1,
      totalScore: 0.75
    });
    expect(scores[1]).toMatchObject({
      modelId: "quality",
      qualityScore: 1,
      latencyScore: 0,
      costScore: 0,
      totalScore: 0.5
    });
  });
});
