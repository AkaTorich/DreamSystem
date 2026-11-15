//! Библиотека: раскладка по папкам, книги, инструменты сюиты, сохранение текста.

use crate::events;
use crate::state::AppState;
use dream_core::books;
use dream_core::util::safe_file_name;
use dream_core::{Error, Result};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, State};

/// Раскладка папок, сохранённая в профиле (с сайтом её сверяет sync_all); нет — null.
#[tauri::command]
pub fn lib_index(state: State<'_, AppState>) -> Value {
    state.store().load_lib_index()
}

/// `{path|null, books}`: books.json мода (Windows) либо книги с сайта из профиля.
#[tauri::command]
pub fn books_get(state: State<'_, AppState>) -> Value {
    let store = state.store();
    let file = books::locate(&store, &state.settings(), state.docs_dir.as_deref());
    let list = books::load(&file);
    let path = file.is_mod.then(|| file.path.to_string_lossy().into_owned());
    json!({ "path": path, "books": list })
}

#[tauri::command]
pub fn books_save(app: AppHandle, books: Vec<Value>) -> Result<()> {
    let st = app.state::<AppState>();
    let store = st.store();
    let file = books::locate(&store, &st.settings(), st.docs_dir.as_deref());
    books::save(&store, &file, &books)?;
    events::library_changed(&app);
    crate::autosync::soon(&app);
    Ok(())
}

/// Скачать инструмент сюиты в «Загрузки». Возвращает путь файла.
#[tauri::command]
pub async fn suite_download(state: State<'_, AppState>, id: i64, file_name: String) -> Result<String> {
    let site = state.site()?;
    let bytes = site.download(&format!("api.php?action=file_get&id={id}")).await?;
    if bytes.is_empty() {
        return Err(Error::msg("Сайт вернул пустой файл"));
    }
    std::fs::create_dir_all(&state.download_dir)?;
    let path = state.download_dir.join(safe_file_name(&file_name));
    std::fs::write(&path, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Прочитать текстовый файл, выбранный в диалоге открытия (BOM в начале снимается).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String> {
    let raw = std::fs::read(&path)?;
    let raw = raw.strip_prefix(b"\xEF\xBB\xBF".as_slice()).unwrap_or(&raw);
    String::from_utf8(raw.to_vec()).map_err(|_| Error::msg("Файл не в UTF-8"))
}

/// Записать текст в файл, выбранный в диалоге сохранения.
#[tauri::command]
pub fn save_text_file(path: String, text: String) -> Result<()> {
    if path.trim().is_empty() {
        return Err(Error::msg("Не задан путь"));
    }
    std::fs::write(path, text)?;
    Ok(())
}
