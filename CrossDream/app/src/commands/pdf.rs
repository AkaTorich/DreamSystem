//! PDF: список и быстрая сверка его с сайтом, чтение в память (нет файла на устройстве —
//! скачать с сайта с ходом), переименование, удаление, память страницы. Добавление — `pdf_add.rs`, обложки — `covers.rs`.

use crate::events;
use crate::state::AppState;
use dream_core::pdfnet;
use dream_core::site::ProgressFn;
use dream_core::store::settings;
use dream_core::sync::Ctx;
use dream_core::{Error, PdfBook, Result, Store};
use serde_json::json;
use std::sync::Arc;
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};

/// Список PDF; последняя страница — из памяти этой машины, если она есть.
#[tauri::command]
pub fn pdfs_list(state: State<'_, AppState>) -> Vec<PdfBook> {
    let pages = state.settings().pdf_page;
    let mut v = state.store().load_pdfs();
    for p in v.iter_mut() {
        if let Some(n) = pages.get(&p.id) {
            p.last_page = *n;
        }
    }
    v
}

pub fn find(store: &Store, id: &str) -> Result<PdfBook> {
    store.load_pdfs().into_iter().find(|p| p.id == id).ok_or_else(|| Error::msg("PDF не найден"))
}

/// Расшифровать в память в стороне от общего хода (большой файл — заметная работа).
async fn decrypt(store: Arc<Store>, p: PdfBook) -> Result<Vec<u8>> {
    tauri::async_runtime::spawn_blocking(move || store.read_pdf(&p))
        .await
        .map_err(|e| Error::msg(e.to_string()))?
}

/// Байты PDF (расшифровка в память) — в JS приходят как ArrayBuffer. Файла на устройстве
/// ещё нет — качается с сайта кусками (`pdf://progress`), сразу шифруется на полку.
#[tauri::command]
pub async fn pdf_read(app: AppHandle, id: String) -> Result<Response> {
    Ok(Response::new(load_bytes(&app, &id).await?))
}

/// Открыть книгу для читалки: байты (с сайта, если на устройстве их ещё нет) кладутся в память,
/// а pdf.js читает их кусками по адресу `cdpdf://localhost/<id>` (crate::pdfproto) — без передачи
/// всего файла через IPC (большая книга шла бы секунды). Ответ — размер в байтах.
#[tauri::command]
pub async fn pdf_open(app: AppHandle, id: String) -> Result<u64> {
    let bytes = load_bytes(&app, &id).await?;
    Ok(crate::pdfproto::keep(&id, bytes))
}

/// Байты PDF из шифра; нет файла на устройстве — скачать с сайта с ходом и положить на полку.
pub async fn load_bytes(app: &AppHandle, id: &str) -> Result<Vec<u8>> {
    let id = id.to_string();
    let st = app.state::<AppState>();
    let store = st.store();
    let p = find(&store, &id)?;
    if store.has_pdf_file(&p) {
        return decrypt(store, p).await;
    }
    let lock = st.pdf_lock(&id);
    let res = async {
        let _g = lock.lock().await;
        // пока ждали замка, его мог скачать соседний запрос
        let p = find(&store, &id)?;
        if store.has_pdf_file(&p) {
            return decrypt(store.clone(), p).await;
        }
        let sess = st.session().ok_or_else(|| Error::msg("PDF ещё не скачан на это устройство — войдите на сайт"))?;
        let (a, pid) = (app.clone(), id.clone());
        let cb: ProgressFn = Arc::new(move |done, total| events::pdf_progress(&a, &pid, done, total));
        pdfnet::fetch(&store, &sess.site, &p, cb).await
    }
    .await;
    drop(lock);
    st.pdf_lock_release(&id);
    res
}

/// Быстро сверить с сайтом только список PDF (и недостающие обложки) — без отправки;
/// затем `library://changed`. Ответ — список, как `pdfs_list`.
#[tauri::command]
pub async fn pdfs_refresh(app: AppHandle) -> Result<Vec<PdfBook>> {
    let st = app.state::<AppState>();
    let site = st.site()?;
    let store = st.store();
    let quiet = |_: &str, _: f64| {};
    dream_core::sync::pdfs::refresh(&Ctx::new(&store, &site, &quiet)).await?;
    events::library_changed(&app);
    Ok(pdfs_list(st))
}

/// Переименовать PDF: при входе — сперва на сайте (ошибка сайта — здесь ничего не меняется).
#[tauri::command]
pub async fn pdf_rename(app: AppHandle, id: String, title: String) -> Result<PdfBook> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(Error::msg("Название не может быть пустым"));
    }
    let st = app.state::<AppState>();
    let store = st.store();
    let book = find(&store, &id)?;
    if let Some(s) = st.session() {
        // номера нет (ещё уходит в фоне) — новое название донесёт сама отправка
        let sid = pdfnet::resolve_site_id(&s.site, &book).await?;
        if sid > 0 {
            s.site.post_json("pdf_rename", &json!({ "id": sid, "title": title })).await?;
        }
    }
    let saved = store.edit_pdfs(|v| {
        v.iter_mut().find(|p| p.id == id).map(|p| {
            p.title = title.clone();
            p.clone()
        })
    })?;
    events::library_changed(&app);
    saved.ok_or_else(|| Error::msg("PDF не найден"))
}

/// Удалить PDF: сперва на сайте (иначе синхронизация вернёт его обратно), затем с полки
/// вместе с обложками. `localOnly` — сайт не трогать (запись там уже стёрта, `lib_purge`).
#[tauri::command]
pub async fn pdf_delete(app: AppHandle, id: String, local_only: Option<bool>) -> Result<()> {
    let st = app.state::<AppState>();
    let store = st.store();
    let book = store.load_pdfs().into_iter().find(|p| p.id == id);
    let site = if local_only.unwrap_or(false) { None } else { st.session() };
    if let (Some(s), Some(b)) = (site, &book) {
        // ещё уходит на сайт — номера нет; фоновая отправка сама удалит его там по окончании
        let sid = pdfnet::resolve_site_id(&s.site, b).await?;
        if sid > 0 {
            s.site.post_json("pdf_del", &json!({ "id": sid })).await?;
        }
    }
    if let Some(p) = &book {
        if !p.file.trim().is_empty() {
            let _ = std::fs::remove_file(store.pdf_path(p));
        }
    }
    store.remove_cover(&id);
    store.edit_pdfs(|v| v.retain(|p| p.id != id))?;
    events::library_changed(&app);
    Ok(())
}

/// Память страницы: локально и на сайте.
#[tauri::command]
pub async fn pdf_page_set(state: State<'_, AppState>, id: String, page: i64) -> Result<()> {
    let page = page.max(0);
    settings::edit(&state.base, |s| {
        s.pdf_page.insert(id.clone(), page);
    })?;
    let site_id = state.store().edit_pdfs(|v| match v.iter_mut().find(|p| p.id == id) {
        Some(p) => {
            p.last_page = page;
            pdfnet::known_site_id(p)
        }
        None => 0,
    })?;
    if let Some(s) = state.session() {
        // номер на сайте надёжнее своего кода: PDF, пришедший с сайта без кода, живёт
        // здесь как «webp<номер>» — по такому коду сайт его не найдёт
        let body = if site_id > 0 { json!({ "id": site_id, "page": page }) } else { json!({ "ext_id": id, "page": page }) };
        let _ = s.site.post_json("pdf_page", &body).await;
    }
    Ok(())
}
