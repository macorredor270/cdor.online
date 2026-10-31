import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import {
  getDatabaseEnvironment,
  type DatabaseEnvironment
} from "../config";

export function createDatabaseClient(
  uri: string,
  options: { connectionLimit?: number; connectTimeoutMs?: number } = {}
) {
  const pool = mysql.createPool({
    uri,
    connectionLimit: options.connectionLimit ?? 3,
    connectTimeout: options.connectTimeoutMs ?? 5_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false
  });

  const database = drizzle({
    client: pool,
    schema,
    mode: "default"
  });

  return {
    database,
    pool,
    close: () => pool.end()
  };
}

export type Database = ReturnType<typeof createDatabaseClient>["database"];
export type DatabaseClient = ReturnType<typeof createDatabaseClient>;

let sharedClient: DatabaseClient | undefined;
let shutdownHandlersInstalled = false;

function installShutdownHandlers(): void {
  if (shutdownHandlersInstalled) {
    return;
  }
  shutdownHandlersInstalled = true;

  const closePool = () => {
    void closeDatabaseClient();
  };
  process.once("SIGINT", closePool);
  process.once("SIGTERM", closePool);
}

export function databaseUriFromEnvironment(
  environment: DatabaseEnvironment
): string {
  const url = new URL("mysql://localhost");
  // Hostinger's local MySQL grants target IPv4 localhost. Node may otherwise
  // resolve `localhost` to ::1 first, which MySQL treats as a different host.
  url.hostname =
    environment.DB_HOST === "localhost"
      ? "127.0.0.1"
      : environment.DB_HOST;
  url.port = String(environment.DB_PORT);
  url.username = environment.DB_USER;
  url.password = environment.DB_PASSWORD;
  url.pathname = `/${environment.DB_NAME}`;
  return url.toString();
}

export function getDatabaseClient(): DatabaseClient {
  if (!sharedClient) {
    const environment = getDatabaseEnvironment();
    sharedClient = createDatabaseClient(
      databaseUriFromEnvironment(environment),
      { connectionLimit: environment.DB_POOL_LIMIT }
    );
    installShutdownHandlers();
  }
  return sharedClient;
}

export async function closeDatabaseClient(): Promise<void> {
  const client = sharedClient;
  sharedClient = undefined;
  await client?.close();
}

export async function checkDatabaseReadiness(
  client: DatabaseClient = getDatabaseClient()
): Promise<void> {
  const connection = await client.pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}
