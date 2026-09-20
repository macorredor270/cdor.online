use std::cell::{Cell, RefCell};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::json;

use super::{
    Action, CachedConversation, CachedMemory, CachedMessage, Connectivity, CoreError, CoreResult,
    EntityType, LocalDatabase, OutboxStatus, PendingOperation, PullPage, PushResult, PushStatus,
    RemoteChange, SecretStore, SyncApi, SyncEngine, retry_delay_ms,
};

const USER: &str = "01JA0000000000000000000000";
const CONVERSATION: &str = "01JA0000000000000000000001";
const MESSAGE: &str = "01JA0000000000000000000002";
const OP_CONVERSATION: &str = "01JA0000000000000000000003";
const OP_MESSAGE: &str = "01JA0000000000000000000004";
const MEMORY: &str = "01JA0000000000000000000005";
const OP_MEMORY: &str = "01JA0000000000000000000006";
const CREATED_AT: &str = "2026-07-29T10:00:00.000Z";
const NOW_MS: i64 = 1_775_000_000_000;

fn conversation(title: &str, version: &str) -> CachedConversation {
    CachedConversation {
        id: CONVERSATION.to_owned(),
        user_id: USER.to_owned(),
        title: title.to_owned(),
        model_mode: "balanced".to_owned(),
        created_at: CREATED_AT.to_owned(),
        updated_at: CREATED_AT.to_owned(),
        deleted_at: None,
        sync_version: version.to_owned(),
    }
}

fn message() -> CachedMessage {
    CachedMessage {
        id: MESSAGE.to_owned(),
        conversation_id: CONVERSATION.to_owned(),
        user_id: USER.to_owned(),
        client_operation_id: Some(OP_MESSAGE.to_owned()),
        role: "user".to_owned(),
        content: "Mensaje sin conexión".to_owned(),
        status: "completed".to_owned(),
        model_provider: None,
        model_id: None,
        input_tokens: None,
        output_tokens: None,
        finish_reason: None,
        error_code: None,
        created_at: CREATED_AT.to_owned(),
        updated_at: CREATED_AT.to_owned(),
        deleted_at: None,
        sync_version: "0".to_owned(),
    }
}

fn memory() -> CachedMemory {
    CachedMemory {
        id: MEMORY.to_owned(),
        user_id: USER.to_owned(),
        content: "Prefiere respuestas breves".to_owned(),
        category: "preferencia".to_owned(),
        importance: 3,
        enabled: true,
        source_message_id: None,
        created_at: CREATED_AT.to_owned(),
        updated_at: CREATED_AT.to_owned(),
        deleted_at: None,
        sync_version: "0".to_owned(),
    }
}

fn operation(
    operation_id: &str,
    entity_type: EntityType,
    entity_id: &str,
    payload: serde_json::Value,
) -> PendingOperation {
    PendingOperation {
        operation_id: operation_id.to_owned(),
        entity_type,
        entity_id: entity_id.to_owned(),
        action: Action::Upsert,
        payload,
        base_version: "0".to_owned(),
        attempts: 0,
        next_attempt_at_ms: NOW_MS,
        created_at_ms: NOW_MS,
        last_error: None,
    }
}

fn temporary_database_path() -> PathBuf {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("el reloj del test debe ser válido")
        .as_nanos();
    std::env::temp_dir().join(format!(
        "cdor-mobile-{}-{unique}.sqlite",
        std::process::id()
    ))
}

#[test]
fn lists_cached_entities_and_recovers_the_local_user_without_exposing_sql() {
    let mut database = LocalDatabase::open_in_memory().expect("SQLite");
    assert_eq!(database.current_user_id().expect("usuario"), None);

    database
        .save_conversation_offline(
            &conversation("Caché", "0"),
            &operation(
                OP_CONVERSATION,
                EntityType::Conversation,
                CONVERSATION,
                json!({
                    "title": "Caché",
                    "modelMode": "balanced",
                    "createdAt": CREATED_AT
                }),
            ),
        )
        .expect("conversación");
    database
        .cache_message(&message())
        .expect("mensaje optimista");
    database
        .save_memory_offline(
            &memory(),
            &operation(
                OP_MEMORY,
                EntityType::Memory,
                MEMORY,
                json!({
                    "content": "Prefiere respuestas breves",
                    "category": "preferencia",
                    "importance": 3,
                    "enabled": true,
                    "sourceMessageId": null
                }),
            ),
        )
        .expect("memoria");

    assert_eq!(
        database.current_user_id().expect("usuario"),
        Some(USER.to_owned())
    );
    assert_eq!(
        database.conversations(USER).expect("conversaciones").len(),
        1
    );
    assert_eq!(database.messages(CONVERSATION).expect("mensajes").len(), 1);
    assert_eq!(database.memories(USER).expect("memorias").len(), 1);
    assert_eq!(
        database.operation_count(None).expect("outbox"),
        2,
        "el mensaje optimista no entra en outbox hasta que falla la red"
    );

    database
        .set_current_user_id(Some(USER))
        .expect("guarda usuario local");
    assert_eq!(
        database.current_user_id().expect("usuario"),
        Some(USER.to_owned())
    );
    database
        .set_current_user_id(None)
        .expect("borra usuario local");
    assert_eq!(
        database.current_user_id().expect("inferencia"),
        Some(USER.to_owned())
    );
}

