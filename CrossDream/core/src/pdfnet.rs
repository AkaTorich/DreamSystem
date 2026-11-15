//! PDF и сайт поштучно: скачать один PDF по требованию, отправить один в фоне, обложки.
//! Отправляемые сейчас PDF отмечены в общем списке — синхронизация их не трогает.

use crate::error::{Error, Result};
use crate::jsonx;
use crate::model::PdfBook;
use crate::site::{FilePart, ProgressFn, SiteClient};
use crate::store::Store;
use serde_json::json;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};

/// Обложка не больше этого — так велит сайт.
pub const COVER_MAX: usize = 300 * 1024;

fn busy() -> &'static Mutex<HashSet<String>> {
    static B: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    B.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Отметка «этот PDF сейчас уходит на сайт»; снимается сама, когда отметка пропадает.
pub struct Claim(String);

impl Drop for Claim {
    fn drop(&mut self) {
        busy().lock().unwrap_or_else(|e| e.into_inner()).remove(&self.0);
    }
}

/// Занять PDF под отправку; уже занят — `None` (второй раз не отправляем).
pub fn claim(id: &str) -> Option<Claim> {
    let mut b = busy().lock().unwrap_or_else(|e| e.into_inner());
    b.insert(id.to_string()).then(|| Claim(id.to_string()))
}

/// Номер на сайте, если он известен без запроса: `SiteId` либо код «webp<номер>».
pub fn known_site_id(p: &PdfBook) -> i64 {
    if p.site_id > 0 {
        return p.site_id;
    }
    p.id.strip_prefix("webp").and_then(|n| n.parse().ok()).unwrap_or(0)
}

/// Номер на сайте; неизвестен — ищем в списке сайта по своему коду. 0 — на сайте нет.
pub async fn resolve_site_id(site: &SiteClient, p: &PdfBook) -> Result<i64> {
    let sid = known_site_id(p);
    if sid > 0 {
        return Ok(sid);
    }
    let list = site.get("pdfs_list").await?;
    Ok(jsonx::arr(&list, "pdfs")
        .iter()
        .find(|sp| crate::sync::pdfs::local_pdf_id(sp) == p.id)
        .and_then(|sp| jsonx::i(sp, "id"))
        .unwrap_or(0))
}

/// Скачать PDF, которого нет на устройстве: кусками с ходом, сразу зашифровать на полку,
/// записать `File` (и `SiteId`) в pdfs.json. Возвращает открытые байты.
pub async fn fetch(store: &Store, site: &SiteClient, p: &PdfBook, cb: ProgressFn) -> Result<Vec<u8>> {
    let sid = resolve_site_id(site, p).await?;
    if sid <= 0 {
        return Err(Error::msg(format!("PDF «{}» на сайте не найден", p.title)));
    }
    let rel = format!("api.php?action=pdf_file&id={sid}");
    let bytes = site.download_progress(&rel, p.size.max(0) as u64, cb).await?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(Error::msg(format!("Сайт прислал не PDF вместо «{}»", p.title)));
    }
    let file = store.stash_pdf(&p.id, &bytes)?;
    let size = bytes.len() as i64;
    store.edit_pdfs(|v| {
        if let Some(x) = v.iter_mut().find(|x| x.id == p.id) {
            x.file = file;
            x.site_id = sid;
            x.size = size;
        }
    })?;
    Ok(bytes)
}

/// Отправить PDF на сайт с ходом. Ответ сайта — номер (`None`, если сайт уже знал этот PDF).
pub async fn upload(site: &SiteClient, id: &str, title: &str, bytes: Vec<u8>, cb: ProgressFn) -> Result<Option<i64>> {
    let part = FilePart::new("pdf", &format!("{id}.pdf"), bytes, "application/pdf");
    let fields = [("title".to_string(), title.to_string()), ("ext_id".to_string(), id.to_string())];
    let r = site.upload_progress("pdf_add", part, &fields, cb).await?;
    Ok(jsonx::i(&r, "id").filter(|n| *n > 0))
}

/// Отправить свой PDF (фон после добавления): номер — в pdfs.json, своя обложка — следом.
/// Пока PDF уходил, его удалили здесь — удаляем и на сайте, чтобы синхронизация не вернула.
pub async fn push(store: &Store, site: &SiteClient, id: &str, title: &str, bytes: Vec<u8>, cb: ProgressFn) -> Result<i64> {
    let size = bytes.len() as i64;
    let sid = match upload(site, id, title, bytes, cb).await? {
        Some(n) => n,
        None => resolve_site_id(site, &PdfBook { id: id.to_string(), ..Default::default() }).await?,
    };
    if sid <= 0 {
        return Ok(0);
    }
    let now_title = store.edit_pdfs(|v| {
        v.iter_mut().find(|x| x.id == id).map(|x| {
            x.site_id = sid;
            x.size = size;
            x.title.clone()
        })
    })?;
    let Some(now_title) = now_title else {
        site.post_json("pdf_del", &json!({ "id": sid })).await?;
        return Ok(0);
    };
    // пока уходил, его переименовали здесь — иначе синхронизация вернёт прежнее название
    if now_title != title {
        let _ = site.post_json("pdf_rename", &json!({ "id": sid, "title": now_title })).await;
    }
    if has_own_cover(store, id) {
        let _ = push_cover(store, site, id, sid).await; // не ушла — уедет при синхронизации
    }
    Ok(sid)
}

/// Есть ли своя (нарисованная здесь) обложка — JPEG, которого сайт, может быть, ещё не видел.
pub fn has_own_cover(store: &Store, id: &str) -> bool {
    store.cover_path(id, "jpg").exists()
}

/// Отправить свою обложку (JPEG) на сайт (`pdf_cover_set`); сайт сам переводит её в WebP.
pub async fn push_cover(store: &Store, site: &SiteClient, id: &str, site_id: i64) -> Result<()> {
    let jpeg = std::fs::read(store.cover_path(id, "jpg"))?;
    if !jpeg.starts_with(&[0xFF, 0xD8, 0xFF]) || jpeg.len() > COVER_MAX {
        return Err(Error::msg("Обложка — только JPEG до 300 КБ"));
    }
    let part = FilePart::new("cover", &format!("{id}.jpg"), jpeg, "image/jpeg");
    site.upload(&format!("pdf_cover_set&id={site_id}"), vec![part], &[("id".to_string(), site_id.to_string())]).await?;
    Ok(())
}

/// Скачать обложку сайта к себе (`covers\<id>.webp`; старая JPEG — `.jpg`).
pub async fn pull_cover(store: &Store, site: &SiteClient, id: &str, site_id: i64) -> Result<()> {
    let img = site.download(&format!("api.php?action=pdf_cover&id={site_id}")).await?;
    let webp = img.len() > 12 && &img[..4] == b"RIFF" && &img[8..12] == b"WEBP";
    if !webp && !img.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Err(Error::msg("Сайт прислал не картинку"));
    }
    store.save_cover(id, &img)?;
    Ok(())
}
