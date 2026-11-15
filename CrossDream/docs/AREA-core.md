# Ядро и команды Tauri — что где

## `core\` — крейт `dream-core` (без Tauri)
| Файл | Что в нём |
|---|---|
| `src\lib.rs` | список модулей, короткие пути к главным типам |
| `src\error.rs` | ошибки (`thiserror`); в интерфейс уходят текстом |
| `src\model.rs` | формы данных: Dream, Analysis, Link, PlanetPos, PdfBook, Settings — поля как в старых JSON, неизвестные поля сохраняются |
| `src\util.rs` | короткое имя локации, случайные имена, логин → профиль, разбор времени сайта, id снов и PDF |
| `src\jsonx.rs` | терпеливое чтение ответов сайта (числа строками и т. п.) |
| `src\ops.rs` | нити по общей локации, удаление сна с нитями |
| `src\books.rs` | где лежат книги: books.json мода (Windows) или копия с сайта в профиле |
| `src\site.rs` | клиент `api.php`: cookie-сессия, GET, POST JSON, multipart, скачивание; `{error}` → ошибка |
| `src\pipeline.rs` | разбор сна ИИ через сайт: ai_analyze → ai_image → ai_links, нити по локации, edit_dream |
| `src\store\mod.rs` | профиль `base\profiles\<логин>`, пути, ключ профиля, замок записи |
| `src\store\files.rs` | атомарная запись, чтение JSON |
| `src\store\data.rs` | сны, планеты, PDF, надгробия, id сайта, раскладка библиотеки |
| `src\store\settings.rs` | общий `settings.json` |
| `src\store\account.rs` | профиль по логину; переезд данных из `local` к первому вошедшему |
| `src\store\creds.rs` | пароль для тихого входа — зашифрованным (`auth.dat`) |
| `src\store\assets.rs` | картинки снов; PDF только зашифрованными |
| `src\vault\mod.rs` | AES-256-GCM, ключ профиля `vault.key` |
| `src\vault\dpapi.rs` | DPAPI Windows (запечатать ключ на пользователя) |
| `src\sync\mod.rs` | `sync_all`: порядок шагов, шкала хода, итог |
| `src\sync\dreams.rs` | сны: import наверх, надгробия, новые с сайта |
| `src\sync\images.rs` | картины: скачать / дослать set_image |
| `src\sync\links.rs` | нити: слить с сайта, отправить add_links пачками |
| `src\sync\positions.rs` | места снов (save_positions) |
| `src\sync\planets.rs` | места планет (save_planet_positions) |
| `src\sync\rule.rs` | правило «новее — главнее» |
| `src\sync\books.rs` | books_import / books_list |
| `src\sync\pdfs.rs` | pdfs_list / pdf_add / pdf_file, память страниц |
| `src\sync\folders.rs` | lib_index → профиль |
| `src\sync\view.rs` | вид карты (save_view) |
| `src\sync\colors.rs` | палитра Settings.Colors (save_settings.colors / user.colors) |
| `src\sync\convert.rs` | сон сайта → сон программы |
| `src\legacy\mod.rs` | перенос из `%APPDATA%\DreamMap` (Windows) |
| `src\legacy\cbc.rs` | старый шифр AES-256-CBC (расшифровка старых PDF) |
| `tests\*.rs` | старые файлы, шифр, ответы сайта, «новее — главнее» |

## `app\src\` — крейт `crossdream`
| Файл | Что в нём |
|---|---|
| `main.rs` / `lib.rs` | вход; плагины dialog и opener; список команд |
| `state.rs` | папка данных, текущий профиль, сессия сайта |
| `auth.rs` | вход/выход, тихий вход сохранённым паролем |
| `startup.rs` | при запуске: тихий вход и `sync_all` в фоне |
| `events.rs` | имена и отправка событий |
| `commands\site.rs` | site_state, site_login, site_logout, site_call, site_upload, site_download |
| `commands\settings.rs` | settings_get, settings_set |
| `commands\dreams.rs` | dreams_list, dream_save, dream_delete, dream_image, dream_set_image, dream_analyze |
| `commands\places.rs` | planets_get, planet_set, positions_save |
| `commands\sync.rs` | sync_all, legacy_import |
| `commands\library.rs` | lib_index, books_get, books_save, suite_download, save_text_file, read_text_file |
| `commands\pdf.rs` | pdfs_list, pdf_add, pdf_add_bytes, pdf_read, pdf_page_set |
