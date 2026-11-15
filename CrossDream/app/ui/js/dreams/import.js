// Импорт снов: разовый перенос из старой «Карты снов» (Windows) и чтение dreams.json
// (файл выбирается диалогом Tauri; картинки из папки images — по желанию).
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import * as store from './store.js';
import { showModal, row } from './modal.js';
import { blobToB64, errText } from './util.js';

let pics = [];   // выбранные картинки: подставляются снам по имени файла

// диалог Tauri → путь → текст файла; если не вышло — обычный выбор файла
async function pickJson() {
  let dlg = null;
  try { dlg = api.dialog(); } catch (e) { dlg = null; }
  if (dlg && dlg.open) {
    try {
      const path = await dlg.open({ multiple: false, filters: [{ name: 'dreams.json', extensions: ['json'] }] });
      if (!path) return null;   // отказались выбирать
      const r = await fetch(api.fileSrc(String(path.path || path)));
      if (r.ok) return await r.text();
    } catch (e) { console.warn('диалог/чтение', e); }
  }
  return new Promise(res => {   // запасной путь: выбор файла самим окном программы
    const inp = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    document.body.append(inp);
    inp.addEventListener('change', () => {
      const fl = inp.files && inp.files[0];
      inp.remove();
      if (fl) fl.text().then(res, () => res(null)); else res(null);
    });
    inp.click();
  });
}

function normalize(x) {
  return {
    Id: String(x.Id || ''), Title: x.Title || 'Сон без имени', Date: x.Date || '', Text: x.Text || '',
    Analysis: x.Analysis || null, ImagePrompt: x.ImagePrompt || '', ImageFile: x.ImageFile || '',
    Links: Array.isArray(x.Links) ? x.Links : [],
    PosX: x.PosX ?? null, PosY: x.PosY ?? null, PosZ: x.PosZ ?? null, PosTime: x.PosTime ?? null,
  };
}

async function importJson(ctx, text, out) {
  let data;
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { throw new Error('файл не читается как JSON'); }
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.dreams) ? data.dreams : null);
  if (!list) throw new Error('в файле нет списка снов');
  const have = new Set(store.state.dreams.map(d => d.Id));
  let added = 0, images = 0, n = 0;
  for (const raw of list) {
    n++;
    if (!raw || !raw.Text || (raw.Id && have.has(String(raw.Id)))) continue;   // повтор не задвоит
    ctx.status.progress('импорт снов: ' + n + ' из ' + list.length, n / list.length * 100);
    const saved = await store.saveDream(normalize(raw));
    added++;
    const pic = raw.ImageFile && pics.find(f => f.name === String(raw.ImageFile).split(/[\\/]/).pop());
    if (pic) {
      try { await api.invoke('dream_set_image', { id: saved.Id, bytesB64: await blobToB64(pic) }); images++; }
      catch (e) { console.warn('картинка', e); }
    }
  }
  ctx.status.done(true, 'импорт: новых снов — ' + added);
  out.textContent = 'Готово: новых снов — ' + added + ', всего в файле — ' + list.length +
    (pics.length ? ', картинок подставлено — ' + images : '') + '.';
}

export function openImport(ctx) {
  const { box, close } = showModal('cdImport', 560);
  const out = el('div', { class: 'note cd-result' });
  const imgs = el('input', { type: 'file', accept: 'image/*', multiple: true });
  imgs.addEventListener('change', () => { pics = [...imgs.files]; });

  const legacy = el('button', { class: 'primary cd-wide', onclick: async () => {
    legacy.disabled = true; out.textContent = 'Переношу…';
    try {
      const r = await api.invoke('legacy_import');
      out.textContent = 'Перенесено: снов — ' + (r.dreams ?? 0) + ', PDF — ' + (r.pdfs ?? 0) +
        ', картинок — ' + (r.images ?? 0) + '.';
      await store.reload();
    } catch (e) { out.textContent = 'Перенос не удался: ' + errText(e); }
    legacy.disabled = false;
  } }, 'Перенести из старой «Карты снов»');
  legacy.hidden = !!window.__CD_WEB__;   // в браузере перенос из программы для Windows невозможен

  const json = el('button', { class: 'cd-wide', onclick: async () => {
    const text = await pickJson();
    if (!text) return;
    json.disabled = true; out.textContent = 'Импортирую…';
    try { await importJson(ctx, text, out); await store.reload(); }
    catch (e) { out.textContent = 'Импорт не удался: ' + errText(e); ctx.status.done(false, 'импорт не удался'); }
    json.disabled = false;
  } }, 'Выбрать dreams.json');

  box.append(el('h2', {}, 'Импорт снов'),
    el('p', { class: 'note' }, 'Прежняя настольная программа хранит сны в папке %APPDATA%\\DreamMap. ' +
      'На Windows её можно перенести целиком одной кнопкой — сны, PDF и картинки.'),
    el('div', { class: 'cd-gap' }), legacy,
    el('div', { class: 'sect' }, 'ИЛИ ФАЙЛОМ'),
    el('p', { class: 'note' }, 'Сперва (по желанию) выберите картинки из папки images — они лягут к своим снам. ' +
      'Повторный импорт безопасен: уже записанные сны не задвоятся.'),
    el('label', {}, 'КАРТИНКИ (ПАПКА IMAGES)'), imgs,
    el('div', { class: 'cd-gap' }), json, out,
    row(el('button', { class: 'ghost', onclick: close }, 'Закрыть')));
}
