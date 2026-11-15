//! Добавление PDF: на полку (зашифрованным) и сразу ответ; на сайт — в фоне с ходом
//! (`upload://progress`, в конце `upload://done`). Без входа уедет при синхронизации.

use super::b64;
use crate::events;
use crate::state::AppState;
use dream_core::pdfnet::{self, Claim};
use dream_core::site::ProgressFn;
use dream_core::util::new_pdf_id;
use dream_core::{Error, PdfBook, Result, Store};
use serde_json::Map;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

async fn add(app: &AppHandle, title: String, bytes: Vec<u8>) -> Result<PdfBook> {
    if !bytes.starts_with(b"%PDF-") {
        return Err(Error::msg("Это не PDF-файл"));
    }
    let st = app.state::<AppState>();
    let store = st.store();
    let id = new_pdf_id();
    // отметка «уходит в фоне» — до записи в pdfs.json, чтобы синхронизация не отправила его второй раз
    let claim = pdfnet::claim(&id).ok_or_else(|| Error::msg("Этот PDF уже добавляется"))?;
    let file = store.stash_pdf(&id, &bytes)?;
    let title = if title.trim().is_empty() { "Без названия".to_string() } else { title.trim().to_string() };
    let book = PdfBook { id: id.clone(), title: title.clone(), file, size: bytes.len() as i64, extra: Map::new(), ..Default::default() };
    store.edit_pdfs(|v| v.push(book.clone()))?;
    events::library_changed(app);
    if st.session().is_some() {
        let app = app.clone();
        tauri::async_runtime::spawn(async move { send(app, store, claim, id, title, bytes).await });
    }
    Ok(book)
}

/// Фоновая отправка одного PDF; отметка снимается, когда кончится.
async fn send(app: AppHandle, store: Arc<Store>, claim: Claim, id: String, title: String, bytes: Vec<u8>) {
    let _claim = claim;
    let Some(sess) = app.state::<AppState>().session() else { return };
    let (a, pid, ptitle) = (app.clone(), id.clone(), title.clone());
    let cb: ProgressFn = Arc::new(move |done, total| events::upload_progress(&a, &pid, &ptitle, done, total));
    match pdfnet::push(&store, &sess.site, &id, &title, bytes, cb).await {
        Ok(_) => events::upload_done(&app, &id, &title, true, &format!("«{title}» — на сайте")),
        // не ушло — уедет при синхронизации
        Err(e) => events::upload_done(&app, &id, &title, false, &e.to_string()),
    }
}

/// PDF по пути файла (ПК). Пустое название — имя файла.
#[tauri::command]
pub async fn pdf_add(app: AppHandle, path: String, title: Option<String>) -> Result<PdfBook> {
    let p = std::path::PathBuf::from(&path);
    let bytes = std::fs::read(&p)?;
    let title = title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default());
    add(&app, title, bytes).await
}

/// PDF байтами (телефоны: диалог отдаёт не путь, а содержимое).
#[tauri::command]
pub async fn pdf_add_bytes(app: AppHandle, title: String, bytes_b64: String) -> Result<PdfBook> {
    add(&app, title, b64(&bytes_b64)?).await
}
