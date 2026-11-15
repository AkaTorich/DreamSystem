// Прослойка CrossDream для браузера: подставляет window.__TAURI__ (core, event, dialog), и тот же
// интерфейс app\ui работает на сайте без Rust. Каждая команда docs\CONTRACT.md выполняется через
// api.php сайта и отдаёт ту же форму данных и те же события, что ядро.
// Подключать ДО js/main.js:  <script type="module" src="shim/tauri.js"></script>
// Адрес api.php — window.__CD_API__ (по умолчанию «../api.php» от страницы).
import { listen, once, emit } from './lib/events.js';
import * as dialog from './lib/dialog.js';
import { pdfUrl } from './lib/pdf-cache.js';
import { commands as site } from './cmd/site.js';
import { commands as settings } from './cmd/settings.js';
import { commands as dreams } from './cmd/dreams.js';
import { commands as pipeline } from './cmd/pipeline.js';
import { commands as places } from './cmd/places.js';
import { commands as sync } from './cmd/sync.js';
import { commands as library } from './cmd/library.js';
import { commands as pdf } from './cmd/pdf.js';
import { commands as pdfAdd } from './cmd/pdf-add.js';
import { commands as covers } from './cmd/covers.js';

export const COMMANDS = Object.freeze({
  ...site, ...settings, ...dreams, ...pipeline, ...places, ...sync, ...library, ...pdf, ...pdfAdd, ...covers,
});

// ошибка уходит в интерфейс строкой — как ошибки ядра Tauri
const errorText = e => (e == null ? 'неизвестная ошибка' : typeof e === 'string' ? e : e.message ? e.message : String(e));

function invoke(cmd, args = {}) {
  const f = COMMANDS[cmd];
  if (!f) return Promise.reject('Command ' + cmd + ' not found');
  try {
    return Promise.resolve(f(args || {})).then(v => (v === undefined ? null : v), e => { throw errorText(e); });
  } catch (e) {
    return Promise.reject(errorText(e));
  }
}

// путь → адрес. cdpdf — книга для pdf.js; «cdfile:…» — выбранный файл; адреса (api.php, http, blob:) — как есть
function convertFileSrc(path, protocol = 'asset') {
  if (protocol === 'cdpdf') return pdfUrl(String(path));
  const s = String(path ?? '');
  if (dialog.isFileToken(s)) return dialog.fileUrl(s);
  return s;
}

window.__CD_WEB__ = true;
window.__TAURI__ = {
  core: { invoke, convertFileSrc },
  event: {
    listen,
    once,
    emit: (event, payload) => { emit(event, payload); return Promise.resolve(); },
  },
  dialog: {
    open: dialog.open,
    save: dialog.save,
    ask: dialog.ask,
    confirm: dialog.confirm,
    message: dialog.message,
  },
};
