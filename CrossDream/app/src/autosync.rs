//! Синхронизация сама, без кнопок: через несколько секунд после своей правки
//! (несколько правок подряд — одна синхронизация) и раз в пять минут — чтобы приходило
//! сделанное на сайте и на других устройствах.

use crate::commands::sync::run_sync;
use crate::state::AppState;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const AFTER_CHANGE: Duration = Duration::from_secs(4);
const PERIOD: Duration = Duration::from_secs(300);

static LAST_REQUEST: AtomicU64 = AtomicU64::new(0);

fn online(app: &AppHandle) -> bool {
    app.state::<AppState>().session().is_some()
}

// идущая синхронизация не должна «съесть» новую правку — дождаться её конца
async fn wait_idle(app: &AppHandle) {
    while app.state::<AppState>().syncing.load(Ordering::SeqCst) {
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// Своя правка: синхронизировать вскоре.
pub fn soon(app: &AppHandle) {
    let mine = LAST_REQUEST.fetch_add(1, Ordering::SeqCst) + 1;
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(AFTER_CHANGE).await;
        if LAST_REQUEST.load(Ordering::SeqCst) != mine || !online(&app) {
            return; // за это время была ещё правка — синхронизирует она
        }
        wait_idle(&app).await;
        run_sync(&app).await;
    });
}

/// Раз в пять минут, пока программа открыта и есть вход.
pub fn start_periodic(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(PERIOD).await;
            if online(&app) {
                wait_idle(&app).await;
                run_sync(&app).await;
            }
        }
    });
}
