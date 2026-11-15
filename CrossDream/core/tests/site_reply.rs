//! Разбор ответов сайта: {error}, не-JSON, числа строками, сон сайта → сон программы.

use dream_core::site::parse_reply;
use dream_core::sync::convert::{dream_from_site, local_id};
use dream_core::{jsonx, Error};
use serde_json::json;

#[test]
fn ok_reply() {
    let v = parse_reply(200, r#"{"user":{"id":"5","login":"ovk","role":"owner"}}"#).unwrap();
    assert_eq!(jsonx::i(&v["user"], "id"), Some(5));
    // BOM и пробелы не мешают
    assert!(parse_reply(200, "\u{feff}  {\"ok\":true}\n").is_ok());
}

#[test]
fn error_reply() {
    match parse_reply(401, r#"{"error":"Нужен вход"}"#) {
        Err(Error::Site(m)) => assert_eq!(m, "Нужен вход"),
        other => panic!("ждали ошибку сайта, а пришло {other:?}"),
    }
    // текст ошибки уходит в интерфейс без приставок
    let e = parse_reply(400, r#"{"error":"Пустой сон"}"#).unwrap_err();
    assert_eq!(e.to_string(), "Пустой сон");
    // error: null — не ошибка
    assert!(parse_reply(200, r#"{"error":null,"ok":true}"#).is_ok());
}

#[test]
fn not_json_reply() {
    let e = parse_reply(502, "<html>Bad gateway</html>").unwrap_err();
    assert!(e.to_string().contains("HTTP 502"));
}

#[test]
fn lenient_numbers() {
    let o = json!({ "a": "12", "b": 3.5, "c": "0.25", "d": null, "e": 7 });
    assert_eq!(jsonx::i(&o, "a"), Some(12));
    assert_eq!(jsonx::f(&o, "c"), Some(0.25));
    assert_eq!(jsonx::f(&o, "b"), Some(3.5));
    assert_eq!(jsonx::f(&o, "d"), None);
    assert_eq!(jsonx::s(&o, "e").as_deref(), Some("7"));
    assert_eq!(jsonx::s(&o, "nope"), None);
}

#[test]
fn site_dream_converts() {
    let o = json!({
        "id": "17", "ext_id": null, "title": "Мост", "dream_date": "2026-01-05", "text": "Стоял на мосту",
        "summary": "Переход", "location": "Старый каменный мост, над рекой",
        "characters": ["я"], "emotions": [], "symbols": ["вода"], "motifs": [],
        "image_prompt": "bridge", "image_file": "ab.jpg",
        "pos_x": "0.5", "pos_y": "-0.25", "pos_z": "1", "pos_time": "2026-01-06 08:00:00"
    });
    assert_eq!(local_id(&o), "web17");
    let d = dream_from_site(&o);
    assert_eq!(d.id, "web17");
    assert_eq!(d.location(), "Старый каменный мост");
    assert_eq!(d.analysis.as_ref().unwrap().symbols, vec!["вода"]);
    assert_eq!((d.pos_x, d.pos_y, d.pos_z), (Some(0.5), Some(-0.25), Some(1.0)));
    assert!(d.image_file.is_empty(), "картина ставится после скачивания");

    let own = json!({ "id": 3, "ext_id": "d6386", "title": "", "text": "x", "summary": "", "location": "" });
    let d = dream_from_site(&own);
    assert_eq!(d.id, "d6386");
    assert_eq!(d.title, "Сон без имени");
    assert!(d.analysis.is_none());
    assert_eq!(d.pos_x, None);
}

#[test]
fn short_location_like_site() {
    use dream_core::util::short_loc;
    assert_eq!(short_loc("  Двор,  где  стоял дом"), "Двор");
    assert_eq!(short_loc("Очень тёмный густой лес у реки"), "Очень тёмный густой");
    assert_eq!(short_loc("— Мост —"), "Мост");
    assert_eq!(short_loc(""), "");
}

#[test]
fn colors_from_user() {
    use dream_core::sync::colors::from_user;
    let u = json!({ "colors": "{\"локация\":\"#ff0000\",\"dream\":\"#00ff00\"}" });
    assert_eq!(from_user(&u)["локация"], json!("#ff0000"));
    assert!(from_user(&json!({ "colors": null })).is_null());
    assert!(from_user(&json!({ "colors": "" })).is_null());
    assert_eq!(from_user(&json!({ "colors": { "book": "#123" } }))["book"], json!("#123"));
}
