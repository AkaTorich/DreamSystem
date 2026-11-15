//! Общие настройки `base/settings.json` (одни на все профили).

use super::files::{read_json_lenient, write_json};
use crate::error::Result;
use crate::model::Settings;
use std::path::Path;
use std::sync::Mutex;

static LOCK: Mutex<()> = Mutex::new(());

fn path(base: &Path) -> std::path::PathBuf {
    base.join("settings.json")
}

pub fn load(base: &Path) -> Settings {
    read_json_lenient(&path(base))
}

pub fn save(base: &Path, s: &Settings) -> Result<()> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    write_json(&path(base), s)
}

/// Прочитать, поправить, записать — под замком.
pub fn edit<R>(base: &Path, f: impl FnOnce(&mut Settings) -> R) -> Result<R> {
    let _g = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut s: Settings = read_json_lenient(&path(base));
    let r = f(&mut s);
    write_json(&path(base), &s)?;
    Ok(r)
}

/// Настройки для интерфейса: без пароля (он и так не сериализуется) и без служебного.
pub fn for_ui(s: &Settings) -> Settings {
    let mut s = s.clone();
    s.legacy_pass.clear();
    s.extra.remove("SitePass");
    s
}
