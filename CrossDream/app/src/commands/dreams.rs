//! Сны: список, запись, удаление с надгробием, картина и её миниатюра для карты, разбор ИИ.

use super::b64;
use crate::events;
use crate::state::AppState;
use dream_core::ops::{link_by_location, relink_location, remove_dream};
use dream_core::pipeline::{self, Step};
use dream_core::site::FilePart;
use dream_core::sync::thumbs;
use dream_core::store::assets::image_mime;
use dream_core::util::{new_dream_id, short_loc, today};
use dream_core::{Dream, Error, Result};
use tauri::{AppHandle, Emitter, Manager, State};

#[tauri::command]
pub fn dreams_list(state: State<'_, AppState>) -> Vec<Dream> {
    state.store().dreams_sorted()
}

/// Записать сон. Новый получает Id; у прежнего места на карте не трогаются (их ведёт positions_save).
#[tauri::command]
pub async fn dream_save(state: State<'_, AppState>, dream: Dream) -> Result<Dream> {
    let store = state.store();
    let mut d = dream;
    d.text = d.text.trim().to_string();
    if d.text.is_empty() {
        return Err(Error::msg("Запись не может быть пустой"));
    }
    d.title = d.title.trim().to_string();
    if d.title.is_empty() {
        d.title = "Сон без имени".into();
    }
    if d.date.trim().is_empty() {
        d.date = today();
    }
    if let Some(a) = d.analysis.as_mut() {
        a.location = short_loc(&a.location);
    }
    if d.id.trim().is_empty() {
        d.id = new_dream_id();
    }
    let (saved, existed) = store.edit_dreams(|v| {
        let existed = match v.iter_mut().find(|x| x.id == d.id) {
            Some(x) => {
                let loc_changed = x.location().to_lowercase() != d.location().to_lowercase();
                let mut n = d.clone();
                (n.pos_x, n.pos_y, n.pos_z, n.pos_time) = (x.pos_x, x.pos_y, x.pos_z, x.pos_time.clone());
                *x = n;
                if loc_changed {
                    relink_location(v, &d.id);
                }
                true
            }
            None => {
                v.push(d.clone());
                link_by_location(v, &d.id);
                false
            }
        };
        (v.iter().find(|x| x.id == d.id).cloned(), existed)
    })?;
    let saved = saved.ok_or_else(|| Error::msg("Сон не записался"))?;
    if existed {
        if let Some(s) = state.session() {
            pipeline::push_edit(&store, &s.site, &saved).await;
        }
    }
    Ok(saved)
}

/// Удалить здесь, поставить надгробие и удалить на сайте (если нет связи — доедет при синхронизации).
#[tauri::command]
pub async fn dream_delete(app: AppHandle, id: String) -> Result<()> {
    let st = app.state::<AppState>();
    let store = st.store();
    let site_id = store.site_id_of(&id);
    store.edit_dreams(|v| {
        if let Some(d) = remove_dream(v, &id) {
            store.drop_image_if_unused(&d.image_file, v);
        }
    })?;
    store.add_graves(std::slice::from_ref(&id))?;
    events::dreams_changed(&app);
    if let (Some(s), Some(sid)) = (st.session(), site_id) {
        // не вышло — надгробие доведёт удаление при следующей синхронизации
        let _ = s.site.post_json("del_dream", &serde_json::json!({ "id": sid })).await;
    }
    Ok(())
}

#[tauri::command]
pub fn dream_image(state: State<'_, AppState>, id: String) -> Option<String> {
    let store = state.store();
    let d = store.load_dreams().into_iter().find(|d| d.id == id)?;
    store.image_path(&d).map(|p| p.to_string_lossy().into_owned())
}

/// Поставить сну свою картину; на сайт она уезжает сразу (с заменой прежней).
#[tauri::command]
pub async fn dream_set_image(app: AppHandle, state: State<'_, AppState>, id: String, bytes_b64: String) -> Result<Dream> {
    crate::autosync::soon(&app);
    let store = state.store();
    let bytes = b64(&bytes_b64)?;
    let name = store.save_image(&bytes)?;
    let saved = store.edit_dreams(|v| {
        let old = v.iter_mut().find(|d| d.id == id).map(|d| std::mem::replace(&mut d.image_file, name.clone()));
        if let Some(old) = old {
            store.drop_image_if_unused(&old, v);
        }
        v.iter().find(|d| d.id == id).cloned()
    })?;
    let saved = saved.ok_or_else(|| Error::msg("Сон не найден"))?;
    if let (Some(s), Some(sid)) = (state.session(), store.site_id_of(&id)) {
        let part = FilePart::new("image", &name, bytes, image_mime(&name));
        let fields = [("id".to_string(), sid.to_string()), ("replace".to_string(), "1".to_string())];
        if let Ok(r) = s.site.upload("set_image", vec![part], &fields).await {
            // сайт хранит картинку под своим именем — по нему и миниатюра для карты
            // (готова до ответа: перерисовка после ответа её уже найдёт)
            let site_name = r["image_file"].as_str().unwrap_or("");
            if !site_name.is_empty() {
                let _ = thumbs::fetch(&store, &s.site, &name, site_name).await;
            }
        }
    }
    Ok(saved)
}

/// Миниатюра картинки сна для карты (160×160 WebP): путь, если файл есть; нет — при входе
/// скачать с сайта сейчас. `null` — миниатюры нет (интерфейс уменьшит полную картинку сам).
#[tauri::command]
pub async fn dream_thumb(app: AppHandle, id: String) -> Option<String> {
    let st = app.state::<AppState>();
    let store = st.store();
    let d = store.load_dreams().into_iter().find(|d| d.id == id)?;
    if d.image_file.trim().is_empty() {
        return None;
    }
    let path = |p: std::path::PathBuf| p.to_string_lossy().into_owned();
    if let Some(p) = store.thumb_file(&d.image_file) {
        return Some(path(p));
    }
    // сон есть на сайте, и миниатюру этого имени сайт ещё не отказывался отдать
    let sess = st.session()?;
    store.site_id_of(&id)?;
    if st.thumb_missed(&d.image_file) {
        return None;
    }
    let key = format!("thumb:{}", d.image_file);
    let lock = st.pdf_lock(&key);
    let res = async {
        let _g = lock.lock().await;
        if let Some(p) = store.thumb_file(&d.image_file) {
            return Some(path(p));
        }
        // своя картинка лежит на сайте под другим именем — её миниатюру привезёт синхронизация
        match thumbs::fetch(&store, &sess.site, &d.image_file, &d.image_file).await {
            Ok(p) => Some(path(p)),
            Err(_) => {
                st.thumb_miss(&d.image_file);
                None
            }
        }
    }
    .await;
    drop(lock);
    st.pdf_lock_release(&key);
    res
}

/// Разбор ИИ через сайт; ход — события `pipeline://step`.
#[tauri::command]
pub async fn dream_analyze(app: AppHandle, id: String, forced_location: Option<String>, want_image: bool) -> Result<Dream> {
    let st = app.state::<AppState>();
    let site = st.site()?;
    let store = st.store();
    let a = app.clone();
    let on_step = move |s: Step| {
        let _ = a.emit(events::PIPELINE_STEP, s);
    };
    let d = pipeline::analyze(&store, &site, &id, forced_location.as_deref(), want_image, &on_step).await?;
    events::dreams_changed(&app);
    crate::autosync::soon(&app); // разбор, картина и нити — на сайт
    Ok(d)
}
