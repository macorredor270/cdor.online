import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { requireDatabaseUrl } from "./database-url";

const databaseUrl = requireDatabaseUrl();
const connection = await mysql.createConnection(databaseUrl);
const id = "01J00000000000000000000000";

const queries = [
  {
    name: "conversations_page",
    sql: `SELECT id, title, updated_at
      FROM conversations
      WHERE user_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 30`,
    values: [id]
  },
  {
    name: "messages_page",
    sql: `SELECT id, role, content, created_at
      FROM messages
      WHERE user_id = ? AND conversation_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT 50`,
    values: [id, id]
  },
  {
    name: "memories_enabled",
    sql: `SELECT id, content, importance, updated_at
      FROM memories
      WHERE user_id = ? AND enabled = true AND deleted_at IS NULL
      ORDER BY updated_at DESC, id DESC
      LIMIT 100`,
    values: [id]
  },
  {
    name: "sync_pull",
    sql: `SELECT change_id, entity_type, entity_id, operation, entity_version
      FROM sync_changes
      WHERE user_id = ? AND change_id > ?
      ORDER BY change_id
      LIMIT 500`,
    values: [id, "0"]
  }
];

try {
  for (const query of queries) {
    const [rows] = await connection.query<
      Array<
        RowDataPacket & { key: string | null; type: string; rows: number }
      >
    >(`EXPLAIN ${query.sql}`, query.values);
    const plan = rows[0];
    process.stdout.write(
      `${query.name}: type=${plan?.type ?? "?"} key=${plan?.key ?? "none"} rows=${plan?.rows ?? "?"}\n`
    );
  }
} finally {
  await connection.end();
}
