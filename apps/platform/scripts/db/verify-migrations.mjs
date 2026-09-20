import { access, readFile } from "node:fs/promises";
import path from "node:path";

const migrationRoot = path.resolve("drizzle");
const journalPath = path.join(migrationRoot, "meta", "_journal.json");
const journal = JSON.parse(await readFile(journalPath, "utf8"));

if (!Array.isArray(journal.entries) || journal.entries.length < 2) {
  throw new Error("Se esperan al menos las migraciones inicial y de upgrade");
}

const sqlFiles = journal.entries.map((entry) =>
  path.join(migrationRoot, `${entry.tag}.sql`)
);
await Promise.all(sqlFiles.map((file) => access(file)));

const sql = (
  await Promise.all(sqlFiles.map((file) => readFile(file, "utf8")))
).join("\n");
const requiredTables = [
  "user",
  "session",
  "account",
  "verification",
  "profiles",
  "devices",
  "conversations",
  "messages",
  "memories",
  "user_preferences",
  "model_presets",
  "usage_events",
  "generation_requests",
  "sync_changes",
  "idempotency_keys",
  "rate_limit_buckets"
];

for (const table of requiredTables) {
  if (!sql.includes("CREATE TABLE `" + table + "`")) {
    throw new Error(`Falta CREATE TABLE para ${table}`);
  }
}

if (sql.includes("message_parts")) {
  throw new Error("message_parts no debe existir en v1");
}
if (sql.includes("varchar(36)")) {
  throw new Error("Persisten IDs VARCHAR(36); CDOR exige ULID CHAR(26)");
}
if (!sql.includes("datetime(3)")) {
  throw new Error("La migración no conserva DATETIME(3)");
}
if (
  !sql.includes("ADD `device_id` char(26)") ||
  !sql.includes("session_user_device_idx")
) {
  throw new Error("Falta el vínculo indexado entre sesión y dispositivo");
}

process.stdout.write(
  `Migraciones verificadas: ${journal.entries.length} archivos, ${requiredTables.length} tablas\n`
);
