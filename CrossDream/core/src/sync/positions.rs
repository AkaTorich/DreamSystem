//! Места снов на карте: правило «новее — главнее» по pos_time (штамп ставит сервер).

use super::convert::local_id;
use super::rule::{decide, Winner};
use super::Ctx;
use crate::error::Result;
use crate::jsonx;
use crate::site::SiteClient;
use crate::store::data::SiteIds;
use crate::store::Store;
use serde_json::{json, Value};

/// Место сна: координаты или None (сброс на орбиту).
pub type Place = (String, Option<[f64; 3]>);

/// Сверить места по уже скачанному списку снов сайта. true — что-то поменялось.
pub async fn sync(ctx: &Ctx<'_>, j: &Value, ids: &SiteIds) -> Result<bool> {
    let local = ctx.store.load_dreams();
    let mut pull: Vec<(String, [f64; 3], Option<String>)> = vec![];
    let mut push: Vec<Place> = vec![];
    for o in jsonx::arr(j, "dreams") {
        let lid = local_id(o);
        if !ids.contains_key(&lid) {
            continue;
        }
        let Some(d) = local.iter().find(|d| d.id == lid) else { continue };
        let site_xyz = match (jsonx::f(o, "pos_x"), jsonx::f(o, "pos_y"), jsonx::f(o, "pos_z")) {
            (Some(x), Some(y), Some(z)) => Some([x, y, z]),
            _ => None,
        };
        let site_t = jsonx::s(o, "pos_time");
        match decide(d.pos_x.is_some(), d.pos_time.as_deref(), site_xyz.is_some(), site_t.as_deref()) {
            Winner::Local => push.push((lid, Some([d.pos_x.unwrap_or(0.0), d.pos_y.unwrap_or(0.0), d.pos_z.unwrap_or(0.0)]))),
            Winner::Site => pull.push((lid, site_xyz.unwrap_or_default(), site_t)),
            Winner::Same => {}
        }
    }
    let mut changed = false;
    if !pull.is_empty() {
        ctx.store.edit_dreams(|v| {
            for (lid, p, t) in &pull {
                if let Some(d) = v.iter_mut().find(|d| &d.id == lid) {
                    (d.pos_x, d.pos_y, d.pos_z, d.pos_time) = (Some(p[0]), Some(p[1]), Some(p[2]), t.clone());
                }
            }
        })?;
        changed = true;
    }
    if !push.is_empty() {
        save(ctx.store, ctx.site, &push).await?;
        changed = true;
    }
    Ok(changed)
}

/// Отправить места на сайт (save_positions) и записать серверный штамп в свои сны.
/// Сны, которых ещё нет на сайте, пропускаются — их места уедут при синхронизации.
pub async fn save(store: &Store, site: &SiteClient, items: &[Place]) -> Result<()> {
    let ids = store.load_site_ids();
    let mut sent: Vec<&str> = vec![];
    let mut out: Vec<Value> = vec![];
    for (lid, p) in items {
        let Some(sid) = ids.get(lid).copied().or_else(|| lid.strip_prefix("web").and_then(|n| n.parse().ok())) else {
            continue;
        };
        out.push(match p {
            Some([x, y, z]) => json!({ "id": sid, "x": x, "y": y, "z": z }),
            None => json!({ "id": sid, "x": null, "y": null, "z": null }),
        });
        sent.push(lid);
    }
    if out.is_empty() {
        return Ok(());
    }
    let r = site.post_json("save_positions", &json!({ "items": out })).await?;
    let time = jsonx::s(&r, "time");
    store.edit_dreams(|v| {
        for d in v.iter_mut().filter(|d| sent.contains(&d.id.as_str())) {
            d.pos_time = time.clone();
        }
    })?;
    Ok(())
}
