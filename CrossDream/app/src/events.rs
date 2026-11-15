//! События ядра → интерфейс (имена — как в docs\CONTRACT.md).

use serde_json::json;
use tauri::{AppHandle, Emitter};

pub const SYNC_PROGRESS: &str = "sync://progress";
pub const SYNC_DONE: &str = "sync://done";
pub const PIPELINE_STEP: &str = "pipeline://step";
pub const DREAMS_CHANGED: &str = "dreams://changed";
pub const LIBRARY_CHANGED: &str = "library://changed";
pub const PDF_PROGRESS: &str = "pdf://progress";
pub const UPLOAD_PROGRESS: &str = "upload://progress";
pub const UPLOAD_DONE: &str = "upload://done";

pub fn dreams_changed(app: &AppHandle) {
    let _ = app.emit(DREAMS_CHANGED, ());
}

pub fn library_changed(app: &AppHandle) {
    let _ = app.emit(LIBRARY_CHANGED, ());
}

pub fn sync_progress(app: &AppHandle, text: &str, pct: f64) {
    let _ = app.emit(SYNC_PROGRESS, json!({ "text": text, "pct": pct }));
}

pub fn sync_done(app: &AppHandle, ok: bool, message: &str) {
    let _ = app.emit(SYNC_DONE, json!({ "ok": ok, "message": message }));
}

/// Ход скачивания PDF по требованию (`pdf_read`), байты.
pub fn pdf_progress(app: &AppHandle, id: &str, done: u64, total: u64) {
    let _ = app.emit(PDF_PROGRESS, json!({ "id": id, "done": done, "total": total }));
}

/// Ход фоновой отправки PDF на сайт, байты.
pub fn upload_progress(app: &AppHandle, id: &str, title: &str, done: u64, total: u64) {
    let _ = app.emit(UPLOAD_PROGRESS, json!({ "id": id, "title": title, "done": done, "total": total }));
}

/// Тихий вход при запуске состоялся — интерфейс перечитывает `site_state`
/// (он мог спросить раньше, чем вход закончился).
pub const SITE_LOGIN: &str = "site://login";
pub fn site_login(app: &AppHandle) {
    let _ = app.emit(SITE_LOGIN, ());
}

pub fn upload_done(app: &AppHandle, id: &str, title: &str, ok: bool, message: &str) {
    let _ = app.emit(UPLOAD_DONE, json!({ "id": id, "title": title, "ok": ok, "message": message }));
}
