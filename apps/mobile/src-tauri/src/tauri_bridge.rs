#[cfg(target_os = "android")]
use std::net::IpAddr;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_secure_session::SecureSessionExt;

use crate::mobile_core::{
    CachedConversation, CachedMemory, CachedMessage, Connectivity, CoreError, LocalDatabase,
    PendingOperation, PullPage, PushResult, SecretStore, SyncApi, SyncEngine, SyncReport,
};

const API_ORIGIN: &str = "https://cdor.online";
const API_HOST: &str = "cdor.online";

#[derive(Clone, Default)]
pub struct DatabaseState {
    inner: Arc<Mutex<Option<LocalDatabase>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeError {
    code: &'static str,
    message: String,
    retryable: bool,
}

type BridgeResult<T> = Result<T, BridgeError>;

impl BridgeError {
    fn local(error: CoreError) -> Self {
        let payload = error.payload();
        Self {
            code: "LOCAL_ERROR",
            message: payload.message,
            retryable: payload.retryable,
        }
    }

    fn secure() -> Self {
        Self {
            code: "SECURE_STORE_ERROR",
            message: "No se pudo acceder a la sesión segura".to_owned(),
            retryable: false,
        }
    }

    fn remote(retryable: bool) -> Self {
        Self {
            code: "REMOTE_ERROR",
            message: "No se pudo completar la solicitud".to_owned(),
            retryable,
        }
    }
}

fn api_addresses(app: &AppHandle) -> BridgeResult<Vec<SocketAddr>> {
    #[cfg(target_os = "android")]
    {
        let addresses = app
            .secure_session()
            .resolve_host(API_HOST)
            .map_err(|_| BridgeError::remote(true))?
            .into_iter()
            .filter_map(|address| address.parse::<IpAddr>().ok())
            .map(|address| SocketAddr::new(address, 443))
            .collect::<Vec<_>>();
        if addresses.is_empty() {
            return Err(BridgeError::remote(true));
        }
        Ok(addresses)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

fn client(app: &AppHandle) -> BridgeResult<Client> {
    let addresses = api_addresses(app)?;
    let mut builder = Client::builder()
        .tls_backend_preconfigured(tls_configuration())
        .timeout(Duration::from_secs(30))
        .user_agent("MAC-Mobile/0.1");
    if !addresses.is_empty() {
        builder = builder.resolve_to_addrs(API_HOST, &addresses);
    }
    builder.build().map_err(|_| BridgeError::remote(true))
}

fn tls_configuration() -> rustls::ClientConfig {
    let mut roots = rustls::RootCertStore::empty();
    roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    rustls::ClientConfig::builder()
        .with_root_certificates(roots)
        .with_no_client_auth()
}

#[tauri::command]
pub async fn database_open(app: AppHandle, state: State<'_, DatabaseState>) -> BridgeResult<u32> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?
        .join("cdor.sqlite");
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?;
        }
        let database = LocalDatabase::open(path).map_err(BridgeError::local)?;
        let version = database.schema_version().map_err(BridgeError::local)?;
        *inner
            .lock()
            .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))? = Some(database);
        Ok(version)
    })
    .await
    .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInInput {
    email: String,
    password: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatus {
    authenticated: bool,
    user_id: Option<String>,
}

#[tauri::command]
pub async fn auth_sign_in(
    app: AppHandle,
    state: State<'_, DatabaseState>,
    input: SignInInput,
) -> BridgeResult<SessionStatus> {
    let http_app = app.clone();
    let response = tauri::async_runtime::spawn_blocking(move || {
        client(&http_app)?
            .post(format!("{API_ORIGIN}/api/auth/sign-in/email"))
            .header("origin", API_ORIGIN)
            .json(&json!({ "email": input.email, "password": input.password }))
            .send()
            .map_err(|_| BridgeError::remote(true))
    })
    .await
    .map_err(|_| BridgeError::remote(true))??;
    if !response.status().is_success() {
        return Err(BridgeError::remote(false));
    }
    let bearer = response
        .headers()
        .get("set-auth-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| BridgeError::remote(false))?;
    let body = response
        .json::<Value>()
        .map_err(|_| BridgeError::remote(false))?;
    let user_id = body
        .pointer("/user/id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| BridgeError::remote(false))?;
    let local_user_id = user_id.clone();
    with_database(&state, move |database| {
        database.set_current_user_id(Some(&local_user_id))
    })
    .await?;
    app.secure_session()
        .store(&bearer)
        .map_err(|_| BridgeError::secure())?;
    Ok(SessionStatus {
        authenticated: true,
        user_id: Some(user_id),
    })
}

#[tauri::command]
pub async fn auth_sign_out(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> BridgeResult<SessionStatus> {
    let bearer = app
        .secure_session()
        .load()
        .map_err(|_| BridgeError::secure())?;
    if let Some(token) = bearer {
        let http_app = app.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || {
            client(&http_app)?
                .post(format!("{API_ORIGIN}/api/auth/sign-out"))
                .header("origin", API_ORIGIN)
                .bearer_auth(token)
                .send()
                .map_err(|_| BridgeError::remote(true))
        })
        .await;
    }
    app.secure_session()
        .delete()
        .map_err(|_| BridgeError::secure())?;
    with_database(&state, |database| database.set_current_user_id(None)).await?;
    Ok(SessionStatus {
        authenticated: false,
        user_id: None,
    })
}

#[tauri::command]
pub async fn auth_session(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> BridgeResult<SessionStatus> {
    let authenticated = app
        .secure_session()
        .load()
        .map_err(|_| BridgeError::secure())?
        .is_some();
    let user_id = if authenticated {
        with_database(&state, |database| database.current_user_id()).await?
    } else {
        None
    };
    Ok(SessionStatus {
        authenticated: authenticated && user_id.is_some(),
        user_id,
    })
}

#[tauri::command]
pub async fn auth_complete_oauth(
    app: AppHandle,
    state: State<'_, DatabaseState>,
    code: String,
    verifier: String,
) -> BridgeResult<SessionStatus> {
    if code.len() != 43
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        || verifier.len() != 43
        || !verifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(BridgeError::remote(false));
    }
    let http_app = app.clone();
    let exchange_code = code;
    let exchange = tauri::async_runtime::spawn_blocking(move || {
        client(&http_app)?
            .post(format!("{API_ORIGIN}/api/v1/auth/mobile-oauth/exchange"))
            .header("origin", API_ORIGIN)
            .json(&json!({ "code": exchange_code, "verifier": verifier }))
            .send()
            .map_err(|_| BridgeError::remote(true))
    })
    .await
    .map_err(|_| BridgeError::remote(true))??;
    if !exchange.status().is_success() {
        return Err(BridgeError::remote(false));
    }
    let exchange_body = exchange
        .json::<Value>()
        .map_err(|_| BridgeError::remote(false))?;
    let bearer = exchange_body
        .pointer("/data/token")
        .and_then(Value::as_str)
        .filter(|token| !token.is_empty() && token.len() <= 4096)
        .map(str::to_owned)
        .ok_or_else(|| BridgeError::remote(false))?;

    let session_app = app.clone();
    let request_bearer = bearer.clone();
    let response = tauri::async_runtime::spawn_blocking(move || {
        client(&session_app)?
            .get(format!("{API_ORIGIN}/api/auth/get-session"))
            .header("origin", API_ORIGIN)
            .bearer_auth(&request_bearer)
            .send()
            .map_err(|_| BridgeError::remote(true))
    })
    .await
    .map_err(|_| BridgeError::remote(true))??;
    if !response.status().is_success() {
        return Err(BridgeError::remote(false));
    }
    let body = response
        .json::<Value>()
        .map_err(|_| BridgeError::remote(false))?;
    let user_id = body
        .pointer("/user/id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| BridgeError::remote(false))?;
    let local_user_id = user_id.clone();
    with_database(&state, move |database| {
        database.set_current_user_id(Some(&local_user_id))
    })
    .await?;
    app.secure_session()
        .store(&bearer)
        .map_err(|_| BridgeError::secure())?;
    Ok(SessionStatus {
        authenticated: true,
        user_id: Some(user_id),
    })
}

async fn with_database<T, F>(state: &DatabaseState, action: F) -> BridgeResult<T>
where
    T: Send + 'static,
    F: FnOnce(&mut LocalDatabase) -> Result<T, CoreError> + Send + 'static,
{
    let inner = state.inner.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = inner
            .lock()
            .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?;
        let database = guard
            .as_mut()
            .ok_or_else(|| BridgeError::local(CoreError::InvalidSyncResponse))?;
        action(database).map_err(BridgeError::local)
    })
    .await
    .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?
}

#[tauri::command]
pub async fn conversation_save(
    state: State<'_, DatabaseState>,
    conversation: CachedConversation,
    operation: PendingOperation,
) -> BridgeResult<()> {
    with_database(&state, move |database| {
        database.save_conversation_offline(&conversation, &operation)
    })
    .await
}

#[tauri::command]
pub async fn conversation_get(
    state: State<'_, DatabaseState>,
    id: String,
) -> BridgeResult<Option<CachedConversation>> {
    with_database(&state, move |database| database.conversation(&id)).await
}

#[tauri::command]
pub async fn conversation_list(
    state: State<'_, DatabaseState>,
    user_id: String,
) -> BridgeResult<Vec<CachedConversation>> {
    with_database(&state, move |database| database.conversations(&user_id)).await
}

#[tauri::command]
pub async fn message_save(
    state: State<'_, DatabaseState>,
    message: CachedMessage,
    operation: PendingOperation,
) -> BridgeResult<()> {
    with_database(&state, move |database| {
        database.save_message_offline(&message, &operation)
    })
    .await
}

#[tauri::command]
pub async fn message_cache(
    state: State<'_, DatabaseState>,
    message: CachedMessage,
) -> BridgeResult<()> {
    with_database(&state, move |database| database.cache_message(&message)).await
}

#[tauri::command]
pub async fn message_list(
    state: State<'_, DatabaseState>,
    conversation_id: String,
) -> BridgeResult<Vec<CachedMessage>> {
    with_database(&state, move |database| database.messages(&conversation_id)).await
}

#[tauri::command]
pub async fn memory_save(
    state: State<'_, DatabaseState>,
    memory: CachedMemory,
    operation: PendingOperation,
) -> BridgeResult<()> {
    with_database(&state, move |database| {
        database.save_memory_offline(&memory, &operation)
    })
    .await
}

#[tauri::command]
pub async fn memory_list(
    state: State<'_, DatabaseState>,
    user_id: String,
) -> BridgeResult<Vec<CachedMemory>> {
    with_database(&state, move |database| database.memories(&user_id)).await
}

struct AlwaysOnline;

impl Connectivity for AlwaysOnline {
    fn is_online(&self) -> bool {
        true
    }
}

struct LoadedSecret(String);

impl SecretStore for LoadedSecret {
    fn load_session(&self) -> Result<Option<String>, CoreError> {
        Ok(Some(self.0.clone()))
    }

    fn store_session(&mut self, session: &str) -> Result<(), CoreError> {
        self.0 = session.to_owned();
        Ok(())
    }

    fn delete_session(&mut self) -> Result<(), CoreError> {
        self.0.clear();
        Ok(())
    }
}

struct HttpSyncApi {
    client: Client,
}

#[derive(Deserialize)]
struct DataEnvelope<T> {
    data: T,
}

impl SyncApi for HttpSyncApi {
    fn push(
        &self,
        session: &str,
        operations: &[PendingOperation],
    ) -> Result<Vec<PushResult>, CoreError> {
        let operations = operations
            .iter()
            .map(|operation| {
                json!({
                    "operationId": operation.operation_id,
                    "entityId": operation.entity_id,
                    "entity": operation.entity_type,
                    "action": operation.action,
                    "baseVersion": operation.base_version,
                    "payload": operation.payload
                })
            })
            .collect::<Vec<Value>>();
        let response = self
            .client
            .post(format!("{API_ORIGIN}/api/v1/sync/push"))
            .header("origin", API_ORIGIN)
            .bearer_auth(session)
            .json(&json!({ "operations": operations }))
            .send()
            .map_err(|_| CoreError::RemoteRetryable)?;
        if response.status().is_server_error() {
            return Err(CoreError::RemoteRetryable);
        }
        if !response.status().is_success() {
            return Err(CoreError::RemotePermanent);
        }
        #[derive(Deserialize)]
        struct PushData {
            results: Vec<PushResult>,
        }
        response
            .json::<DataEnvelope<PushData>>()
            .map(|body| body.data.results)
            .map_err(|_| CoreError::InvalidSyncResponse)
    }

    fn pull(&self, session: &str, cursor: &str, limit: u32) -> Result<PullPage, CoreError> {
        let response = self
            .client
            .get(format!(
                "{API_ORIGIN}/api/v1/sync/pull?cursor={cursor}&limit={limit}"
            ))
            .header("origin", API_ORIGIN)
            .bearer_auth(session)
            .send()
            .map_err(|_| CoreError::RemoteRetryable)?;
        if response.status().as_u16() == 409 {
            return Err(CoreError::CursorInvalid);
        }
        if response.status().is_server_error() {
            return Err(CoreError::RemoteRetryable);
        }
        if !response.status().is_success() {
            return Err(CoreError::RemotePermanent);
        }
        response
            .json::<DataEnvelope<PullPage>>()
            .map(|body| body.data)
            .map_err(|_| CoreError::InvalidSyncResponse)
    }
}

#[tauri::command]
pub async fn sync_now(
    app: AppHandle,
    state: State<'_, DatabaseState>,
    user_id: String,
    now_ms: i64,
) -> BridgeResult<SyncReport> {
    let bearer = app
        .secure_session()
        .load()
        .map_err(|_| BridgeError::secure())?
        .ok_or_else(|| BridgeError::remote(false))?;
    let connectivity = AlwaysOnline;
    let secrets = LoadedSecret(bearer);
    let inner = state.inner.clone();
    let http_app = app.clone();
    let report = tauri::async_runtime::spawn_blocking(move || {
        let api = HttpSyncApi {
            client: client(&http_app)?,
        };
        let mut guard = inner
            .lock()
            .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?;
        let database = guard
            .as_mut()
            .ok_or_else(|| BridgeError::local(CoreError::InvalidSyncResponse))?;
        SyncEngine::new(database, &api, &connectivity, &secrets)
            .sync_once(&user_id, now_ms)
            .map_err(BridgeError::local)
    })
    .await
    .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))??;
    app.emit("sync://state", &report)
        .map_err(|_| BridgeError::local(CoreError::InvalidSyncResponse))?;
    Ok(report)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    cursor: String,
    pending: usize,
    failed: usize,
}

