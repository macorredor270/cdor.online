import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import {
  assertSafeMigrationTarget,
  describeDatabaseTarget,
  requireDatabaseUrl
} from "./database-url";

const databaseUrl = requireDatabaseUrl();
assertSafeMigrationTarget(databaseUrl);

const connection = await mysql.createConnection({
  uri: databaseUrl,
  timezone: "Z",
  supportBigNumbers: true,
  bigNumberStrings: true
});

try {
  const [rows] = await connection.query<
    Array<RowDataPacket & { version: string; databaseName: string }>
  >("SELECT VERSION() AS version, DATABASE() AS databaseName");
  const server = rows[0];

  process.stdout.write(
    `Migrando ${describeDatabaseTarget(databaseUrl)} con ${server?.version ?? "versión desconocida"}\n`
  );

  const database = drizzle({ client: connection });
  await migrate(database, {
    migrationsFolder: path.resolve("drizzle"),
    migrationsTable: "__cdor_migrations"
  });

  process.stdout.write("Migraciones aplicadas correctamente\n");
} finally {
  await connection.end();
}
