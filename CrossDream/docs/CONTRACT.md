# Договор: ядро (Rust) ↔ интерфейс (JS)

Ядро реализует ровно эти команды и события. Интерфейс зовёт их только через `app/ui/js/shell/api.js`
(`invoke`, `site`, `listen`, `fileSrc`). Новые команды добавляет только ядро — и дописывает их сюда.

## Формы данных
Имена полей — **как в старых файлах DreamMap** (dreams.json, settings.json — с большой буквы), чтобы
старые данные читались без переделки. Аргументы команд из JS — в camelCase (так Tauri 2 сводит их
с параметрами Rust в snake_case).

```
Dream     { Id, Title, Date "YYYY-MM-DD", Text, Analysis|null, ImagePrompt, ImageFile,
            Links: [Link], PosX|null, PosY|null, PosZ|null, PosTime|null }
Analysis  { Summary, Location, Characters[], Emotions[], Symbols[], Motifs[] }
Link      { Id, Type: "локация"|"персонаж"|"эмоция"|"символ"|"сюжет", Reason }
PlanetPos { X, Y, Z, Time }
PdfBook   { Id, Title, File, LastPage, SiteId, Size }  // File "" — файла на этом устройстве ещё нет; SiteId 0 — номер на сайте неизвестен; Size — байт на сайте
Settings  { TextModel, ImageModel, GenImages, ServerUrl, SiteLogin, PdfZoom, MapZoom, MapPanX, MapPanY,
            MapLinks, ViewTime, PdfPage: {id: page}, BooksPath, Colors|null }  // пароль в ответах НЕ отдаётся
User      — объект user из ответа сайта (id, login, role, colors, map_view, key_issued, …)
```
Сервер по умолчанию — `https://dream.globthe.top`.

