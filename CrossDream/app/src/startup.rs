//! Запуск: тихий вход сохранённым логином и синхронизация всего в фоне.

use crate::{auth, commands, events};
use tauri::AppHandle;

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        match auth::auto_login(&app).await {
            None => {}
            Some(Ok(_)) => {
                events::site_login(&app);
                commands::sync::run_sync(&app).await;
            }
            Some(Err(e)) => {
                events::sync_done(&app, false, &format!("вход на сайт не удался: {e}"));
            }
        }
    });
}
