use std::sync::Mutex;

use serde::de::DeserializeOwned;
use tauri::{AppHandle, Runtime, plugin::PluginApi};

pub struct SecureSession<R: Runtime> {
    _app: AppHandle<R>,
    value: Mutex<Option<String>>,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<SecureSession<R>> {
    Ok(SecureSession {
        _app: app.clone(),
        value: Mutex::new(None),
    })
}

impl<R: Runtime> SecureSession<R> {
    pub fn store(&self, value: &str) -> crate::Result<()> {
        *self.value.lock().map_err(|_| crate::Error::Unavailable)? =
            Some(value.to_owned());
        Ok(())
    }

    pub fn load(&self) -> crate::Result<Option<String>> {
        self.value
            .lock()
            .map(|value| value.clone())
            .map_err(|_| crate::Error::Unavailable)
    }

    pub fn delete(&self) -> crate::Result<()> {
        *self.value.lock().map_err(|_| crate::Error::Unavailable)? = None;
        Ok(())
    }
}
