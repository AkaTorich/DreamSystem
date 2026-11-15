//! Синхронизация всего с сайтом и разовый перенос из старой программы.

use crate::events;
use crate::state::AppState;
use dream_core::legacy::{self, LegacyReport};
use dream_core::sync::{self, SyncReport};
use dream_core::Result;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};

/// Одна синхронизация за раз; ход — `sync://progress`, итог — `sync://done`.
pub async fn run_sync(app: &AppHandle) -> SyncReport {
    let st = app.state::<AppState>();
    let Some(sess) = st.session() else {
        let rep = SyncReport { ok: false, message: "Сначала войдите на сайт".into(), ..Default::default() };
        events::sync_done(app, rep.ok, &rep.message);
        return rep;
    };
    if st.syncing.swap(true, Ordering::SeqCst) {
        return SyncReport { ok: false, message: "Синхронизация уже идёт".into(), ..Default::default() };
    }
    let store = st.store();
    let a = app.clone();
    let progress = move |text: &str, pct: f64| events::sync_progress(&a, text, pct);
    let rep = sync::sync_all(&store, &sess.site, &progress, st.docs_dir.as_deref()).await;
    st.syncing.store(false, Ordering::SeqCst);
    events::sync_done(app, rep.ok, &rep.message);
    if rep.dreams_changed {
        events::dreams_changed(app);
    }
    if rep.library_changed {
        events::library_changed(app);
    }
    rep
}

#[tauri::command]
pub async fn sync_all(app: AppHandle) -> SyncReport {
    run_sync(&app).await
}

/// Перенос снов, картинок, планет и PDF из %APPDATA%\DreamMap (только Windows),
/// а с `path` — из выбранного dreams.json (другая машина; любая система).
#[tauri::command]
pub async fn legacy_import(app: AppHandle, path: Option<String>) -> Result<LegacyReport> {
    let st = app.state::<AppState>();
    let store = st.store();
    let login = st.settings().site_login;
    let path = path.filter(|p| !p.trim().is_empty());
    let rep = tauri::async_runtime::spawn_blocking(move || match path {
        Some(p) => legacy::import_file(&store, std::path::Path::new(&p)),
        None => legacy::import(&store, &login),
    })
        .await
        .map_err(|e| dream_core::Error::msg(e.to_string()))??;
    if rep.dreams + rep.images > 0 {
        events::dreams_changed(&app);
        crate::autosync::soon(&app); // перенесённое — сразу на сайт
    }
    if rep.pdfs > 0 {
        events::library_changed(&app);
    }
    Ok(rep)
}
