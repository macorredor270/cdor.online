import { z } from "zod";
import { getAuth } from "#lib/server/auth/runtime.js";
import { AppError } from "#lib/server/errors/app-error.js";
import { parseJsonRequest } from "#lib/server/http/payload.js";
import { apiHandler, apiSuccess } from "#lib/server/http/response.js";
import { getServices } from "#lib/server/services/index.js";
import type { RequestHandler } from "./$types";

const ExchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
});

export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const { code, verifier } = await parseJsonRequest(request, ExchangeSchema, {
      maximumBytes: 256
    });
    const token = await getServices().mobileOAuth.consume(code, verifier);
    if (!token)
      throw new AppError("UNAUTHENTICATED", "El acceso móvil ha caducado");

    const session = await getAuth().api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}` })
    });
    if (!session)
      throw new AppError("UNAUTHENTICATED", "La sesión móvil no es válida");

    return apiSuccess({ token }, locals.requestId, {
      headers: { "cache-control": "no-store" }
    });
  });
