export type BenchmarkMeasurement = Readonly<{
  modelId: string;
  quality: number;
  latencyMs: number;
  costUnits: number;
}>;

export type BenchmarkScore = BenchmarkMeasurement &
  Readonly<{
    qualityScore: number;
    latencyScore: number;
    costScore: number;
    totalScore: number;
  }>;

function normalizeLowerIsBetter(
  value: number,
  minimum: number,
  maximum: number
): number {
  if (minimum === maximum) {
    return 1;
  }
  return (maximum - value) / (maximum - minimum);
}

export function scoreBenchmark(
  measurements: readonly BenchmarkMeasurement[]
): readonly BenchmarkScore[] {
  if (measurements.length < 2) {
    throw new Error("El benchmark requiere al menos dos modelos");
  }

  const latencies = measurements.map(({ latencyMs }) => latencyMs);
  const costs = measurements.map(({ costUnits }) => costUnits);
  const minimumLatency = Math.min(...latencies);
  const maximumLatency = Math.max(...latencies);
  const minimumCost = Math.min(...costs);
  const maximumCost = Math.max(...costs);

  return measurements
    .map((measurement): BenchmarkScore => {
      const qualityScore = measurement.quality;
      const latencyScore = normalizeLowerIsBetter(
        measurement.latencyMs,
        minimumLatency,
        maximumLatency
      );
      const costScore = normalizeLowerIsBetter(
        measurement.costUnits,
        minimumCost,
        maximumCost
      );
      return Object.freeze({
        ...measurement,
        qualityScore,
        latencyScore,
        costScore,
        totalScore:
          qualityScore * 0.5 + latencyScore * 0.3 + costScore * 0.2
      });
    })
    .sort(
      (left, right) =>
        right.totalScore - left.totalScore ||
        right.qualityScore - left.qualityScore ||
        left.latencyMs - right.latencyMs ||
        left.modelId.localeCompare(right.modelId)
    );
}
