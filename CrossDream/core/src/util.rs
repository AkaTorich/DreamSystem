//! Мелочи: короткое имя локации, случайные имена, логин → имя профиля, время сервера.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;
use chrono::{DateTime, NaiveDateTime, Utc};

/// Имя локации — подпись под планетой: до первой запятой и не более трёх слов (как short_loc сайта).
pub fn short_loc(s: &str) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.is_empty() {
        return s;
    }
    let s = match s.find(',') {
        Some(i) if i > 0 => &s[..i],
        _ => s.as_str(),
    };
    let w: Vec<&str> = s.split_whitespace().take(3).collect();
    let trim: &[char] = &[' ', '-', '—', ':', ';', '.'];
    w.join(" ").trim_matches(trim).to_string()
}

/// Сравнение локаций без учёта регистра и краевых пробелов.
pub fn same_loc(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim(), b.trim());
    !a.is_empty() && a.to_lowercase() == b.to_lowercase()
}

/// Случайные байты из системного источника.
pub fn random_bytes(n: usize) -> Vec<u8> {
    let mut v = vec![0u8; n];
    OsRng.fill_bytes(&mut v);
    v
}

/// Безымянное имя файла: 32 hex-знака и расширение (как на сервере).
pub fn rand_name(ext: &str) -> String {
    let hex: String = random_bytes(16).iter().map(|b| format!("{b:02x}")).collect();
    if ext.is_empty() { hex } else { format!("{hex}.{ext}") }
}

/// Логин → имя папки профиля (буквы, цифры, «_» и «-»; прочее — «_»).
pub fn sanitize_login(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect()
}

/// Id нового сна: «d» + метка времени (как у старой программы: буква + число).
pub fn new_dream_id() -> String {
    let n = Utc::now().timestamp_nanos_opt().unwrap_or(0) / 100 + 621_355_968_000_000_000;
    format!("d{n}")
}

/// Id нового PDF: «p» + метка времени.
pub fn new_pdf_id() -> String {
    let n = Utc::now().timestamp_nanos_opt().unwrap_or(0) / 100 + 621_355_968_000_000_000;
    format!("p{n}")
}

/// Сегодняшняя дата "YYYY-MM-DD" (местное время).
pub fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Время сервера ("YYYY-MM-DD HH:MM:SS", UTC) → секунды. Понимает и ISO-вид с «T» и поясом.
pub fn parse_time(s: &str) -> Option<i64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Ok(d) = DateTime::parse_from_rfc3339(s) {
        return Some(d.with_timezone(&Utc).timestamp());
    }
    for f in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%dT%H:%M:%S%.f"] {
        if let Ok(d) = NaiveDateTime::parse_from_str(s, f) {
            return Some(d.and_utc().timestamp());
        }
    }
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .ok()
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .map(|d| d.and_utc().timestamp())
}

/// Безопасное имя файла: без путей и запретных знаков.
pub fn safe_file_name(s: &str) -> String {
    let base = s.rsplit(['/', '\\']).next().unwrap_or("").trim();
    let clean: String = base
        .chars()
        .map(|c| if "<>:\"|?*".contains(c) || c.is_control() { '_' } else { c })
        .collect();
    if clean.is_empty() || clean == "." || clean == ".." { "file".into() } else { clean }
}

/// Простой хеш FNV-1a — для имён файлов кеша.
pub fn fnv_hex(s: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// Кодирование значения для строки запроса (%XX для всего, кроме букв, цифр и -_.~).
pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}
