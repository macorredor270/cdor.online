import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyMigrations,
  createTestDatabase,
  createVersionZeroMigrations,
  databaseUrlFor,
  dropTestDatabase,
  removeTemporaryMigrations,
  testDatabaseName
} from "./helpers";

const cleanDatabase = testDatabaseName("clean");
const upgradeDatabase = testDatabaseName("upgrade");

describe.sequential("migraciones MySQL", () => {
  beforeAll(async () => {
    await createTestDatabase(cleanDatabase);
    await createTestDatabase(upgradeDatabase);
  }, 120_000);

  afterAll(async () => {
    await dropTestDatabase(cleanDatabase);
    await dropTestDatabase(upgradeDatabase);
  }, 120_000);

  it("crea una base vacía y es idempotente al reejecutarse", async () => {
    const databaseUrl = databaseUrlFor(cleanDatabase);
    await applyMigrations(databaseUrl);
    await applyMigrations(databaseUrl);

    const connection = await mysql.createConnection(databaseUrl);
    try {
      const [tables] = await connection.query<
        Array<RowDataPacket & { tableName: string }>
      >(
        `SELECT table_name AS tableName
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
          ORDER BY table_name`
      );
      const names = tables.map((table) => table.tableName);

      expect(names).toContain("__cdor_migrations");
      expect(names).toContain("user");
      expect(names).toContain("sync_changes");
      expect(names).toContain("rate_limit_buckets");
      expect(names).not.toContain("message_parts");
      expect(names).toHaveLength(17);
    } finally {
      await connection.end();
    }
  }, 120_000);

  it("conserva ULID, DATETIME(3), FKs y collation esperados", async () => {
    const connection = await mysql.createConnection(
      databaseUrlFor(cleanDatabase)
    );
    try {
      const [columns] = await connection.query<
        Array<
          RowDataPacket & {
            tableName: string;
            columnName: string;
            columnType: string;
            datetimePrecision: number | null;
          }
        >
      >(
        `SELECT table_name AS tableName,
                column_name AS columnName,
                column_type AS columnType,
                datetime_precision AS datetimePrecision
           FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND (
              (column_name = 'id' AND table_name IN ('user', 'messages'))
              OR (column_name = 'created_at' AND table_name = 'messages')
            )
          ORDER BY table_name, column_name`
      );

      expect(
        columns.filter((column) => column.columnName === "id")
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ columnType: "char(26)" })
        ])
      );
      expect(
        columns.find(
          (column) =>
            column.tableName === "messages" &&
            column.columnName === "created_at"
        )
      ).toMatchObject({
        columnType: "datetime(3)",
        datetimePrecision: 3
      });

      const [metadata] = await connection.query<
        Array<
          RowDataPacket & { version: string; collationName: string }
        >
      >(
        `SELECT VERSION() AS version,
                @@collation_database AS collationName`
      );
      expect(metadata[0]?.version).toMatch(
        new RegExp(process.env.CDOR_TEST_EXPECTED_VERSION ?? "^8\\.4\\.")
      );
      expect(metadata[0]?.collationName).toBe(
        process.env.CDOR_TEST_COLLATION ?? "utf8mb4_0900_ai_ci"
      );

      const [foreignKeys] = await connection.query<
        Array<RowDataPacket & { count: number }>
      >(
        `SELECT COUNT(*) AS count
           FROM information_schema.referential_constraints
          WHERE constraint_schema = DATABASE()`
      );
      expect(Number(foreignKeys[0]?.count)).toBeGreaterThanOrEqual(16);
    } finally {
      await connection.end();
    }
  });

  it("actualiza desde la migración anterior", async () => {
    const versionZero = await createVersionZeroMigrations();
    const databaseUrl = databaseUrlFor(upgradeDatabase);

    try {
      await applyMigrations(databaseUrl, versionZero);

      const before = await mysql.createConnection(databaseUrl);
      try {
        const [indexes] = await before.query<
          Array<RowDataPacket & { count: number }>
        >(
          `SELECT COUNT(*) AS count
             FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND index_name = 'sync_changes_user_entity_idx'`
        );
        expect(Number(indexes[0]?.count)).toBe(0);
      } finally {
        await before.end();
      }

      await applyMigrations(databaseUrl);

      const after = await mysql.createConnection(databaseUrl);
      try {
        const [indexes] = await after.query<
          Array<RowDataPacket & { count: number }>
        >(
          `SELECT COUNT(*) AS count
             FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND index_name = 'sync_changes_user_entity_idx'`
        );
        expect(Number(indexes[0]?.count)).toBe(4);

        const [authUpgrade] = await after.query<
          Array<RowDataPacket & { deviceColumn: number; deviceIndex: number }>
        >(
          `SELECT
             (SELECT COUNT(*)
                FROM information_schema.columns
               WHERE table_schema = DATABASE()
                 AND table_name = 'session'
                 AND column_name = 'device_id'
                 AND column_type = 'char(26)') AS deviceColumn,
             (SELECT COUNT(*)
                FROM information_schema.statistics
               WHERE table_schema = DATABASE()
                 AND table_name = 'session'
                 AND index_name = 'session_user_device_idx') AS deviceIndex`
        );
        expect(Number(authUpgrade[0]?.deviceColumn)).toBe(1);
        expect(Number(authUpgrade[0]?.deviceIndex)).toBe(2);
      } finally {
        await after.end();
      }
    } finally {
      await removeTemporaryMigrations(versionZero);
    }
  }, 120_000);
});
