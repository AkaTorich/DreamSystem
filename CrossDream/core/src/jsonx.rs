//! Терпеливое чтение ответов сайта: MySQL через PDO отдаёт числа то числами, то строками.

use serde_json::Value;

/// Строка поля; null/нет — None; число — его запись.
pub fn s(v: &Value, key: &str) -> Option<String> {
    match v.get(key)? {
        Value::String(x) => Some(x.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    }
}

/// Строка поля или пусто.
pub fn str_or(v: &Value, key: &str) -> String {
    s(v, key).unwrap_or_default()
}

/// Целое из числа или строки.
pub fn i(v: &Value, key: &str) -> Option<i64> {
    match v.get(key)? {
        Value::Number(n) => n.as_i64().or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(x) => x.trim().parse::<i64>().ok().or_else(|| x.trim().parse::<f64>().ok().map(|f| f as i64)),
        Value::Bool(b) => Some(*b as i64),
        _ => None,
    }
}

/// Дробное из числа или строки; null — None.
pub fn f(v: &Value, key: &str) -> Option<f64> {
    match v.get(key)? {
        Value::Number(n) => n.as_f64(),
        Value::String(x) => x.trim().parse::<f64>().ok(),
        _ => None,
    }
}

/// Массив поля или пустой срез.
pub fn arr<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(|a| a.as_array()).map(|a| a.as_slice()).unwrap_or(&[])
}

/// Список строк (элементы-числа тоже превращаются в строки).
pub fn strings(v: &Value, key: &str) -> Vec<String> {
    arr(v, key)
        .iter()
        .filter_map(|x| match x {
            Value::String(s) => Some(s.clone()),
            Value::Null => None,
            other => Some(other.to_string()),
        })
        .collect()
}
