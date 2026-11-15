//! Чтение старых файлов DreamMap: dreams.json, settings.json; хранилище профиля.

use dream_core::model::{Dream, Settings};
use dream_core::store::{account, settings, Store};
use serde_json::{json, Value};
use std::path::PathBuf;

fn sample() -> Vec<Dream> {
    let raw = include_str!("data/dreams_old.json");
    serde_json::from_str(raw).expect("старый dreams.json читается")
}

fn tmp(name: &str) -> PathBuf {
    let p = PathBuf::from(env!("CARGO_TARGET_TMPDIR")).join(name).join(dream_core::util::rand_name(""));
    std::fs::create_dir_all(&p).unwrap();
    p
}

#[test]
fn old_dreams_read() {
    let v = sample();
    assert_eq!(v.len(), 2);
    let a = &v[0];
    assert_eq!(a.title, "Тёмный лес");
    assert_eq!(a.location(), "Тёмный лес");
    assert_eq!(a.analysis.as_ref().unwrap().characters, vec!["я", "старик"]);
    assert_eq!(a.links[0].r#type, "локация");
    assert_eq!(a.pos_x, Some(0.25));
    assert_eq!(a.pos_time.as_deref(), Some("2026-03-02 10:00:00"));
    // null в строках и списках — пусто, не ошибка
    let b = &v[1];
    assert_eq!(b.title, "");
    assert!(b.analysis.is_none());
    assert!(b.links.is_empty());
    assert_eq!(b.pos_x, None);
}

#[test]
fn unknown_fields_survive_round_trip() {
    let v = sample();
    let out = serde_json::to_value(&v).unwrap();
    assert_eq!(out[0]["Mood"], json!("старое поле, которого нет в программе"));
    assert_eq!(out[0]["ImagePrompt"], json!("dark forest, mist"));
    assert_eq!(out[0]["Analysis"]["Summary"], json!("Путь через лес к реке."));
    assert_eq!(out[0]["Links"][0]["Id"], json!("web42"));
    let back: Vec<Dream> = serde_json::from_value(out).unwrap();
    assert_eq!(back, v);
}

#[test]
fn settings_password_never_written() {
    let s: Settings = serde_json::from_value(json!({
        "SiteLogin": "ovk", "SitePass": "секрет", "MapZoom": 1.5, "ProfileOwner": "ovk",
        "PdfPage": { "p1": 12 }
    }))
    .unwrap();
    assert_eq!(s.legacy_pass, "секрет");
    assert_eq!(s.pdf_page.get("p1"), Some(&12));
    let out: Value = serde_json::to_value(&s).unwrap();
    assert!(out.get("SitePass").is_none());
    assert_eq!(out["ProfileOwner"], json!("ovk"));
    assert_eq!(out["ServerUrl"], json!("https://dream.globthe.top"));
}

#[test]
fn store_profiles_and_files() {
    let base = tmp("store");
    let st = Store::open(&base, " Ovk User ").unwrap();
    assert_eq!(st.profile, "ovk_user");
    st.save_dreams(&sample()).unwrap();
    st.edit_dreams(|v| v[1].title = "Снова лес".into()).unwrap();
    let sorted = st.dreams_sorted();
    assert_eq!(sorted[0].id, "web42");
    assert_eq!(sorted[0].title, "Снова лес");
    assert_eq!(st.site_id_of("web42"), Some(42));

    let pdf = b"%PDF-1.4 test".to_vec();
    let file = st.stash_pdf("p1", &pdf).unwrap();
    let raw = std::fs::read(st.pdf_dir().join(&file)).unwrap();
    assert!(!raw.windows(5).any(|w| w == b"%PDF-"), "на диске PDF лежит открытым");
    let book = dream_core::PdfBook { id: "p1".into(), title: "T".into(), file, ..Default::default() };
    assert_eq!(st.read_pdf(&book).unwrap(), pdf);

    st.save_pass("пароль").unwrap();
    assert_eq!(st.load_pass().as_deref(), Some("пароль"));
    st.forget_pass().unwrap();
    assert_eq!(st.load_pass(), None);
}

#[test]
fn local_profile_moves_to_first_account() {
    let base = tmp("account");
    let local = Store::open(&base, "").unwrap();
    local.save_dreams(&sample()).unwrap();
    let acc = account::open_account(&base, "Ovk").unwrap();
    assert_eq!(acc.profile, "ovk");
    assert_eq!(acc.load_dreams().len(), 2);
    assert_eq!(settings::load(&base).profile, "ovk");
    // второй аккаунт чужие сны не получает
    let other = account::open_account(&base, "guest").unwrap();
    assert!(other.load_dreams().is_empty());
}
