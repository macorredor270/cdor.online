CREATE TABLE local_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
) STRICT;

CREATE TABLE conversations (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  model_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version TEXT NOT NULL
) STRICT;

CREATE TABLE messages (
  id TEXT PRIMARY KEY NOT NULL,
  conversation_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_operation_id TEXT UNIQUE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  model_provider TEXT,
  model_id TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  finish_reason TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version TEXT NOT NULL
) STRICT;

CREATE TABLE memories (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  importance INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  source_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version TEXT NOT NULL
) STRICT;

CREATE TABLE preferences (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  locale TEXT NOT NULL,
  timezone TEXT NOT NULL,
  theme TEXT NOT NULL,
  default_model_mode TEXT NOT NULL,
  memory_enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_version TEXT NOT NULL
) STRICT;

CREATE TABLE pending_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  base_version TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at_ms INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_error TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
) STRICT;

CREATE TABLE sync_state (
  user_id TEXT PRIMARY KEY NOT NULL,
  cursor TEXT NOT NULL DEFAULT '0',
  last_synced_at_ms INTEGER
) STRICT;
