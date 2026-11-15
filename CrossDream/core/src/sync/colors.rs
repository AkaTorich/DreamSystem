//! Личная палитра (Settings.Colors): правка без связи уезжает на сайт, иначе главнее сайт.

use crate::error::Result;
use crate::site::SiteClient;
use crate::store::settings;
use serde_json::{json, Value};
use std::path::Path;

/// Палитра из `user.colors`: сайт хранит её JSON-строкой; пусто — null.
pub fn from_user(user: &Value) -> Value {
    match user.get("colors") {
        Some(Value::String(s)) if !s.trim().is_empty() => serde_json::from_str(s).unwrap_or(Value::Null),
        Some(v @ Value::Object(_)) => v.clone(),
        _ => Value::Null,
    }
}

/// Сверить палитру с пользователем из ответа login/me.
pub async fn apply(base: &Path, site: &SiteClient, user: &Value) -> Result<()> {
    if user.is_null() {
        return Ok(());
    }
    let s = settings::load(base);
    let remote = from_user(user);
    let local_has = s.colors.is_object();
    if s.colors_dirty || (remote.is_null() && local_has) {
        return push(base, site).await;
    }
    if !remote.is_null() && remote != s.colors {
        settings::edit(base, |s| s.colors = remote)?;
    }
    Ok(())
}

/// Отправить свою палитру (save_settings.colors); удалось — снять пометку правки без связи.
pub async fn push(base: &Path, site: &SiteClient) -> Result<()> {
    let s = settings::load(base);
    let colors = if s.colors.is_object() { s.colors.clone() } else { Value::Null };
    site.post_json("save_settings", &json!({ "colors": colors })).await?;
    settings::edit(base, |s| s.colors_dirty = false)?;
    Ok(())
}
