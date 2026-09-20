use tauri::{
    Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

#[cfg(desktop)]
mod desktop;
mod error;
#[cfg(mobile)]
mod mobile;
#[cfg(mobile)]
mod models;

#[cfg(desktop)]
use desktop::SecureSession;
pub use error::{Error, Result};
#[cfg(mobile)]
use mobile::SecureSession;

pub trait SecureSessionExt<R: Runtime> {
    fn secure_session(&self) -> &SecureSession<R>;
}

impl<R: Runtime, T: Manager<R>> SecureSessionExt<R> for T {
    fn secure_session(&self) -> &SecureSession<R> {
        self.state::<SecureSession<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-session")
        .setup(|app, api| {
            #[cfg(mobile)]
            let secure_session = mobile::init(app, api)?;
            #[cfg(desktop)]
            let secure_session = desktop::init(app, api)?;
            app.manage(secure_session);
            Ok(())
        })
        .build()
}
