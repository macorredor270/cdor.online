import {
  CONTRACT_LIMITS,
  normalizeValidationIssues,
  type ErrorCode,
  type ValidationFailureDetails
} from "@cdor/contracts";
import { z } from "zod";

type InputErrorStatus = 400 | 413 | 415;
type InputErrorCode = Extract<
  ErrorCode,
  "VALIDATION_ERROR" | "PAYLOAD_TOO_LARGE"
>;

export class HttpInputError extends Error {
  readonly status: InputErrorStatus;
  readonly code: InputErrorCode;
  readonly details: ValidationFailureDetails | null;

  constructor(options: {
    status: InputErrorStatus;
    code: InputErrorCode;
    message: string;
    details?: ValidationFailureDetails | null;
  }) {
    super(options.message);
    this.name = "HttpInputError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? null;
  }
}

function validationError(message: string): HttpInputError {
  return new HttpInputError({
    status: 400,
    code: "VALIDATION_ERROR",
    message
  });
}

function assertJsonMediaType(request: Request): void {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (
    contentType !== "application/json" &&
    !contentType?.match(/^application\/[a-z0-9.+-]+\+json$/)
  ) {
    throw new HttpInputError({
      status: 415,
      code: "VALIDATION_ERROR",
      message: "Content-Type JSON requerido"
    });
  }

  const contentEncoding = request.headers
    .get("content-encoding")
    ?.trim()
    .toLowerCase();

  if (contentEncoding && contentEncoding !== "identity") {
    throw new HttpInputError({
      status: 415,
      code: "VALIDATION_ERROR",
      message: "Content-Encoding no permitido"
    });
  }
}

function validateContentLength(request: Request, maximumBytes: number): void {
  const contentLength = request.headers.get("content-length");

  if (contentLength === null) {
    return;
  }

  if (!/^(0|[1-9]\d*)$/.test(contentLength)) {
    throw validationError("Content-Length no válido");
  }

  if (contentLength.length > 16) {
    throw new HttpInputError({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "El payload supera el límite permitido"
    });
  }

  if (BigInt(contentLength) > BigInt(maximumBytes)) {
    throw new HttpInputError({
      status: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "El payload supera el límite permitido"
    });
  }
}

async function readBodyWithLimit(
  request: Request,
  maximumBytes: number
): Promise<Uint8Array> {
  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpInputError({
        status: 413,
        code: "PAYLOAD_TOO_LARGE",
        message: "El payload supera el límite permitido"
      });
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

function decodeJson(body: Uint8Array): unknown {
  let text: string;

  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    throw validationError("El payload no es UTF-8 válido");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw validationError("El payload no contiene JSON válido");
  }
}

export async function parseJsonRequest<const TSchema extends z.ZodType>(
  request: Request,
  schema: TSchema,
  options: { maximumBytes?: number } = {}
): Promise<z.output<TSchema>> {
  const maximumBytes =
    options.maximumBytes ?? CONTRACT_LIMITS.NORMAL_JSON_MAX_BYTES;

  if (
    !Number.isInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > CONTRACT_LIMITS.NORMAL_JSON_MAX_BYTES
  ) {
    throw new RangeError("maximumBytes fuera del límite permitido");
  }

  assertJsonMediaType(request);
  validateContentLength(request, maximumBytes);

  let body: Uint8Array;

  try {
    body = await readBodyWithLimit(request, maximumBytes);
  } catch (error) {
    if (error instanceof HttpInputError) {
      throw error;
    }
    throw validationError("No se pudo leer el payload");
  }

  const parsedJson = decodeJson(body);
  const result = schema.safeParse(parsedJson);

  if (!result.success) {
    throw new HttpInputError({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "El payload no cumple el contrato",
      details: {
        issues: normalizeValidationIssues(result.error)
      }
    });
  }

  return result.data;
}
