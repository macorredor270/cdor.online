import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "mysql",
  schema: "./src/lib/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "mysql://cdor:cdor_dev_password_only@127.0.0.1:3307/cdor_dev"
  },
  migrations: {
    table: "__cdor_migrations"
  },
  strict: true,
  verbose: true
});
