// Строка состояния: ход синхронизации (sync://progress, sync://done), отправка PDF на сайт в фоне
// (upload://progress, upload://done) и сообщения областей.
import { $ } from './ui.js';
import { listen } from './api.js';

let hideT = null;
const uploads = new Map();   // id → {title, done, total} — что сейчас уходит на сайт

export function progress(text, pct) {
  clearTimeout(hideT);
  $('statusText').textContent = text;
  $('syncBar').hidden = $('syncPct').hidden = false;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  $('syncBar').firstElementChild.style.width = p + '%';
  $('syncPct').textContent = p + ' %';
}

const hideBar = () => ($('syncBar').hidden = $('syncPct').hidden = true);

export function done(ok, message) {
  clearTimeout(hideT);
  if (!ok) { $('statusText').textContent = 'Синхронизация не удалась: ' + (message || 'нет связи'); hideBar(); return; }
  // в строке — коротко; что именно пришло и ушло — в подсказке при наведении
  progress('Синхронизировано в ' + new Date().toTimeString().slice(0, 5), 100);
  $('statusText').title = message || '';
  hideT = setTimeout(hideBar, 1500);   // полоса гаснет чуть погодя — видно, что дошла до конца
}

export function say(text) { $('statusText').textContent = text; }

const mb = n => (n / 1048576).toFixed(1).replace('.', ',');

function showUploads() {
  if (!uploads.size) return;
  let done = 0, total = 0;
  for (const u of uploads.values()) { done += u.done; total += u.total; }
  const first = uploads.values().next().value;
  const more = uploads.size > 1 ? ' и ещё ' + (uploads.size - 1) : '';
  progress('На сайт: «' + first.title + '»' + more + ' — ' + mb(done) + ' из ' + mb(total) + ' МБ',
    total ? done * 100 / total : 0);
}

export function initStatus() {
  listen('sync://progress', p => progress(p.text, p.pct));
  listen('sync://done', p => done(p.ok, p.message));
  listen('upload://progress', p => { uploads.set(p.id, p); showUploads(); });
  listen('upload://done', p => {
    uploads.delete(p.id);
    if (uploads.size) { showUploads(); return; }
    clearTimeout(hideT);
    if (p.ok) { progress('«' + p.title + '» на сайте', 100); hideT = setTimeout(hideBar, 1500); }
    else { say('«' + p.title + '» не ушёл на сайт: ' + (p.message || 'нет связи') + ' — повторю при синхронизации'); hideBar(); }
  });
}
