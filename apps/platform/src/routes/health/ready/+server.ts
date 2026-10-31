import { readinessResponse } from "#lib/server/http/health.js";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  readinessResponse(locals.requestId);
