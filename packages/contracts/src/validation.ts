import { z } from "zod";
import { CONTRACT_LIMITS } from "./limits";

export const ValidationPathSegmentSchema = z.union([
  z.string(),
  z.number().int()
]);

export const ValidationIssueSchema = z
  .object({
    path: z.array(ValidationPathSegmentSchema).max(32),
    code: z.string().min(1).max(64)
  })
  .strict();

export const ValidationFailureDetailsSchema = z
  .object({
    issues: z
      .array(ValidationIssueSchema)
      .max(CONTRACT_LIMITS.VALIDATION_MAX_ISSUES)
  })
  .strict();

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type ValidationFailureDetails = z.infer<
  typeof ValidationFailureDetailsSchema
>;

export type ContractValidationResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: {
        code: "VALIDATION_ERROR";
        details: ValidationFailureDetails;
      };
    };

export function normalizeValidationIssues(
  error: z.ZodError
): ValidationIssue[] {
  return error.issues
    .slice(0, CONTRACT_LIMITS.VALIDATION_MAX_ISSUES)
    .map((issue) => ({
      path: issue.path
        .slice(0, 32)
        .map((segment) =>
          typeof segment === "symbol" ? String(segment) : segment
        ),
      code: issue.code
    }));
}

export function validateContract<const TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown
): ContractValidationResult<z.output<TSchema>> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      details: {
        issues: normalizeValidationIssues(result.error)
      }
    }
  };
}

export class ContractOutputValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(error: z.ZodError) {
    super("La salida no cumple el contrato");
    this.name = "ContractOutputValidationError";
    this.issues = normalizeValidationIssues(error);
  }
}

export function parseContractOutput<const TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown
): z.output<TSchema> {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ContractOutputValidationError(result.error);
  }

  return result.data;
}
