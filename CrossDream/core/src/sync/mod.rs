//! Синхронизация с сайтом: сны, нити, картины, места на карте, планеты, книги, PDF, раскладка, вид.
//! Ход сообщается колбэком `(текст, проценты 0…100)`.

pub mod books;
pub mod colors;
pub mod convert;
pub mod dreams;
pub mod folders;
pub mod images;
pub mod links;
pub mod pdfs;
pub mod planets;
pub mod positions;
pub mod rule;
pub mod thumbs;
pub mod view;

use crate::site::SiteClient;
use crate::store::Store;
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

pub type Progress<'a> = &'a (dyn Fn(&str, f64) + Send + Sync);

/// Общее для шагов: хранилище, сайт и шкала хода (своя доля общей шкалы у каждого шага).
pub struct Ctx<'a> {
    pub store: &'a Store,
    pub site: &'a SiteClient,
    progress: Progress<'a>,
    span: Mutex<(f64, f64)>,
}

impl<'a> Ctx<'a> {
    pub fn new(store: &'a Store, site: &'a SiteClient, progress: Progress<'a>) -> Self {
        Ctx { store, site, progress, span: Mutex::new((0.0, 100.0)) }
    }

    /// Задать долю общей шкалы (в процентах) для следующего шага.
    pub fn part(&self, lo: f64, hi: f64) {
        *self.span.lock().unwrap_or_else(|e| e.into_inner()) = (lo, hi);
    }

    /// Сообщить ход внутри текущей доли: `frac` от 0 до 1.
    pub fn step(&self, text: &str, frac: f64) {
        let (lo, hi) = *self.span.lock().unwrap_or_else(|e| e.into_inner());
        let pct = lo + (hi - lo) * frac.clamp(0.0, 1.0);
        (self.progress)(text, (pct * 10.0).round() / 10.0);
    }
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct SyncReport {
    pub ok: bool,
    pub message: String,
    #[serde(skip)]
    pub dreams_changed: bool,
    #[serde(skip)]
    pub library_changed: bool,
}

/// Всё разом. `docs_dir` — папка «Документы» (для books.json мода на Windows).
pub async fn sync_all(store: &Store, site: &SiteClient, progress: Progress<'_>, docs_dir: Option<&Path>) -> SyncReport {
    let ctx = Ctx::new(store, site, progress);
    let mut parts: Vec<String> = vec![];
    let mut errors: Vec<String> = vec![];
    let mut rep = SyncReport::default();

    ctx.part(0.0, 50.0);
    match dreams::sync(&ctx).await {
        Ok(o) => {
            rep.dreams_changed = o.changed();
            parts.push(o.summary());
        }
        Err(e) => errors.push(format!("сны: {e}")),
    }
    ctx.part(50.0, 70.0);
    match books::sync(&ctx, docs_dir).await {
        Ok(o) => {
            rep.library_changed |= o.changed;
            parts.push(format!("книги: новых — {}, трактовок — {}", o.gained_books, o.gained_tr));
        }
        Err(e) => errors.push(format!("книги: {e}")),
    }
    ctx.part(70.0, 95.0);
    match pdfs::sync(&ctx).await {
        Ok(o) => {
            rep.library_changed |= o.changed || o.up > 0;
            parts.push(format!("PDF: на сайт → {}, с сайта ← {}, обложек ← {}", o.up, o.down, o.covers));
        }
        Err(e) => errors.push(format!("PDF: {e}")),
    }
    ctx.part(95.0, 100.0);
    ctx.step("вид карты и раскладка библиотеки", 0.2);
    if let Err(e) = view::sync(&ctx).await {
        errors.push(format!("вид карты: {e}"));
    }
    match folders::sync(&ctx).await {
        Ok(ch) => rep.library_changed |= ch,
        Err(e) => errors.push(format!("раскладка: {e}")),
    }
    ctx.step("готово", 1.0);
    rep.ok = errors.is_empty();
    rep.message = if errors.is_empty() { parts.join("; ") } else { errors.join("; ") };
    rep
}
