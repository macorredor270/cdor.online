const origin = process.env.CDOR_ORIGIN ?? "http://127.0.0.1:4177";
const concurrency = Number.parseInt(process.env.CDOR_CONCURRENCY ?? "10", 10);
const requests = Number.parseInt(process.env.CDOR_REQUESTS ?? "100", 10);

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
  throw new Error("CDOR_CONCURRENCY debe estar entre 1 y 50");
}
if (!Number.isInteger(requests) || requests < concurrency || requests > 10_000) {
  throw new Error("CDOR_REQUESTS debe estar entre concurrency y 10000");
}

const durations = [];
let completed = 0;
async function one() {
  const started = performance.now();
  const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`health devolvió ${response.status}`);
  await response.arrayBuffer();
  durations.push(performance.now() - started);
  completed += 1;
}

while (completed < requests) {
  const batch = Math.min(concurrency, requests - completed);
  await Promise.all(Array.from({ length: batch }, () => one()));
}
durations.sort((a, b) => a - b);
const percentile = (fraction) => durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)];
console.log(JSON.stringify({ origin, requests, concurrency, p50Ms: Math.round(percentile(0.5)), p95Ms: Math.round(percentile(0.95)), p99Ms: Math.round(percentile(0.99)) }));
