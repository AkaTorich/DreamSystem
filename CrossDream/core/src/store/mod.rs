//! Хранилище на диске. Корень данных (`base`) общий: там `settings.json`.
//! Всё содержимое — в профиле аккаунта `base/profiles/<логин>`, чтобы сны разных
//! участников никогда не смешивались на одной машине. Без входа — профиль `local`.
//!
//! В профиле: dreams.json, planets.json, pdfs.json, deleted.json (надгробия), site_ids.json,
//! lib_index.json, books.json (книги с сайта), auth.dat, vault.key, images\, pdf\, covers\, thumbs\, cache\.

pub mod account;
pub mod assets;
pub mod creds;
pub mod data;
pub mod files;
pub mod settings;

use crate::error::Result;
use crate::vault::Vault;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

pub const LOCAL_PROFILE: &str = "local";

pub struct Store {
    pub base: PathBuf,
    pub profile: String,
    lock: Mutex<()>,
    vault: OnceLock<Vault>,
}

impl Store {
    /// Открыть профиль (папки создаются). Пустое имя — профиль `local`.
    pub fn open(base: &Path, profile: &str) -> Result<Self> {
        let profile = crate::util::sanitize_login(profile);
        let profile = if profile.is_empty() { LOCAL_PROFILE.to_string() } else { profile };
        let st = Store { base: base.to_path_buf(), profile, lock: Mutex::new(()), vault: OnceLock::new() };
        std::fs::create_dir_all(st.images_dir())?;
        std::fs::create_dir_all(st.pdf_dir())?;
        Ok(st)
    }

    pub fn dir(&self) -> PathBuf {
        self.base.join("profiles").join(&self.profile)
    }
    pub fn file(&self, name: &str) -> PathBuf {
        self.dir().join(name)
    }
    pub fn images_dir(&self) -> PathBuf {
        self.dir().join("images")
    }
    pub fn pdf_dir(&self) -> PathBuf {
        self.dir().join("pdf")
    }
    pub fn cache_dir(&self) -> PathBuf {
        self.dir().join("cache")
    }

    /// Ключ профиля (загружается один раз).
    pub fn vault(&self) -> Result<&Vault> {
        if let Some(v) = self.vault.get() {
            return Ok(v);
        }
        let v = Vault::open(&self.dir())?;
        Ok(self.vault.get_or_init(|| v))
    }

    /// Замок «прочитать-поправить-записать» для файлов профиля.
    /// После сбоя другого потока замок не отравлен: файлы пишутся атомарно.
    pub(crate) fn guard(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }
}
