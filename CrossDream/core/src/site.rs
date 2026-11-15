//! Клиент сайта (`api.php`): вход по cookie-сессии, GET, POST JSON, отправка файлов, скачивание.
//! Ответ `{error: "…"}` превращается в ошибку с текстом сайта. Большие файлы с ходом — `stream`.

mod stream;

pub use stream::ProgressFn;

use crate::error::{Error, Result};
use reqwest::multipart::{Form, Part};
use serde_json::Value;
use std::time::Duration;

/// Файл для multipart-отправки.
pub struct FilePart {
    pub field: String,
    pub name: String,
    pub bytes: Vec<u8>,
    pub mime: String,
}

impl FilePart {
    pub fn new(field: &str, name: &str, bytes: Vec<u8>, mime: &str) -> Self {
        FilePart { field: field.into(), name: name.into(), bytes, mime: mime.into() }
    }
}

#[derive(Clone)]
pub struct SiteClient {
    http: reqwest::Client,
    base: String,
}

impl SiteClient {
    /// `base` — адрес сайта без `/api.php` (например `https://dream.globthe.top`).
    pub fn new(base: &str) -> Result<Self> {
        let http = reqwest::Client::builder()
            .cookie_store(true)
            .timeout(Duration::from_secs(300))
            .connect_timeout(Duration::from_secs(20))
            .user_agent(concat!("CrossDream/", env!("CARGO_PKG_VERSION")))
            .build()?;
        Ok(SiteClient { http, base: base.trim().trim_end_matches('/').to_string() })
    }

    pub fn base(&self) -> &str {
        &self.base
    }

    /// `action` может нести и GET-параметры: `"user_map&uid=5"`.
    fn url(&self, action: &str) -> String {
        format!("{}/api.php?action={}", self.base, action)
    }

    pub async fn get(&self, action: &str) -> Result<Value> {
        let r = self.http.get(self.url(action)).send().await?;
        let st = r.status().as_u16();
        parse_reply(st, &r.text().await?)
    }

    pub async fn post_json(&self, action: &str, body: &Value) -> Result<Value> {
        let body = if body.is_null() { Value::Object(Default::default()) } else { body.clone() };
        let r = self.http.post(self.url(action)).json(&body).send().await?;
        let st = r.status().as_u16();
        parse_reply(st, &r.text().await?)
    }

    pub async fn upload(&self, action: &str, files: Vec<FilePart>, fields: &[(String, String)]) -> Result<Value> {
        let mut form = Form::new();
        for f in files {
            let part = Part::bytes(f.bytes)
                .file_name(f.name)
                .mime_str(&f.mime)
                .map_err(|e| Error::Http(e.to_string()))?;
            form = form.part(f.field, part);
        }
        for (k, v) in fields {
            form = form.text(k.clone(), v.clone());
        }
        let r = self.http.post(self.url(action)).multipart(form).send().await?;
        let st = r.status().as_u16();
        parse_reply(st, &r.text().await?)
    }

    /// Скачать файл по пути от корня сайта (`"api.php?action=img&f=…"`).
    pub async fn download(&self, rel: &str) -> Result<Vec<u8>> {
        let url = format!("{}/{}", self.base, rel.trim_start_matches('/'));
        let r = self.http.get(url).send().await?;
        let st = r.status();
        let bytes = r.bytes().await?.to_vec();
        if !st.is_success() {
            let txt = String::from_utf8_lossy(&bytes);
            return Err(parse_reply(st.as_u16(), &txt).err().unwrap_or_else(|| Error::Http(format!("HTTP {st}"))));
        }
        // сайт мог ответить ошибкой в JSON и при коде 200
        if bytes.first() == Some(&b'{') && bytes.len() < 4096 {
            if let Ok(v) = serde_json::from_slice::<Value>(&bytes) {
                if let Some(e) = v.get("error") {
                    return Err(Error::Site(error_text(e)));
                }
            }
        }
        Ok(bytes)
    }
}

/// Разбор ответа api.php: не JSON → ошибка с кодом HTTP; `{error}` → ошибка сайта.
pub fn parse_reply(status: u16, text: &str) -> Result<Value> {
    let t = text.trim_start_matches('\u{feff}').trim();
    let v: Value = serde_json::from_str(t)
        .map_err(|_| Error::Site(format!("Сервер вернул не-JSON (HTTP {status})")))?;
    if let Some(e) = v.get("error") {
        if !e.is_null() {
            return Err(Error::Site(error_text(e)));
        }
    }
    Ok(v)
}

fn error_text(e: &Value) -> String {
    match e {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}
