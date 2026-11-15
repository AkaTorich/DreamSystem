//! Картины снов: скачать с сайта (локальное имя = серверное, уже случайный хеш)
//! и дослать на сайт те, которых там нет (set_image).

use super::Ctx;
use crate::error::Result;
use crate::jsonx;
use crate::model::Dream;
use crate::site::FilePart;
use crate::store::assets::image_mime;
use crate::util::{safe_file_name, url_encode};
use serde_json::Value;
use std::collections::BTreeMap;

/// Скачать картину сайта, если её ещё нет. Возвращает локальное имя файла.
pub async fn fetch(ctx: &Ctx<'_>, file: &str) -> Result<String> {
    let name = safe_file_name(file);
    if ctx.store.image_path_by_name(&name).is_some() {
        return Ok(name);
    }
    let bytes = ctx.site.download(&format!("api.php?action=img&f={}", url_encode(file))).await?;
    ctx.store.save_image_named(&name, &bytes)
}

/// Картины к уже существующим снам. Возвращает (отправлено, [(локальный id, имя скачанного)]).
pub async fn sync_existing(
    ctx: &Ctx<'_>,
    local: &[Dream],
    site_dreams: &[Value],
    site_to_local: &BTreeMap<i64, String>,
) -> (usize, Vec<(String, String)>) {
    let mut up = 0;
    let mut down = vec![];
    let total = site_dreams.len().max(1);
    for (n, o) in site_dreams.iter().enumerate() {
        ctx.step(&format!("картины: сверяю {} из {}", n + 1, site_dreams.len()), 0.6 + 0.2 * (n + 1) as f64 / total as f64);
        let Some(sid) = jsonx::i(o, "id") else { continue };
        let Some(lid) = site_to_local.get(&sid) else { continue };
        let Some(ld) = local.iter().find(|d| &d.id == lid) else { continue };
        let site_img = jsonx::str_or(o, "image_file");
        let local_path = ctx.store.image_path(ld);
        match (site_img.is_empty(), local_path) {
            (true, Some(p)) => {
                let Ok(bytes) = std::fs::read(&p) else { continue };
                let part = FilePart::new("image", &ld.image_file, bytes, image_mime(&ld.image_file));
                if let Ok(r) = ctx.site.upload("set_image", vec![part], &[("id".into(), sid.to_string())]).await {
                    up += 1;
                    // сайт хранит картинку под своим именем — по нему и миниатюра для карты
                    let site_name = jsonx::str_or(&r, "image_file");
                    if !site_name.is_empty() {
                        let _ = super::thumbs::fetch(ctx.store, ctx.site, &ld.image_file, &site_name).await;
                    }
                }
            }
            (false, None) => {
                if let Ok(name) = fetch(ctx, &site_img).await {
                    down.push((lid.clone(), name));
                }
            }
            _ => {}
        }
    }
    (up, down)
}
