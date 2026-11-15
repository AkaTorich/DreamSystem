//! Книги: наверх — своя библиотека (books_import), вниз — новые книги, трактовки и
//! фундамент планеты (books_list).

use super::Ctx;
use crate::books::{self, BooksFile};
use crate::error::Result;
use crate::jsonx;
use crate::site::FilePart;
use crate::store::settings;
use serde_json::{json, Value};
use std::path::Path;

#[derive(Debug, Default)]
pub struct BooksOutcome {
    pub gained_books: usize,
    pub gained_tr: usize,
    pub changed: bool,
}

pub async fn sync(ctx: &Ctx<'_>, docs_dir: Option<&Path>) -> Result<BooksOutcome> {
    let st = settings::load(&ctx.store.base);
    let file = books::locate(ctx.store, &st, docs_dir);
    let mut list = books::load(&file);

    if (file.is_mod || books::is_dirty(ctx.store)) && !list.is_empty() {
        ctx.step("книги: отправляю библиотеку на сайт", 0.05);
        let bytes = serde_json::to_vec(&list)?;
        ctx.site
            .upload("books_import", vec![FilePart::new("books", "books.json", bytes, "application/json")], &[])
            .await?;
        books::clear_dirty(ctx.store);
    }

    ctx.step("книги: беру с сайта новые и трактовки", 0.4);
    let j = ctx.site.get("books_list").await?;
    let out = merge(&mut list, jsonx::arr(&j, "books"), &file);
    if out.changed {
        books::write(&file, &list)?;
    }
    ctx.step("книги сверены", 1.0);
    Ok(out)
}

/// Слить книги сайта в свой список. Копия с сайта (не мод) повторяет сайт целиком.
pub fn merge(list: &mut Vec<Value>, site_books: &[Value], file: &BooksFile) -> BooksOutcome {
    let mut out = BooksOutcome::default();
    for sb in site_books {
        let Some(num) = jsonx::i(sb, "num") else { continue };
        let pos = list.iter().position(|b| jsonx::i(b, "num") == Some(num));
        let Some(i) = pos else {
            list.push(json!({
                "num": num,
                "title": jsonx::str_or(sb, "title"),
                "text": jsonx::str_or(sb, "text"),
                "size": 34,
                "per_page": 600,
                "translation": jsonx::str_or(sb, "translation"),
                "location": jsonx::str_or(sb, "location"),
            }));
            out.gained_books += 1;
            out.changed = true;
            continue;
        };
        let Some(local) = list[i].as_object_mut() else { continue };
        let tr = jsonx::str_or(sb, "translation");
        let local_tr = local.get("translation").and_then(|v| v.as_str()).unwrap_or("");
        if !tr.is_empty() && (local_tr.is_empty() || (!file.is_mod && local_tr != tr)) {
            local.insert("translation".into(), Value::String(tr));
            out.gained_tr += 1;
            out.changed = true;
        }
        let mut fields = vec!["location"];
        if !file.is_mod {
            fields.extend(["title", "text"]);
        }
        for f in fields {
            let sv = jsonx::str_or(sb, f);
            if local.get(f).and_then(|v| v.as_str()).unwrap_or("") != sv {
                local.insert(f.into(), Value::String(sv));
                out.changed = true;
            }
        }
    }
    out
}
