//! Сны: наверх новые (import с картинками), надгробия (del_dream), вниз новые с сайта,
//! затем картины, нити и места на карте.

use super::convert::{dream_from_site, local_id};
use super::{images, links, planets, positions, thumbs, Ctx};
use crate::error::Result;
use crate::jsonx;
use crate::model::Dream;
use crate::site::FilePart;
use crate::store::data::SiteIds;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashSet};

#[derive(Debug, Default)]
pub struct DreamsOutcome {
    pub pushed: i64,
    pub pulled: usize,
    pub links_up: i64,
    pub links_down: usize,
    pub img_up: usize,
    pub img_down: usize,
    /// скачано миниатюр для карты
    pub thumbs: usize,
    pub places_changed: bool,
}

impl DreamsOutcome {
    pub fn changed(&self) -> bool {
        self.pulled > 0 || self.links_down > 0 || self.img_down > 0 || self.thumbs > 0 || self.places_changed
    }

    pub fn summary(&self) -> String {
        let mut s = format!("сны: на сайт → {}, с сайта ← {}", self.pushed, self.pulled);
        if self.links_up > 0 {
            s += &format!(", нитей наверх → {}", self.links_up);
        }
        if self.img_up + self.img_down > 0 {
            s += &format!(", картин ↑{} ↓{}", self.img_up, self.img_down);
        }
        if self.thumbs > 0 {
            s += &format!(", миниатюр ↓{}", self.thumbs);
        }
        s
    }
}

pub async fn sync(ctx: &Ctx<'_>) -> Result<DreamsOutcome> {
    let mut out = DreamsOutcome::default();
    ctx.step("сны: сверяю список с сайтом", 0.02);
    let mut j = ctx.site.get("dreams").await?;
    let graves = ctx.store.load_graves();
    let local = ctx.store.load_dreams();

    // 1) наверх: свои сны, которых нет на сайте
    if let Some(n) = push_new(ctx, &local, &j, &graves).await? {
        out.pushed = n;
        j = ctx.site.get("dreams").await?; // новым снам нужны их id на сайте
    }
    let site_dreams = jsonx::arr(&j, "dreams");

    // 2) надгробия доводим до сайта, остальным — соответствие id
    let mut ids = SiteIds::new();
    let mut site_to_local: BTreeMap<i64, String> = BTreeMap::new();
    for o in site_dreams {
        let (lid, Some(sid)) = (local_id(o), jsonx::i(o, "id")) else { continue };
        if graves.contains(&lid) {
            let _ = ctx.site.post_json("del_dream", &json!({ "id": sid })).await;
            continue;
        }
        ids.insert(lid.clone(), sid);
        site_to_local.insert(sid, lid);
    }
    ctx.store.save_site_ids(&ids)?;

    // 3) вниз: сны сайта, которых нет здесь (картины качаем до записи списка)
    let known: HashSet<&str> = local.iter().map(|d| d.id.as_str()).collect();
    let total = site_dreams.len().max(1);
    let mut fresh: Vec<Dream> = vec![];
    for (n, o) in site_dreams.iter().enumerate() {
        ctx.step(&format!("сны: сверяю с сайтом {} из {}", n + 1, site_dreams.len()), 0.3 + 0.3 * (n + 1) as f64 / total as f64);
        let lid = local_id(o);
        if graves.contains(&lid) || known.contains(lid.as_str()) {
            continue;
        }
        let mut nd = dream_from_site(o);
        let img = jsonx::str_or(o, "image_file");
        if !img.is_empty() {
            if let Ok(name) = images::fetch(ctx, &img).await {
                nd.image_file = name;
            }
        }
        fresh.push(nd);
    }

    // 4) картины к уже имеющимся снам: чего нет на одной стороне — берётся с другой
    let (img_up, img_down) = images::sync_existing(ctx, &local, site_dreams, &site_to_local).await;
    out.img_up = img_up;
    out.img_down = img_down.len();

    // 5) слить под замком: новые сны, картины, нити с сайта
    let site_links = jsonx::arr(&j, "links");
    let (merged, pulled, links_down) = ctx.store.edit_dreams(|v| {
        let mut pulled = 0;
        for nd in fresh {
            if !v.iter().any(|d| d.id == nd.id) {
                v.push(nd);
                pulled += 1;
            }
        }
        for (lid, name) in &img_down {
            if let Some(d) = v.iter_mut().find(|d| &d.id == lid) {
                d.image_file = name.clone();
            }
        }
        let ld = links::merge_down(v, site_links, &site_to_local);
        v.sort_by(|a, b| a.date.cmp(&b.date));
        (v.clone(), pulled, ld)
    })?;
    out.pulled = pulled;
    out.links_down = links_down;

    // 5½) миниатюры картинок для карты
    out.thumbs = thumbs::sync(ctx, &merged, site_dreams, &site_to_local).await;

    // 6) нити наверх: свои связи, которых ещё нет на сайте
    out.links_up = links::push_up(ctx, &merged, site_links, &ids).await;

    // 7) места снов и планет — «новее — главнее»
    ctx.step("места снов на карте", 0.93);
    out.places_changed = positions::sync(ctx, &j, &ids).await?;
    out.places_changed |= planets::sync(ctx, &j).await?;
    ctx.step("сны сверены", 1.0);
    Ok(out)
}

/// Отправить import со своими новыми снами и их картинками. None — отправлять нечего.
async fn push_new(ctx: &Ctx<'_>, local: &[Dream], j: &Value, graves: &BTreeSet<String>) -> Result<Option<i64>> {
    let mut by_ext: HashSet<String> = HashSet::new();
    let mut site_ids: HashSet<String> = HashSet::new();
    for o in jsonx::arr(j, "dreams") {
        site_ids.insert(jsonx::str_or(o, "id"));
        if let Some(e) = jsonx::s(o, "ext_id").filter(|e| !e.is_empty()) {
            by_ext.insert(e);
        }
    }
    let to_push: Vec<&Dream> = local
        .iter()
        .filter(|d| !d.id.is_empty() && !d.text.trim().is_empty() && !graves.contains(&d.id))
        .filter(|d| !by_ext.contains(&d.id))
        .filter(|d| !d.id.strip_prefix("web").is_some_and(|n| site_ids.contains(n)))
        .collect();
    if to_push.is_empty() {
        return Ok(None);
    }
    ctx.step(&format!("сны: отправляю на сайт новые — {}", to_push.len()), 0.1);
    let mut files = vec![FilePart::new("dreams", "dreams.json", serde_json::to_vec(&to_push)?, "application/json")];
    let mut sent: HashSet<&str> = HashSet::new();
    for d in &to_push {
        if let Some(p) = ctx.store.image_path(d) {
            if sent.insert(d.image_file.as_str()) {
                if let Ok(bytes) = std::fs::read(&p) {
                    files.push(FilePart::new("images[]", &d.image_file, bytes, "image/jpeg"));
                }
            }
        }
    }
    let r = ctx.site.upload("import", files, &[]).await?;
    Ok(Some(jsonx::i(&r, "added").unwrap_or(0)))
}
