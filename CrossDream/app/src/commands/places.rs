//! Места на карте: планеты-локации и авторские координаты снов.

use super::now_stamp;
use crate::state::AppState;
use dream_core::store::data::Planets;
use dream_core::sync::{planets, positions};
use dream_core::{PlanetPos, Result};
use serde::Deserialize;
use tauri::State;

#[tauri::command]
pub fn planets_get(state: State<'_, AppState>) -> Planets {
    state.store().load_planets()
}

/// Место планеты. Без связи штамп ставится свой (новее — главнее), со связью — сайта.
#[tauri::command]
pub async fn planet_set(state: State<'_, AppState>, key: String, pos: PlanetPos) -> Result<()> {
    let store = state.store();
    let key = planets::planet_key(&key);
    if key.is_empty() {
        return Ok(());
    }
    store.edit_planets(|m| {
        m.insert(key.clone(), PlanetPos { time: now_stamp(), ..pos });
    })?;
    if let Some(s) = state.session() {
        let _ = planets::save(&store, &s.site, &[key]).await;
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct PosItem {
    pub id: String,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub z: Option<f64>,
}

/// Координаты снов; элемент без x/y/z — сброс на орбиту.
#[tauri::command]
pub async fn positions_save(state: State<'_, AppState>, items: Vec<PosItem>) -> Result<()> {
    let store = state.store();
    let places: Vec<positions::Place> = items
        .into_iter()
        .map(|it| match (it.x, it.y, it.z) {
            (Some(x), Some(y), Some(z)) => (it.id, Some([x, y, z])),
            _ => (it.id, None),
        })
        .collect();
    let stamp = now_stamp();
    store.edit_dreams(|v| {
        for (id, p) in &places {
            if let Some(d) = v.iter_mut().find(|d| &d.id == id) {
                match p {
                    Some([x, y, z]) => (d.pos_x, d.pos_y, d.pos_z) = (Some(*x), Some(*y), Some(*z)),
                    None => (d.pos_x, d.pos_y, d.pos_z) = (None, None, None),
                }
                d.pos_time = Some(stamp.clone());
            }
        }
    })?;
    if let Some(s) = state.session() {
        let _ = positions::save(&store, &s.site, &places).await;
    }
    Ok(())
}
