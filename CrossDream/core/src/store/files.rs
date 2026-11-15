//! Чтение и атомарная запись файлов: сперва во временный рядом, затем подмена одним шагом.

use crate::error::Result;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::path::Path;

/// Записать байты целиком: `<путь>.tmp` → переименование поверх старого.
pub fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// JSON с отступами, атомарно.
pub fn write_json<T: Serialize + ?Sized>(path: &Path, v: &T) -> Result<()> {
    write_atomic(path, &serde_json::to_vec_pretty(v)?)
}

/// Прочитать JSON; нет файла — значение по умолчанию. BOM в начале не мешает.
pub fn read_json<T: DeserializeOwned + Default>(path: &Path) -> Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    let raw = std::fs::read(path)?;
    let raw = raw.strip_prefix(b"\xEF\xBB\xBF".as_slice()).unwrap_or(&raw);
    if raw.iter().all(|b| b.is_ascii_whitespace()) {
        return Ok(T::default());
    }
    Ok(serde_json::from_slice(raw)?)
}

/// То же, но испорченный файл тоже даёт значение по умолчанию (как старая программа).
pub fn read_json_lenient<T: DeserializeOwned + Default>(path: &Path) -> T {
    read_json(path).unwrap_or_default()
}