## Команды
| команда | аргументы | ответ |
|---|---|---|
| `site_state` | — | `{online, user|null, server}` |
| `site_login` | `{server, login, pass, invite?, remember}` | `User` (запоминает вход; при запуске ядро входит само) |
| `site_logout` | — | — (забывает логин и пароль) |
| `site_call` | `{action, method:"GET"|"POST", body|null}` | ответ `api.php` как есть (JSON). GET-параметры можно дописать в action: `"user_map&uid=5"` |
| `site_upload` | `{action, field, fileName, bytesB64, extra:{k:v}, mime}` | ответ `api.php` |
| `site_download` | `{rel}` (`"api.php?action=img&f=…"`) | путь файла в кеше |
| `settings_get` / `settings_set` | — / `{settings}` | `Settings` / — |
| `dreams_list` | — | `[Dream]` (свои, отсортированы по дате) |
| `dream_save` | `{dream}` | `Dream` (новый — получает Id) |
| `dream_delete` | `{id}` | — (локально + «надгробие» + удаление на сайте; картинка и миниатюра — если больше ни у кого) |
| `dream_image` | `{id}` | путь картинки или `null` (для `fileSrc`) |
| `dream_thumb` | `{id}` | путь миниатюры картинки сна для карты (`<профиль>\thumbs\<ImageFile>.webp`, квадрат 160×160 WebP с сайта) или `null`. Файла нет — при входе ядро качает его сейчас (`img&f=…&s=1`); `null` — миниатюры нет, интерфейс уменьшает полную картинку сам. Неудача запоминается до перезапуска (повторно сайт не спрашивается) |
| `dream_set_image` | `{id, bytesB64}` | `Dream`; картинка сразу уходит на сайт, и к ответу её миниатюра уже скачана |
| `dream_analyze` | `{id, forcedLocation|null, wantImage}` | `Dream` — разбор ИИ через сайт; ход — события `pipeline://step` |
| `planets_get` / `planet_set` | — / `{key, pos}` | `{key: PlanetPos}` / — |
| `positions_save` | `{items:[{id,x,y,z}|{id}]}` | — (без x/y/z — сброс на орбиту) |
| `sync_all` | — | `{ok, message}`; ход — `sync://progress`, конец — `sync://done` |
| `lib_index` | — | раскладка папок (сохранённая в профиле; сверка с сайтом — внутри `sync_all`) |
| `books_get` | — | `{path|null, books:[…]}` — books.json мода (Windows) либо книги с сайта |
| `books_save` | `{books}` | — |
| `pdfs_list` | — | `[PdfBook]` |
| `pdf_add` | `{path, title}` | `PdfBook` — сразу после записи на полку (зашифрованным); на сайт уходит в фоне: `upload://progress`, `upload://done` |
| `pdf_read` | `{id}` | байты PDF (`ArrayBuffer`, расшифровка в память). Файла на устройстве нет (`File: ""`) — ядро качает его с сайта (ход — `pdf://progress`), шифрует на полку и пишет `File`; без входа — ошибка «PDF ещё не скачан на это устройство — войдите на сайт» |
| `pdf_page_set` | `{id, page}` | — (память страницы: локально и на сайте) |
| `suite_download` | `{id, fileName}` | путь сохранённого файла |
| `suite_open` | `{id, fileName, title, size?}` | `{path, downloaded, launched, shortcut}` — Windows: скачать один раз в `%LOCALAPPDATA%\Programs\Hermes\<имя>\`, ярлык на рабочий стол, запуск (через оболочку — установщик спросит права); прочие системы: в «Загрузки», без запуска |
| `save_text_file` | `{path, text}` | — (после диалога сохранения в JS) |
| `legacy_import` | — | `{dreams, pdfs, images}` — разовый перенос из старой DreamMap (Windows) |
| `pdf_add_bytes` | `{title, bytesB64}` | `PdfBook` — то же, что `pdf_add`, но содержимым (телефоны: диалог отдаёт не путь) |
| `pdf_delete` | `{id, localOnly?}` | — (запись на сайте — `pdf_del`, затем с полки: файл `.enc` и обложки `.webp`/`.jpg`). `localOnly: true` — сайт не трогается вовсе (запись там уже стёрта через `lib_purge`) |
| `pdf_rename` | `{id, title}` | `PdfBook` — при входе сперва `pdf_rename` на сайте (ошибка сайта — ошибка, здесь ничего не меняется), затем `Title` в pdfs.json; `library://changed`. PDF ещё уходит в фоне — новое название донесёт отправка |
| `pdfs_refresh` | — | `[PdfBook]` — быстрая сверка только списка PDF с сайтом (новые записи без файлов, номера, размеры, названия, пропавшие с сайта записи без файла — прочь, недостающие обложки); без отправки PDF и своих обложек; затем `library://changed`. Без входа — ошибка «Сначала войдите на сайт» |
| `cover_get` | `{id}` | полный путь обложки PDF (`<профиль>\covers\<id>.webp`, иначе `<id>.jpg`) или `null` — для `fileSrc` |
| `cover_put` | `{id, jpegB64}` | путь записанного `<id>.jpg` — своя обложка (JPEG; рисует интерфейс pdf.js-ом, когда книги нет на сайте); при известном `SiteId` и входе уходит на сайт в фоне |
| `read_text_file` | `{path}` | строка — текст файла после диалога открытия (BOM снимается) |

Уточнения ядра:
- `legacy_import` принимает необязательный `{path}` — dreams.json другой машины (рядом берутся images\,
  planets.json, pdfs.json, если есть); без `path` — %APPDATA%\DreamMap (Windows).
- `dream_save`: `Id: ''` — новый сон, ядро выдаёт Id; незнакомый ядру Id — тоже новый, Id сохраняется как есть.
  У прежнего сна места на карте (`PosX/Y/Z`, `PosTime`) не меняются — их ведёт `positions_save`.
- `settings_set` принимает и часть полей (накладываются на сохранённые); `SiteLogin`, `Profile`, `ViewTime`,
  `ColorsDirty` ведёт ядро; сохранённый пароль хранится отдельно и `settings_set` его не стирает.