#[tauri::command]
pub async fn sync_status(
    state: State<'_, DatabaseState>,
    user_id: String,
) -> BridgeResult<SyncStatus> {
    with_database(&state, move |database| {
        Ok(SyncStatus {
            cursor: database.sync_cursor(&user_id)?,
            pending: database.operation_count(None)?,
            failed: database.operation_count(Some(crate::mobile_core::OutboxStatus::Failed))?,
        })
    })
    .await
}

#[tauri::command]
pub async fn chat_cancel(app: AppHandle, generation_id: String) -> BridgeResult<()> {
    let bearer = app
        .secure_session()
        .load()
        .map_err(|_| BridgeError::secure())?
        .ok_or_else(|| BridgeError::remote(false))?;
    let http_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let response = client(&http_app)?
            .post(format!("{API_ORIGIN}/api/v1/chat/cancel"))
            .header("origin", API_ORIGIN)
            .bearer_auth(bearer)
            .json(&json!({ "generationId": generation_id }))
            .send()
            .map_err(|_| BridgeError::remote(true))?;
        if response.status().is_success() {
            Ok(())
        } else {
            Err(BridgeError::remote(response.status().is_server_error()))
        }
    })
    .await
    .map_err(|_| BridgeError::remote(true))?
}

fn take_sse_frame(buffer: &mut Vec<u8>) -> Option<(String, Value)> {
    let boundary = buffer.windows(2).position(|window| window == b"\n\n")?;
    let frame = buffer.drain(..boundary + 2).collect::<Vec<_>>();
    let text = std::str::from_utf8(&frame[..frame.len() - 2]).ok()?;
    let mut event = None;
    let mut data = String::new();
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("event:") {
            event = Some(value.trim().to_owned());
        } else if let Some(value) = line.strip_prefix("data:") {
            data.push_str(value.trim_start());
        }
    }
    Some((event?, serde_json::from_str(&data).ok()?))
}

