import { loadEnvFile } from "node:process";
import path from "node:path";
import {
  closeDatabaseClient,
  getDatabaseClient
} from "../../src/lib/server/db/client";
import { GenerationRepository } from "../../src/lib/server/db/repositories/generations";

try {
  loadEnvFile(path.resolve(process.cwd(), "../../.env"));
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}

const now = new Date();
const olderThan = new Date(now.getTime() - 5 * 60 * 1000);

try {
  const repository = new GenerationRepository(
    getDatabaseClient().database
  );
  const reconciled = await repository.reconcileStale(
    null,
    olderThan,
    now,
    100
  );
  process.stdout.write(`Generaciones reconciliadas: ${reconciled}\n`);
} finally {
  await closeDatabaseClient();
}
