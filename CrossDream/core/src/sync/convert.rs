//! Сон с сайта → сон программы.

use crate::jsonx;
use crate::model::{Analysis, Dream};
use crate::util::short_loc;
use serde_json::{Map, Value};

/// Локальный id сна сайта: его ext_id (id программы) либо «web<id>».
pub fn local_id(o: &Value) -> String {
    match jsonx::s(o, "ext_id") {
        Some(e) if !e.is_empty() => e,
        _ => format!("web{}", jsonx::str_or(o, "id")),
    }
}

pub fn dream_from_site(o: &Value) -> Dream {
    let summary = jsonx::str_or(o, "summary");
    let location = jsonx::str_or(o, "location");
    let analysis = if summary.is_empty() && location.is_empty() {
        None
    } else {
        Some(Analysis {
            summary,
            location: short_loc(&location),
            characters: jsonx::strings(o, "characters"),
            emotions: jsonx::strings(o, "emotions"),
            symbols: jsonx::strings(o, "symbols"),
            motifs: jsonx::strings(o, "motifs"),
            extra: Map::new(),
        })
    };
    let title = jsonx::s(o, "title").filter(|t| !t.is_empty()).unwrap_or_else(|| "Сон без имени".into());
    Dream {
        id: local_id(o),
        title,
        date: jsonx::str_or(o, "dream_date"),
        text: jsonx::str_or(o, "text"),
        analysis,
        image_prompt: jsonx::str_or(o, "image_prompt"),
        image_file: String::new(),
        links: vec![],
        pos_x: jsonx::f(o, "pos_x"),
        pos_y: jsonx::f(o, "pos_y"),
        pos_z: jsonx::f(o, "pos_z"),
        pos_time: jsonx::s(o, "pos_time"),
        extra: Map::new(),
    }
}
