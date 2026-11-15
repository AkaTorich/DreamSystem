//! Общее состояние: корень данных, текущий профиль, сессия сайта, флаг синхронизации.

use dream_core::store::{account, settings};
use dream_core::{Error, Result, Settings, SiteClient, Store};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};

/// Замок по ключу (PDF — его id, миниатюра — «thumb:<имя>»): два одновременных запроса
/// не качают одно и то же дважды.
pub type PdfLock = Arc<tauri::async_runtime::Mutex<()>>;

/// Вход на сайт: клиент с cookie-сессией и пользователь из ответа login.
#[derive(Clone)]
pub struct Session {
    pub site: SiteClient,
    pub user: Value,
}

pub struct AppState {
    /// корень данных (`app_data_dir`): settings.json и profiles\
    pub base: PathBuf,
    /// «Документы» — для books.json мода на Windows
    pub docs_dir: Option<PathBuf>,
    /// куда класть скачанные инструменты сюиты
    pub download_dir: PathBuf,
    store: RwLock<Arc<Store>>,
    session: RwLock<Option<Session>>,
    pub syncing: AtomicBool,
    pdf_locks: Mutex<HashMap<String, PdfLock>>,
    /// миниатюры, которых сайт не отдал в этот запуск, — не спрашивать снова на каждой перерисовке карты
    thumb_misses: Mutex<HashSet<String>>,
}

impl AppState {
    pub fn open(base: PathBuf, docs_dir: Option<PathBuf>, download_dir: PathBuf) -> Result<Self> {
        std::fs::create_dir_all(&base)?;
        let store = account::startup_profile(&base)?;
        Ok(AppState {
            base,
            docs_dir,
            download_dir,
            store: RwLock::new(Arc::new(store)),
            session: RwLock::new(None),
            syncing: AtomicBool::new(false),
            pdf_locks: Mutex::new(HashMap::new()),
            thumb_misses: Mutex::new(HashSet::new()),
        })
    }

    /// Текущий профиль (копия ссылки: смена профиля не мешает уже начатой работе).
    pub fn store(&self) -> Arc<Store> {
        self.store.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_store(&self, s: Arc<Store>) {
        *self.store.write().unwrap_or_else(|e| e.into_inner()) = s;
    }

    pub fn session(&self) -> Option<Session> {
        self.session.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_session(&self, s: Option<Session>) {
        *self.session.write().unwrap_or_else(|e| e.into_inner()) = s;
    }

    /// Клиент вошедшего пользователя либо ошибка «войдите».
    pub fn site(&self) -> Result<SiteClient> {
        self.session().map(|s| s.site).ok_or_else(|| Error::msg("Сначала войдите на сайт"))
    }

    /// Клиент сессии, а без входа — новый клиент к серверу из настроек.
    pub fn site_any(&self) -> Result<SiteClient> {
        match self.session() {
            Some(s) => Ok(s.site),
            None => SiteClient::new(&self.settings().server()),
        }
    }

    pub fn settings(&self) -> Settings {
        settings::load(&self.base)
    }

    /// Замок скачивания по ключу (общий для всех, кто ждёт его сейчас).
    pub fn pdf_lock(&self, id: &str) -> PdfLock {
        let mut m = self.pdf_locks.lock().unwrap_or_else(|e| e.into_inner());
        m.entry(id.to_string()).or_default().clone()
    }

    /// Убрать замок, если его больше никто не держит.
    pub fn pdf_lock_release(&self, id: &str) {
        let mut m = self.pdf_locks.lock().unwrap_or_else(|e| e.into_inner());
        if m.get(id).is_some_and(|l| Arc::strong_count(l) == 1) {
            m.remove(id);
        }
    }

    /// Сайт уже не отдал эту миниатюру в этот запуск.
    pub fn thumb_missed(&self, name: &str) -> bool {
        self.thumb_misses.lock().unwrap_or_else(|e| e.into_inner()).contains(name)
    }

    pub fn thumb_miss(&self, name: &str) {
        self.thumb_misses.lock().unwrap_or_else(|e| e.into_inner()).insert(name.to_string());
    }
}
