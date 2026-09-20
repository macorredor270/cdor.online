use rusqlite::{OptionalExtension, Transaction, params};

use super::database::LocalDatabase;
use super::error::{CoreError, CoreResult};
use super::models::{
    Action, CachedConversation, CachedMemory, CachedMessage, CachedPreference, EntityType,
    PendingOperation, PullPage, RemoteChange,
};

fn validate_decimal(value: &str) -> CoreResult<()> {
    value
        .parse::<u64>()
        .map(|_| ())
        .map_err(|_| CoreError::InvalidSyncResponse)
}

fn insert_operation(transaction: &Transaction<'_>, operation: &PendingOperation) -> CoreResult<()> {
    validate_decimal(&operation.base_version)?;
    let payload_json = serde_json::to_string(&operation.payload)?;
    let inserted = transaction.execute(
        "INSERT INTO pending_operations (
            operation_id, entity_type, entity_id, action, payload_json,
            base_version, attempts, next_attempt_at_ms, created_at_ms,
            last_error, status
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'pending')
         ON CONFLICT(operation_id) DO NOTHING",
        params![
            operation.operation_id,
            operation.entity_type.as_str(),
            operation.entity_id,
            operation.action.as_str(),
            payload_json,
            operation.base_version,
            operation.attempts,
            operation.next_attempt_at_ms,
            operation.created_at_ms,
            operation.last_error,
        ],
    )?;
    if inserted == 1 {
        return Ok(());
    }

    let existing: (String, String, String, String, String) = transaction.query_row(
        "SELECT entity_type, entity_id, action, payload_json, base_version
         FROM pending_operations WHERE operation_id = ?1",
        [&operation.operation_id],
        |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        },
    )?;
    if existing
        != (
            operation.entity_type.as_str().to_owned(),
            operation.entity_id.clone(),
            operation.action.as_str().to_owned(),
            serde_json::to_string(&operation.payload)?,
            operation.base_version.clone(),
        )
    {
        return Err(CoreError::InvalidSyncResponse);
    }
    Ok(())
}

