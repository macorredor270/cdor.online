import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";

const databaseNamePattern = /^cdor_test_[a-z0-9_]+$/;

function requireAdminUrl(): string {
  const value = process.env.CDOR_TEST_ADMIN_DATABASE_URL;
  if (!value) {
    throw new Error("CDOR_TEST_ADMIN_DATABASE_URL es obligatoria");
  }
  return value;
}

export function testDatabaseName(suffix: string): string {
  const name = `cdor_test_${process.pid}_${suffix}`.toLowerCase();
  if (!databaseNamePattern.test(name)) {
    throw new Error(`Nombre de base de test no válido: ${name}`);
  }
  return name;
}

export function databaseUrlFor(name: string): string {
  if (!databaseNamePattern.test(name)) {
    throw new Error(`Base fuera del scope de test: ${name}`);
  }
  const url = new URL(requireAdminUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

export async function createTestDatabase(name: string): Promise<void> {
  if (!databaseNamePattern.test(name)) {
    throw new Error(`Base fuera del scope de test: ${name}`);
  }
  const connection = await mysql.createConnection(requireAdminUrl());
  const collation =
    process.env.CDOR_TEST_COLLATION ?? "utf8mb4_0900_ai_ci";
  if (!/^[a-z0-9_]+$/.test(collation)) {
    throw new Error("Collation de test no válida");
  }
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await connection.query(
      `CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE ${collation}`
    );
  } finally {
    await connection.end();
  }
}

export async function dropTestDatabase(name: string): Promise<void> {
  if (!databaseNamePattern.test(name)) {
    throw new Error(`Base fuera del scope de test: ${name}`);
  }
  const connection = await mysql.createConnection(requireAdminUrl());
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } finally {
    await connection.end();
  }
}

export async function applyMigrations(
  databaseUrl: string,
  migrationsFolder = path.resolve("drizzle")
): Promise<void> {
  const connection = await mysql.createConnection(databaseUrl);
  try {
    await migrate(drizzle({ client: connection }), {
      migrationsFolder,
      migrationsTable: "__cdor_migrations"
    });
  } finally {
    await connection.end();
  }
}

export async function createVersionZeroMigrations(): Promise<string> {
  const source = path.resolve("drizzle");
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "cdor-migrations-v0-")
  );
  const journal = JSON.parse(
    await readFile(path.join(source, "meta", "_journal.json"), "utf8")
  );
  const firstEntry = journal.entries[0];

  if (!firstEntry) {
    throw new Error("No existe la migración inicial");
  }

  await cp(
    path.join(source, `${firstEntry.tag}.sql`),
    path.join(temporaryRoot, `${firstEntry.tag}.sql`)
  );
  await mkdir(path.join(temporaryRoot, "meta"), { recursive: true });
  await writeFile(
    path.join(temporaryRoot, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: [firstEntry] }, null, 2)
  );

  return temporaryRoot;
}

export async function removeTemporaryMigrations(root: string): Promise<void> {
  const expectedPrefix = path.join(os.tmpdir(), "cdor-migrations-v0-");
  if (!root.startsWith(expectedPrefix)) {
    throw new Error("Ruta temporal fuera del scope esperado");
  }
  await rm(root, { recursive: true, force: true });
}
