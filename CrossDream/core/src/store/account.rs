//! Привязка данных к аккаунту: сны, записанные без входа (профиль `local`),
//! переезжают в профиль первого вошедшего — и только его (ProfileOwner).

use super::{settings, Store, LOCAL_PROFILE};
use crate::error::Result;
use crate::util::sanitize_login;
use serde_json::Value;
use std::path::Path;

const MOVABLE_FILES: [&str; 5] = ["dreams.json", "planets.json", "pdfs.json", "deleted.json", "vault.key"];
const MOVABLE_DIRS: [&str; 2] = ["images", "pdf"];

/// Открыть профиль аккаунта `login`; при первом входе забрать в него данные из `local`.
pub fn open_account(base: &Path, login: &str) -> Result<Store> {
    let p = sanitize_login(login);
    if p.is_empty() || p == LOCAL_PROFILE {
        return Store::open(base, LOCAL_PROFILE);
    }
    let dst = base.join("profiles").join(&p);
    let src = base.join("profiles").join(LOCAL_PROFILE);
    let fresh = !dst.join("dreams.json").exists() && !dst.join("vault.key").exists();
    if fresh && src.join("dreams.json").exists() {
        let s = settings::load(base);
        let owner = s.extra.get("ProfileOwner").and_then(|v| v.as_str()).map(sanitize_login).unwrap_or_default();
        if owner.is_empty() || owner == p {
            move_profile(&src, &dst);
            settings::edit(base, |s| {
                s.extra.insert("ProfileOwner".into(), Value::String(login.trim().to_string()));
            })?;
        }
    }
    let st = Store::open(base, &p)?;
    settings::edit(base, |s| s.profile = st.profile.clone())?;
    Ok(st)
}

/// Профиль, который открыть при запуске: по сохранённому логину, иначе последний открытый.
pub fn startup_profile(base: &Path) -> Result<Store> {
    let s = settings::load(base);
    if !s.site_login.trim().is_empty() {
        return Store::open(base, &s.site_login);
    }
    Store::open(base, &s.profile)
}

fn move_profile(src: &Path, dst: &Path) {
    let _ = std::fs::create_dir_all(dst);
    for f in MOVABLE_FILES {
        let a = src.join(f);
        if a.exists() {
            let _ = std::fs::rename(&a, dst.join(f));
        }
    }
    for d in MOVABLE_DIRS {
        let a = src.join(d);
        let b = dst.join(d);
        if !a.exists() {
            continue;
        }
        if b.exists() {
            // папка уже создана пустой — переносим файлы по одному
            if let Ok(rd) = std::fs::read_dir(&a) {
                for e in rd.flatten() {
                    let _ = std::fs::rename(e.path(), b.join(e.file_name()));
                }
            }
        } else {
            let _ = std::fs::rename(&a, &b);
        }
    }
}
