pub mod mobile_core;
mod tauri_bridge;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_secure_session::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .manage(tauri_bridge::DatabaseState::default())
        .invoke_handler(tauri::generate_handler![
            tauri_bridge::database_open,
            tauri_bridge::auth_sign_in,
            tauri_bridge::auth_sign_out,
            tauri_bridge::auth_session,
            tauri_bridge::auth_complete_oauth,
            tauri_bridge::conversation_save,
            tauri_bridge::conversation_get,
            tauri_bridge::conversation_list,
            tauri_bridge::message_save,
            tauri_bridge::message_cache,
            tauri_bridge::message_list,
            tauri_bridge::memory_save,
            tauri_bridge::memory_list,
            tauri_bridge::sync_now,
            tauri_bridge::sync_status,
            tauri_bridge::chat_start,
            tauri_bridge::chat_retry,
            tauri_bridge::chat_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error al ejecutar MAC Mobile");
}