impl LocalDatabase {
    pub fn save_conversation_offline(
        &mut self,
        conversation: &CachedConversation,
        operation: &PendingOperation,
    ) -> CoreResult<()> {
        if operation.entity_type != EntityType::Conversation
            || operation.entity_id != conversation.id
        {
            return Err(CoreError::InvalidSyncResponse);
        }
        let transaction = self.connection.transaction()?;
        upsert_conversation(&transaction, conversation)?;
        insert_operation(&transaction, operation)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_message_offline(
        &mut self,
        message: &CachedMessage,
        operation: &PendingOperation,
    ) -> CoreResult<()> {
        if operation.entity_type != EntityType::Message
            || operation.entity_id != message.id
            || operation.action != Action::Upsert
        {
            return Err(CoreError::InvalidSyncResponse);
        }
        let transaction = self.connection.transaction()?;
        upsert_message(&transaction, message)?;
        insert_operation(&transaction, operation)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn cache_message(&mut self, message: &CachedMessage) -> CoreResult<()> {
        let transaction = self.connection.transaction()?;
        upsert_message(&transaction, message)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_memory_offline(
        &mut self,
        memory: &CachedMemory,
        operation: &PendingOperation,
    ) -> CoreResult<()> {
        if operation.entity_type != EntityType::Memory || operation.entity_id != memory.id {
            return Err(CoreError::InvalidSyncResponse);
        }
        let transaction = self.connection.transaction()?;
        upsert_memory(&transaction, memory)?;
        insert_operation(&transaction, operation)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn save_preference_offline(
        &mut self,
        preference: &CachedPreference,
        operation: &PendingOperation,
    ) -> CoreResult<()> {
        if operation.entity_type != EntityType::Preference || operation.entity_id != preference.id {
            return Err(CoreError::InvalidSyncResponse);
        }
        let transaction = self.connection.transaction()?;
        upsert_preference(&transaction, preference)?;
        insert_operation(&transaction, operation)?;
        transaction.commit()?;
        Ok(())
    }

    pub fn conversation(&self, id: &str) -> CoreResult<Option<CachedConversation>> {
        self.connection
            .query_row(
                "SELECT id, user_id, title, model_mode, created_at, updated_at,
                        deleted_at, sync_version
                 FROM conversations WHERE id = ?1",
                [id],
                map_conversation,
            )
            .optional()
            .map_err(CoreError::from)
    }

    pub fn conversations(&self, user_id: &str) -> CoreResult<Vec<CachedConversation>> {
        let mut statement = self.connection.prepare(
            "SELECT id, user_id, title, model_mode, created_at, updated_at,
                    deleted_at, sync_version
             FROM conversations
             WHERE user_id = ?1 AND deleted_at IS NULL
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = statement.query_map([user_id], map_conversation)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
    }

    pub fn messages(&self, conversation_id: &str) -> CoreResult<Vec<CachedMessage>> {
        let mut statement = self.connection.prepare(
            "SELECT id, conversation_id, user_id, client_operation_id, role,
                    content, status, model_provider, model_id, input_tokens,
                    output_tokens, finish_reason, error_code, created_at,
                    updated_at, deleted_at, sync_version
             FROM messages
             WHERE conversation_id = ?1 AND deleted_at IS NULL
             ORDER BY created_at, id",
        )?;
        let rows = statement.query_map([conversation_id], map_message)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
    }

    pub fn memories(&self, user_id: &str) -> CoreResult<Vec<CachedMemory>> {
        let mut statement = self.connection.prepare(
            "SELECT id, user_id, content, category, importance, enabled,
                    source_message_id, created_at, updated_at, deleted_at,
                    sync_version
             FROM memories
             WHERE user_id = ?1 AND deleted_at IS NULL
             ORDER BY updated_at DESC, id DESC",
        )?;
        let rows = statement.query_map([user_id], map_memory)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(CoreError::from)
    }

    pub fn set_current_user_id(&self, user_id: Option<&str>) -> CoreResult<()> {
        if let Some(user_id) = user_id {
            self.connection.execute(
                "INSERT INTO local_meta (key, value)
                 VALUES ('current_user_id', ?1)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [user_id],
            )?;
        } else {
            self.connection
                .execute("DELETE FROM local_meta WHERE key = 'current_user_id'", [])?;
        }
        Ok(())
    }

    pub fn current_user_id(&self) -> CoreResult<Option<String>> {
        let stored = self
            .connection
            .query_row(
                "SELECT value FROM local_meta WHERE key = 'current_user_id'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        if stored.is_some() {
            return Ok(stored);
        }
        let mut statement = self.connection.prepare(
            "SELECT user_id
             FROM (
               SELECT user_id FROM conversations WHERE deleted_at IS NULL
               UNION
               SELECT user_id FROM messages WHERE deleted_at IS NULL
             )
             LIMIT 2",
        )?;
        let inferred = statement
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(if inferred.len() == 1 {
            inferred.into_iter().next()
        } else {
            None
        })
    }

    pub fn sync_cursor(&self, user_id: &str) -> CoreResult<String> {
        self.connection
            .query_row(
                "SELECT cursor FROM sync_state WHERE user_id = ?1",
                [user_id],
                |row| row.get(0),
            )
            .optional()
            .map(|value| value.unwrap_or_else(|| "0".to_owned()))
            .map_err(CoreError::from)
    }

    pub fn reset_sync_cursor(&self, user_id: &str) -> CoreResult<()> {
        self.connection.execute(
            "INSERT INTO sync_state (user_id, cursor, last_synced_at_ms)
             VALUES (?1, '0', NULL)
             ON CONFLICT(user_id) DO UPDATE SET cursor = '0', last_synced_at_ms = NULL",
            [user_id],
        )?;
        Ok(())
    }

    pub fn apply_pull_page(
        &mut self,
        user_id: &str,
        page: &PullPage,
        now_ms: i64,
    ) -> CoreResult<usize> {
        validate_decimal(&page.next_cursor)?;
        let transaction = self.connection.transaction()?;
        for change in &page.changes {
            apply_remote_change(&transaction, change)?;
        }
        transaction.execute(
            "INSERT INTO sync_state (user_id, cursor, last_synced_at_ms)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(user_id) DO UPDATE SET
               cursor = excluded.cursor,
               last_synced_at_ms = excluded.last_synced_at_ms",
            params![user_id, page.next_cursor, now_ms],
        )?;
        transaction.commit()?;
        Ok(page.changes.len())
    }
}

fn apply_remote_change(transaction: &Transaction<'_>, change: &RemoteChange) -> CoreResult<()> {
    validate_decimal(&change.change_id)?;
    validate_decimal(&change.entity_version)?;
    if change.operation == Action::Delete {
        let table = match change.entity_type {
            EntityType::Conversation => "conversations",
            EntityType::Message => "messages",
            EntityType::Memory => "memories",
            EntityType::Preference => "preferences",
        };
        transaction.execute(
            &format!(
                "UPDATE {table}
                 SET deleted_at = ?1, updated_at = ?1, sync_version = ?2
                 WHERE id = ?3"
            ),
            params![change.changed_at, change.entity_version, change.entity_id],
        )?;
        transaction.execute(
            "DELETE FROM pending_operations
             WHERE entity_type = ?1 AND entity_id = ?2",
            params![change.entity_type.as_str(), change.entity_id],
        )?;
        return Ok(());
    }

    let payload = change
        .payload
        .as_ref()
        .ok_or(CoreError::InvalidSyncResponse)?;
    match change.entity_type {
        EntityType::Conversation => {
            let entity: CachedConversation = serde_json::from_value(payload.clone())?;
            if entity.id != change.entity_id || entity.sync_version != change.entity_version {
                return Err(CoreError::InvalidSyncResponse);
            }
            upsert_conversation(transaction, &entity)?;
        }
        EntityType::Message => {
            let entity: CachedMessage = serde_json::from_value(payload.clone())?;
            if entity.id != change.entity_id || entity.sync_version != change.entity_version {
                return Err(CoreError::InvalidSyncResponse);
            }
            upsert_message(transaction, &entity)?;
        }
        EntityType::Memory => {
            let entity: CachedMemory = serde_json::from_value(payload.clone())?;
            if entity.id != change.entity_id || entity.sync_version != change.entity_version {
                return Err(CoreError::InvalidSyncResponse);
            }
            upsert_memory(transaction, &entity)?;
        }
        EntityType::Preference => {
            let entity: CachedPreference = serde_json::from_value(payload.clone())?;
            if entity.id != change.entity_id || entity.sync_version != change.entity_version {
                return Err(CoreError::InvalidSyncResponse);
            }
            upsert_preference(transaction, &entity)?;
        }
    }
    Ok(())
}

fn upsert_conversation(
    transaction: &Transaction<'_>,
    value: &CachedConversation,
) -> CoreResult<()> {
    validate_decimal(&value.sync_version)?;
    transaction.execute(
        "INSERT INTO conversations (
           id, user_id, title, model_mode, created_at, updated_at,
           deleted_at, sync_version
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           title = excluded.title,
           model_mode = excluded.model_mode,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_version = excluded.sync_version",
        params![
            value.id,
            value.user_id,
            value.title,
            value.model_mode,
            value.created_at,
            value.updated_at,
            value.deleted_at,
            value.sync_version,
        ],
    )?;
    Ok(())
}

fn upsert_message(transaction: &Transaction<'_>, value: &CachedMessage) -> CoreResult<()> {
    validate_decimal(&value.sync_version)?;
    transaction.execute(
        "INSERT INTO messages (
           id, conversation_id, user_id, client_operation_id, role, content,
           status, model_provider, model_id, input_tokens, output_tokens,
           finish_reason, error_code, created_at, updated_at, deleted_at,
           sync_version
         ) VALUES (
           ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13,
           ?14, ?15, ?16, ?17
         )
         ON CONFLICT(id) DO UPDATE SET
           conversation_id = excluded.conversation_id,
           user_id = excluded.user_id,
           client_operation_id = excluded.client_operation_id,
           role = excluded.role,
           content = excluded.content,
           status = excluded.status,
           model_provider = excluded.model_provider,
           model_id = excluded.model_id,
           input_tokens = excluded.input_tokens,
           output_tokens = excluded.output_tokens,
           finish_reason = excluded.finish_reason,
           error_code = excluded.error_code,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_version = excluded.sync_version",
        params![
            value.id,
            value.conversation_id,
            value.user_id,
            value.client_operation_id,
            value.role,
            value.content,
            value.status,
            value.model_provider,
            value.model_id,
            value.input_tokens,
            value.output_tokens,
            value.finish_reason,
            value.error_code,
            value.created_at,
            value.updated_at,
            value.deleted_at,
            value.sync_version,
        ],
    )?;
    Ok(())
}

fn upsert_memory(transaction: &Transaction<'_>, value: &CachedMemory) -> CoreResult<()> {
    validate_decimal(&value.sync_version)?;
    transaction.execute(
        "INSERT INTO memories (
           id, user_id, content, category, importance, enabled,
           source_message_id, created_at, updated_at, deleted_at, sync_version
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           content = excluded.content,
           category = excluded.category,
           importance = excluded.importance,
           enabled = excluded.enabled,
           source_message_id = excluded.source_message_id,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_version = excluded.sync_version",
        params![
            value.id,
            value.user_id,
            value.content,
            value.category,
            value.importance,
            value.enabled,
            value.source_message_id,
            value.created_at,
            value.updated_at,
            value.deleted_at,
            value.sync_version,
        ],
    )?;
    Ok(())
}

fn upsert_preference(transaction: &Transaction<'_>, value: &CachedPreference) -> CoreResult<()> {
    validate_decimal(&value.sync_version)?;
    transaction.execute(
        "INSERT INTO preferences (
           id, user_id, locale, timezone, theme, default_model_mode,
           memory_enabled, created_at, updated_at, deleted_at, sync_version
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(id) DO UPDATE SET
           user_id = excluded.user_id,
           locale = excluded.locale,
           timezone = excluded.timezone,
           theme = excluded.theme,
           default_model_mode = excluded.default_model_mode,
           memory_enabled = excluded.memory_enabled,
           created_at = excluded.created_at,
           updated_at = excluded.updated_at,
           deleted_at = excluded.deleted_at,
           sync_version = excluded.sync_version",
        params![
            value.id,
            value.user_id,
            value.locale,
            value.timezone,
            value.theme,
            value.default_model_mode,
            value.memory_enabled,
            value.created_at,
            value.updated_at,
            value.deleted_at,
            value.sync_version,
        ],
    )?;
    Ok(())
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<CachedConversation> {
    Ok(CachedConversation {
        id: row.get(0)?,
        user_id: row.get(1)?,
        title: row.get(2)?,
        model_mode: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        deleted_at: row.get(6)?,
        sync_version: row.get(7)?,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<CachedMessage> {
    Ok(CachedMessage {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        user_id: row.get(2)?,
        client_operation_id: row.get(3)?,
        role: row.get(4)?,
        content: row.get(5)?,
        status: row.get(6)?,
        model_provider: row.get(7)?,
        model_id: row.get(8)?,
        input_tokens: row.get(9)?,
        output_tokens: row.get(10)?,
        finish_reason: row.get(11)?,
        error_code: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        deleted_at: row.get(15)?,
        sync_version: row.get(16)?,
    })
}

fn map_memory(row: &rusqlite::Row<'_>) -> rusqlite::Result<CachedMemory> {
    Ok(CachedMemory {
        id: row.get(0)?,
        user_id: row.get(1)?,
        content: row.get(2)?,
        category: row.get(3)?,
        importance: row.get(4)?,
        enabled: row.get(5)?,
        source_message_id: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        deleted_at: row.get(9)?,
        sync_version: row.get(10)?,
    })
}
