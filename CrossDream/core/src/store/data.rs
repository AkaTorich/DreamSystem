//! Файлы профиля: сны, планеты, PDF, надгробия, соответствие id сайта, раскладка библиотеки.
//! Правки — через `edit_*`: прочитать, поправить, записать под замком профиля.

use super::files::{read_json_lenient, write_json};
use super::Store;
use crate::error::Result;
use crate::model::{Dream, PdfBook, PlanetPos};
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

pub type Planets = BTreeMap<String, PlanetPos>;
/// локальный id сна → id сна на сайте
pub type SiteIds = BTreeMap<String, i64>;

const DREAMS: &str = "dreams.json";
const PLANETS: &str = "planets.json";
const PDFS: &str = "pdfs.json";
const GRAVES: &str = "deleted.json";
const SITE_IDS: &str = "site_ids.json";
const LIB_INDEX: &str = "lib_index.json";

impl Store {
    pub fn load_dreams(&self) -> Vec<Dream> {
        read_json_lenient(&self.file(DREAMS))
    }

    /// Сны, отсортированные по дате (так их показывает список).
    pub fn dreams_sorted(&self) -> Vec<Dream> {
        let mut v = self.load_dreams();
        v.sort_by(|a, b| a.date.cmp(&b.date));
        v
    }

    pub fn save_dreams(&self, v: &[Dream]) -> Result<()> {
        let _g = self.guard();
        write_json(&self.file(DREAMS), v)
    }

    pub fn edit_dreams<R>(&self, f: impl FnOnce(&mut Vec<Dream>) -> R) -> Result<R> {
        let _g = self.guard();
        let mut v: Vec<Dream> = read_json_lenient(&self.file(DREAMS));
        let r = f(&mut v);
        write_json(&self.file(DREAMS), &v)?;
        Ok(r)
    }

    pub fn load_planets(&self) -> Planets {
        read_json_lenient(&self.file(PLANETS))
    }

    pub fn edit_planets<R>(&self, f: impl FnOnce(&mut Planets) -> R) -> Result<R> {
        let _g = self.guard();
        let mut v: Planets = read_json_lenient(&self.file(PLANETS));
        let r = f(&mut v);
        write_json(&self.file(PLANETS), &v)?;
        Ok(r)
    }

    pub fn load_pdfs(&self) -> Vec<PdfBook> {
        read_json_lenient(&self.file(PDFS))
    }

    pub fn edit_pdfs<R>(&self, f: impl FnOnce(&mut Vec<PdfBook>) -> R) -> Result<R> {
        let _g = self.guard();
        let mut v: Vec<PdfBook> = read_json_lenient(&self.file(PDFS));
        let r = f(&mut v);
        write_json(&self.file(PDFS), &v)?;
        Ok(r)
    }

    /// Надгробия: сны, удалённые здесь. Пока удаление не доехало до сайта,
    /// синхронизация не тащит их обратно.
    pub fn load_graves(&self) -> BTreeSet<String> {
        let v: Vec<String> = read_json_lenient(&self.file(GRAVES));
        v.into_iter().collect()
    }

    pub fn add_graves(&self, ids: &[String]) -> Result<()> {
        let _g = self.guard();
        let mut v: Vec<String> = read_json_lenient(&self.file(GRAVES));
        for id in ids {
            if !v.contains(id) {
                v.push(id.clone());
            }
        }
        write_json(&self.file(GRAVES), &v)
    }

    pub fn load_site_ids(&self) -> SiteIds {
        read_json_lenient(&self.file(SITE_IDS))
    }

    pub fn save_site_ids(&self, ids: &SiteIds) -> Result<()> {
        let _g = self.guard();
        write_json(&self.file(SITE_IDS), ids)
    }

    /// id сна на сайте: из последней синхронизации либо из самого id («web123»).
    pub fn site_id_of(&self, local_id: &str) -> Option<i64> {
        if let Some(x) = self.load_site_ids().get(local_id) {
            return Some(*x);
        }
        local_id.strip_prefix("web").and_then(|n| n.parse().ok())
    }

    /// Раскладка библиотеки по папкам (последний слепок lib_index с сайта); нет — null.
    pub fn load_lib_index(&self) -> Value {
        read_json_lenient::<Option<Value>>(&self.file(LIB_INDEX)).unwrap_or(Value::Null)
    }

    pub fn save_lib_index(&self, v: &Value) -> Result<()> {
        let _g = self.guard();
        write_json(&self.file(LIB_INDEX), v)
    }
}
