import { loadEnvFile } from "node:process";
import path from "node:path";
import {
  parseAiEnvironment,
  type AiEnvironment
} from "../../src/lib/server/config/schema";

export function loadAiEnvironment(): AiEnvironment {
  const environmentPath = path.resolve(process.cwd(), "../../.env");
  try {
    loadEnvFile(environmentPath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  return parseAiEnvironment(process.env);
}
