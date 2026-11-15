// Память браузера (localStorage): настройки и то немногое, чего сайт пока хранить не умеет.
// Всё в try/catch — в приватном окне хранилища может не быть, тогда живём в памяти.

const mem = new Map();

export function read(key, fallback) {
  try {
    const t = localStorage.getItem(key);
    if (t != null) return JSON.parse(t);
  } catch { /* нет хранилища или испорчено */ }
  return mem.has(key) ? JSON.parse(mem.get(key)) : fallback;
}

export function write(key, value) {
  const t = JSON.stringify(value);
  mem.set(key, t);
  try { localStorage.setItem(key, t); } catch { /* переполнено или запрещено — останется в памяти */ }
}

/* ===== настройки: форма Settings ядра (core\src\model.rs) ===== */

const KEY = 'cd.settings';

export const DEFAULTS = Object.freeze({
  TextModel: 'google/gemini-2.5-flash',
  ImageModel: 'google/gemini-2.5-flash-image',
  GenImages: true,
  ServerUrl: '',
  SiteLogin: '',
  PdfZoom: 1,
  MapZoom: 0,
  MapPanX: 0,
  MapPanY: 0,
  MapLinks: true,
  ViewTime: '',
  PdfPage: {},
  BooksPath: '',
  Profile: '',
  Colors: null,
  ColorsDirty: false,
});

// null в полях — значение по умолчанию (как `nd` ядра)
function normalize(s) {
  const out = { ...JSON.parse(JSON.stringify(DEFAULTS)), ...(s && typeof s === 'object' ? s : {}) };
  for (const [k, v] of Object.entries(DEFAULTS)) if (out[k] == null && v != null) out[k] = JSON.parse(JSON.stringify(v));
  if (!out.PdfPage || typeof out.PdfPage !== 'object' || Array.isArray(out.PdfPage)) out.PdfPage = {};
  delete out.SitePass;   // пароль не хранится и не отдаётся
  return out;
}

export function loadSettings() { return normalize(read(KEY, null)); }
export function saveSettings(s) { write(KEY, normalize(s)); }

// прочитать, поправить, записать
export function editSettings(f) {
  const s = loadSettings();
  const r = f(s);
  saveSettings(s);
  return r;
}
