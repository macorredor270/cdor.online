import { loadEnvFile } from "node:process";
import path from "node:path";
import {
  parseOpenRouterEnvironment,
  type OpenRouterEnvironment
} from "../../src/lib/server/config/schema";

export function loadOpenRouterEnvironment(): OpenRouterEnvironment {
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
  return parseOpenRouterEnvironment(process.env);
}
