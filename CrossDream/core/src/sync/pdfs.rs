//! PDF: наверх — свои, которых нет на сайте (кроме уходящих прямо сейчас в фоне);
//! вниз — только записи (название, номер, размер, закладка) без файлов: файл качается
//! по требованию при открытии (`pdfnet::fetch`). Затем обложки: недостающие — с сайта
//! (WebP, их печёт сайт), свои JPEG, которых нет на сайте, — туда. pdfs.json пишется одним разом.

use super::Ctx;
use crate::error::Result;
use crate::jsonx;
use crate::model::PdfBook;
use crate::pdfnet;
use crate::store::{settings, Store};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

/// Локальный id PDF сайта: ext_id либо «webp<id>».
pub fn local_pdf_id(sp: &Value) -> String {
    match jsonx::s(sp, "ext_id") {
        Some(e) if !e.is_empty() => e,
        _ => format!("webp{}", jsonx::str_or(sp, "id")),
    }
}

/// Запись списка сайта (`pdfs_list`) в удобном виде.
#[derive(Debug, Clone, PartialEq)]
pub struct SitePdf {
    pub local_id: String,
    pub site_id: i64,
    pub title: String,
    pub size: i64,
    pub last_page: i64,
    pub has_cover: bool,
}

/// Разбор ответа `pdfs_list` (числа сайт отдаёт то числами, то строками).
pub fn parse_list(v: &Value) -> Vec<SitePdf> {
    jsonx::arr(v, "pdfs")
        .iter()
        .map(|sp| SitePdf {
            local_id: local_pdf_id(sp),
            site_id: jsonx::i(sp, "id").unwrap_or(0),
            title: jsonx::str_or(sp, "title"),
            size: jsonx::i(sp, "size").unwrap_or(0).max(0),
            last_page: jsonx::i(sp, "last_page").unwrap_or(0),
            has_cover: jsonx::i(sp, "has_cover").unwrap_or(0) != 0,
        })
        .collect()
}

#[derive(Debug, Default)]
pub struct PdfOutcome {
    /// отправлено на сайт
    pub up: usize,
    /// новых записей с сайта (файлы — по требованию)
    pub down: usize,
    /// скачано обложек
    pub covers: usize,
    /// pdfs.json или обложки изменились
    pub changed: bool,
}

pub async fn sync(ctx: &Ctx<'_>) -> Result<PdfOutcome> {
    let mut out = PdfOutcome::default();
    ctx.step("PDF: сверяю список", 0.02);
    let site = parse_list(&ctx.site.get("pdfs_list").await?);
    let on_site: HashSet<&str> = site.iter().map(|s| s.local_id.as_str()).collect();
    let local = ctx.store.load_pdfs();

    // наверх: свои с файлом, которых сайт не знает; уходящие в фоне не трогаем
    let up_list: Vec<&PdfBook> = local
        .iter()
        .filter(|p| !on_site.contains(p.id.as_str()) && !p.id.starts_with("webp") && ctx.store.has_pdf_file(p))
        .collect();
    let mut sent: HashMap<String, (i64, i64)> = HashMap::new();
    let quiet: crate::site::ProgressFn = Arc::new(|_, _| {});
    for (n, lp) in up_list.iter().enumerate() {
        let Some(_claim) = pdfnet::claim(&lp.id) else { continue };
        ctx.step(&format!("PDF: отправляю «{}» — {} из {}", lp.title, n + 1, up_list.len()), 0.05 + 0.45 * n as f64 / up_list.len() as f64);
        let Ok(plain) = ctx.store.read_pdf(lp) else { continue };
        let size = plain.len() as i64;
        let sid = pdfnet::upload(ctx.site, &lp.id, &lp.title, plain, quiet.clone()).await?;
        sent.insert(lp.id.clone(), (sid.unwrap_or(0), size));
        out.up += 1;
    }

    // вниз: только записи, одним разом
    ctx.step("PDF: записываю список", 0.52);
    (out.down, out.changed) = merge_down(ctx.store, &site, &sent)?;
    take_pages(ctx.store, &site)?;

    pull_covers(ctx, &site, &mut out).await;
    push_covers(ctx, &site, &sent).await;
    ctx.step("PDF сверены", 1.0);
    Ok(out)
}

/// Быстрая сверка: только список с сайта и недостающие обложки — без отправки PDF и своих
/// обложек (после копирования PDF на сайте новые записи видны на полке сразу).
pub async fn refresh(ctx: &Ctx<'_>) -> Result<PdfOutcome> {
    let mut out = PdfOutcome::default();
    let site = parse_list(&ctx.site.get("pdfs_list").await?);
    (out.down, out.changed) = merge_down(ctx.store, &site, &HashMap::new())?;
    take_pages(ctx.store, &site)?;
    pull_covers(ctx, &site, &mut out).await;
    Ok(out)
}