#[tauri::command]
pub fn chat_start(app: AppHandle, input: Value) -> BridgeResult<()> {
    start_generation(app, input, "/api/v1/chat/stream")
}

/// Regenera la última respuesta. Emite exactamente los mismos eventos
/// `chat://*` que `chat_start`, de modo que Svelte no distingue el origen.
#[tauri::command]
pub fn chat_retry(app: AppHandle, input: Value) -> BridgeResult<()> {
    start_generation(app, input, "/api/v1/chat/regenerate")
}

fn start_generation(app: AppHandle, input: Value, path: &'static str) -> BridgeResult<()> {
    let bearer = app
        .secure_session()
        .load()
        .map_err(|_| BridgeError::secure())?
        .ok_or_else(|| BridgeError::remote(false))?;
    tauri::async_runtime::spawn(async move {
        let request = api_addresses(&app).map_err(|_| ()).and_then(|addresses| {
            let mut builder = reqwest::Client::builder()
                .tls_backend_preconfigured(tls_configuration())
                .timeout(Duration::from_secs(330))
                .user_agent("MAC-Mobile/0.1");
            if !addresses.is_empty() {
                builder = builder.resolve_to_addrs(API_HOST, &addresses);
            }
            builder.build().map_err(|_| ())
        });
        let Ok(client) = request else {
            let _ = app.emit(
                "chat://failed",
                json!({ "code": "REMOTE_ERROR", "retryable": true }),
            );
            return;
        };
        let response = client
            .post(format!("{API_ORIGIN}{path}"))
            .header("origin", API_ORIGIN)
            .bearer_auth(bearer)
            .json(&input)
            .send()
            .await;
        let Ok(response) = response else {
            let _ = app.emit(
                "chat://failed",
                json!({ "code": "REMOTE_ERROR", "retryable": true }),
            );
            return;
        };
        if !response.status().is_success() {
            let _ = app.emit(
                "chat://failed",
                json!({
                    "code": "REMOTE_ERROR",
                    "retryable": response.status().is_server_error()
                }),
            );
            return;
        }
        let mut bytes = response.bytes_stream();
        let mut buffer = Vec::new();
        while let Some(chunk) = bytes.next().await {
            let Ok(chunk) = chunk else {
                let _ = app.emit(
                    "chat://failed",
                    json!({ "code": "STREAM_INTERRUPTED", "retryable": true }),
                );
                return;
            };
            buffer.extend_from_slice(&chunk);
            while let Some((event, data)) = take_sse_frame(&mut buffer) {
                let target = match event.as_str() {
                    "start" => "chat://started",
                    "delta" => "chat://delta",
                    "usage" => "chat://usage",
                    "done" => "chat://completed",
                    "error" => "chat://failed",
                    _ => continue,
                };
                let _ = app.emit(target, data);
            }
        }
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::take_sse_frame;

    #[test]
    fn parses_complete_and_split_sse_frames() {
        let mut buffer = b"event: delta\ndata: {\"sequence\":1".to_vec();
        assert!(take_sse_frame(&mut buffer).is_none());
        buffer.extend_from_slice(b",\"text\":\"hola\"}\n\n");
        let (event, data) = take_sse_frame(&mut buffer).expect("frame");
        assert_eq!(event, "delta");
        assert_eq!(data["text"], "hola");
        assert!(buffer.is_empty());
    }
}
