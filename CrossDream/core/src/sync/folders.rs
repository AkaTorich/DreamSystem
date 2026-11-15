//! Раскладка библиотеки по папкам: живёт на сайте, последний слепок (lib_index) — в профиле,
//! чтобы библиотека сразу открывалась с папками.

use super::Ctx;
use crate::error::Result;

/// true — раскладка на сайте отличается от сохранённой.
pub async fn sync(ctx: &Ctx<'_>) -> Result<bool> {
    let ix = ctx.site.get("lib_index").await?;
    if ix == ctx.store.load_lib_index() {
        return Ok(false);
    }
    ctx.store.save_lib_index(&ix)?;
    Ok(true)
}