struct Online(bool);

impl Connectivity for Online {
    fn is_online(&self) -> bool {
        self.0
    }
}

struct MemorySecrets(Option<String>);

impl SecretStore for MemorySecrets {
    fn load_session(&self) -> CoreResult<Option<String>> {
        Ok(self.0.clone())
    }

    fn store_session(&mut self, session: &str) -> CoreResult<()> {
        self.0 = Some(session.to_owned());
        Ok(())
    }

    fn delete_session(&mut self) -> CoreResult<()> {
        self.0 = None;
        Ok(())
    }
}

struct FakeApi {
    pushed: RefCell<Vec<Vec<PendingOperation>>>,
    fail_push: Cell<bool>,
    cursor_invalid_once: Cell<bool>,
}

impl FakeApi {
    fn normal() -> Self {
        Self {
            pushed: RefCell::new(Vec::new()),
            fail_push: Cell::new(false),
            cursor_invalid_once: Cell::new(false),
        }
    }
}

impl SyncApi for FakeApi {
    fn push(&self, session: &str, operations: &[PendingOperation]) -> CoreResult<Vec<PushResult>> {
        assert_eq!(session, "session-in-native-store");
        if self.fail_push.get() {
            return Err(CoreError::RemoteRetryable);
        }
        self.pushed.borrow_mut().push(operations.to_vec());
        Ok(operations
            .iter()
            .map(|operation| PushResult {
                operation_id: operation.operation_id.clone(),
                entity_id: operation.entity_id.clone(),
                status: PushStatus::Applied,
                server_version: Some("1".to_owned()),
                error_code: None,
            })
            .collect())
    }

    fn pull(&self, session: &str, cursor: &str, _limit: u32) -> CoreResult<PullPage> {
        assert_eq!(session, "session-in-native-store");
        if self.cursor_invalid_once.replace(false) {
            return Err(CoreError::CursorInvalid);
        }
        if cursor != "0" {
            return Ok(PullPage {
                next_cursor: cursor.to_owned(),
                has_more: false,
                changes: vec![],
            });
        }
        let server_conversation = conversation("Título del servidor", "2");
        let mut server_message = message();
        server_message.sync_version = "1".to_owned();
        Ok(PullPage {
            next_cursor: "2".to_owned(),
            has_more: false,
            changes: vec![
                RemoteChange {
                    change_id: "1".to_owned(),
                    entity_type: EntityType::Conversation,
                    entity_id: CONVERSATION.to_owned(),
                    entity_version: "2".to_owned(),
                    operation: Action::Upsert,
                    changed_at: CREATED_AT.to_owned(),
                    payload: Some(serde_json::to_value(server_conversation)?),
                },
                RemoteChange {
                    change_id: "2".to_owned(),
                    entity_type: EntityType::Message,
                    entity_id: MESSAGE.to_owned(),
                    entity_version: "1".to_owned(),
                    operation: Action::Upsert,
                    changed_at: CREATED_AT.to_owned(),
                    payload: Some(serde_json::to_value(server_message)?),
                },
            ],
        })
    }
}

