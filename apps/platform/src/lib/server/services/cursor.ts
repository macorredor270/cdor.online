import { IsoDateSchema, UlidSchema } from "@cdor/contracts";
import { AppError } from "../errors/app-error";

type TimestampCursor = Readonly<{ updatedAt: Date; id: string }>;

export function encodeTimestampCursor(cursor: TimestampCursor): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      timestamp: cursor.updatedAt.toISOString(),
      id: cursor.id
    }),
    "utf8"
  ).toString("base64url");
}

export function decodeTimestampCursor(value: string): TimestampCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Record<string, unknown>;
    if (
      parsed.version !== 1 ||
      !IsoDateSchema.safeParse(parsed.timestamp).success ||
      !UlidSchema.safeParse(parsed.id).success
    ) {
      throw new Error("cursor inválido");
    }
    return {
      updatedAt: new Date(String(parsed.timestamp)),
      id: String(parsed.id)
    };
  } catch {
    throw new AppError("VALIDATION_ERROR", "El cursor no es válido");
  }
}
