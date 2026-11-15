//! Нити между снами: вниз — с сайта те, которых нет здесь; наверх — пачками по сотне (add_links).

use super::Ctx;
use crate::jsonx;
use crate::model::{Dream, Link};
use crate::store::data::SiteIds;
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, HashSet};

/// Добавить в сны нити сайта, которых нет ни с одной стороны. Возвращает число добавленных.
pub fn merge_down(dreams: &mut [Dream], site_links: &[Value], site_to_local: &BTreeMap<i64, String>) -> usize {
    let mut added = 0;
    for l in site_links {
        let (Some(a), Some(b)) = (jsonx::i(l, "dream_a"), jsonx::i(l, "dream_b")) else { continue };
        let (Some(la), Some(lb)) = (site_to_local.get(&a), site_to_local.get(&b)) else { continue };
        let ty = jsonx::str_or(l, "type");
        let (Some(ia), Some(ib)) = (dreams.iter().position(|d| &d.id == la), dreams.iter().position(|d| &d.id == lb))
        else {
            continue;
        };
        let exists = dreams[ia].links.iter().any(|x| &x.id == lb && x.r#type == ty)
            || dreams[ib].links.iter().any(|x| &x.id == la && x.r#type == ty);
        if !exists {
            dreams[ia].links.push(Link { id: lb.clone(), r#type: ty, reason: jsonx::str_or(l, "reason"), extra: Map::new() });
            added += 1;
        }
    }
    added
}

fn key(a: i64, b: i64, ty: &str) -> String {
    format!("{}|{}|{}", a.min(b), a.max(b), ty)
}

/// Отправить свои нити, которых ещё нет на сайте. Возвращает число принятых сайтом.
pub async fn push_up(ctx: &Ctx<'_>, dreams: &[Dream], site_links: &[Value], ids: &SiteIds) -> i64 {
    let mut on_site: HashSet<String> = HashSet::new();
    for l in site_links {
        if let (Some(a), Some(b)) = (jsonx::i(l, "dream_a"), jsonx::i(l, "dream_b")) {
            on_site.insert(key(a, b, &jsonx::str_or(l, "type")));
        }
    }
    let mut items: Vec<Value> = vec![];
    for d in dreams {
        let Some(&a) = ids.get(&d.id) else { continue }; // сна ещё нет на сайте
        for l in &d.links {
            let Some(&b) = ids.get(&l.id) else { continue };
            if a == b || !on_site.insert(key(a, b, &l.r#type)) {
                continue;
            }
            items.push(json!({ "a": a, "b": b, "type": l.r#type, "reason": l.reason }));
        }
    }
    if items.is_empty() {
        return 0;
    }
    ctx.step(&format!("нити: отправляю на сайт — {}", items.len()), 0.85);
    let mut added = 0;
    for chunk in items.chunks(100) {
        if let Ok(r) = ctx.site.post_json("add_links", &json!({ "items": chunk })).await {
            added += jsonx::i(&r, "added").unwrap_or(0);
        }
    }
    added
}
