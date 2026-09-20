import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { ulid } from "ulid";

const pool = mysql.createPool({
  uri:
    process.env.DATABASE_URL ??
    "mysql://cdor:cdor_dev_password_only@127.0.0.1:3307/cdor_dev",
  connectionLimit: 1
});

const database = drizzle({ client: pool });

// Este archivo reproduce el esquema base oficial. Los campos propios de CDOR,
// como session.device_id, se revisan en el esquema Drizzle y sus migraciones.
export const auth = betterAuth({
  appName: "CDOR schema generator",
  baseURL: "http://localhost:5173",
  secret: "cdor-schema-generator-only-not-a-runtime-secret",
  database: drizzleAdapter(database, {
    provider: "mysql"
  }),
  emailAndPassword: {
    enabled: true
  },
  advanced: {
    database: {
      generateId: () => ulid()
    }
  }
});
