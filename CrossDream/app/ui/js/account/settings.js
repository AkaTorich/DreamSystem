// Окно «⚙ Настройки»: палитра нитей и сфер, рисовать картинки сами, масштаб PDF,
// смена пароля и свой ключ ИИ (после входа), модели ИИ — только владельцу.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import { showModal, row } from '../dreams/modal.js';
import { getSettings, patchSettings } from '../dreams/store.js';
import { errText } from '../dreams/util.js';
import { colors, DEF_COLORS, applyColors } from '../map/palette.js';
import { currentUser } from './site.js';
import { fillModels } from './models.js';
import { THEMES, currentTheme, applyTheme } from '../shell/themes.js';

const PAL = [['локация', 'локация'], ['персонаж', 'персонаж'], ['эмоция', 'эмоция'], ['символ', 'символ'],
  ['сюжет', 'сюжет'], ['dream', 'сон'], ['planet', 'планета']];

function paletteGrid() {
  const inputs = {};
  const grid = el('div', { class: 'cd-pal' }, PAL.map(([key, label]) => {
    const inp = el('input', { type: 'color' });
    inp.value = colors[key] || DEF_COLORS[key];
    inputs[key] = inp;
    return el('label', {}, label, inp);
  }));
  const reset = el('button', { class: 'ghost', onclick: () => {
    for (const [key] of PAL) inputs[key].value = DEF_COLORS[key];
  } }, 'Вернуть исходные цвета');
  return { grid, reset, read: () => Object.fromEntries(PAL.map(([k]) => [k, inputs[k].value])) };
}

function accountPart(user) {
  if (!user) return { nodes: [el('p', { class: 'note' }, 'Пароль, ключ ИИ и модели — после входа на сайт (вкладка «Сайт»).')], read: () => ({}) };
  const oldPass = el('input', { type: 'password', autocomplete: 'current-password' });
  const newPass = el('input', { type: 'password', autocomplete: 'new-password', placeholder: 'пусто — не менять' });
  const email = el('input', { type: 'email', autocomplete: 'email', placeholder: 'не указана' });
  email.value = user.email || '';
  const nodes = [el('div', { class: 'sect' }, 'АККАУНТ · ' + user.login),
    el('label', {}, 'ПОЧТА — на неё придёт ссылка, если забудете пароль'), email,
    el('label', {}, 'ТЕКУЩИЙ ПАРОЛЬ (для смены)'), oldPass, el('label', {}, 'НОВЫЙ ПАРОЛЬ'), newPass];
  let key = null;
  if (Number(user.key_issued) === 1)
    nodes.push(el('p', { class: 'note cd-ok' }, 'Доступ к ИИ выдан администратором — ключ вводить не нужно.'));
  else {
    key = el('input', { type: 'password', placeholder: 'пусто — не менять' });
    nodes.push(el('label', {}, 'КЛЮЧ API OPENROUTER' + (user.has_key ? ' · задан' : '')), key,
      el('p', { class: 'note' }, 'Ключ хранится только на сайте и нужен для толкования снов и картинок.'));
  }
  let text = null, image = null;
  if (user.role === 'owner') {
    text = el('input', { type: 'text', list: 'cdTextModels' });
    image = el('input', { type: 'text', list: 'cdImgModels' });
    const st = el('div', { class: 'note' });
    nodes.push(el('div', { class: 'sect' }, 'МОДЕЛИ ИИ — ОБЩИЕ ДЛЯ ВСЕГО САЙТА'),
      el('label', {}, 'МОДЕЛЬ ДЛЯ ТОЛКОВАНИЯ'), text, el('datalist', { id: 'cdTextModels' }),
      el('label', {}, 'МОДЕЛЬ ДЛЯ КАРТИНОК'), image, el('datalist', { id: 'cdImgModels' }), st);
    fillModels(st);
  }
  return {
    nodes,
    fill(s) { if (text) { text.value = s.TextModel || user.text_model || ''; image.value = s.ImageModel || user.image_model || ''; } },
    read: () => ({ email: email.value.trim(), oldPass: oldPass.value, newPass: newPass.value, key: key ? key.value.trim() : '',
      text: text ? text.value.trim() : null, image: image ? image.value.trim() : null }),
  };
}

// двадцать расцветок образцами; щелчок — сразу меняет окно и запоминается на этом устройстве
function themeGrid() {
  const grid = el('div', { class: 'cd-themes' });
  const draw = () => grid.replaceChildren(...THEMES.map(t =>
    el('button', { class: 'cd-theme' + (t.id === currentTheme() ? ' on' : ''), title: t.name,
      onclick: () => { applyTheme(t.id); draw(); } },
      el('span', { class: 'sw' }, ...[t.header, t.s3, t.primary, t.accent, t.text].map(c => {
        const i = el('i'); i.style.background = c; return i;
      })),
      el('span', { class: 'nm' }, t.name))));
  draw();
  return grid;
}

export async function openSettings(ctx) {
  let s;
  try { s = await getSettings(); } catch (e) { ctx.ui.toast('Настройки не читаются: ' + errText(e)); return; }
  const user = currentUser();
  const { box, close } = showModal('cdSettings', 540);
  const pal = paletteGrid();
  const gen = el('input', { type: 'checkbox' });
  gen.checked = s.GenImages !== false;
  const zoom = el('input', { type: 'range', min: '0.5', max: '3', step: '0.1' });
  zoom.value = String(s.PdfZoom || 1);
  const zoomVal = el('span', { class: 'cd-zoomval' }, Math.round(zoom.value * 100) + ' %');
  zoom.addEventListener('input', () => { zoomVal.textContent = Math.round(zoom.value * 100) + ' %'; });
  const acc = accountPart(user);
  if (acc.fill) acc.fill(s);

  const save = async () => {
    const a = acc.read();
    const col = pal.read();
    try {
      if (user && a.email !== (user.email || '')) {
        await api.site('set_email', { email: a.email });
        user.email = a.email;
      }
      if (user && a.newPass) {
        await api.site('change_pass', { old_pass: a.oldPass, new_pass: a.newPass });
        ctx.ui.toast('Пароль изменён');
      }
      const patch = { GenImages: gen.checked, PdfZoom: parseFloat(zoom.value) || 1 };
      if (a.text != null) { if (a.text) patch.TextModel = a.text; if (a.image) patch.ImageModel = a.image; }
      await patchSettings(patch);
      if (user) {
        const body = { gen_images: gen.checked, colors: col };
        if (a.key) body.openrouter_key = a.key;
        if (a.text) body.text_model = a.text;
        if (a.image) body.image_model = a.image;
        await api.site('save_settings', body);
        user.colors = col;
      }
      applyColors(col);   // палитра — сразу, без перезагрузки
      close();
      ctx.ui.toast('Сохранено');
    } catch (e) { ctx.ui.toast(errText(e)); }
  };

  box.append(el('h2', {}, 'Настройки'),
    el('div', { class: 'sect' }, 'ОФОРМЛЕНИЕ — РАСЦВЕТКА ОКНА'), themeGrid(),
    el('div', { class: 'sect' }, 'МОЯ ПАЛИТРА — НИТИ И СФЕРЫ'), pal.grid, pal.reset,
    el('label', { class: 'remember' }, gen, 'рисовать картинку нового сна автоматически'),
    el('label', {}, 'МАСШТАБ PDF'), el('div', { class: 'cd-zoomrow' }, zoom, zoomVal),
    ...acc.nodes,
    row(el('button', { class: 'ghost', onclick: close }, 'Отмена'),
        el('button', { class: 'primary', onclick: save }, 'Сохранить')));
}
