import { loadEnvFile } from "node:process";
import path from "node:path";
import { z } from "zod";

try {
  loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

const EnvironmentSchema = z.object({
  STREAM_CANARY_TOKEN: z.string().min(32).max(512),
  STREAM_CANARY_URL: z
    .url()
    .default("https://cdor.online/api/v1/internal/stream-canary")
});
const environment = EnvironmentSchema.safeParse(process.env);
if (!environment.success) {
  throw new Error(
    "STREAM_CANARY_TOKEN debe existir en .env y en Hostinger"
  );
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 310_000);
const startedAt = performance.now();

try {
  const response = await fetch(environment.data.STREAM_CANARY_URL, {
    headers: {
      authorization: `Bearer ${environment.data.STREAM_CANARY_TOKEN}`,
      accept: "text/event-stream"
    },
    signal: controller.signal
  });
  if (!response.ok || !response.body) {
    throw new Error(`Canary HTTP inválida: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let ticks = 0;
  let firstTickAt: number | undefined;
  let previousTickAt: number | undefined;
  let maximumGapMs = 0;
  let receivedDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }).replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const event = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const eventName = event
        .split("\n")
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const now = performance.now();
      if (eventName === "tick") {
        firstTickAt ??= now;
        if (previousTickAt !== undefined) {
          maximumGapMs = Math.max(maximumGapMs, now - previousTickAt);
        }
        previousTickAt = now;
        ticks += 1;
      } else if (eventName === "done") {
        receivedDone = true;
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  const elapsedMs = performance.now() - startedAt;
  const firstTickMs = (firstTickAt ?? performance.now()) - startedAt;
  if (
    !receivedDone ||
    ticks < 1_100 ||
    elapsedMs < 295_000 ||
    firstTickMs > 5_000 ||
    maximumGapMs > 5_000
  ) {
    throw new Error(
      `Canary fallida: ticks=${ticks} elapsed_ms=${Math.round(elapsedMs)} first_tick_ms=${Math.round(firstTickMs)} max_gap_ms=${Math.round(maximumGapMs)} done=${receivedDone}`
    );
  }
  process.stdout.write(
    `Canary Hostinger OK: ticks=${ticks} elapsed_ms=${Math.round(elapsedMs)} first_tick_ms=${Math.round(firstTickMs)} max_gap_ms=${Math.round(maximumGapMs)}\n`
  );
} finally {
  clearTimeout(timeout);
}
