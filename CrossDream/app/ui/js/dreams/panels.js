// Боковые панели (класс drawer из site.css) внутри #panels: заголовок, кнопки, тело.
// На узком экране панель занимает всю ширину — открытой остаётся только одна.
import { $, el } from '../shell/ui.js';
import { narrow } from './util.js';
import { icon } from '../shell/icons.js';

export function makeDrawer(id, side = 'left') {
  let d = $(id);
  const api = {};
  if (!d) {
    const title = el('h2');
    const tools = el('span', { class: 'cd-tools' });
    const shut = el('button', { class: 'ghost icon', title: 'Закрыть', onclick: () => api.close() }, icon('close', 16));
    const body = el('div', { class: 'body' });
    d = el('div', { class: 'drawer cd-drawer' + (side === 'right' ? ' right' : ''), id },
      el('div', { class: 'head' }, title, tools, shut), body);
    $('panels').append(d);
  }
  const head = d.querySelector('.head');
  Object.assign(api, {
    el: d,
    body: d.querySelector('.body'),
    onClose: null,
    title(t) { head.querySelector('h2').textContent = t; },
    tools(...buttons) { head.querySelector('.cd-tools').replaceChildren(...buttons); },
    open() {
      if (narrow())
        document.querySelectorAll('#panels .drawer.open').forEach(x => { if (x !== d) x.classList.remove('open'); });
      d.classList.add('open');
    },
    close() {
      if (!d.classList.contains('open')) return;
      d.classList.remove('open');
      if (api.onClose) api.onClose();
    },
    isOpen: () => d.classList.contains('open'),
  });
  return api;
}

// маленькая кнопка в шапке панели
export function toolBtn(label, title, onclick, cls = 'ghost') {
  return el('button', { class: cls, title, onclick }, label);
}
