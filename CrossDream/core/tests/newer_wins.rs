//! Правило «новее — главнее» и слияния без сети (нити, книги, локации).

use dream_core::books::BooksFile;
use dream_core::model::{Analysis, Dream};
use dream_core::ops;
use dream_core::sync::books::merge;
use dream_core::sync::links::merge_down;
use dream_core::sync::rule::{decide, Winner};
use serde_json::json;
use std::collections::BTreeMap;

const T1: &str = "2026-05-01 10:00:00";
const T2: &str = "2026-05-01 10:00:05";
const T1_PLUS_1: &str = "2026-05-01 10:00:01";

#[test]
fn newer_side_wins() {
    assert_eq!(decide(true, Some(T2), true, Some(T1)), Winner::Local);
    assert_eq!(decide(true, Some(T1), true, Some(T2)), Winner::Site);
    // разница в секунду — не разница
    assert_eq!(decide(true, Some(T1_PLUS_1), true, Some(T1)), Winner::Same);
    assert_eq!(decide(true, Some(T1), true, Some(T1)), Winner::Same);
}

#[test]
fn missing_side_takes_other() {
    assert_eq!(decide(true, None, false, None), Winner::Local);
    assert_eq!(decide(false, None, true, Some(T1)), Winner::Site);
    assert_eq!(decide(false, None, false, None), Winner::Same);
}

#[test]
fn stamp_beats_no_stamp() {
    assert_eq!(decide(true, Some(T1), true, None), Winner::Local);
    assert_eq!(decide(true, None, true, Some(T1)), Winner::Site);
    assert_eq!(decide(true, None, true, None), Winner::Same);
    // ISO-вид штампа тоже понимается
    assert_eq!(decide(true, Some("2026-05-01T10:00:10Z"), true, Some(T1)), Winner::Local);
}

fn dream(id: &str, loc: &str) -> Dream {
    Dream {
        id: id.into(),
        text: "t".into(),
        analysis: Some(Analysis { location: loc.into(), ..Default::default() }),
        ..Default::default()
    }
}

#[test]
fn links_merge_without_duplicates() {
    let mut v = vec![dream("a", ""), dream("b", "")];
    let map: BTreeMap<i64, String> = [(1, "a".to_string()), (2, "b".to_string())].into();
    let site = vec![
        json!({ "dream_a": "1", "dream_b": 2, "type": "символ", "reason": "вода" }),
        json!({ "dream_a": 1, "dream_b": 2, "type": "символ", "reason": "повтор" }),
        json!({ "dream_a": 1, "dream_b": 99, "type": "сюжет" }),
    ];
    assert_eq!(merge_down(&mut v, &site, &map), 1);
    assert_eq!(v[0].links[0].id, "b");
    assert_eq!(v[0].links[0].reason, "вода");
}

#[test]
fn same_location_links() {
    let mut v = vec![dream("a", "Лес"), dream("b", "лес "), dream("c", "Мост")];
    ops::link_by_location(&mut v, "b");
    assert_eq!(v[1].links.len(), 1);
    assert_eq!(v[1].links[0].id, "a");
    ops::link_by_location(&mut v, "a"); // встречная нить уже есть — новой нет
    assert!(v[0].links.is_empty());
    v[1].analysis.as_mut().unwrap().location = "Мост".into();
    ops::relink_location(&mut v, "b");
    assert_eq!(v[1].links[0].id, "c");
    ops::remove_dream(&mut v, "c");
    assert!(v[1].links.is_empty());
}

#[test]
fn books_merge_mod_and_cache() {
    let modf = BooksFile { path: "books.json".into(), is_mod: true };
    let mut list = vec![json!({ "num": 1, "title": "Свой", "text": "мой текст", "translation": "" })];
    let site = vec![
        json!({ "num": "1", "title": "С сайта", "text": "текст сайта", "translation": "перевод", "location": "Нил" }),
        json!({ "num": 2, "title": "Новая", "text": "т", "translation": "" }),
    ];
    let o = merge(&mut list, &site, &modf);
    assert_eq!((o.gained_books, o.gained_tr, o.changed), (1, 1, true));
    assert_eq!(list[0]["title"], json!("Свой"), "у мода свой текст главнее");
    assert_eq!(list[0]["translation"], json!("перевод"));
    assert_eq!(list[0]["location"], json!("Нил"));
    assert_eq!(list[1]["per_page"], json!(600));

    let cache = BooksFile { path: "books.json".into(), is_mod: false };
    let o = merge(&mut list, &site, &cache);
    assert!(o.changed);
    assert_eq!(list[0]["title"], json!("С сайта"), "копия с сайта повторяет сайт");
    assert!(!merge(&mut list, &site, &cache).changed);
}
