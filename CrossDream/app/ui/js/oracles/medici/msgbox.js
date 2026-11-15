// Сообщение поверх окна гадания (как MessageBox): заголовок, текст, кнопка «OK».
import { h } from '../common/frame.js';

const ICON = { info: 'ℹ', warning: '⚠', error: '✕' };

// showMessage(win.root, {text, caption, kind}) → Promise, когда нажато «OK»
export function showMessage(root, { text, caption, kind = 'info' }) {
  return new Promise(resolve => {
    const ok = h('button', { type: 'button', class: 'md-msg-ok' }, 'OK');
    const box = h('div', { class: 'md-msg-box md-' + kind, role: 'alertdialog' },
      h('div', { class: 'md-msg-cap' },
        h('span', { class: 'md-msg-icon' }, ICON[kind] || ''),
        caption),
      h('div', { class: 'md-msg-text' }, text),
      h('div', { class: 'md-msg-btns' }, ok));
    const shade = h('div', { class: 'md-msg-shade' }, box);

    const done = () => { shade.remove(); resolve(); };
    ok.addEventListener('click', done);
    shade.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); done(); }
    });

    root.append(shade);
    ok.focus();
  });
}
