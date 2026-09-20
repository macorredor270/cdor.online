use serde::de::DeserializeOwned;
use tauri::{
    AppHandle, Runtime,
    plugin::{PluginApi, PluginHandle},
};

use crate::models::{Empty, LoadResponse, StoreRequest};
#[cfg(target_os = "android")]
use crate::models::{ResolveHostRequest, ResolveHostResponse};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_secure_session);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<SecureSession<R>> {
    #[cfg(target_os = "android")]
    let handle =
        api.register_android_plugin("online.cdor.securesession", "SecureSessionPlugin")?;
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_secure_session)?;
    Ok(SecureSession(handle))
}

pub struct SecureSession<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> SecureSession<R> {
    pub fn store(&self, value: &str) -> crate::Result<()> {
        let _: Empty = self
            .0
            .run_mobile_plugin("store", StoreRequest { value })?;
        Ok(())
    }

    pub fn load(&self) -> crate::Result<Option<String>> {
        self.0
            .run_mobile_plugin::<LoadResponse>("load", Empty::default())
            .map(|response| response.value)
            .map_err(Into::into)
    }

    pub fn delete(&self) -> crate::Result<()> {
        let _: Empty = self
            .0
            .run_mobile_plugin("delete", Empty::default())?;
        Ok(())
    }

    #[cfg(target_os = "android")]
    pub fn resolve_host(&self, host: &str) -> crate::Result<Vec<String>> {
        self.0
            .run_mobile_plugin::<ResolveHostResponse>("resolve_host", ResolveHostRequest { host })
            .map(|response| response.addresses)
            .map_err(Into::into)
    }
}
