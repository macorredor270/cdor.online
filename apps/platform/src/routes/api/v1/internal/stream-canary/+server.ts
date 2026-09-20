import { timingSafeEqual } from "node:crypto";
import { getStreamCanaryEnvironment } from "$lib/server/config";
import {
  createCanaryStream
} from "$lib/server/stream/canary";
import { sseResponse } from "$lib/server/stream/sse";
import { apiError } from "$lib/server/http/response";
import { AppError } from "$lib/server/errors/app-error";
import type { RequestHandler } from "./$types";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TICK_INTERVAL_MS = 250;

function validBearer(header: string | null, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const supplied = Buffer.from(header.slice(7));
  const target = Buffer.from(expected);
  return (
    supplied.length === target.length && timingSafeEqual(supplied, target)
  );
}

export const GET: RequestHandler = ({ locals, request }) => {
  try {
    const environment = getStreamCanaryEnvironment();
    if (
      !validBearer(
        request.headers.get("authorization"),
        environment.STREAM_CANARY_TOKEN
      )
    ) {
      throw new AppError(
        "UNAUTHENTICATED",
        "La canary requiere autorización"
      );
    }

    return sseResponse(
      createCanaryStream({
        durationMs: FIVE_MINUTES_MS,
        intervalMs: TICK_INTERVAL_MS,
        signal: request.signal
      })
    );
  } catch (error) {
    return apiError(error, locals.requestId);
  }
};