#[test]
fn migrates_reopens_and_deduplicates_the_outbox() {
    let path = temporary_database_path();
    let local = conversation("Offline", "0");
    let queued = operation(
        OP_CONVERSATION,
        EntityType::Conversation,
        CONVERSATION,
        json!({
            "title": "Offline",
            "modelMode": "balanced",
            "createdAt": CREATED_AT
        }),
    );

    {
        let mut database = LocalDatabase::open(&path).expect("abre SQLite");
        assert_eq!(database.schema_version().expect("versión"), 2);
        database
            .save_conversation_offline(&local, &queued)
            .expect("escritura local y outbox atómicas");
        database
            .save_conversation_offline(&local, &queued)
            .expect("reintento local idempotente");
        assert_eq!(database.operation_count(None).expect("outbox"), 1);
    }

    {
        let mut reopened = LocalDatabase::open(&path).expect("reabre SQLite");
        assert_eq!(
            reopened
                .conversation(CONVERSATION)
                .expect("caché")
                .expect("conversación")
                .title,
            "Offline"
        );
        assert_eq!(reopened.operation_count(None).expect("outbox"), 1);

        let mut conflicting = queued.clone();
        conflicting.payload = json!({"title": "Otro payload"});
        let changed = conversation("No debe persistir", "0");
        assert!(matches!(
            reopened.save_conversation_offline(&changed, &conflicting),
            Err(CoreError::InvalidSyncResponse)
        ));
        assert_eq!(
            reopened
                .conversation(CONVERSATION)
                .expect("caché")
                .expect("conversación")
                .title,
            "Offline"
        );
    }

    fs::remove_file(path).expect("elimina SQLite temporal");
}

#[test]
fn offline_then_online_converges_and_mysql_wins() {
    let mut database = LocalDatabase::open_in_memory().expect("SQLite");
    let local_conversation = conversation("Título offline", "0");
    let conversation_operation = operation(
        OP_CONVERSATION,
        EntityType::Conversation,
        CONVERSATION,
        json!({
            "title": "Título offline",
            "modelMode": "balanced",
            "createdAt": CREATED_AT
        }),
    );
    let local_message = message();
    let message_operation = operation(
        OP_MESSAGE,
        EntityType::Message,
        MESSAGE,
        json!({
            "conversationId": CONVERSATION,
            "clientOperationId": OP_MESSAGE,
            "role": "user",
            "content": "Mensaje sin conexión",
            "createdAt": CREATED_AT
        }),
    );
    database
        .save_conversation_offline(&local_conversation, &conversation_operation)
        .expect("conversación offline");
    database
        .save_message_offline(&local_message, &message_operation)
        .expect("mensaje offline");

    let api = FakeApi::normal();
    let online = Online(true);
    let secrets = MemorySecrets(Some("session-in-native-store".to_owned()));
    let report = SyncEngine::new(&mut database, &api, &online, &secrets)
        .sync_once(USER, NOW_MS)
        .expect("sincroniza");

    assert_eq!(report.pushed, 2);
    assert_eq!(report.pulled, 2);
    assert_eq!(report.cursor, "2");
    assert_eq!(database.operation_count(None).expect("outbox"), 0);
    assert_eq!(
        database
            .conversation(CONVERSATION)
            .expect("caché")
            .expect("conversación")
            .title,
        "Título del servidor"
    );
    assert_eq!(database.messages(CONVERSATION).expect("mensajes").len(), 1);

    SyncEngine::new(&mut database, &api, &online, &secrets)
        .sync_once(USER, NOW_MS + 1_000)
        .expect("segundo sync");
    assert_eq!(api.pushed.borrow().len(), 1);
}

#[test]
fn retry_uses_bounded_jitter_and_permanent_errors_stop() {
    for attempt in 1..=10 {
        let delay = retry_delay_ms(attempt, OP_CONVERSATION);
        assert!(delay >= 800);
        if attempt >= 7 {
            assert!((240_000..=360_000).contains(&delay));
        }
    }

    let mut database = LocalDatabase::open_in_memory().expect("SQLite");
    let queued = operation(
        OP_CONVERSATION,
        EntityType::Conversation,
        CONVERSATION,
        json!({"title": "Offline"}),
    );
    database
        .save_conversation_offline(&conversation("Offline", "0"), &queued)
        .expect("encola");
    let api = FakeApi::normal();
    api.fail_push.set(true);
    let secrets = MemorySecrets(Some("session-in-native-store".to_owned()));
    assert!(matches!(
        SyncEngine::new(&mut database, &api, &Online(true), &secrets).sync_once(USER, NOW_MS),
        Err(CoreError::RemoteRetryable)
    ));
    assert_eq!(
        database
            .due_operations(NOW_MS, 100)
            .expect("aún no toca")
            .len(),
        0
    );
    let later = database
        .due_operations(NOW_MS + 400_000, 100)
        .expect("reintento posterior");
    assert_eq!(later[0].attempts, 1);

    database
        .mark_operation(
            OP_CONVERSATION,
            super::RetryDisposition::Permanent,
            "VALIDATION_ERROR",
            NOW_MS + 400_000,
        )
        .expect("bloquea 4xx");
    assert_eq!(
        database
            .operation_count(Some(OutboxStatus::Failed))
            .expect("fallidas"),
        1
    );
    assert!(
        database
            .due_operations(NOW_MS + 1_000_000, 100)
            .expect("no reintenta permanente")
            .is_empty()
    );
}

