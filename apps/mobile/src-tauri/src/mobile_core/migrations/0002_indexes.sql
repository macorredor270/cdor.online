CREATE INDEX conversations_user_updated_idx
  ON conversations(user_id, updated_at DESC, id DESC);
CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at, id);
CREATE INDEX memories_user_updated_idx
  ON memories(user_id, updated_at DESC, id DESC);
CREATE INDEX pending_operations_due_idx
  ON pending_operations(status, next_attempt_at_ms, created_at_ms);
CREATE INDEX pending_operations_entity_idx
  ON pending_operations(entity_type, entity_id);
