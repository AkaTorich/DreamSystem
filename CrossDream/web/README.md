# CrossDream в браузере — прослойка `web\shim\`

Тот же интерфейс `app\ui` работает на сайте dream.globthe.top без Rust: прослойка подставляет
`window.__TAURI__` и выполняет каждую команду `docs\CONTRACT.md` через `api.php` сайта — с той же формой
данных и теми же событиями, что у ядра. Ставит и `window.__CD_WEB__ = true`.

## Что где
| файл | что делает |
|---|---|
| `shim\tauri.js` | вход: `window.__TAURI__ = {core: {invoke, convertFileSrc}, event: {listen, once, emit}, dialog: {open, save, ask, confirm, message}}`, свод команд |
| `shim\lib\http.js` | вызовы `api.php` (GET, POST JSON, multipart, скачивание с ходом, отправка с ходом через XMLHttpRequest); `{error}` → ошибка |
| `shim\lib\session.js` | вошедший пользователь (по cookie страницы), «Сначала войдите на сайт» |
| `shim\lib\store.js` | localStorage: настройки (форма `Settings` ядра) |
| `shim\lib\viewsync.js` | вид карты и палитра: «новее — главнее», как `sync\view.rs`, `sync\colors.rs` |
| `shim\lib\dialog.js` | диалоги на HTML; выбранный файл — строка-указатель `cdfile:<n>/<имя>` |
| `shim\lib\events.js` | события «ядра» (`sync://…`, `pipeline://step`, `dreams://changed`, …) |
| `shim\lib\dreams-cache.js` | сны сайта → форма `Dream` (как `sync\convert.rs`), номера на сайте, нити, планеты |
| `shim\lib\dream-links.js` | нити по общей локации (`ops.rs`) и донесение разницы нитей до сайта |
| `shim\lib\dream-site.js` | `edit_dream`, `set_image`, `import` одного сна |
| `shim\lib\pdf-cache.js` | PDF сайта → форма `PdfBook`, уходящие на сайт PDF, адрес книги для pdf.js |
| `shim\lib\pdf-upload.js` | фоновая отправка PDF с ходом, своя обложка на сайт |
| `shim\lib\util.js` | `short_loc`, Id снов и PDF, штампы времени, правило «новее — главнее», base64 |
| `shim\cmd\*.js` | команды по областям: site, settings, dreams, pipeline, places, sync, library, pdf, pdf-add, covers |
| `check.html` | проверка: все модули грузятся, каждая команда договора есть, мелочи считаются верно |

## Как поставить на сайт
`tools\build-web.ps1 -Deploy` — собирает `app\ui` + `web\shim` в `web-dist\` (прослойка подключается в `index.html`
раньше `js/main.js`) и выкладывает в **корень** dream.globthe.top: сайт — это и есть программа.
На сервере `tools\deploy-web.sh` заменяет только свои имена (`index.html`, `css`, `fonts`, `js`, `shim`, `vendor`),
api.php и прочее серверное не трогает. `api.php` берётся как `../api.php` от страницы (из корня — `/api.php`);
иной адрес — `window.__CD_API__ = '…'` до прослойки.

Проверка без входа: открыть `web/check.html` через любой сервер (не `file://`) — внизу «ВСЁ ХОРОШО».

## Команды → api.php
| команда | действие api.php | заметки |
|---|---|---|
| `site_state` | `me` | `{online, user, server}`; при входе сверяет вид карты и палитру (`save_view`, `save_settings`) |
| `site_login` | `login` / `register` (+ `save_view`, `save_settings`) | после входа — `sync_all` в фоне |
| `site_logout` | `logout` | |
| `site_call` | любое (`GET` / `POST` JSON) | ответ как есть |
| `site_upload` | любое (multipart) | |
| `site_download` | любой путь (`api.php?action=img…`, `gift_icon`, `file_icon`) | ответ — адрес `blob:`, второй раз не качается |
| `settings_get` / `settings_set` | — (localStorage); `save_view`, `save_settings.colors` | вид и палитра — на сайт, как у ядра |
| `dreams_list` | `dreams` | форма `Dream`; Id — `ext_id` либо `web<id>`; нити — у сна `dream_a` |
| `dream_save` | новый: `import` + `dreams` + `add_links` (+ `save_positions`); прежний: `edit_dream`, `add_links` / `del_link` | нити по общей локации — как ядро |
| `dream_delete` | `del_dream` | затем `dreams://changed` |
| `dream_image` / `dream_thumb` | адрес `img&f=…` / `img&f=…&s=1` | `convertFileSrc` отдаёт адрес как есть |
| `dream_set_image` | `set_image` (`replace=1`) | |
| `dream_analyze` | `ai_analyze` → `ai_image` + `set_image` → `ai_links`; `edit_dream`, `add_links` | шаги `pipeline://step`, затем `dreams://changed` |
| `planets_get` / `planet_set` | `dreams` (поле planets) / `save_planet_positions` | |
| `positions_save` | `save_positions` | |
| `sync_all` | `dreams`, `books_list`, `pdfs_list`, `me`, `lib_index` (+ повтор неушедших `pdf_add`) | `sync://progress`, `sync://done`, `*://changed` — если изменилось; раз в 5 минут — сама |
| `lib_index` | `lib_index` | |
| `books_get` / `books_save` | `books_list` / `books_import` | `{path: null, books}` |
| `pdfs_list` / `pdfs_refresh` | `pdfs_list` | `File` непустой; `pdfs_refresh` шлёт `library://changed` |
| `pdf_open` | — | ответ `Size`; книгу pdf.js берёт по `convertFileSrc(id, 'cdpdf')` → `pdf_file&id=<SiteId>` |
| `pdf_read` | `pdf_file` | `ArrayBuffer`, ход `pdf://progress` |
| `pdf_add` / `pdf_add_bytes` | `pdf_add` (XMLHttpRequest), при повторе — `pdfs_list`; вслед `pdf_rename`, `pdf_cover_set`, `pdf_del` | ответ сразу; `upload://progress`, `upload://done`, `library://changed` |
| `pdf_page_set` | `pdf_page` | память страницы — и в localStorage |
| `pdf_rename` | `pdf_rename` | |
| `pdf_delete` | `pdf_del` (`localOnly` — ничего) | |
| `cover_get` / `cover_put` | адрес `pdf_cover&id=…` / `pdf_cover_set` | |
| `suite_download` | `file_get` | скачивание браузером |
| `save_text_file` | — | скачивание Blob под именем из диалога сохранения |
| `read_text_file` | — | текст выбранного файла |
| `legacy_import` | — | ошибка «Перенос из прежней программы — только в программе для Windows» |
