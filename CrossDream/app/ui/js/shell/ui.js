// Общие мелочи интерфейса: тост, меню ☰, шина событий между областями, создание элементов.

export const $ = id => document.getElementById(id);

// el('div', {class: 'x', onclick: f}, 'текст', childEl)
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

let toastT = null;
export function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.hidden = true), 5500);
}

// шина: области общаются событиями, а не прямыми вызовами друг друга (имена — docs/CONTRACT.md)
const handlers = {};
export const bus = {
  on(name, cb) { (handlers[name] ||= []).push(cb); },
  emit(name, data) { (handlers[name] || []).forEach(cb => { try { cb(data); } catch (e) { console.error(name, e); } }); },
};

// кнопка шапки или меню: onTop('btnLibrary', () => …)
export function onTop(id, handler) {
  const b = $(id);
  if (!b) return;
  b.addEventListener('click', e => { $('moreMenu').hidden = true; handler(e); });
}

export function initMenu() {
  const menu = $('moreMenu');
  $('btnMore').addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; bus.emit('ui:escape'); } });
}

// кто вошёл: чип в шапке и кнопки по рангу
export function showUser(user) {
  const rank = { user: 1, moder: 2, admin: 3, owner: 4 }[user?.role] || 0;
  const names = { owner: 'владелец', admin: 'админ', moder: 'модер', user: 'сновидец' };
  $('whoChip').hidden = !user;
  if (user) { $('whoName').textContent = user.login; $('whoRole').textContent = names[user.role] || user.role; }
  $('btnGifts').hidden = $('btnTrust').hidden = !user;
  $('menuCosmos').hidden = $('menuUsers').hidden = rank < 2;
}
