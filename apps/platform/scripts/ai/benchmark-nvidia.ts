import {
  filterAllowedModels,
  NVIDIA_MODEL_CANDIDATES
} from "../../src/lib/server/ai/model-router";
import { scoreBenchmark } from "../../src/lib/server/ai/benchmark";
import { createNvidiaProvider } from "../../src/lib/server/ai/runtime";
import { estimateMessagesTokens } from "../../src/lib/server/ai/token-budget";
import type { AiMessage } from "../../src/lib/server/ai/types";
import { collectGeneration } from "./collect";
import { loadAiEnvironment } from "./environment";

type BenchmarkCase = Readonly<{
  id: string;
  messages: readonly AiMessage[];
  evaluate: (output: string) => boolean;
}>;

const CASES = [
  {
    id: "instruction",
    messages: [{ role: "user", content: "Responde únicamente con: CDOR_OK" }],
    evaluate: (output) => output.trim() === "CDOR_OK"
  },
  {
    id: "reasoning",
    messages: [
      {
        role: "user",
        content:
          "Una caja tiene 17 fichas y se añaden 25. Responde únicamente con el número total."
      }
    ],
    evaluate: (output) => output.trim() === "42"
  },
  {
    id: "architecture",
    messages: [
      {
        role: "user",
        content:
          "En una frase breve explica qué base es autoridad y cuál es caché en MAC: MySQL y SQLite."
      }
    ],
    evaluate: (output) => {
      const normalized = output.toLocaleLowerCase("es");
      return (
        normalized.includes("mysql") &&
        normalized.includes("sqlite") &&
        (normalized.includes("autoridad") ||
          normalized.includes("fuente de verdad")) &&
        normalized.includes("cach")
      );
    }
  }
] satisfies readonly BenchmarkCase[];

const environment = loadAiEnvironment();
const provider = createNvidiaProvider(environment);
const available = filterAllowedModels(await provider.listModels());

if (available.length < 2) {
  throw new Error(
    `Benchmark bloqueado: se necesitan 2 candidatos accesibles de la allowlist y hay ${available.length}`
  );
}

const measurements = [];
const failures: Array<{
  modelId: string;
  caseId: string;
  reason: "NO_COMPLETE_TEXT";
}> = [];
for (const model of available) {
  let passed = 0;
  let latencyTotalMs = 0;
  let costUnits = 0;

  for (const benchmarkCase of CASES) {
    const startedAt = performance.now();
    try {
      const generation = await collectGeneration(provider, {
        model: model.id,
        messages: benchmarkCase.messages,
        maxOutputTokens: 128,
        temperature: 0
      });
      if (benchmarkCase.evaluate(generation.text)) {
        passed += 1;
      }
      latencyTotalMs += generation.latencyTotalMs;
      costUnits +=
        (generation.inputTokens * model.benchmarkCost.inputPerMillion +
          generation.outputTokens * model.benchmarkCost.outputPerMillion) /
        1_000_000;
    } catch {
      failures.push({
        modelId: model.id,
        caseId: benchmarkCase.id,
        reason: "NO_COMPLETE_TEXT"
      });
      latencyTotalMs += performance.now() - startedAt;
      costUnits +=
        (estimateMessagesTokens(benchmarkCase.messages) *
          model.benchmarkCost.inputPerMillion +
          128 * model.benchmarkCost.outputPerMillion) /
        1_000_000;
    }
  }

  measurements.push({
    modelId: model.id,
    quality: passed / CASES.length,
    latencyMs: latencyTotalMs / CASES.length,
    costUnits
  });
}

const scores = scoreBenchmark(measurements);
process.stdout.write(
  `${JSON.stringify(
    {
      weights: { quality: 0.5, latency: 0.3, cost: 0.2 },
      candidateCount: NVIDIA_MODEL_CANDIDATES.length,
      testedCount: scores.length,
      winner: scores[0]?.modelId,
      failures,
      scores: scores.map((score) => ({
        modelId: score.modelId,
        quality: Number(score.qualityScore.toFixed(4)),
        latencyMs: Math.round(score.latencyMs),
        costUnits: Number(score.costUnits.toFixed(8)),
        total: Number(score.totalScore.toFixed(4))
      }))
    },
    null,
    2
  )}\n`
);
