# CrossDream — «Карта снов» для всех платформ

Rust + Tauri 2: Windows, Android, macOS, iOS/iPad, Linux. Замена WPF-программы `..\DreamMap`
(та остаётся как есть). Сайт — тот же `dream.globthe.top` (`..\dreamweb`).

**Правило: никаких огромных исходников — файл ≤ ~300 строк, одна забота на файл.**

## Устройство
| Папка | Что внутри |
|---|---|
| `core\` | ядро без Tauri: данные, хранилище, шифр, клиент сайта, синхронизация |
| `app\src\` | приложение Tauri: команды для интерфейса (`commands\`) |
| `app\ui\` | интерфейс: чистые HTML/CSS/ES-модули, без сборщика |
| `app\ui\js\shell\` | общее: мост к ядру (`api.js`), тост, меню, шина (`ui.js`), строка состояния (`status.js`), вкладки шапки (`tabs.js`: окна областей — страницами, открытый PDF — своя вкладка), свои SVG-значки (`icons.js`) |
| `app\ui\css\theme.css`, `pages.css` | строгий вид (прямые углы, без размытий и эмодзи) и страницы вкладок |
| `app\ui\js\shell\themes.js`, `themes-data.js`, `css\themes.css` | 20 тёмных расцветок окна (выбор — «Настройки» → «Оформление», запоминается на устройстве); небо и кружки карты берут цвета из расцветки |
| `app\ui\js\<область>\` | `map`, `dreams`, `account`, `admin`, `library`, `pdf`, `oracles` — у каждой свой `index.js` |
| `docs\CONTRACT.md` | договор ядро ↔ интерфейс: команды, события, шина |
| `tools\` | сборка Windows, Android и Linux (WSL), проверка окна |

## Что где
Подробно, файл за файлом, — по областям:
- `docs\AREA-core.md` — ядро и команды Tauri (`core\`, `app\src\`)
- `docs\AREA-diary.md` — карта и дневник (`js\map`, `dreams`, `account`, `admin`)
- `docs\AREA-library.md` — библиотека, читалка PDF, пять гаданий, шрифт, сценарии сборки

Сквозное:
- **Синхронизация — сама, без кнопок** (`app\src\autosync.rs`): при запуске, через 4 секунды после своей правки
  (несколько правок подряд — одна сверка) и раз в пять минут. Ход и итог — в строке состояния внизу окна
  (`js\shell\status.js`), подробности итога — в подсказке при наведении.
- **Восстановление пароля** — по почте аккаунта: «Забыли пароль?» в окне «⛅ Сайт» (`js\account\site.js`),
  почта — при регистрации и в настройках (`js\account\settings.js`). Письмо и страницу ссылки делает сайт
  (`..\dreamweb\lib\reset.php`, `reset.php`).
- Данные — в папке приложения (`%APPDATA%\top.globthe.crossdream` на Windows), по профилю на логин;
  PDF и пароль для тихого входа — зашифрованы.

## Сборка
| Что | Как | Итог |
|---|---|---|
| Windows | `powershell -ExecutionPolicy Bypass -File tools\build-windows.ps1` | `CrossDream.exe`, `CrossDream_<версия>_x64-setup.exe` в корне |
| Android | `powershell -ExecutionPolicy Bypass -File tools\build-android.ps1` (нужен диск с `JavaSDK`) | `CrossDream.apk` в корне |
| Linux | `wsl -d Ubuntu -- bash tools/build-linux.sh` (WSL с Ubuntu; первый раз ставит пакеты через sudo, Rust и tauri-cli) | `builds\linux\` — `.AppImage` и `.deb` |
| Все платформы на GitHub | GitHub Actions `DreamSystem\.github\workflows\crossdream.yml` — Windows, Android, Linux, macOS, iOS; при пуше в `CrossDream/**` или вручную (можно выбрать одну платформу). Ключ подписи Android — в секретах репозитория, кладёт `tools\android-secrets.ps1` (один раз) | артефакты задания; скачиваются в `builds\` (не в git) |
| Проверка окна | `tools\run-debug.ps1`, затем `tools\cdp.ps1 -Shots <папка>` (снимки 360 / 768 / 1280) | |
| Руководство | `tools\Собрать PDF.ps1 -Html docs\Руководство.html -Pdf "docs\Карта снов — руководство.pdf"` (Chrome) | 11 страниц A4 |

Грабли Android: компоновщик NDK и Gradle не открывают пути с русскими буквами. Поэтому Rust для Android
собирается в `%LOCALAPPDATA%\crossdream-android-target`, а Gradle — через временную букву диска (`subst`).
Установка на Windows — в `%LOCALAPPDATA%\Programs\CrossDream` (`setup.exe /S /D=…`).