#[test]
fn message_dependency_is_requeued_after_parent_arrives_from_mysql() {
    let mut database = LocalDatabase::open_in_memory().expect("SQLite");
    let local_conversation = conversation("Offline", "0");
    let conversation_operation = operation(
        OP_CONVERSATION,
        EntityType::Conversation,
        CONVERSATION,
        json!({"title": "Offline"}),
    );
    let local_message = message();
    let message_operation = operation(
        OP_MESSAGE,
        EntityType::Message,
        MESSAGE,
        json!({
            "conversationId": CONVERSATION,
            "clientOperationId": OP_MESSAGE,
            "role": "user",
            "content": "Mensaje sin conexión",
            "createdAt": CREATED_AT
        }),
    );
    database
        .save_conversation_offline(&local_conversation, &conversation_operation)
        .expect("conversación offline");
    database
        .save_message_offline(&local_message, &message_operation)
        .expect("mensaje offline");
    database
        .mark_operation(
            OP_MESSAGE,
            super::RetryDisposition::Permanent,
            "CONVERSATION_NOT_FOUND",
            NOW_MS,
        )
        .expect("dependencia inicialmente bloqueada");
    database
        .apply_pull_page(
            USER,
            &PullPage {
                next_cursor: "1".to_owned(),
                has_more: false,
                changes: vec![RemoteChange {
                    change_id: "1".to_owned(),
                    entity_type: EntityType::Conversation,
                    entity_id: CONVERSATION.to_owned(),
                    entity_version: "1".to_owned(),
                    operation: Action::Upsert,
                    changed_at: CREATED_AT.to_owned(),
                    payload: Some(json!({
                        "id": CONVERSATION,
                        "userId": USER,
                        "title": "Servidor",
                        "modelMode": "balanced",
                        "createdAt": CREATED_AT,
                        "updatedAt": CREATED_AT,
                        "deletedAt": null,
                        "syncVersion": "1"
                    })),
                }],
            },
            NOW_MS,
        )
        .expect("padre autoritativo");

    assert_eq!(
        database
            .requeue_resolved_dependencies(NOW_MS + 1)
            .expect("reactiva dependencias"),
        1
    );
    let due = database
        .due_operations(NOW_MS + 1, 100)
        .expect("operación reintentable");
    assert!(
        due.iter()
            .any(|operation| operation.operation_id == OP_MESSAGE)
    );
}

#[test]
fn server_delete_dominates_and_invalid_cursor_restarts_from_zero() {
    let mut database = LocalDatabase::open_in_memory().expect("SQLite");
    let queued = operation(
        OP_CONVERSATION,
        EntityType::Conversation,
        CONVERSATION,
        json!({"title": "Pendiente"}),
    );
    database
        .save_conversation_offline(&conversation("Pendiente", "0"), &queued)
        .expect("encola");
    database
        .apply_pull_page(
            USER,
            &PullPage {
                next_cursor: "9".to_owned(),
                has_more: false,
                changes: vec![],
            },
            NOW_MS,
        )
        .expect("cursor previo");

    let api = FakeApi {
        pushed: RefCell::new(Vec::new()),
        fail_push: Cell::new(false),
        cursor_invalid_once: Cell::new(true),
    };
    let secrets = MemorySecrets(Some("session-in-native-store".to_owned()));
    let report = SyncEngine::new(&mut database, &api, &Online(true), &secrets)
        .sync_once(USER, NOW_MS)
        .expect("resync completo");
    assert_eq!(report.cursor, "2");

    let delete = PullPage {
        next_cursor: "3".to_owned(),
        has_more: false,
        changes: vec![RemoteChange {
            change_id: "3".to_owned(),
            entity_type: EntityType::Conversation,
            entity_id: CONVERSATION.to_owned(),
            entity_version: "3".to_owned(),
            operation: Action::Delete,
            changed_at: "2026-07-29T10:05:00.000Z".to_owned(),
            payload: None,
        }],
    };
    database
        .apply_pull_page(USER, &delete, NOW_MS)
        .expect("aplica delete autoritativo");
    let stored = database
        .conversation(CONVERSATION)
        .expect("caché")
        .expect("tombstone");
    assert!(stored.deleted_at.is_some());
    assert_eq!(stored.sync_version, "3");
    assert_eq!(database.operation_count(None).expect("outbox"), 0);
}
