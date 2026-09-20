import { DeleteAccountRequestSchema } from "@cdor/contracts";
import { requirePrincipal } from "$lib/server/http/principal";
import { parseJsonRequest } from "$lib/server/http/payload";
import { apiHandler, apiSuccess } from "$lib/server/http/response";
import { getServices } from "$lib/server/services";
import type { RequestHandler } from "./$types";

// POST en lugar de DELETE: el borrado exige un cuerpo con la contraseña y
// algunos proxies descartan el cuerpo de las peticiones DELETE.
export const POST: RequestHandler = ({ locals, request }) =>
  apiHandler(locals.requestId, async () => {
    const principal = requirePrincipal(locals.principal);
    const input = await parseJsonRequest(request, DeleteAccountRequestSchema);
    return apiSuccess(
      await getServices().account.delete(principal, input, request.headers),
      locals.requestId
    );
  });
