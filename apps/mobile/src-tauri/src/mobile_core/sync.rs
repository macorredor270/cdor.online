use std::collections::HashMap;

use super::database::LocalDatabase;
use super::error::{CoreError, CoreResult};
use super::models::{PendingOperation, PullPage, PushResult, PushStatus, SyncReport};
use super::outbox::RetryDisposition;

pub trait Connectivity {
    fn is_online(&self) -> bool;
}

pub trait SecretStore {
    fn load_session(&self) -> CoreResult<Option<String>>;
    fn store_session(&mut self, session: &str) -> CoreResult<()>;
    fn delete_session(&mut self) -> CoreResult<()>;
}

pub trait SyncApi {
    fn push(&self, session: &str, operations: &[PendingOperation]) -> CoreResult<Vec<PushResult>>;

    fn pull(&self, session: &str, cursor: &str, limit: u32) -> CoreResult<PullPage>;
}

pub struct SyncEngine<'a, A, C, S> {
    database: &'a mut LocalDatabase,
    api: &'a A,
    connectivity: &'a C,
    secrets: &'a S,
}

impl<'a, A, C, S> SyncEngine<'a, A, C, S>
where
    A: SyncApi,
    C: Connectivity,
    S: SecretStore,
{
    pub fn new(
        database: &'a mut LocalDatabase,
        api: &'a A,
        connectivity: &'a C,
        secrets: &'a S,
    ) -> Self {
        Self {
            database,
            api,
            connectivity,
            secrets,
        }
    }

    pub fn sync_once(&mut self, user_id: &str, now_ms: i64) -> CoreResult<SyncReport> {
        let initial_cursor = self.database.sync_cursor(user_id)?;
        if !self.connectivity.is_online() {
            return Ok(SyncReport {
                online: false,
                pushed: 0,
                pulled: 0,
                blocked: self
                    .database
                    .operation_count(Some(super::models::OutboxStatus::Failed))?,
                cursor: initial_cursor,
            });
        }
        let session = self
            .secrets
            .load_session()?
            .ok_or(CoreError::RemotePermanent)?;

        let operations = self.database.due_operations(now_ms, 100)?;
        let mut pushed = 0;
        if !operations.is_empty() {
            match self.api.push(&session, &operations) {
                Ok(results) => {
                    self.apply_push_results(&operations, results, now_ms)?;
                    pushed = operations.len();
                }
                Err(CoreError::RemoteRetryable) => {
                    for operation in &operations {
                        self.database.mark_operation(
                            &operation.operation_id,
                            RetryDisposition::Retryable,
                            "REMOTE_RETRYABLE",
                            now_ms,
                        )?;
                    }
                    return Err(CoreError::RemoteRetryable);
                }
                Err(error) => return Err(error),
            }
        }

        let mut pulled = 0;
        let mut reset_cursor = false;
        let mut pages = 0_u16;
        loop {
            pages = pages.saturating_add(1);
            if pages > 1_000 {
                return Err(CoreError::InvalidSyncResponse);
            }
            let cursor = self.database.sync_cursor(user_id)?;
            let page = match self.api.pull(&session, &cursor, 500) {
                Ok(page) => page,
                Err(CoreError::CursorInvalid) if !reset_cursor => {
                    self.database.reset_sync_cursor(user_id)?;
                    reset_cursor = true;
                    continue;
                }
                Err(error) => return Err(error),
            };
            pulled += self.database.apply_pull_page(user_id, &page, now_ms)?;
            if !page.has_more {
                break;
            }
        }
        self.database.requeue_resolved_dependencies(now_ms)?;

        Ok(SyncReport {
            online: true,
            pushed,
            pulled,
            blocked: self
                .database
                .operation_count(Some(super::models::OutboxStatus::Failed))?,
            cursor: self.database.sync_cursor(user_id)?,
        })
    }

    fn apply_push_results(
        &self,
        operations: &[PendingOperation],
        results: Vec<PushResult>,
        now_ms: i64,
    ) -> CoreResult<()> {
        if results.len() != operations.len() {
            return Err(CoreError::InvalidSyncResponse);
        }
        let by_id = results
            .into_iter()
            .map(|result| (result.operation_id.clone(), result))
            .collect::<HashMap<_, _>>();
        if by_id.len() != operations.len() {
            return Err(CoreError::InvalidSyncResponse);
        }
        for operation in operations {
            let result = by_id
                .get(&operation.operation_id)
                .ok_or(CoreError::InvalidSyncResponse)?;
            if result.entity_id != operation.entity_id {
                return Err(CoreError::InvalidSyncResponse);
            }
            match result.status {
                PushStatus::Applied | PushStatus::Duplicate => {
                    self.database.complete_operation(&operation.operation_id)?;
                }
                PushStatus::Conflict | PushStatus::Rejected => {
                    self.database.mark_operation(
                        &operation.operation_id,
                        RetryDisposition::Permanent,
                        result.error_code.as_deref().unwrap_or("SYNC_REJECTED"),
                        now_ms,
                    )?;
                }
            }
        }
        Ok(())
    }
}
