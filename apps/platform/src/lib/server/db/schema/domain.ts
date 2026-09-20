import {
  bigint,
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  smallint,
  text,
  tinyint,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { user } from "./auth";

const ulid = (name: string) => char(name, { length: 26 });
const syncVersion = () =>
  bigint("sync_version", { mode: "bigint", unsigned: true })
    .notNull()
    .default(sql`0`);
const createdAt = () =>
  datetime("created_at", { fsp: 3 })
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .notNull();
const updatedAt = () =>
  datetime("updated_at", { fsp: 3 })
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .notNull();

export const profiles = mysqlTable(
  "profiles",
  {
    userId: ulid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    username: varchar("username", { length: 32 }),
    publicName: varchar("public_name", { length: 80 }).notNull(),
    avatarUrl: varchar("avatar_url", { length: 2048 }),
    locale: varchar("locale", { length: 16 }).notNull().default("es-ES"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [uniqueIndex("profiles_username_uq").on(table.username)]
);

export const devices = mysqlTable(
  "devices",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    platform: mysqlEnum("platform", [
      "web",
      "android",
      "ios",
      "desktop"
    ]).notNull(),
    appVersion: varchar("app_version", { length: 32 }).notNull(),
    lastSeenAt: datetime("last_seen_at", { fsp: 3 }).notNull(),
    createdAt: createdAt(),
    revokedAt: datetime("revoked_at", { fsp: 3 })
  },
  (table) => [
    index("devices_user_last_seen_idx").on(table.userId, table.lastSeenAt),
    index("devices_user_revoked_idx").on(table.userId, table.revokedAt)
  ]
);

export const conversations = mysqlTable(
  "conversations",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    modelMode: varchar("model_mode", { length: 64 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: datetime("deleted_at", { fsp: 3 }),
    syncVersion: syncVersion()
  },
  (table) => [
    index("conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id
    ),
    index("conversations_user_deleted_updated_idx").on(
      table.userId,
      table.deletedAt,
      table.updatedAt,
      table.id
    )
  ]
);

export const messages = mysqlTable(
  "messages",
  {
    id: ulid("id").primaryKey(),
    conversationId: ulid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientOperationId: ulid("client_operation_id"),
    role: mysqlEnum("role", [
      "user",
      "assistant",
      "system",
      "tool"
    ]).notNull(),
    content: longtext("content").notNull(),
    status: mysqlEnum("status", [
      "pending",
      "streaming",
      "completed",
      "cancelled",
      "failed"
    ]).notNull(),
    modelProvider: varchar("model_provider", { length: 32 }),
    modelId: varchar("model_id", { length: 160 }),
    inputTokens: int("input_tokens", { unsigned: true }),
    outputTokens: int("output_tokens", { unsigned: true }),
    finishReason: varchar("finish_reason", { length: 32 }),
    errorCode: varchar("error_code", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: datetime("deleted_at", { fsp: 3 }),
    syncVersion: syncVersion()
  },
  (table) => [
    uniqueIndex("messages_client_operation_uq").on(table.clientOperationId),
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
      table.id
    ),
    index("messages_user_conversation_created_idx").on(
      table.userId,
      table.conversationId,
      table.createdAt,
      table.id
    ),
    index("messages_user_updated_idx").on(
      table.userId,
      table.updatedAt,
      table.id
    )
  ]
);

export const memories = mysqlTable(
  "memories",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    importance: tinyint("importance", { unsigned: true }).notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    sourceMessageId: ulid("source_message_id").references(() => messages.id, {
      onDelete: "set null"
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: datetime("deleted_at", { fsp: 3 }),
    syncVersion: syncVersion()
  },
  (table) => [
    index("memories_user_enabled_updated_idx").on(
      table.userId,
      table.enabled,
      table.updatedAt,
      table.id
    ),
    index("memories_source_message_idx").on(table.sourceMessageId)
  ]
);

export const userPreferences = mysqlTable(
  "user_preferences",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    locale: varchar("locale", { length: 16 }).notNull().default("es-ES"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    theme: mysqlEnum("theme", ["system", "light", "dark"])
      .notNull()
      .default("system"),
    defaultModelMode: varchar("default_model_mode", { length: 64 })
      .notNull()
      .default("balanced"),
    memoryEnabled: boolean("memory_enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: datetime("deleted_at", { fsp: 3 }),
    syncVersion: syncVersion()
  },
  (table) => [
    uniqueIndex("user_preferences_user_uq").on(table.userId),
    index("user_preferences_user_updated_idx").on(
      table.userId,
      table.updatedAt
    )
  ]
);

export const modelPresets = mysqlTable(
  "model_presets",
  {
    id: ulid("id").primaryKey(),
    key: varchar("key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    provider: varchar("provider", { length: 32 }).notNull(),
    modelId: varchar("model_id", { length: 160 }).notNull(),
    mode: varchar("mode", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(false),
    sortOrder: smallint("sort_order", { unsigned: true }).notNull().default(0),
    configuration: json("configuration")
      .$type<Record<string, unknown>>()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt()
  },
  (table) => [
    uniqueIndex("model_presets_key_uq").on(table.key),
    index("model_presets_enabled_order_idx").on(
      table.enabled,
      table.sortOrder
    )
  ]
);

export const generationRequests = mysqlTable(
  "generation_requests",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    conversationId: ulid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    assistantMessageId: ulid("assistant_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    modelId: varchar("model_id", { length: 160 }).notNull(),
    state: mysqlEnum("state", [
      "queued",
      "streaming",
      "completed",
      "cancelled",
      "failed"
    ]).notNull(),
    cancelRequestedAt: datetime("cancel_requested_at", { fsp: 3 }),
    startedAt: datetime("started_at", { fsp: 3 }),
    completedAt: datetime("completed_at", { fsp: 3 }),
    latencyFirstTokenMs: int("latency_first_token_ms", { unsigned: true }),
    latencyTotalMs: int("latency_total_ms", { unsigned: true }),
    inputTokens: int("input_tokens", { unsigned: true }),
    outputTokens: int("output_tokens", { unsigned: true }),
    errorCode: varchar("error_code", { length: 64 }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex("generation_assistant_message_uq").on(
      table.assistantMessageId
    ),
    index("generation_user_state_idx").on(
      table.userId,
      table.state,
      table.createdAt
    ),
    index("generation_conversation_created_idx").on(
      table.conversationId,
      table.createdAt
    )
  ]
);

export const usageEvents = mysqlTable(
  "usage_events",
  {
    id: ulid("id").primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    generationId: ulid("generation_id").references(
      () => generationRequests.id,
      { onDelete: "set null" }
    ),
    kind: varchar("kind", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 32 }),
    modelId: varchar("model_id", { length: 160 }),
    inputTokens: int("input_tokens", { unsigned: true }).notNull().default(0),
    outputTokens: int("output_tokens", { unsigned: true }).notNull().default(0),
    costMicrousd: bigint("cost_microusd", {
      mode: "bigint",
      unsigned: true
    }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt()
  },
  (table) => [
    index("usage_user_created_idx").on(table.userId, table.createdAt, table.id),
    index("usage_generation_idx").on(table.generationId)
  ]
);

export const syncChanges = mysqlTable(
  "sync_changes",
  {
    changeId: bigint("change_id", { mode: "bigint", unsigned: true })
      .autoincrement()
      .primaryKey(),
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: ulid("entity_id").notNull(),
    operation: mysqlEnum("operation", ["upsert", "delete"]).notNull(),
    entityVersion: bigint("entity_version", {
      mode: "bigint",
      unsigned: true
    }).notNull(),
    createdAt: createdAt()
  },
  (table) => [
    index("sync_changes_user_change_idx").on(table.userId, table.changeId),
    index("sync_changes_user_entity_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
      table.changeId
    ),
    index("sync_changes_created_idx").on(table.createdAt)
  ]
);

export const idempotencyKeys = mysqlTable(
  "idempotency_keys",
  {
    userId: ulid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: ulid("idempotency_key").notNull(),
    route: varchar("route", { length: 160 }).notNull(),
    requestHash: char("request_hash", { length: 64 }).notNull(),
    state: mysqlEnum("state", ["processing", "completed", "failed"])
      .notNull()
      .default("processing"),
    resourceId: ulid("resource_id"),
    responseStatus: smallint("response_status", { unsigned: true }),
    responseBody: json("response_body").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull()
  },
  (table) => [
    primaryKey({
      name: "idempotency_keys_pk",
      columns: [table.userId, table.idempotencyKey]
    }),
    index("idempotency_expires_idx").on(table.expiresAt)
  ]
);

export const rateLimitBuckets = mysqlTable(
  "rate_limit_buckets",
  {
    scope: varchar("scope", { length: 32 }).notNull(),
    subjectHash: char("subject_hash", { length: 64 }).notNull(),
    windowStartedAt: datetime("window_started_at", { fsp: 3 }).notNull(),
    requestCount: int("request_count", { unsigned: true }).notNull().default(0),
    expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
    updatedAt: updatedAt()
  },
  (table) => [
    primaryKey({
      name: "rate_limit_buckets_pk",
      columns: [table.scope, table.subjectHash, table.windowStartedAt]
    }),
    index("rate_limit_expires_idx").on(table.expiresAt)
  ]
);
