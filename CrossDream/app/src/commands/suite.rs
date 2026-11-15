//! Сюита «Гермес» на компьютере: программа скачивается один раз в папку программ пользователя,
//! на рабочем столе появляется ярлык, и она сразу запускается. Уже скачанная — просто запускается.
//! На Windows: `%LOCALAPPDATA%\Programs\Hermes\<имя>\<файл>`. На прочих системах программы сюиты —
//! для Windows: файл кладётся в «Загрузки», как раньше, и запускать его не пытаемся.

use crate::state::AppState;
use dream_core::util::safe_file_name;
use dream_core::{Error, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
#[cfg(windows)]
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SuiteOpened {
    pub path: String,
    /// скачали сейчас (false — уже лежала, только запустили)
    pub downloaded: bool,
    /// запущена (на Windows)
    pub launched: bool,
    /// путь ярлыка на рабочем столе, если он сделан
    pub shortcut: Option<String>,
}

/// Название для ярлыка и папки: «Анкх (Ankh.exe)» → «Анкх».
fn plain_title(title: &str, file: &str) -> String {
    let t = match title.rfind(" (") {
        Some(i) if title.trim_end().ends_with(')') => &title[..i],
        _ => title,
    };
    let t = safe_file_name(t.trim());
    if t.is_empty() { safe_file_name(file.trim_end_matches(".exe")) } else { t }
}

fn suite_dir(app: &AppHandle, st: &AppState, name: &str) -> PathBuf {
    if cfg!(windows) {
        let base = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)
            .or_else(|| app.path().local_data_dir().ok())
            .unwrap_or_else(|| st.download_dir.clone());
        base.join("Programs").join("Hermes").join(name)
    } else {
        st.download_dir.clone()
    }
}

/// Скачать (если ещё нет) и открыть инструмент сюиты; на Windows — ярлык на рабочем столе.
#[tauri::command]
pub async fn suite_open(app: AppHandle, id: i64, file_name: String, title: String, size: Option<i64>) -> Result<SuiteOpened> {
    let st = app.state::<AppState>();
    let file = safe_file_name(&file_name);
    let name = plain_title(&title, &file);
    let dir = suite_dir(&app, &st, &name);
    let path = dir.join(&file);
    // уже скачана целиком — второй раз сайт не дёргаем
    let have = std::fs::metadata(&path).map(|m| size.map_or(m.len() > 0, |s| s > 0 && m.len() == s as u64)).unwrap_or(false);
    if !have {
        let site = st.site()?;
        let bytes = site.download(&format!("api.php?action=file_get&id={id}")).await?;
        if bytes.is_empty() {
            return Err(Error::msg("Сайт вернул пустой файл"));
        }
        std::fs::create_dir_all(&dir)?;
        std::fs::write(&path, &bytes)?;
    }
    let (launched, shortcut) = launch(&app, &name, &path);
    Ok(SuiteOpened { path: path.to_string_lossy().into_owned(), downloaded: !have, launched, shortcut })
}

/// Windows: ярлык на рабочий стол и запуск через оболочку (установщик с правами администратора
/// спросит разрешения, как обычно). Ответ — (запущена, путь ярлыка).
#[cfg(windows)]
fn launch(app: &AppHandle, name: &str, path: &Path) -> (bool, Option<String>) {
    let shortcut = app.path().desktop_dir().ok().and_then(|desk| make_shortcut(&desk, name, path).ok());
    let launched = app.opener().open_path(path.to_string_lossy(), None::<&str>).is_ok();
    (launched, shortcut)
}

/// Прочие системы: программы сюиты — для Windows; файл сохранён, запускать нечего.
#[cfg(not(windows))]
fn launch(_app: &AppHandle, _name: &str, _path: &Path) -> (bool, Option<String>) {
    (false, None)
}

/// Ярлык `<рабочий стол>\<имя>.lnk` на программу (через WScript.Shell; окно PowerShell не показывается).
#[cfg(windows)]
fn make_shortcut(desk: &Path, name: &str, target: &Path) -> Result<String> {
    use std::os::windows::process::CommandExt;
    let lnk = desk.join(format!("{name}.lnk"));
    let q = |p: &Path| p.to_string_lossy().replace('\'', "''");
    let dir = target.parent().unwrap_or(target);
    let script = format!(
        "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{}');$s.TargetPath='{}';$s.WorkingDirectory='{}';$s.IconLocation='{},0';$s.Save()",
        q(&lnk), q(target), q(dir), q(target)
    );
    let st = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status()?;
    if !st.success() {
        return Err(Error::msg("ярлык не создался"));
    }
    Ok(lnk.to_string_lossy().into_owned())
}

