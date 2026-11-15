//! Обложки PDF в `<профиль>\covers\`: `<id>.webp` — испечённые сайтом (приходят при синхронизации),
//! `<id>.jpg` — нарисованные интерфейсом (pdf.js), пока книги нет на сайте; эти ядро возит на сайт
//! (`pdf_cover_set`, сайт сам переводит в WebP). Путь — для `convertFileSrc`.

use super::b64;
use crate::state::AppState;
use dream_core::{pdfnet, Error, Result};
use tauri::{AppHandle, Manager, State};

/// Полный путь обложки, если файл есть: сперва `.webp`, потом `.jpg`.
#[tauri::command]
pub fn cover_get(state: State<'_, AppState>, id: String) -> Option<String> {
    state.store().cover_file(&id).map(|p| p.to_string_lossy().into_owned())
}

/// Записать свою обложку (JPEG base64) как `<id>.jpg`; номер на сайте известен и есть вход — в фоне отправить туда.
/// Ответ — полный путь файла.
#[tauri::command]
pub async fn cover_put(app: AppHandle, id: String, jpeg_b64: String) -> Result<String> {
    let jpeg = b64(&jpeg_b64)?;
    if !jpeg.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Err(Error::msg("Обложка — только JPEG"));
    }
    let st = app.state::<AppState>();
    let store = st.store();
    let path = store.save_cover(&id, &jpeg)?;
    let site_id = store.load_pdfs().iter().find(|p| p.id == id).map(pdfnet::known_site_id).unwrap_or(0);
    // номера ещё нет (PDF уходит в фоне) — обложку отправит сама отправка или синхронизация
    if let (Some(sess), true) = (st.session(), site_id > 0 && jpeg.len() <= pdfnet::COVER_MAX) {
        tauri::async_runtime::spawn(async move {
            let _ = pdfnet::push_cover(&store, &sess.site, &id, site_id).await; // не ушла — уедет при синхронизации
        });
    }
    Ok(path.to_string_lossy().into_owned())
}
