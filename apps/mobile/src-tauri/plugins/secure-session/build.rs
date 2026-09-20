const COMMANDS: &[&str] = &["store", "load", "delete", "resolve_host"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
