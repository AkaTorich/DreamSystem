//! Миниатюры картинок снов для карты: квадрат 160×160 из середины картинки в WebP,
//! сайт печёт её сам при первом запросе (`img&f=<имя>&s=1`). Лежат по ЛОКАЛЬНОМУ имени
//! картинки (`thumbs\<ImageFile>.webp`), а берутся по имени картинки НА САЙТЕ: свои картинки
//! сайт при приёме переименовывает.

use super::Ctx;
use crate::error::{Error, Result};
use crate::jsonx;
use crate::model::Dream;
use crate::site::SiteClient;
use crate::store::Store;
use crate::util::url_encode;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::path::PathBuf;

/// Скачать миниатюру картинки сайта `site_name` и положить её под локальным именем `local_name`.
pub async fn fetch(store: &Store, site: &SiteClient, local_name: &str, site_name: &str) -> Result<PathBuf> {
    let bytes = site.download(&format!("api.php?action=img&f={}&s=1", url_encode(site_name))).await?;
    let webp = bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP";
    // не смог испечь — сайт отдаёт саму картинку; годится и она
    let other = bytes.starts_with(&[0xFF, 0xD8, 0xFF]) || bytes.starts_with(b"\x89PNG") || bytes.starts_with(b"GIF8");
    if !webp && !other {
        return Err(Error::msg("Сайт прислал не картинку"));
    }
    store.save_thumb(local_name, &bytes)
}

/// Шаг синхронизации: недостающие миниатюры — с сайта, лишние (картинка сменилась,
/// сон удалён) — прочь. `dreams` — уже слитый список. Возвращает число скачанных.
pub async fn sync(ctx: &Ctx<'_>, dreams: &[Dream], site_dreams: &[Value], site_to_local: &BTreeMap<i64, String>) -> usize {
    // локальный id сна → имя его картинки на сайте
    let site_img: HashMap<&str, String> = site_dreams
        .iter()
        .filter_map(|o| {
            let lid = site_to_local.get(&jsonx::i(o, "id")?)?;
            let f = jsonx::str_or(o, "image_file");
            (!f.is_empty()).then(|| (lid.as_str(), f))
        })
        .collect();
    let mut seen: HashSet<&str> = HashSet::new();
    let need: Vec<(&str, &str)> = dreams
        .iter()
        .filter(|d| !d.image_file.is_empty() && ctx.store.thumb_file(&d.image_file).is_none())
        .filter_map(|d| site_img.get(d.id.as_str()).map(|s| (d.image_file.as_str(), s.as_str())))
        .filter(|(local, _)| seen.insert(local))
        .collect();
    let mut got = 0;
    for (n, (local, site_name)) in need.iter().enumerate() {
        ctx.step(&format!("Миниатюры: {} из {}", n + 1, need.len()), 0.86 + 0.06 * n as f64 / need.len() as f64);
        if fetch(ctx.store, ctx.site, local, site_name).await.is_ok() {
            got += 1;
        }
    }
    // по свежему списку: пока шла сверка, сну могли поставить новую картинку
    prune(ctx.store, &ctx.store.load_dreams());
    got
}

/// Убрать миниатюры картинок, на которые не ссылается ни один сон.
pub fn prune(store: &Store, dreams: &[Dream]) {
    let Ok(rd) = std::fs::read_dir(store.thumbs_dir()) else { return };
    let used: HashSet<String> = dreams.iter().filter(|d| !d.image_file.is_empty()).map(|d| crate::util::safe_file_name(&d.image_file)).collect();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        // «.tmp» — недописанный файл: его доделает или бросит write_atomic, не трогаем
        let Some(img) = name.strip_suffix(".webp") else { continue };
        if !used.contains(img) {
            let _ = std::fs::remove_file(e.path());
        }
    }
}