- `Settings.Colors` — палитра `{локация, персонаж, эмоция, символ, сюжет, dream, planet, book} → цвет` либо
  `null`; правка через `settings_set` уходит на сайт (`save_settings.colors`), при входе и синхронизации
  берётся `user.colors` (если своя правка ещё не доехала до сайта — наоборот).
- В `pdf_add` поле `title` можно не давать (возьмётся имя файла); `site_login` с непустым `invite` —
  регистрация; после входа ядро само запускает `sync_all` в фоне.
- Пути картинок (`dream_image`, `site_download`) лежат в `app_data_dir` (`$APPDATA/**` в scope
  assetProtocol) — открываются через `convertFileSrc`. PDF на диске зашифрованы: только `pdf_read`.
- `sync_all` для PDF не качает файлы: с сайта приходят только записи (`File: ""`, `SiteId`, `Size`, закладка),
  файл — при первом `pdf_read`. Записи без файла, исчезнувшие с сайта, убираются; название берётся с сайта. Затем обложки: каких нет
  здесь — скачиваются (`covers\<id>.webp`, шаг «Обложки: n из m»); свои `.jpg`, которых нет на сайте, — туда.
  PDF, уходящий в фоне после `pdf_add`, синхронизация второй раз не отправляет.
- `sync_all` для снов качает миниатюры картинок, которых здесь нет (шаг «Миниатюры: n из m»), и убирает
  миниатюры картинок, на которые не ссылается ни один сон (картинка сменилась, сон удалён). Миниатюра лежит
  по локальному имени картинки, а берётся по имени картинки на сайте (свои картинки сайт переименовывает) —
  поэтому миниатюра своей картинки (в том числе из `dream_analyze`) появляется после её отправки на сайт.

## События ядра → интерфейс
- `sync://progress` `{text, pct}` — шаг синхронизации, 0…100
- `sync://done` `{ok, message}`
- `pipeline://step` `{step: "analysis"|"image"|"links", state: "run"|"ok"|"fail", text}`
- `dreams://changed` — сны изменились (после синхронизации, разбора, удаления)
- `library://changed` — книги/PDF/раскладка изменились
- `pdf://progress` `{id, done, total}` — скачивание PDF внутри `pdf_read`, байты (`total` — Content-Length либо `Size`; 0 — неизвестен); не чаще ~10 раз в секунду, последнее — `done == total`
- `upload://progress` `{id, title, done, total}` — фоновая отправка добавленного PDF на сайт, байты; так же редко
- `upload://done` `{id, title, ok, message}` — отправка кончилась; при `ok` в pdfs.json записан `SiteId`; не ушло — уедет при синхронизации
- `site://login` — тихий вход при запуске состоялся; интерфейс перечитывает `site_state` (мог спросить раньше, чем вход закончился)

## Шина между областями интерфейса (`ctx.bus`)
- `app:ready` — все области загружены
- `user:changed` `User|null` — вошли/вышли (шлёт область account)
- `dream:open` `id` — открыть карточку сна (карта → дневник)
- `dreams:reload` — перечитать сны и перерисовать карту
- `map:focus` `id` — показать сон на карте
- `library:open` `{tab?, bookNum?, pdfId?}` — открыть библиотеку
- `oracle:open` `{name: "medici"|"iching"|"obi"|"tonalpohualli"|"tzite", dream?}` — открыть гадание
- `ui:escape` — нажат Esc (закрыть верхнее окно)

## Вёрстка
- Боковые панели — внутрь `#panels`, всплывающие окна — внутрь `#overlays`; классы `drawer`, `overlay`,
  `modal` — из `css/site.css`.
- Кнопки шапки: `btnNew`, `btnList`, `btnLibrary`, `btnSite`, `btnGifts`, `btnTrust`; меню ☰:
  `menuCosmos`, `menuUsers`, `menuImport`, `menuSettings` — обработчики вешаются через `ui.onTop(id, f)`.
- Всё должно помещаться от 360 px ширины (телефон) до широкого экрана; касание = мышь.
