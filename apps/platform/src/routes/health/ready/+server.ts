import { readinessResponse } from "$lib/server/http/health";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  readinessResponse(locals.requestId);
