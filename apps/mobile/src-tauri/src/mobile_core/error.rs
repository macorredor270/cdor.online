use serde::Serialize;
use thiserror::Error;

pub type CoreResult<T> = Result<T, CoreError>;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("fallo de almacenamiento local")]
    Database(#[from] rusqlite::Error),
    #[error("dato local o remoto inválido")]
    Serialization(#[from] serde_json::Error),
    #[error("la migración local {version} no pudo aplicarse: {reason}")]
    Migration { version: u32, reason: String },
    #[error("la respuesta de sincronización no corresponde a la solicitud")]
    InvalidSyncResponse,
    #[error("el cursor remoto ya no es válido")]
    CursorInvalid,
    #[error("el servicio remoto no está disponible")]
    RemoteRetryable,
    #[error("el servicio remoto rechazó la operación")]
    RemotePermanent,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppErrorPayload {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub request_id: Option<String>,
}

impl CoreError {
    #[must_use]
    pub fn payload(&self) -> AppErrorPayload {
        let (code, retryable) = match self {
            Self::Database(_) => ("LOCAL_DATABASE_ERROR", true),
            Self::Serialization(_) => ("INVALID_SYNC_PAYLOAD", false),
            Self::Migration { .. } => ("LOCAL_MIGRATION_ERROR", false),
            Self::InvalidSyncResponse => ("INVALID_SYNC_RESPONSE", false),
            Self::CursorInvalid => ("SYNC_CURSOR_INVALID", false),
            Self::RemoteRetryable => ("REMOTE_RETRYABLE", true),
            Self::RemotePermanent => ("REMOTE_REJECTED", false),
        };
        AppErrorPayload {
            code: code.to_owned(),
            message: self.to_string(),
            retryable,
            request_id: None,
        }
    }
}
