//! Личный вид карты (зум и сдвиг): «новее — главнее» по view_time аккаунта.

use super::rule::{decide, Winner};
use super::Ctx;
use crate::error::Result;
use crate::jsonx;
use crate::site::SiteClient;
use crate::store::settings;
use serde_json::{json, Value};
use std::path::Path;

/// Спросить `me` и сверить вид карты и палитру.
pub async fn sync(ctx: &Ctx<'_>) -> Result<()> {
    let me = ctx.site.get("me").await?;
    let user = me.get("user").unwrap_or(&Value::Null);
    apply(&ctx.store.base, ctx.site, user).await?;
    super::colors::apply(&ctx.store.base, ctx.site, user).await
}

pub async fn apply(base: &Path, site: &SiteClient, user: &Value) -> Result<()> {
    if user.is_null() {
        return Ok(());
    }
    let s = settings::load(base);
    let mv = jsonx::str_or(user, "map_view");
    let site_t = jsonx::s(user, "view_time");
    let local_has = s.map_zoom > 0.0 || s.map_pan_x.abs() > 0.001 || s.map_pan_y.abs() > 0.001;
    let local_t = (!s.view_time.is_empty()).then_some(s.view_time.as_str());
    match decide(local_has, local_t, !mv.is_empty(), site_t.as_deref()) {
        Winner::Site => {
            let v: Value = serde_json::from_str(&mv).unwrap_or(Value::Null);
            settings::edit(base, |s| {
                s.map_zoom = jsonx::f(&v, "zoom").unwrap_or(1.0);
                s.map_pan_x = jsonx::f(&v, "panx").unwrap_or(0.0);
                s.map_pan_y = jsonx::f(&v, "pany").unwrap_or(0.0);
                s.view_time = site_t.unwrap_or_default();
            })?;
        }
        Winner::Local => push(base, site).await?,
        Winner::Same => {}
    }
    Ok(())
}

/// Отправить свой вид на сайт (save_view) и запомнить серверный штамп.
pub async fn push(base: &Path, site: &SiteClient) -> Result<()> {
    let s = settings::load(base);
    let zoom = if s.map_zoom > 0.0 { s.map_zoom } else { 1.0 };
    let r = site
        .post_json("save_view", &json!({ "zoom": zoom, "panx": s.map_pan_x, "pany": s.map_pan_y }))
        .await?;
    let t = jsonx::str_or(&r, "time");
    settings::edit(base, |s| s.view_time = t)?;
    Ok(())
}
