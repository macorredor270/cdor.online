mod database;
mod error;
mod migrations;
mod models;
mod outbox;
mod repository;
mod sync;

pub use database::LocalDatabase;
pub use error::{CoreError, CoreResult};
pub use models::{
    Action, CachedConversation, CachedMemory, CachedMessage, CachedPreference, EntityType,
    OutboxStatus, PendingOperation, PullPage, PushResult, PushStatus, RemoteChange, SyncReport,
};
pub use outbox::{RetryDisposition, retry_delay_ms};
pub use sync::{Connectivity, SecretStore, SyncApi, SyncEngine};

#[cfg(test)]
mod tests;
