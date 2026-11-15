//! CrossDream — точка входа, общая для ПК и телефонов (на телефонах её зовёт мобильная оболочка).

mod auth;
mod autosync;
mod commands;
mod events;
mod pdfproto;
mod startup;
mod state;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .register_asynchronous_uri_scheme_protocol("cdpdf", pdfproto::handle)   // книги для pdf.js — кусками
        .setup(|app| {
            let base = app.path().app_data_dir()?;
            let docs = app.path().document_dir().ok();
            let downloads = app.path().download_dir().unwrap_or_else(|_| base.join("downloads"));
            app.manage(state::AppState::open(base, docs, downloads)?);
            startup::spawn(app.handle().clone());
            autosync::start_periodic(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::site::site_state,
            commands::site::site_login,
            commands::site::site_logout,
            commands::site::site_call,
            commands::site::site_upload,
            commands::site::site_download,
            commands::settings::settings_get,
            commands::settings::settings_set,
            commands::dreams::dreams_list,
            commands::dreams::dream_save,
            commands::dreams::dream_delete,
            commands::dreams::dream_image,
            commands::dreams::dream_set_image,
            commands::dreams::dream_thumb,
            commands::dreams::dream_analyze,
            commands::places::planets_get,
            commands::places::planet_set,
            commands::places::positions_save,
            commands::sync::sync_all,
            commands::sync::legacy_import,
            commands::library::lib_index,
            commands::library::books_get,
            commands::library::books_save,
            commands::library::suite_download,
            commands::suite::suite_open,
            commands::library::save_text_file,
            commands::library::read_text_file,
            commands::pdf::pdfs_list,
            commands::pdf_add::pdf_add,
            commands::pdf_add::pdf_add_bytes,
            commands::pdf::pdf_read,
            commands::pdf::pdf_open,
            commands::pdf::pdf_delete,
            commands::pdf::pdf_rename,
            commands::pdf::pdfs_refresh,
            commands::pdf::pdf_page_set,
            commands::covers::cover_get,
            commands::covers::cover_put,
        ])
        .run(tauri::generate_context!())
        .expect("CrossDream не запустился");
}
