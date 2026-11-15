//! Разовый перенос из старой WPF-программы (%APPDATA%\DreamMap): сны, картинки, планеты,
//! надгробия, память страниц и PDF (старые .enc расшифровываются ключом key.dat под DPAPI).
//! Только Windows; на прочих системах — нули.

pub mod cbc;

use crate::error::Result;
use crate::model::{Dream, PdfBook, Settings};
use crate::store::files::read_json_lenient;
use crate::store::{settings, Store};
use crate::util::sanitize_login;
use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Default, Clone, Serialize)]
pub struct LegacyReport {
    pub dreams: usize,
    pub pdfs: usize,
    pub images: usize,
}

/// Перенести данные старой программы для аккаунта `login` в текущий профиль.
pub fn import(store: &Store, login: &str) -> Result<LegacyReport> {
    #[cfg(windows)]
    {
        let Some(app) = std::env::var_os("APPDATA") else { return Ok(LegacyReport::default()) };
        let base = PathBuf::from(app).join("DreamMap");
        match old_profile_dir(&base, login) {
            Some(dir) => import_from(store, &base, &dir),
            None => Ok(LegacyReport::default()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (store, login);
        Ok(LegacyReport::default())
    }
}

/// Профиль старой программы: по логину, иначе корень (данные до разделения по аккаунтам).
pub fn old_profile_dir(base: &Path, login: &str) -> Option<PathBuf> {
    let p = sanitize_login(login);
    if !p.is_empty() {
        let d = base.join("profiles").join(&p);
        if d.join("dreams.json").exists() {
            return Some(d);
        }
    }
    base.join("dreams.json").exists().then(|| base.to_path_buf())
}

/// Перенос из выбранного файла dreams.json (например, с другой машины). Рядом с ним берутся
/// images\, planets.json, deleted.json, pdfs.json и pdf\, если они есть. Работает на любой системе;
/// старые зашифрованные PDF открываются только на Windows той же учётной записи.
pub fn import_file(store: &Store, dreams_file: &Path) -> Result<LegacyReport> {
    if !dreams_file.is_file() {
        return Err(crate::error::Error::msg("Файл снов не найден"));
    }
    let dir = dreams_file.parent().unwrap_or(Path::new("."));
    import_inner(store, dir, dir, dreams_file)
}

/// Перенос из папки `dir` (её корень данных — `old_base`, там settings.json).
pub fn import_from(store: &Store, old_base: &Path, dir: &Path) -> Result<LegacyReport> {
    import_inner(store, old_base, dir, &dir.join("dreams.json"))
}

fn import_inner(store: &Store, old_base: &Path, dir: &Path, dreams_file: &Path) -> Result<LegacyReport> {
    let mut rep = LegacyReport::default();

    let old: Vec<Dream> = crate::store::files::read_json(dreams_file)?;
    rep.dreams = store.edit_dreams(|v| {
        let mut n = 0;
        for d in old {
            if !d.id.is_empty() && !v.iter().any(|x| x.id == d.id) {
                v.push(d);
                n += 1;
            }
        }
        v.sort_by(|a, b| a.date.cmp(&b.date));
        n
    })?;

    rep.images = copy_missing(&dir.join("images"), &store.images_dir());

    let planets: BTreeMap<String, crate::model::PlanetPos> = read_json_lenient(&dir.join("planets.json"));
    if !planets.is_empty() {
        store.edit_planets(|m| {
            for (k, p) in planets {
                m.entry(k).or_insert(p);
            }
        })?;
    }

    let graves: Vec<String> = read_json_lenient(&dir.join("deleted.json"));
    if !graves.is_empty() {
        store.add_graves(&graves)?;
    }

    let old_settings: Settings = read_json_lenient(&old_base.join("settings.json"));
    if !old_settings.pdf_page.is_empty() {
        settings::edit(&store.base, |s| {
            for (k, p) in &old_settings.pdf_page {
                s.pdf_page.entry(k.clone()).or_insert(*p);
            }
        })?;
    }

    rep.pdfs = import_pdfs(store, dir)?;
    Ok(rep)
}

fn copy_missing(from: &Path, to: &Path) -> usize {
    let Ok(rd) = std::fs::read_dir(from) else { return 0 };
    let mut n = 0;
    for e in rd.flatten() {
        let dst = to.join(e.file_name());
        if e.path().is_file() && !dst.exists() && std::fs::copy(e.path(), &dst).is_ok() {
            n += 1;
        }
    }
    n
}

fn import_pdfs(store: &Store, dir: &Path) -> Result<usize> {
    let old: Vec<PdfBook> = read_json_lenient(&dir.join("pdfs.json"));
    let have: Vec<String> = store.load_pdfs().into_iter().map(|p| p.id).collect();
    let mut fresh = vec![];
    for p in old.into_iter().filter(|p| !p.id.is_empty() && !have.contains(&p.id)) {
        let path = dir.join("pdf").join(crate::util::safe_file_name(&p.file));
        let Ok(raw) = std::fs::read(&path) else { continue };
        let plain = if p.file.ends_with(".enc") {
            match old_key(dir).and_then(|k| cbc::decrypt(&k, &raw)) {
                Ok(b) => b,
                Err(_) => continue,
            }
        } else {
            raw
        };
        let file = store.stash_pdf(&p.id, &plain)?;
        fresh.push(PdfBook { file, ..p });
    }
    let n = fresh.len();
    if n > 0 {
        store.edit_pdfs(|v| v.extend(fresh))?;
    }
    Ok(n)
}

/// Ключ старого профиля: key.dat, запечатанный DPAPI с энтропией старой программы.
#[cfg(windows)]
fn old_key(dir: &Path) -> Result<[u8; 32]> {
    let sealed = std::fs::read(dir.join("key.dat"))?;
    let k = crate::vault::dpapi::unprotect(&sealed, "DreamMap·врата·снов·2026".as_bytes())?;
    k.try_into().map_err(|_| crate::error::Error::Crypto("старый ключ повреждён".into()))
}

#[cfg(not(windows))]
fn old_key(_dir: &Path) -> Result<[u8; 32]> {
    Err(crate::error::Error::Crypto("старые PDF открываются только на Windows".into()))
}