/// Записи сайта → pdfs.json одним разом: у имеющихся — номер, размер, название; новые — без
/// файла; запись без файла, которой больше нет на сайте, — прочь. `sent` — только что
/// отправленные (их ещё нет в списке сайта): номер и размер. Ответ — (новых, изменилось ли).
fn merge_down(store: &Store, site: &[SitePdf], sent: &HashMap<String, (i64, i64)>) -> Result<(usize, bool)> {
    let by_id: HashMap<&str, &SitePdf> = site.iter().map(|s| (s.local_id.as_str(), s)).collect();
    store.edit_pdfs(|v| {
        let before = v.clone();
        for x in v.iter_mut() {
            if let Some(s) = by_id.get(x.id.as_str()) {
                x.site_id = s.site_id;
                x.size = s.size;
                // переименовали на сайте или на другом устройстве
                if !s.title.trim().is_empty() {
                    x.title = s.title.clone();
                }
            } else if let Some((sid, size)) = sent.get(&x.id) {
                if *sid > 0 {
                    x.site_id = *sid;
                }
                x.size = *size;
            }
        }
        // запись без файла, которой больше нет на сайте (удалили или стёрли там), — пустышка
        v.retain(|x| !x.file.trim().is_empty() || by_id.contains_key(x.id.as_str()));
        let have: HashSet<String> = v.iter().map(|x| x.id.clone()).collect();
        let mut added = 0;
        for s in site {
            if have.contains(&s.local_id) {
                continue;
            }
            v.push(PdfBook {
                id: s.local_id.clone(),
                title: s.title.clone(),
                file: String::new(),
                last_page: s.last_page,
                site_id: s.site_id,
                size: s.size,
                extra: Map::new(),
            });
            added += 1;
        }
        (added, *v != before)
    })
}

/// Память страницы: на этой машине её ещё нет — берём серверную закладку.
fn take_pages(store: &Store, site: &[SitePdf]) -> Result<()> {
    let pages: Vec<(&str, i64)> = site.iter().filter(|s| s.last_page > 0).map(|s| (s.local_id.as_str(), s.last_page)).collect();
    if pages.iter().any(|(id, _)| !settings::load(&store.base).pdf_page.contains_key(*id)) {
        settings::edit(&store.base, |st| {
            for (id, p) in &pages {
                st.pdf_page.entry(id.to_string()).or_insert(*p);
            }
        })?;
    }
    Ok(())
}

/// Недостающие обложки — с сайта. Сбой одной обложки не останавливает сверку.
async fn pull_covers(ctx: &Ctx<'_>, site: &[SitePdf], out: &mut PdfOutcome) {
    let need: Vec<&SitePdf> = site.iter().filter(|s| s.has_cover && ctx.store.cover_file(&s.local_id).is_none()).collect();
    for (n, s) in need.iter().enumerate() {
        ctx.step(&format!("Обложки: {} из {}", n + 1, need.len()), 0.55 + 0.4 * n as f64 / need.len() as f64);
        if pdfnet::pull_cover(ctx.store, ctx.site, &s.local_id, s.site_id).await.is_ok() {
            out.covers += 1;
        }
    }
    if out.covers > 0 {
        out.changed = true;
    }
}

/// Свои обложки — на сайт.
async fn push_covers(ctx: &Ctx<'_>, site: &[SitePdf], sent: &HashMap<String, (i64, i64)>) {
    // свои обложки, которых сайт ещё не видел (рисовались, пока PDF уходил, или без связи)
    let give: Vec<(&str, i64)> = site
        .iter()
        .filter(|s| !s.has_cover && s.site_id > 0)
        .map(|s| (s.local_id.as_str(), s.site_id))
        .chain(sent.iter().filter(|(_, (sid, _))| *sid > 0).map(|(id, (sid, _))| (id.as_str(), *sid)))
        .filter(|(id, _)| pdfnet::has_own_cover(ctx.store, id))
        .collect();
    for (n, (id, sid)) in give.iter().enumerate() {
        ctx.step(&format!("Обложки на сайт: {} из {}", n + 1, give.len()), 0.95 + 0.04 * n as f64 / give.len() as f64);
        let _ = pdfnet::push_cover(ctx.store, ctx.site, id, *sid).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_list_size_and_cover() {
        let v = json!({ "pdfs": [
            { "id": "12", "ext_id": "p6385", "title": "Сны", "last_page": "7", "size": "1048576", "has_cover": "1" },
            { "id": 13, "ext_id": null, "title": "Без кода", "last_page": 0, "size": 2048, "has_cover": 0 },
            { "id": 14, "ext_id": "", "title": "Старый сайт" }
        ]});
        let l = parse_list(&v);
        assert_eq!(l.len(), 3);
        assert_eq!(l[0], SitePdf { local_id: "p6385".into(), site_id: 12, title: "Сны".into(), size: 1_048_576, last_page: 7, has_cover: true });
        assert_eq!((l[1].local_id.as_str(), l[1].site_id, l[1].size, l[1].has_cover), ("webp13", 13, 2048, false));
        assert_eq!((l[2].local_id.as_str(), l[2].size, l[2].has_cover), ("webp14", 0, false));
    }

    #[test]
    fn old_pdfs_json_reads_without_new_fields() {
        let p: PdfBook = serde_json::from_str(r#"{"Id":"p1","Title":"A","File":"p1.enc","LastPage":3}"#).unwrap();
        assert_eq!((p.site_id, p.size), (0, 0));
        let p: PdfBook = serde_json::from_str(r#"{"Id":"p2","Title":"B","File":"","LastPage":0,"SiteId":5,"Size":10}"#).unwrap();
        assert_eq!((p.site_id, p.size, p.file.as_str()), (5, 10, ""));
        let s = serde_json::to_value(&p).unwrap();
        assert_eq!((s["SiteId"].as_i64(), s["Size"].as_i64()), (Some(5), Some(10)));
    }
}
