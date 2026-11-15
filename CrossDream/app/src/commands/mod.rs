//! Команды для интерфейса — ровно по docs\CONTRACT.md. Аргументы из JS приходят в camelCase.

pub mod covers;
pub mod dreams;
pub mod library;
pub mod pdf;
pub mod pdf_add;
pub mod places;
pub mod settings;
pub mod site;
pub mod suite;
pub mod sync;

use base64::Engine;
use dream_core::Result;

/// base64 из JS → байты (допускается и «data:…;base64,» в начале).
pub fn b64(s: &str) -> Result<Vec<u8>> {
    let s = s.trim();
    let s = match s.find(";base64,") {
        Some(i) if s.starts_with("data:") => &s[i + 8..],
        _ => s,
    };
    Ok(base64::engine::general_purpose::STANDARD.decode(s)?)
}

/// Текущее время UTC в виде штампа сайта — для правок без связи (сайт потом поставит свой).
pub fn now_stamp() -> String {
    chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()
}
