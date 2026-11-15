// Мелочи дневника: экранирование, иероглифы в тексте, имя локации, даты, base64.

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// текст записи: египетские знаки — отдельными кусками своим шрифтом, крупнее (как в читальне)
export function richText(s) {
  return String(s == null ? '' : s).split(/([\u{13000}-\u{1345F}]+)/u)
    .map((part, i) => (i % 2 ? `<span class="hiero hi">${esc(part)}</span>` : esc(part))).join('');
}

// имя локации — подпись под планетой: не длиннее трёх слов, до первой запятой
export function shortLoc(s) {
  s = String(s || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const comma = s.indexOf(',');
  if (comma > 0) s = s.slice(0, comma);
  const w = s.split(' ');
  if (w.length > 3) s = w.slice(0, 3).join(' ');
  return s.replace(/^[\s\-—:;.]+|[\s\-—:;.]+$/g, '');
}

export const locKey = s => String(s || '').trim().toLowerCase();
export const dreamLoc = d => String((d && d.Analysis && d.Analysis.Location) || '').trim();

export function emptyAnalysis(location = '') {
  return { Summary: '', Location: location, Characters: [], Emotions: [], Symbols: [], Motifs: [] };
}

// сегодняшняя дата по местному времени — YYYY-MM-DD
export function todayIso() {
  const t = new Date();
  t.setMinutes(t.getMinutes() - t.getTimezoneOffset());
  return t.toISOString().slice(0, 10);
}

// штамп правки как у сайта: UTC «YYYY-MM-DD HH:MM:SS»
export function utcStamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// ядро отвечает ошибкой-строкой, браузер — объектом Error
export function errText(e) {
  if (e == null) return 'неизвестная ошибка';
  return String(e.message || e);
}

export function blobToB64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

// картинка по адресу (в том числе с диска через fileSrc) → base64
export async function urlToB64(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('картинка не читается');
  return blobToB64(await r.blob());
}

// подключить свою таблицу стилей один раз
export function addCss(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href;
  document.head.append(l);
}

// узкий экран: панели на всю ширину, открыта только одна
export const narrow = () => matchMedia('(max-width: 760px)').matches;
