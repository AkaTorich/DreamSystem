//! Разбор сна ИИ через сайт (ключ ИИ живёт только на сервере):
//! ai_analyze → (картина) ai_image → (нити) ai_links, затем нити по общей локации.

use crate::error::{Error, Result};
use crate::jsonx;
use crate::model::{Analysis, Dream, Link};
use crate::ops::link_by_location;
use crate::site::SiteClient;
use crate::store::Store;
use crate::util::{same_loc, short_loc};
use base64::Engine;
use serde::Serialize;
use serde_json::{json, Map, Value};

/// Шаг разбора для события `pipeline://step`.
#[derive(Debug, Clone, Serialize)]
pub struct Step {
    /// "analysis" | "image" | "links"
    pub step: &'static str,
    /// "run" | "ok" | "fail"
    pub state: &'static str,
    pub text: String,
}

pub type StepFn<'a> = &'a (dyn Fn(Step) + Send + Sync);

fn emit(f: StepFn<'_>, step: &'static str, state: &'static str, text: impl Into<String>) {
    f(Step { step, state, text: text.into() });
}

pub async fn analyze(
    store: &Store,
    site: &SiteClient,
    id: &str,
    forced_location: Option<&str>,
    want_image: bool,
    on_step: StepFn<'_>,
) -> Result<Dream> {
    let all = store.load_dreams();
    let mut d = all.iter().find(|x| x.id == id).cloned().ok_or_else(|| Error::msg("Сон не найден"))?;

    // 1) разбор
    if d.analysis.is_none() {
        emit(on_step, "analysis", "run", "разбираю сон");
        match site_analyze(site, &d.text).await {
            Ok((a, prompt)) => {
                d.analysis = Some(a);
                d.image_prompt = prompt;
                emit(on_step, "analysis", "ok", "сон разобран");
            }
            Err(e) => emit(on_step, "analysis", "fail", format!("Анализ: {e}")),
        }
    } else {
        emit(on_step, "analysis", "ok", "разбор уже есть");
    }

    // выбранная прежняя локация: закрепляем её и наследуем её картину
    if let (Some(loc), Some(a)) = (forced_location.map(short_loc).filter(|l| !l.is_empty()), d.analysis.as_mut()) {
        a.location = loc.clone();
        if d.image_file.is_empty() {
            let donor = all.iter().find(|x| x.id != d.id && same_loc(x.location(), &loc) && store.image_path(x).is_some());
            if let Some(x) = donor {
                d.image_file = x.image_file.clone();
            }
        }
    }

    // 2) картина локации
    if d.image_file.is_empty() && !d.image_prompt.is_empty() && want_image {
        emit(on_step, "image", "run", "рисую локацию");
        match site_image(site, store, &d.image_prompt).await {
            Ok(file) => {
                d.image_file = file;
                emit(on_step, "image", "ok", "картина готова");
            }
            Err(e) => emit(on_step, "image", "fail", format!("Картинка: {e}")),
        }
    } else {
        let t = if d.image_file.is_empty() { "без картинки" } else { "картина есть" };
        emit(on_step, "image", "ok", t);
    }

    // 3) нити с прежними снами
    if let Some(a) = &d.analysis {
        emit(on_step, "links", "run", "ищу связи с прежними снами");
        match site_links(site, &d, a, &all).await {
            Ok(links) => {
                d.links = links;
                emit(on_step, "links", "ok", "связи найдены");
            }
            Err(e) => emit(on_step, "links", "fail", format!("Связи: {e}")),
        }
    }

    // записать: правим только то, что дал разбор (места на карте могли смениться)
    let saved = store.edit_dreams(|v| {
        if let Some(x) = v.iter_mut().find(|x| x.id == d.id) {
            x.analysis = d.analysis.clone();
            x.image_prompt = d.image_prompt.clone();
            x.image_file = d.image_file.clone();
            x.links = d.links.clone();
        }
        link_by_location(v, &d.id); // сны одной локации всегда в одной сети
        v.iter().find(|x| x.id == d.id).cloned()
    })?;
    let saved = saved.ok_or_else(|| Error::msg("Сон удалён во время разбора"))?;
    push_edit(store, site, &saved).await;
    Ok(saved)
}

/// Донести правку сна до сайта (edit_dream), если сон там уже есть. Ошибки молча.
pub async fn push_edit(store: &Store, site: &SiteClient, d: &Dream) {
    let Some(sid) = store.site_id_of(&d.id) else { return };
    let a = d.analysis.clone().unwrap_or_default();
    let body = json!({ "id": sid, "title": d.title, "text": d.text, "summary": a.summary, "location": a.location });
    let _ = site.post_json("edit_dream", &body).await;
}

async fn site_analyze(site: &SiteClient, text: &str) -> Result<(Analysis, String)> {
    let j = site.post_json("ai_analyze", &json!({ "text": text })).await?;
    let o = j.get("analysis").cloned().unwrap_or(Value::Null);
    let a = Analysis {
        summary: jsonx::str_or(&o, "summary"),
        location: short_loc(&jsonx::str_or(&o, "location")),
        characters: jsonx::strings(&o, "characters"),
        emotions: jsonx::strings(&o, "emotions"),
        symbols: jsonx::strings(&o, "symbols"),
        motifs: jsonx::strings(&o, "motifs"),
        extra: Map::new(),
    };
    Ok((a, jsonx::str_or(&o, "image_prompt")))
}

async fn site_image(site: &SiteClient, store: &Store, prompt: &str) -> Result<String> {
    let j = site.post_json("ai_image", &json!({ "prompt": prompt })).await?;
    let raw = base64::engine::general_purpose::STANDARD.decode(jsonx::str_or(&j, "image").trim())?;
    store.save_image(&raw)
}

fn brief(id: Option<&str>, title: &str, a: &Analysis) -> Value {
    let mut v = json!({
        "title": title, "summary": a.summary, "location": a.location, "characters": a.characters,
        "emotions": a.emotions, "symbols": a.symbols, "motifs": a.motifs,
    });
    if let Some(id) = id {
        v["id"] = Value::String(id.into());
    }
    v
}

async fn site_links(site: &SiteClient, d: &Dream, a: &Analysis, all: &[Dream]) -> Result<Vec<Link>> {
    let others: Vec<Value> = all
        .iter()
        .filter(|x| x.id != d.id)
        .filter_map(|x| x.analysis.as_ref().map(|xa| brief(Some(&x.id), &x.title, xa)))
        .collect();
    if others.is_empty() {
        return Ok(vec![]);
    }
    let j = site.post_json("ai_links", &json!({ "dream": brief(None, &d.title, a), "others": others })).await?;
    Ok(jsonx::arr(&j, "links")
        .iter()
        .map(|l| Link {
            id: jsonx::str_or(l, "id"),
            r#type: jsonx::str_or(l, "type"),
            reason: jsonx::str_or(l, "reason"),
            extra: Map::new(),
        })
        .collect())
}
