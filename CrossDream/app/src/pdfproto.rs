//! Свой адрес для читалки PDF: `cdpdf://localhost/<id>` (на Windows и Android —
//! `http://cdpdf.localhost/<id>`; адрес строит convertFileSrc(id, 'cdpdf')).
//! Расшифрованная книга держится в памяти (последние две открытые), на диск открытой не пишется.
//! Отдаётся кусками по заголовку Range: pdf.js сперва берёт только то, что нужно первым страницам.

use std::sync::{Arc, Mutex};
use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Runtime, UriSchemeContext, UriSchemeResponder};

static OPEN: Mutex<Vec<(String, Arc<Vec<u8>>)>> = Mutex::new(Vec::new());

/// Положить байты книги в память (вытесняя самую давнюю из двух); ответ — размер.
pub fn keep(id: &str, bytes: Vec<u8>) -> u64 {
    let n = bytes.len() as u64;
    let mut v = OPEN.lock().unwrap_or_else(|e| e.into_inner());
    v.retain(|(k, _)| k != id);
    v.push((id.to_string(), Arc::new(bytes)));
    while v.len() > 2 {
        v.remove(0);
    }
    n
}

fn cached(id: &str) -> Option<Arc<Vec<u8>>> {
    OPEN.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(k, _)| k == id).map(|(_, b)| b.clone())
}

/// Обработчик адреса `cdpdf` (регистрируется в lib.rs).
pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, req: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app: AppHandle<R> = ctx.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        responder.respond(serve(&app, &req).await);
    });
}

async fn serve<R: Runtime>(app: &AppHandle<R>, req: &Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = percent_decode(req.uri().path().trim_start_matches('/'));
    let bytes = match cached(&id) {
        Some(b) => b,
        None => match load(app, &id).await {
            Some(b) => b,
            None => return reply(StatusCode::NOT_FOUND, "text/plain", b"PDF not found".to_vec(), None),
        },
    };
    let len = bytes.len() as u64;
    // Range: bytes=a-b — отдаём кусок; иначе весь файл
    if let Some((a, b)) = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|r| range(r, len)) {
        let body = bytes[a as usize..=b as usize].to_vec();
        return reply(StatusCode::PARTIAL_CONTENT, "application/pdf", body, Some(format!("bytes {a}-{b}/{len}")));
    }
    reply(StatusCode::OK, "application/pdf", bytes.as_ref().clone(), None)
}

/// Нет в памяти (страницу перезагрузили) — прочитать с полки заново.
async fn load<R: Runtime>(app: &AppHandle<R>, id: &str) -> Option<Arc<Vec<u8>>> {
    use tauri::Manager;
    let st = app.state::<crate::state::AppState>();
    let store = st.store();
    let p = crate::commands::pdf::find(&store, id).ok()?;
    if !store.has_pdf_file(&p) {
        return None;
    }
    let bytes = tauri::async_runtime::spawn_blocking(move || store.read_pdf(&p)).await.ok()?.ok()?;
    keep(id, bytes);
    cached(id)
}

fn range(h: &str, len: u64) -> Option<(u64, u64)> {
    let spec = h.strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (a, b) = match (a.trim(), b.trim()) {
        ("", n) => { let n: u64 = n.parse().ok()?; (len.saturating_sub(n), len.checked_sub(1)?) }
        (s, "") => (s.parse().ok()?, len.checked_sub(1)?),
        (s, e) => (s.parse().ok()?, e.parse::<u64>().ok()?.min(len.checked_sub(1)?)),
    };
    (a <= b && b < len).then_some((a, b))
}

fn reply(status: StatusCode, mime: &str, body: Vec<u8>, content_range: Option<String>) -> Response<Vec<u8>> {
    let mut r = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_LENGTH, body.len())
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Accept-Ranges, Content-Range, Content-Length")
        .header(header::CACHE_CONTROL, "no-store");
    if let Some(cr) = content_range {
        r = r.header(header::CONTENT_RANGE, cr);
    }
    r.body(body).unwrap_or_else(|_| Response::new(Vec::new()))
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ranges() {
        assert_eq!(range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(range("bytes=900-", 1000), Some((900, 999)));
        assert_eq!(range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(range("bytes=2000-3000", 1000), None);
        assert_eq!(percent_decode("webp%2012"), "webp 12");
    }
}
