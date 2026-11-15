//! Правки списка снов, общие для команд и разбора ИИ: нити по общей локации, удаление.

use crate::model::{Dream, Link};
use crate::util::same_loc;
use serde_json::Map;

pub const LOC: &str = "локация";

/// Новые нити «локация» от сна `idx` к снам той же локации (без уже имеющихся).
pub fn location_links(dreams: &[Dream], idx: usize) -> Vec<Link> {
    let d = &dreams[idx];
    let loc = d.location().to_string();
    if loc.is_empty() {
        return vec![];
    }
    dreams
        .iter()
        .filter(|o| o.id != d.id && same_loc(o.location(), &loc))
        .filter(|o| {
            !d.links.iter().any(|l| l.id == o.id && l.r#type == LOC)
                && !o.links.iter().any(|l| l.id == d.id && l.r#type == LOC)
        })
        .map(|o| Link {
            id: o.id.clone(),
            r#type: LOC.into(),
            reason: format!("та же локация — {loc}"),
            extra: Map::new(),
        })
        .collect()
}

/// Сцепить сон с одноместными снами: без ИИ этого довольно, чтобы карта жила.
pub fn link_by_location(dreams: &mut [Dream], id: &str) {
    if let Some(i) = dreams.iter().position(|d| d.id == id) {
        let add = location_links(dreams, i);
        dreams[i].links.extend(add);
    }
}

/// Локация сна сменилась: старые нити «локация» (свои и входящие) снимаются, вяжутся новые.
pub fn relink_location(dreams: &mut [Dream], id: &str) {
    for d in dreams.iter_mut() {
        if d.id == id {
            d.links.retain(|l| l.r#type != LOC);
        } else {
            d.links.retain(|l| !(l.id == id && l.r#type == LOC));
        }
    }
    link_by_location(dreams, id);
}

/// Убрать сон и все нити к нему. Возвращает удалённый сон.
pub fn remove_dream(dreams: &mut Vec<Dream>, id: &str) -> Option<Dream> {
    let i = dreams.iter().position(|d| d.id == id)?;
    let d = dreams.remove(i);
    for x in dreams.iter_mut() {
        x.links.retain(|l| l.id != id);
    }
    Some(d)
}
