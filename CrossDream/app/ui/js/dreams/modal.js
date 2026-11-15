// Всплывающие окна областей «Карта и дневник»: открыть/закрыть, вопрос «да/нет»,
// ввод строки, выбор из нескольких кнопок. Esc закрывает верхнее окно (closeTop).
import { $, el } from '../shell/ui.js';

const stack = [];

export function showModal(id, width = 520) {
  let ov = $(id);
  if (!ov) {
    ov = el('div', { class: 'overlay cd-ov', id });
    $('overlays').append(ov);
  }
  ov.replaceChildren();
  ov._onClose = null;
  const box = el('div', { class: 'modal' });
  box.style.width = width + 'px';
  ov.append(box);
  ov.classList.add('open');
  const i = stack.indexOf(ov);
  if (i >= 0) stack.splice(i, 1);
  stack.push(ov);
  return { ov, box, close: () => hideModal(id) };
}

export function hideModal(id) {
  const ov = typeof id === 'string' ? $(id) : id;
  if (!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open');
  const i = stack.indexOf(ov);
  if (i >= 0) stack.splice(i, 1);
  const f = ov._onClose; ov._onClose = null;
  if (f) f();
}

export const isOpen = id => !!$(id) && $(id).classList.contains('open');

// Esc: закрыть верхнее из своих окон; true — было что закрывать
export function closeTop() {
  while (stack.length) {
    const ov = stack[stack.length - 1];
    if (ov.classList.contains('open')) { hideModal(ov); return true; }
    stack.pop();
  }
  return false;
}

// другие мои панели (космос, чужая карточка) тоже закрываются по Esc — по одной за нажатие
const closers = [];
export function addEscape(fn) { closers.push(fn); }   // fn() → true, если что-то закрыл
export function escapeOthers() { return closers.some(fn => { try { return fn(); } catch (e) { return false; } }); }

// строка кнопок внизу окна
export function row(...buttons) {
  return el('div', { class: 'mrow' }, ...buttons);
}

export function ask(text, { title = 'Подтвердите', ok = 'Да', danger = false } = {}) {
  return new Promise(res => {
    const { ov, box, close } = showModal('cdAsk', 430);
    let done = false;
    const fin = v => { if (done) return; done = true; close(); res(v); };
    ov._onClose = () => fin(false);
    box.append(
      el('h2', {}, title),
      el('p', { class: 'note cd-ask' }, text),
      row(el('button', { class: 'ghost', onclick: () => fin(false) }, 'Отмена'),
          el('button', { class: danger ? 'primary cd-danger' : 'primary', onclick: () => fin(true) }, ok)));
  });
}

// ввод строки (или текста): null — отмена
export function askText(title, note, value = '', { list = [], multiline = false, placeholder = '', ok = 'Сохранить' } = {}) {
  return new Promise(res => {
    const { ov, box, close } = showModal('cdText', multiline ? 560 : 440);
    let done = false;
    const fin = v => { if (done) return; done = true; close(); res(v); };
    ov._onClose = () => fin(null);
    const inp = multiline
      ? el('textarea', { rows: 8, placeholder })
      : el('input', { type: 'text', placeholder, list: list.length ? 'cdTextList' : null });
    inp.value = value || '';
    if (!multiline) inp.addEventListener('keydown', e => { if (e.key === 'Enter') fin(inp.value); });
    box.append(el('h2', {}, title));
    if (note) box.append(el('p', { class: 'note' }, note));
    box.append(el('div', { class: 'cd-gap' }), inp);
    if (list.length) box.append(el('datalist', { id: 'cdTextList' }, list.map(v => el('option', { value: v }))));
    box.append(row(el('button', { class: 'ghost', onclick: () => fin(null) }, 'Отмена'),
                   el('button', { class: 'primary', onclick: () => fin(inp.value) }, ok)));
    setTimeout(() => inp.focus(), 30);
  });
}

// выбор из нескольких действий: [{label, value, cls}] → value или null
export function choose(title, note, buttons) {
  return new Promise(res => {
    const { ov, box, close } = showModal('cdChoose', 460);
    let done = false;
    const fin = v => { if (done) return; done = true; close(); res(v); };
    ov._onClose = () => fin(null);
    box.append(el('h2', {}, title));
    if (note) box.append(el('p', { class: 'note' }, note));
    box.append(el('div', { class: 'cd-choices' },
      buttons.map(b => el('button', { class: b.cls || '', onclick: () => fin(b.value) }, b.label))));
    box.append(row(el('button', { class: 'ghost', onclick: () => fin(null) }, 'Отмена')));
  });
}
