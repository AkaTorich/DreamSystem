//! Вход и выход: смена профиля по логину, пароль — зашифрованным в профиле.

use crate::events;
use crate::state::{AppState, Session};
use dream_core::store::{account, settings};
use dream_core::sync::{colors, view};
use dream_core::util::sanitize_login;
use dream_core::{Error, Result, SiteClient};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub struct Credentials {
    pub server: String,
    pub login: String,
    pub pass: String,
    pub invite: String,
    pub remember: bool,
}

/// Войти (или зарегистрироваться — если задан инвайт). Возвращает пользователя сайта.
pub async fn login(app: &AppHandle, c: Credentials) -> Result<Value> {
    let st = app.state::<AppState>();
    let login = c.login.trim().to_string();
    if login.is_empty() || c.pass.is_empty() {
        return Err(Error::msg("Нужны логин и пароль"));
    }
    let server = if c.server.trim().is_empty() { st.settings().server() } else { c.server.trim().to_string() };
    let site = SiteClient::new(&server)?;
    let action = if c.invite.trim().is_empty() { "login" } else { "register" };
    let body = json!({ "login": login, "pass": c.pass, "invite": c.invite.trim(), "remember": true });
    let j = site.post_json(action, &body).await?;
    let user = j.get("user").cloned().filter(|u| u.is_object()).ok_or_else(|| Error::msg("Сайт не вернул пользователя"))?;

    // другой аккаунт — другой набор данных: сны участников не смешиваются
    let switched = sanitize_login(&login) != st.store().profile;
    if switched {
        let store = account::open_account(&st.base, &login)?;
        st.set_store(Arc::new(store));
    }
    settings::edit(&st.base, |s| {
        s.server_url = server.clone();
        s.site_login = login.clone();
        if switched {
            // вид карты возьмётся из аккаунта сайта
            s.map_zoom = 0.0;
            s.map_pan_x = 0.0;
            s.map_pan_y = 0.0;
            s.view_time.clear();
            // и палитра — тоже аккаунта
            s.colors = serde_json::Value::Null;
            s.colors_dirty = false;
        }
    })?;
    let store = st.store();
    if c.remember {
        store.save_pass(&c.pass)?;
    } else {
        store.forget_pass()?;
    }
    st.set_session(Some(Session { site: site.clone(), user: user.clone() }));
    let _ = view::apply(&st.base, &site, &user).await;
    let _ = colors::apply(&st.base, &site, &user).await;
    if switched {
        events::dreams_changed(app);
        events::library_changed(app);
    }
    Ok(user)
}

/// Выйти: логин и пароль забываются, сны остаются на месте.
pub async fn logout(app: &AppHandle) -> Result<()> {
    let st = app.state::<AppState>();
    if let Some(s) = st.session() {
        let _ = s.site.get("logout").await;
    }
    st.set_session(None);
    st.store().forget_pass()?;
    settings::edit(&st.base, |s| s.site_login.clear())?;
    Ok(())
}

/// Тихий вход сохранённым логином. None — входить нечем.
pub async fn auto_login(app: &AppHandle) -> Option<Result<Value>> {
    let st = app.state::<AppState>();
    let s = st.settings();
    if s.site_login.trim().is_empty() {
        return None;
    }
    let pass = st.store().load_pass()?;
    let c = Credentials { server: s.server(), login: s.site_login.clone(), pass, invite: String::new(), remember: true };
    Some(login(app, c).await)
}
