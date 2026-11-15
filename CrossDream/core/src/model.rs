//! Формы данных. Имена полей — как в старых файлах DreamMap (с большой буквы),
//! неизвестные поля не теряются (`extra`), `null` в строках и списках читается как пусто.

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;

/// `null` → значение по умолчанию (Newtonsoft писал null в пустые строки и списки).
fn nd<'de, D: Deserializer<'de>, T: Default + Deserialize<'de>>(d: D) -> Result<T, D::Error> {
    Ok(Option::<T>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct Analysis {
    #[serde(deserialize_with = "nd")]
    pub summary: String,
    #[serde(deserialize_with = "nd")]
    pub location: String,
    #[serde(deserialize_with = "nd")]
    pub characters: Vec<String>,
    #[serde(deserialize_with = "nd")]
    pub emotions: Vec<String>,
    #[serde(deserialize_with = "nd")]
    pub symbols: Vec<String>,
    #[serde(deserialize_with = "nd")]
    pub motifs: Vec<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct Link {
    #[serde(deserialize_with = "nd")]
    pub id: String,
    /// «локация» | «персонаж» | «эмоция» | «символ» | «сюжет»
    #[serde(deserialize_with = "nd")]
    pub r#type: String,
    #[serde(deserialize_with = "nd")]
    pub reason: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct Dream {
    #[serde(deserialize_with = "nd")]
    pub id: String,
    #[serde(deserialize_with = "nd")]
    pub title: String,
    /// "YYYY-MM-DD"
    #[serde(deserialize_with = "nd")]
    pub date: String,
    #[serde(deserialize_with = "nd")]
    pub text: String,
    pub analysis: Option<Analysis>,
    #[serde(deserialize_with = "nd")]
    pub image_prompt: String,
    #[serde(deserialize_with = "nd")]
    pub image_file: String,
    #[serde(deserialize_with = "nd")]
    pub links: Vec<Link>,
    /// авторские координаты на сфере; None — сон на орбите своей планеты
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub pos_z: Option<f64>,
    /// серверное время правки координат: новее — главнее
    pub pos_time: Option<String>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Dream {
    pub fn location(&self) -> &str {
        self.analysis.as_ref().map(|a| a.location.trim()).unwrap_or("")
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct PlanetPos {
    pub x: f64,
    pub y: f64,
    pub z: f64,
    #[serde(deserialize_with = "nd")]
    pub time: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct PdfBook {
    #[serde(deserialize_with = "nd")]
    pub id: String,
    #[serde(deserialize_with = "nd")]
    pub title: String,
    /// имя файла на полке профиля (`<id>.enc`); пусто — на этом устройстве файла ещё нет
    #[serde(deserialize_with = "nd")]
    pub file: String,
    /// последняя открытая страница (с 1)
    pub last_page: i64,
    /// номер на сайте; 0 — неизвестен (ещё не отправлен или не сверен)
    #[serde(default, deserialize_with = "nd")]
    pub site_id: i64,
    /// размер файла на сайте, байт (для полосы хода при скачивании)
    #[serde(default, deserialize_with = "nd")]
    pub size: i64,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

pub const DEFAULT_SERVER: &str = "https://dream.globthe.top";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "PascalCase", default)]
pub struct Settings {
    #[serde(deserialize_with = "nd")]
    pub text_model: String,
    #[serde(deserialize_with = "nd")]
    pub image_model: String,
    pub gen_images: bool,
    #[serde(deserialize_with = "nd")]
    pub server_url: String,
    #[serde(deserialize_with = "nd")]
    pub site_login: String,
    /// пароль старой программы (открытым текстом) — читается, но никогда не пишется и не отдаётся
    #[serde(rename = "SitePass", deserialize_with = "nd", skip_serializing)]
    pub legacy_pass: String,
    pub pdf_zoom: f64,
    pub map_zoom: f64,
    pub map_pan_x: f64,
    pub map_pan_y: f64,
    pub map_links: bool,
    #[serde(deserialize_with = "nd")]
    pub view_time: String,
    #[serde(deserialize_with = "nd")]
    pub pdf_page: BTreeMap<String, i64>,
    #[serde(deserialize_with = "nd")]
    pub books_path: String,
    /// профиль, открытый последним (чтобы и без входа видеть свои сны)
    #[serde(deserialize_with = "nd")]
    pub profile: String,
    /// палитра нитей и сфер: {локация, персонаж, эмоция, символ, сюжет, dream, planet, book} → цвет;
    /// null — своей палитры нет. Ездит с сайтом (save_settings.colors / user.colors)
    pub colors: Value,
    /// палитру правили без связи — при синхронизации она уедет на сайт, а не наоборот
    pub colors_dirty: bool,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            text_model: "google/gemini-2.5-flash".into(),
            image_model: "google/gemini-2.5-flash-image".into(),
            gen_images: true,
            server_url: DEFAULT_SERVER.into(),
            site_login: String::new(),
            legacy_pass: String::new(),
            pdf_zoom: 1.0,
            map_zoom: 0.0,
            map_pan_x: 0.0,
            map_pan_y: 0.0,
            map_links: true,
            view_time: String::new(),
            pdf_page: BTreeMap::new(),
            books_path: String::new(),
            profile: String::new(),
            colors: Value::Null,
            colors_dirty: false,
            extra: Map::new(),
        }
    }
}

impl Settings {
    /// адрес сервера без хвостового «/»; пусто — сервер по умолчанию
    pub fn server(&self) -> String {
        let s = self.server_url.trim().trim_end_matches('/');
        if s.is_empty() { DEFAULT_SERVER.to_string() } else { s.to_string() }
    }
}
