import { setTimeout as delay } from "node:timers/promises";
import { encodeSse } from "./sse";

export type CanaryStreamConfiguration = Readonly<{
  durationMs: number;
  intervalMs: number;
  signal?: AbortSignal;
}>;

export function createCanaryStream(
  configuration: CanaryStreamConfiguration
): ReadableStream<Uint8Array> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  configuration.signal?.addEventListener("abort", abort, { once: true });

  return new ReadableStream({
    async start(streamController) {
      const startedAt = Date.now();
      let sequence = 0;
      try {
        while (Date.now() - startedAt < configuration.durationMs) {
          streamController.enqueue(
            encodeSse("tick", {
              sequence,
              elapsedMs: Date.now() - startedAt
            })
          );
          sequence += 1;
          await delay(configuration.intervalMs, undefined, {
            signal: controller.signal
          });
        }
        streamController.enqueue(
          encodeSse("done", {
            ticks: sequence,
            elapsedMs: Date.now() - startedAt
          })
        );
        streamController.close();
      } catch (error) {
        if (controller.signal.aborted) {
          streamController.close();
        } else {
          streamController.error(error);
        }
      } finally {
        configuration.signal?.removeEventListener("abort", abort);
      }
    },
    cancel() {
      controller.abort();
    }
  });
}
