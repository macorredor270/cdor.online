import { apiSuccess } from "$lib/server/http/response";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals }) =>
  apiSuccess({ status: "ok" }, locals.requestId);
