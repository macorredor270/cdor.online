import { checkDatabaseReadiness } from "../db/client";
import { AppError } from "../errors/app-error";
import { apiError, apiSuccess } from "./response";

export async function readinessResponse(
  requestId: string,
  check: () => Promise<void> = checkDatabaseReadiness
): Promise<Response> {
  try {
    await check();
    return apiSuccess({ status: "ready" }, requestId);
  } catch {
    return apiError(
      new AppError(
        "INTERNAL_ERROR",
        "El servicio aún no está preparado",
        { status: 503 }
      ),
      requestId
    );
  }
}
