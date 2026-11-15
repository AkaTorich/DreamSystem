//! Большие файлы с ходом: отправка multipart кусками и скачивание кусками.
//! Колбэк хода `(сделано, всего)` зовётся не чаще ~10 раз в секунду и всегда в конце.

use super::{error_text, parse_reply, FilePart, SiteClient};
use crate::error::{Error, Result};
use reqwest::multipart::{Form, Part};
use reqwest::Body;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Кусок тела при отправке.
const CHUNK: usize = 64 * 1024;
/// Большой файл по медленной связи идёт долго — общий предел клиента (5 минут) тут не годится.
const LONG: Duration = Duration::from_secs(6 * 3600);
/// Не чаще одного сообщения о ходе за этот срок.
const TICK: Duration = Duration::from_millis(100);

/// Колбэк хода `(сделано, всего)`.
pub type ProgressFn = Arc<dyn Fn(u64, u64) + Send + Sync>;

/// Прореживатель сообщений о ходе.
struct Throttle {
    cb: ProgressFn,
    last: Mutex<Option<Instant>>,
}

impl Throttle {
    fn new(cb: ProgressFn) -> Self {
        Throttle { cb, last: Mutex::new(None) }
    }

    fn tick(&self, done: u64, total: u64) {
        let finished = total > 0 && done >= total;
        let mut last = self.last.lock().unwrap_or_else(|e| e.into_inner());
        if !finished && last.is_some_and(|t| t.elapsed() < TICK) {
            return;
        }
        *last = Some(Instant::now());
        drop(last);
        (self.cb)(done, total);
    }
}

impl SiteClient {
    /// Отправить файл с ходом: тело идёт кусками по 64 КБ, `cb(отправлено, всего)` — байты файла.
    pub async fn upload_progress(&self, action: &str, part: FilePart, fields: &[(String, String)], cb: ProgressFn) -> Result<Value> {
        let total = part.bytes.len() as u64;
        let data = Arc::new(part.bytes);
        let th = Arc::new(Throttle::new(cb));
        th.tick(0, total);
        let stream = futures_util::stream::unfold(0usize, move |pos| {
            let data = data.clone();
            let th = th.clone();
            async move {
                if pos >= data.len() {
                    return None;
                }
                let end = (pos + CHUNK).min(data.len());
                let chunk = data[pos..end].to_vec();
                th.tick(end as u64, total);
                Some((Ok::<Vec<u8>, std::io::Error>(chunk), end))
            }
        });
        let file = Part::stream_with_length(Body::wrap_stream(stream), total)
            .file_name(part.name)
            .mime_str(&part.mime)
            .map_err(|e| Error::Http(e.to_string()))?;
        let mut form = Form::new().part(part.field, file);
        for (k, v) in fields {
            form = form.text(k.clone(), v.clone());
        }
        let r = self.http.post(self.url(action)).timeout(LONG).multipart(form).send().await?;
        let st = r.status().as_u16();
        parse_reply(st, &r.text().await?)
    }

    /// Скачать файл кусками с ходом. `size_hint` — размер, если сайт не скажет Content-Length.
    pub async fn download_progress(&self, rel: &str, size_hint: u64, cb: ProgressFn) -> Result<Vec<u8>> {
        let url = format!("{}/{}", self.base, rel.trim_start_matches('/'));
        let mut r = self.http.get(url).timeout(LONG).send().await?;
        let st = r.status();
        if !st.is_success() {
            let txt = r.text().await.unwrap_or_default();
            return Err(parse_reply(st.as_u16(), &txt).err().unwrap_or_else(|| Error::Http(format!("HTTP {st}"))));
        }
        let total = r.content_length().filter(|n| *n > 0).unwrap_or(size_hint);
        let th = Throttle::new(cb);
        // место сразу под весь файл, но без безумных заявок
        let mut buf: Vec<u8> = Vec::with_capacity(total.min(512 << 20) as usize);
        th.tick(0, total);
        while let Some(c) = r.chunk().await? {
            buf.extend_from_slice(&c);
            th.tick(buf.len() as u64, total.max(buf.len() as u64));
        }
        if total == 0 {
            th.tick(buf.len() as u64, buf.len() as u64);
        }
        // сайт мог ответить ошибкой в JSON и при коде 200
        if buf.first() == Some(&b'{') && buf.len() < 4096 {
            if let Ok(v) = serde_json::from_slice::<Value>(&buf) {
                if let Some(e) = v.get("error") {
                    return Err(Error::Site(error_text(e)));
                }
            }
        }
        Ok(buf)
    }
}
