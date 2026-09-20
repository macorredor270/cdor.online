import { loadEnvFile } from "node:process";
import path from "node:path";
import {
  closeDatabaseClient,
  getDatabaseClient
} from "../../src/lib/server/db/client";
import { SyncRepository } from "../../src/lib/server/db/repositories/sync";

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

const RETENTION_DAYS = 90;
const BATCH_SIZE = 500;
const now = new Date();
const cutoff = new Date(
  now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1_000
);

try {
  const repository = new SyncRepository(
    getDatabaseClient().database
  );
  let refreshed = 0;
  let removed = 0;
  while (true) {
    const changes = await repository.oldChanges(cutoff, BATCH_SIZE);
    if (changes.length === 0) break;
    const result = await repository.refreshAndRemoveOldChanges(
      changes,
      cutoff,
      now
    );
    refreshed += result.refreshed;
    removed += result.removed;
  }

  let expiredIdempotency = 0;
  while (true) {
    const removedKeys = await repository.pruneExpiredIdempotency(
      now,
      BATCH_SIZE
    );
    expiredIdempotency += removedKeys;
    if (removedKeys < BATCH_SIZE) break;
  }

  process.stdout.write(
    [
      `Cambios eliminados: ${removed}`,
      `Snapshots renovados: ${refreshed}`,
      `Claves idempotentes caducadas: ${expiredIdempotency}`
    ].join("\n") + "\n"
  );
} finally {
  await closeDatabaseClient();
}
