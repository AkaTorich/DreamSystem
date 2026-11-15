// Мелочи, общие для прослойки: то же, что core\src\util.rs, jsonx.rs и sync\rule.rs ядра.

/* ===== терпеливое чтение ответов сайта (MySQL отдаёт числа то числами, то строками) ===== */
export const jx = {
  // строка поля; null/нет — null; число — его запись
  s(v, k) {
    const x = v == null ? undefined : v[k];
    if (typeof x === 'string') return x;
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    return null;
  },
  str(v, k) { return jx.s(v, k) ?? ''; },
  // целое из числа или строки
  i(v, k) {
    const x = v == null ? undefined : v[k];
    if (typeof x === 'number') return Number.isFinite(x) ? Math.trunc(x) : null;
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string' && x.trim() !== '') { const n = Number(x.trim()); return Number.isFinite(n) ? Math.trunc(n) : null; }
    return null;
  },
  // дробное из числа или строки; null — null
  f(v, k) {
    const x = v == null ? undefined : v[k];
    if (typeof x === 'number') return Number.isFinite(x) ? x : null;
    if (typeof x === 'string' && x.trim() !== '') { const n = Number(x.trim()); return Number.isFinite(n) ? n : null; }
    return null;
  },
  arr(v, k) { const a = v == null ? undefined : v[k]; return Array.isArray(a) ? a : []; },
  // список строк (элементы-числа тоже превращаются в строки)
  strings(v, k) {
    return jx.arr(v, k).filter(x => x != null).map(x => (typeof x === 'string' ? x : JSON.stringify(x)));
  },
};

/* ===== локации ===== */

// имя локации — подпись под планетой: до первой запятой и не более трёх слов (как short_loc сайта)
export function shortLoc(s) {
  let t = String(s ?? '').split(/\s+/).filter(Boolean).join(' ');
  if (!t) return t;
  const i = t.indexOf(',');
  if (i > 0) t = t.slice(0, i);
  const w = t.split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
  return w.replace(/^[ \-—:;.]+|[ \-—:;.]+$/g, '');
}

// сравнение локаций без учёта регистра и краевых пробелов
export function sameLoc(a, b) {
  const x = String(a ?? '').trim(), y = String(b ?? '').trim();
  return x !== '' && x.toLowerCase() === y.toLowerCase();
}

export const dreamLocation = d => (d && d.Analysis ? String(d.Analysis.Location || '').trim() : '');

/* ===== имена и время ===== */

// метка времени как у старой программы (.NET ticks), строго растущая
let lastTick = 0n;
function ticks() {
  let t = BigInt(Date.now()) * 10000n + 621355968000000000n;
  if (t <= lastTick) t = lastTick + 1n;
  lastTick = t;
  return t;
}
export const newDreamId = () => 'd' + ticks();   // «d» + метка времени
export const newPdfId = () => 'p' + ticks();     // «p» + метка времени

// безымянное имя файла: 32 hex-знака и расширение (как на сервере)
export function randName(ext) {
  const b = crypto.getRandomValues(new Uint8Array(16));
  const hex = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return ext ? hex + '.' + ext : hex;
}

const pad = n => String(n).padStart(2, '0');
// сегодняшняя дата "YYYY-MM-DD" (местное время)
export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
// текущее время UTC в виде штампа сайта
export function nowStamp() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + ' ' +
    pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
}

// время сервера ("YYYY-MM-DD HH:MM:SS", UTC) → секунды; понимает и ISO-вид с «T» и поясом
export function parseTime(s) {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(t);
  if (!m) return null;
  if (m[7]) {
    const ms = Date.parse(t.replace(' ', 'T'));
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
  }
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)) / 1000);
}

// правило «новее — главнее» (с допуском в 1 секунду): 'local' | 'site' | 'same'
export function decide(localHas, localTime, siteHas, siteTime) {
  const lt = localTime ? parseTime(localTime) : null;
  const st = siteTime ? parseTime(siteTime) : null;
  const newer = (a, b) => a != null && (b == null || a > b + 1);
  const localNewer = localHas && (!siteHas || newer(lt, st));
  const siteNewer = siteHas && (!localHas || newer(st, lt));
  return localNewer ? 'local' : siteNewer ? 'site' : 'same';
}

/* ===== байты ===== */

// base64 из интерфейса → байты (допускается и «data:…;base64,» в начале)
export function b64ToBytes(s) {
  let t = String(s ?? '').trim();
  const i = t.indexOf(';base64,');
  if (t.startsWith('data:') && i >= 0) t = t.slice(i + 8);
  let bin;
  try { bin = atob(t.replace(/\s+/g, '')); } catch (e) { throw new Error('base64: ' + (e.message || e)); }
  const u8 = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
  return u8;
}

export const startsWith = (u8, sig) => u8.length >= sig.length && sig.every((b, k) => u8[k] === b);
export const isPdf = u8 => startsWith(u8, [0x25, 0x50, 0x44, 0x46, 0x2d]);   // «%PDF-»
export const isJpeg = u8 => startsWith(u8, [0xff, 0xd8, 0xff]);

// расширение картинки по сигнатуре (как image_ext ядра)
export function imageExt(u8) {
  if (startsWith(u8, [0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith(u8, [0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (u8.length > 12 && startsWith(u8, [0x52, 0x49, 0x46, 0x46]) && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
  return 'jpg';
}
export function imageMime(name) {
  const e = String(name).split('.').pop().toLowerCase();
  return { png: 'image/png', gif: 'image/gif', webp: 'image/webp' }[e] || 'image/jpeg';
}

/* ===== прочее ===== */

export const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

// ход не чаще раза в `ms`; force — сообщить сразу (последнее «done == total»)
export function throttle(ms, f) {
  let last = 0;
  return (force, ...a) => {
    const t = Date.now();
    if (!force && t - last < ms) return;
    last = t;
    f(...a);
  };
}
