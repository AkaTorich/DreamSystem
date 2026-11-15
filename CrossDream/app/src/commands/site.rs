//! Сайт: состояние входа, вход/выход, произвольный вызов api.php, отправка и скачивание файлов.

use super::b64;
use crate::auth::{self, Credentials};
use crate::state::AppState;
use dream_core::site::FilePart;
use dream_core::store::assets::image_ext;
use dream_core::util::{fnv_hex, safe_file_name};
use dream_core::{Error, Result};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn site_state(state: State<'_, AppState>) -> Value {
    let s = state.session();
    json!({
        "online": s.is_some(),
        "user": s.map(|s| s.user).unwrap_or(Value::Null),
        "server": state.settings().server(),
    })
}

#[tauri::command]
pub async fn site_login(
    app: AppHandle,
    server: String,
    login: String,
    pass: String,
    invite: Option<String>,
    remember: Option<bool>,
) -> Result<Value> {
    let c = Credentials { server, login, pass, invite: invite.unwrap_or_default(), remember: remember.unwrap_or(true) };
    let user = auth::login(&app, c).await?;
    // после входа — всё своё с сайта, в фоне
    let a = app.clone();
    tauri::async_runtime::spawn(async move {
        super::sync::run_sync(&a).await;
    });
    Ok(user)
}

#[tauri::command]
pub async fn site_logout(app: AppHandle) -> Result<()> {
    auth::logout(&app).await
}

#[tauri::command]
pub async fn site_call(state: State<'_, AppState>, action: String, method: Option<String>, body: Option<Value>) -> Result<Value> {
    let site = state.site_any()?;
    match method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_str() {
        "POST" => site.post_json(&action, &body.unwrap_or(Value::Null)).await,
        _ => site.get(&action).await,
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn site_upload(
    state: State<'_, AppState>,
    action: String,
    field: String,
    file_name: String,
    bytes_b64: String,
    extra: Option<Map<String, Value>>,
    mime: Option<String>,
) -> Result<Value> {
    let site = state.site_any()?;
    let bytes = b64(&bytes_b64)?;
    let mime = mime.filter(|m| !m.is_empty()).unwrap_or_else(|| "application/octet-stream".into());
    let fields: Vec<(String, String)> = extra
        .unwrap_or_default()
        .into_iter()
        .map(|(k, v)| (k, v.as_str().map(str::to_string).unwrap_or_else(|| v.to_string())))
        .collect();
    site.upload(&action, vec![FilePart::new(&field, &file_name, bytes, &mime)], &fields).await
}

/// Скачать файл сайта в кеш профиля; картинки снов (`img&f=`) берутся из кеша без повторной загрузки.
#[tauri::command]
pub async fn site_download(state: State<'_, AppState>, rel: String) -> Result<String> {
    let site = state.site_any()?;
    let store = state.store();
    let dir = store.cache_dir();
    std::fs::create_dir_all(&dir)?;
    // маленькая копия для карты (`&s=1`) кладётся под своим именем
    let thumb = if query_value(&rel, "s").is_some() { "s_" } else { "" };
    let named = query_value(&rel, "f").map(|f| format!("{thumb}{}", safe_file_name(&f)));
    if let Some(n) = &named {
        let p = dir.join(n);
        if p.exists() {
            return Ok(p.to_string_lossy().into_owned());
        }
    }
    let bytes = site.download(&rel).await?;
    if bytes.is_empty() {
        return Err(Error::msg("Сайт вернул пустой файл"));
    }
    let name = named.unwrap_or_else(|| {
        let ext = if bytes.starts_with(b"%PDF") { "pdf" } else { image_ext(&bytes) };
        format!("{}.{ext}", fnv_hex(&rel))
    });
    let p = dir.join(name);
    std::fs::write(&p, &bytes)?;
    Ok(p.to_string_lossy().into_owned())
}

/// Значение параметра строки запроса (без раскодирования %XX, кроме самых частых).
fn query_value(rel: &str, key: &str) -> Option<String> {
    let q = rel.split_once('?').map(|(_, q)| q).unwrap_or(rel);
    q.split('&')
        .filter_map(|kv| kv.split_once('='))
        .find(|(k, _)| *k == key)
        .map(|(_, v)| v.replace("%2F", "/").replace("%2E", ".").replace("%20", " "))
        .filter(|v| !v.is_empty())
}
