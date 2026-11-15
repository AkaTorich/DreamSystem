//! Картинки снов и PDF на полке профиля. PDF лежат только зашифрованными (`<id>.enc`),
//! расшифровка — только в память. Обложки PDF — открытыми WebP/JPEG в `covers\`.
//! Миниатюры картинок снов (квадрат 160×160 WebP с сайта, для карты) — `thumbs\<ImageFile>.webp`.

use super::files::write_atomic;
use super::Store;
use crate::error::{Error, Result};
use crate::model::{Dream, PdfBook};
use std::path::PathBuf;

impl Store {
    /// Полный путь картинки сна, если файл есть.
    pub fn image_path(&self, d: &Dream) -> Option<PathBuf> {
        image_in(&self.images_dir(), &d.image_file)
    }

    pub fn image_path_by_name(&self, name: &str) -> Option<PathBuf> {
        image_in(&self.images_dir(), name)
    }

    /// Положить картинку под случайным именем; расширение — по сигнатуре.
    pub fn save_image(&self, bytes: &[u8]) -> Result<String> {
        let name = crate::util::rand_name(image_ext(bytes));
        write_atomic(&self.images_dir().join(&name), bytes)?;
        Ok(name)
    }

    /// Положить картинку под заданным именем (имя с сайта — уже случайный хеш).
    pub fn save_image_named(&self, name: &str, bytes: &[u8]) -> Result<String> {
        let name = crate::util::safe_file_name(name);
        write_atomic(&self.images_dir().join(&name), bytes)?;
        Ok(name)
    }

    /// Удалить файл картинки (и её миниатюру), если на неё больше не ссылается ни один сон.
    pub fn drop_image_if_unused(&self, name: &str, dreams: &[Dream]) {
        if name.is_empty() || dreams.iter().any(|d| d.image_file == name) {
            return;
        }
        if let Some(p) = self.image_path_by_name(name) {
            let _ = std::fs::remove_file(p);
        }
        self.remove_thumb(name);
    }

    pub fn thumbs_dir(&self) -> PathBuf {
        self.dir().join("thumbs")
    }

    /// Путь миниатюры картинки сна (по локальному имени картинки), есть файл или нет.
    pub fn thumb_path(&self, image_file: &str) -> PathBuf {
        self.thumbs_dir().join(format!("{}.webp", crate::util::safe_file_name(image_file)))
    }

    /// Путь миниатюры, если файл есть.
    pub fn thumb_file(&self, image_file: &str) -> Option<PathBuf> {
        if image_file.trim().is_empty() {
            return None;
        }
        let p = self.thumb_path(image_file);
        p.exists().then_some(p)
    }

    pub fn save_thumb(&self, image_file: &str, bytes: &[u8]) -> Result<PathBuf> {
        let p = self.thumb_path(image_file);
        write_atomic(&p, bytes)?;
        Ok(p)
    }

    pub fn remove_thumb(&self, image_file: &str) {
        if !image_file.trim().is_empty() {
            let _ = std::fs::remove_file(self.thumb_path(image_file));
        }
    }

    pub fn pdf_path(&self, p: &PdfBook) -> PathBuf {
        self.pdf_dir().join(crate::util::safe_file_name(&p.file))
    }

    /// Открытые байты PDF → `<id>.enc` под ключом профиля. Возвращает имя файла.
    pub fn stash_pdf(&self, id: &str, bytes: &[u8]) -> Result<String> {
        let file = format!("{}.enc", crate::util::safe_file_name(id));
        self.vault()?.encrypt_to_file(bytes, &self.pdf_dir().join(&file))?;
        Ok(file)
    }

    /// Есть ли файл этого PDF на устройстве (`File` пуст — запись пришла с сайта без файла).
    pub fn has_pdf_file(&self, p: &PdfBook) -> bool {
        !p.file.trim().is_empty() && self.pdf_path(p).exists()
    }

    /// Обложки PDF: `<профиль>\covers\<id>.webp` (испечённая сайтом) либо `<id>.jpg`
    /// (нарисованная здесь, пока книги нет на сайте).
    pub fn covers_dir(&self) -> PathBuf {
        self.dir().join("covers")
    }

    /// Путь обложки с расширением `ext` («webp» | «jpg»), есть файл или нет.
    pub fn cover_path(&self, id: &str, ext: &str) -> PathBuf {
        self.covers_dir().join(format!("{}.{ext}", crate::util::safe_file_name(id)))
    }

    /// Путь обложки, если файл есть: сперва `.webp`, потом `.jpg`.
    pub fn cover_file(&self, id: &str) -> Option<PathBuf> {
        ["webp", "jpg"].iter().map(|e| self.cover_path(id, e)).find(|p| p.exists())
    }

    /// Положить обложку; расширение — по сигнатуре (WebP либо JPEG).
    pub fn save_cover(&self, id: &str, bytes: &[u8]) -> Result<PathBuf> {
        let ext = if image_ext(bytes) == "webp" { "webp" } else { "jpg" };
        let p = self.cover_path(id, ext);
        write_atomic(&p, bytes)?;
        Ok(p)
    }

    /// Удалить обе обложки (`.webp` и `.jpg`).
    pub fn remove_cover(&self, id: &str) {
        let _ = std::fs::remove_file(self.cover_path(id, "webp"));
        let _ = std::fs::remove_file(self.cover_path(id, "jpg"));
    }

    /// PDF в память (на диск открытым не пишется никогда).
    pub fn read_pdf(&self, p: &PdfBook) -> Result<Vec<u8>> {
        let path = self.pdf_path(p);
        if p.file.trim().is_empty() || !path.exists() {
            return Err(Error::msg(format!("нет файла PDF «{}»", p.title)));
        }
        self.vault()?.decrypt_file(&path)
    }
}

fn image_in(dir: &std::path::Path, name: &str) -> Option<PathBuf> {
    if name.trim().is_empty() {
        return None;
    }
    let p = dir.join(crate::util::safe_file_name(name));
    p.exists().then_some(p)
}

/// Расширение по первым байтам: png, webp, gif, иначе jpg.
pub fn image_ext(b: &[u8]) -> &'static str {
    if b.starts_with(b"\x89PNG") {
        "png"
    } else if b.len() > 12 && &b[..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        "webp"
    } else if b.starts_with(b"GIF8") {
        "gif"
    } else {
        "jpg"
    }
}

/// MIME картинки по имени файла.
pub fn image_mime(name: &str) -> &'static str {
    let n = name.to_lowercase();
    if n.ends_with(".png") {
        "image/png"
    } else if n.ends_with(".webp") {
        "image/webp"
    } else if n.ends_with(".gif") {
        "image/gif"
    } else {
        "image/jpeg"
    }
}
