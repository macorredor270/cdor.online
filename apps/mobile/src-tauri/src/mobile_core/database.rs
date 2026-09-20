use std::path::Path;
use std::time::Duration;

use rusqlite::{Connection, OpenFlags, TransactionBehavior};

use super::error::{CoreError, CoreResult};
use super::migrations::MIGRATIONS;

pub struct LocalDatabase {
    pub(super) connection: Connection,
}

impl LocalDatabase {
    pub fn open(path: impl AsRef<Path>) -> CoreResult<Self> {
        let connection = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_WRITE
                | OpenFlags::SQLITE_OPEN_CREATE
                | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        Self::configure_and_migrate(connection)
    }

    pub fn open_in_memory() -> CoreResult<Self> {
        Self::configure_and_migrate(Connection::open_in_memory()?)
    }

    fn configure_and_migrate(connection: Connection) -> CoreResult<Self> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", true)?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        connection.pragma_update(None, "journal_mode", "DELETE")?;
        let mut database = Self { connection };
        database.migrate()?;
        Ok(database)
    }

    fn migrate(&mut self) -> CoreResult<()> {
        let current: u32 = self
            .connection
            .pragma_query_value(None, "user_version", |row| row.get(0))?;
        for migration in MIGRATIONS
            .iter()
            .filter(|migration| migration.version > current)
        {
            let transaction = self
                .connection
                .transaction_with_behavior(TransactionBehavior::Immediate)?;
            transaction
                .execute_batch(migration.sql)
                .map_err(|error| CoreError::Migration {
                    version: migration.version,
                    reason: error.to_string(),
                })?;
            transaction.pragma_update(None, "user_version", migration.version)?;
            transaction.commit()?;
        }
        Ok(())
    }

    pub fn schema_version(&self) -> CoreResult<u32> {
        self.connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .map_err(CoreError::from)
    }
}
