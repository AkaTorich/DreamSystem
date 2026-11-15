//! Книги библиотеки. На Windows источник — books.json мода (путь из настроек либо
//! «Документы\Mo2Organzer\mods\Египетские иероглифы\books.json»); где мода нет —
//! копия книг с сайта в профиле (`books.json`). Книги — JSON-объекты как есть.

use crate::error::Result;
use crate::model::Settings;
use crate::store::files::{read_json_lenient, write_atomic, write_json};
use crate::store::Store;
use serde_json::Value;
use std::path::{Path, PathBuf};

const CACHE: &str = "books.json";
const DIRTY: &str = "books.dirty";

pub struct BooksFile {
    pub path: PathBuf,
    /// true — это books.json мода (его путь показывается интерфейсу)
    pub is_mod: bool,
}

/// Путь books.json мода, если он есть на этой машине.
pub fn mod_path(settings: &Settings, docs_dir: Option<&Path>) -> Option<PathBuf> {
    let own = settings.books_path.trim();
    if !own.is_empty() {
        let p = PathBuf::from(own);
        if p.is_file() {
            return Some(p);
        }
    }
    if !cfg!(windows) {
        return None;
    }
    let p = docs_dir?.join("Mo2Organzer").join("mods").join("Египетские иероглифы").join("books.json");
    p.is_file().then_some(p)
}

pub fn locate(store: &Store, settings: &Settings, docs_dir: Option<&Path>) -> BooksFile {
    match mod_path(settings, docs_dir) {
        Some(path) => BooksFile { path, is_mod: true },
        None => BooksFile { path: store.file(CACHE), is_mod: false },
    }
}

pub fn load(file: &BooksFile) -> Vec<Value> {
    read_json_lenient(&file.path)
}

/// Записать книги. Правка копии с сайта помечается — при синхронизации она уедет на сайт.
pub fn save(store: &Store, file: &BooksFile, books: &[Value]) -> Result<()> {
    write_json(&file.path, books)?;
    if !file.is_mod {
        write_atomic(&store.file(DIRTY), b"1")?;
    }
    Ok(())
}

/// Записать без пометки (так пишет синхронизация).
pub fn write(file: &BooksFile, books: &[Value]) -> Result<()> {
    write_json(&file.path, books)
}

pub fn is_dirty(store: &Store) -> bool {
    store.file(DIRTY).exists()
}

pub fn clear_dirty(store: &Store) {
    let _ = std::fs::remove_file(store.file(DIRTY));
}
