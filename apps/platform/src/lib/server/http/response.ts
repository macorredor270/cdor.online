import {
  ApiErrorSchema,
  normalizeValidationIssues,
  type ErrorCode
} from "@cdor/contracts";
import { z } from "zod";
import { AppError } from "../errors/app-error";
import { HttpInputError } from "./payload";

export function apiSuccess(
  data: unknown,
  requestId: string,
  init: ResponseInit = {}
): Response {
  return Response.json(
    {
      data,
      meta: { requestId }
    },
    init
  );
}

function errorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  details: unknown | null
) {
  return ApiErrorSchema.parse({
    error: { code, message, requestId, details }
  });
}

export function apiError(error: unknown, requestId: string): Response {
  if (error instanceof AppError || error instanceof HttpInputError) {
    return Response.json(
      errorBody(error.code, error.message, requestId, error.details),
      { status: error.status }
    );
  }

  if (error instanceof z.ZodError) {
    return Response.json(
      errorBody(
        "VALIDATION_ERROR",
        "La solicitud no cumple el contrato",
        requestId,
        { issues: normalizeValidationIssues(error) }
      ),
      { status: 400 }
    );
  }

  return Response.json(
    errorBody(
      "INTERNAL_ERROR",
      "No se pudo completar la solicitud",
      requestId,
      null
    ),
    { status: 500 }
  );
}

export async function apiHandler(
  requestId: string,
  handler: () => Response | Promise<Response>
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return apiError(error, requestId);
  }
}
