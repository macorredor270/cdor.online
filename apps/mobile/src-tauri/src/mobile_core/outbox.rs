use rusqlite::{OptionalExtension, params};

use super::database::LocalDatabase;
use super::error::{CoreError, CoreResult};
use super::models::{Action, EntityType, OutboxStatus, PendingOperation};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RetryDisposition {
    Retryable,
    Permanent,
}

#[must_use]
pub fn retry_delay_ms(attempts: u32, jitter_seed: &str) -> i64 {
    const SCHEDULE_MS: [i64; 7] = [1_000, 2_000, 5_000, 15_000, 30_000, 60_000, 300_000];
    let index = attempts.saturating_sub(1) as usize;
    let base = SCHEDULE_MS[index.min(SCHEDULE_MS.len() - 1)];
    let hash = jitter_seed
        .bytes()
        .chain(attempts.to_le_bytes())
        .fold(2_166_136_261_u32, |value, byte| {
            (value ^ u32::from(byte)).wrapping_mul(16_777_619)
        });
    let percentage = i64::from(hash % 41) + 80;
    base * percentage / 100
}

impl LocalDatabase {
    pub fn due_operations(&self, now_ms: i64, limit: usize) -> CoreResult<Vec<PendingOperation>> {
        let safe_limit =
            i64::try_from(limit.clamp(1, 100)).map_err(|_| CoreError::InvalidSyncResponse)?;
        let mut statement = self.connection.prepare(
            "SELECT operation_id, entity_type, entity_id, action, payload_json,
                    base_version, attempts, next_attempt_at_ms, created_at_ms,
                    last_error
             FROM pending_operations
             WHERE status = 'pending' AND next_attempt_at_ms <= ?1
             ORDER BY created_at_ms, operation_id
             LIMIT ?2",
        )?;
        let raw = statement
            .query_map(params![now_ms, safe_limit], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, u32>(6)?,
                    row.get::<_, i64>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        raw.into_iter()
            .map(
                |(
                    operation_id,
                    entity_type,
                    entity_id,
                    action,
                    payload_json,
                    base_version,
                    attempts,
                    next_attempt_at_ms,
                    created_at_ms,
                    last_error,
                )| {
                    Ok(PendingOperation {
                        operation_id,
                        entity_type: parse_entity_type(&entity_type)?,
                        entity_id,
                        action: parse_action(&action)?,
                        payload: serde_json::from_str(&payload_json)?,
                        base_version,
                        attempts,
                        next_attempt_at_ms,
                        created_at_ms,
                        last_error,
                    })
                },
            )
            .collect()
    }

    pub fn complete_operation(&self, operation_id: &str) -> CoreResult<()> {
        self.connection.execute(
            "DELETE FROM pending_operations WHERE operation_id = ?1",
            [operation_id],
        )?;
        Ok(())
    }

    pub fn mark_operation(
        &self,
        operation_id: &str,
        disposition: RetryDisposition,
        error_code: &str,
        now_ms: i64,
    ) -> CoreResult<()> {
        let attempts: Option<u32> = self
            .connection
            .query_row(
                "SELECT attempts FROM pending_operations WHERE operation_id = ?1",
                [operation_id],
                |row| row.get(0),
            )
            .optional()?;
        let Some(attempts) = attempts else {
            return Ok(());
        };
        let next_attempt = attempts.saturating_add(1);
        let error = error_code.chars().take(128).collect::<String>();
        match disposition {
            RetryDisposition::Retryable => {
                let next_at = now_ms + retry_delay_ms(next_attempt, operation_id);
                self.connection.execute(
                    "UPDATE pending_operations SET
                       attempts = ?1,
                       next_attempt_at_ms = ?2,
                       last_error = ?3,
                       status = 'pending'
                     WHERE operation_id = ?4",
                    params![next_attempt, next_at, error, operation_id],
                )?;
            }
            RetryDisposition::Permanent => {
                self.connection.execute(
                    "UPDATE pending_operations SET
                       attempts = ?1,
                       last_error = ?2,
                       status = 'failed'
                     WHERE operation_id = ?3",
                    params![next_attempt, error, operation_id],
                )?;
            }
        }
        Ok(())
    }

    pub fn operation_count(&self, status: Option<OutboxStatus>) -> CoreResult<usize> {
        let count: i64 = match status {
            Some(status) => self.connection.query_row(
                "SELECT COUNT(*) FROM pending_operations WHERE status = ?1",
                [status.as_str()],
                |row| row.get(0),
            )?,
            None => {
                self.connection
                    .query_row("SELECT COUNT(*) FROM pending_operations", [], |row| {
                        row.get(0)
                    })?
            }
        };
        usize::try_from(count).map_err(|_| CoreError::InvalidSyncResponse)
    }

    pub fn requeue_resolved_dependencies(&self, now_ms: i64) -> CoreResult<usize> {
        let updated = self.connection.execute(
            "UPDATE pending_operations
             SET status = 'pending', next_attempt_at_ms = ?1
             WHERE status = 'failed'
               AND entity_type = 'message'
               AND last_error = 'CONVERSATION_NOT_FOUND'
               AND attempts < 5
               AND EXISTS (
                 SELECT 1
                 FROM messages AS message
                 INNER JOIN conversations AS conversation
                   ON conversation.id = message.conversation_id
                 WHERE message.id = pending_operations.entity_id
                   AND conversation.sync_version <> '0'
                   AND conversation.deleted_at IS NULL
               )",
            [now_ms],
        )?;
        Ok(updated)
    }
}

fn parse_entity_type(value: &str) -> CoreResult<EntityType> {
    match value {
        "conversation" => Ok(EntityType::Conversation),
        "message" => Ok(EntityType::Message),
        "memory" => Ok(EntityType::Memory),
        "preference" => Ok(EntityType::Preference),
        _ => Err(CoreError::InvalidSyncResponse),
    }
}

fn parse_action(value: &str) -> CoreResult<Action> {
    match value {
        "upsert" => Ok(Action::Upsert),
        "delete" => Ok(Action::Delete),
        _ => Err(CoreError::InvalidSyncResponse),
    }
}
