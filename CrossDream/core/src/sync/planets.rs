//! Места планет-локаций: тем же правилом «новее — главнее». Ключ — имя локации строчными.

use super::rule::{decide, Winner};
use super::Ctx;
use crate::error::Result;
use crate::jsonx;
use crate::model::PlanetPos;
use crate::site::SiteClient;
use crate::store::Store;
use serde_json::{json, Value};
use std::collections::BTreeSet;

/// Ключ планеты так, как его хранит сайт.
pub fn planet_key(s: &str) -> String {
    s.trim().to_lowercase()
}

/// Сверить планеты по уже скачанному ответу `dreams` (поле planets). true — что-то поменялось.
pub async fn sync(ctx: &Ctx<'_>, j: &Value) -> Result<bool> {
    let local = ctx.store.load_planets();
    let mut pull: Vec<(String, PlanetPos)> = vec![];
    let mut push: Vec<String> = vec![];
    let mut on_site: BTreeSet<String> = BTreeSet::new();
    for sp in jsonx::arr(j, "planets") {
        let key = jsonx::str_or(sp, "loc_key");
        if key.is_empty() {
            continue;
        }
        on_site.insert(key.clone());
        let site_xyz = match (jsonx::f(sp, "x"), jsonx::f(sp, "y"), jsonx::f(sp, "z")) {
            (Some(x), Some(y), Some(z)) => Some((x, y, z)),
            _ => None,
        };
        let site_t = jsonx::s(sp, "pos_time");
        let lp = local.get(&key);
        match decide(lp.is_some(), lp.map(|p| p.time.as_str()), site_xyz.is_some(), site_t.as_deref()) {
            Winner::Site => {
                let (x, y, z) = site_xyz.unwrap_or_default();
                pull.push((key, PlanetPos { x, y, z, time: site_t.unwrap_or_default() }));
            }
            Winner::Local => push.push(key),
            Winner::Same => {}
        }
    }
    // свои планеты, которых сайт ещё не знает
    push.extend(local.keys().filter(|k| !on_site.contains(*k)).cloned());
    let changed = !pull.is_empty() || !push.is_empty();
    if !pull.is_empty() {
        ctx.store.edit_planets(|m| {
            for (k, p) in pull {
                m.insert(k, p);
            }
        })?;
    }
    if !push.is_empty() {
        save(ctx.store, ctx.site, &push).await?;
    }
    Ok(changed)
}

/// Отправить места планет `keys` (save_planet_positions) и записать серверный штамп.
pub async fn save(store: &Store, site: &SiteClient, keys: &[String]) -> Result<()> {
    let local = store.load_planets();
    let items: Vec<Value> = keys
        .iter()
        .filter_map(|k| local.get(k).map(|p| json!({ "loc": k, "x": p.x, "y": p.y, "z": p.z })))
        .collect();
    if items.is_empty() {
        return Ok(());
    }
    let r = site.post_json("save_planet_positions", &json!({ "items": items })).await?;
    let time = jsonx::str_or(&r, "time");
    store.edit_planets(|m| {
        for k in keys {
            if let Some(p) = m.get_mut(k) {
                p.time = time.clone();
            }
        }
    })?;
    Ok(())
}
