//! Настройки: отдаются без пароля; правка — наложением присланных полей на сохранённые
//! (можно прислать и часть; сохранённый пароль не трогается — он лежит отдельно, в auth.dat).
//! Правка вида карты и палитры уходит на сайт.

use super::now_stamp;
use crate::state::AppState;
use dream_core::store::settings;
use dream_core::sync::{colors, view};
use dream_core::{Error, Result, Settings};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

/// Поля, которые ведёт ядро: интерфейс их не меняет.
const PROTECTED: [&str; 5] = ["SiteLogin", "SitePass", "Profile", "ViewTime", "ColorsDirty"];

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> Settings {
    settings::for_ui(&state.settings())
}

#[tauri::command]
pub async fn settings_set(app: AppHandle, settings: Value) -> Result<()> {
    let st = app.state::<AppState>();
    let Value::Object(patch) = settings else { return Err(Error::msg("Настройки — не объект")) };
    let (moved, recolored) = settings::edit(&st.base, |cur| -> Result<(bool, bool)> {
        let mut merged = serde_json::to_value(&*cur)?;
        if let Value::Object(m) = &mut merged {
            for (k, v) in patch {
                if !PROTECTED.contains(&k.as_str()) {
                    m.insert(k, v);
                }
            }
        }
        let mut new: Settings = serde_json::from_value(merged)?;
        let moved = (cur.map_zoom - new.map_zoom).abs() > 1e-9
            || (cur.map_pan_x - new.map_pan_x).abs() > 1e-9
            || (cur.map_pan_y - new.map_pan_y).abs() > 1e-9;
        if moved {
            new.view_time = now_stamp(); // без связи своё будет новее; сайт потом поставит свой штамп
        }
        let recolored = new.colors != cur.colors;
        if recolored {
            new.colors_dirty = true; // снимется, когда палитра доедет до сайта
        }
        *cur = new;
        Ok((moved, recolored))
    })??;
    if let Some(sess) = st.session() {
        if moved {
            let _ = view::push(&st.base, &sess.site).await;
        }
        if recolored {
            let _ = colors::push(&st.base, &sess.site).await;
        }
    }
    Ok(())
}
