// Маленькие окна библиотеки вместо prompt/confirm: вопрос со строкой, «да/нет», дар.
// Окно ставится поверх всего в #overlays; Esc и «Отмена» отвечают null/false.
import { S } from './state.js';
import { showOverlay, wasTopOnEsc } from './util.js';

function modal(build) {
  return new Promise(resolve => {
    const { el } = S.ctx.ui;
    const ov = el('div', { class: 'overlay lib-dialog' });
    const box = el('div', { class: 'modal lib-modal-small' });
    ov.append(box);
    let done = false;
    const finish = v => {
      if (done) return;
      done = true;
      ov.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = e => {
      if (e.key === 'Escape' && wasTopOnEsc(ov)) { e.stopPropagation(); finish(null); }
    };
    document.addEventListener('keydown', onKey, true);
    ov.addEventListener('mousedown', e => { if (e.target === ov) finish(null); });
    build(box, finish);
    showOverlay(ov);
    const first = box.querySelector('input,select,button.primary');
    if (first) setTimeout(() => first.focus(), 30);
  });
}

// askText('Новая папка', 'Имя папки на этой полке:', '') → строка | null
export function askText(title, label, value = '', placeholder = '') {
  const { el } = S.ctx.ui;
  return modal((box, finish) => {
    const inp = el('input', { type: 'text', placeholder });
    inp.value = value || '';
    const ok = () => finish(inp.value);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    box.append(
      el('h2', {}, title),
      el('label', {}, label),
      inp,
      el('div', { class: 'mrow' },
        el('button', { class: 'ghost', onclick: () => finish(null) }, 'Отмена'),
        el('button', { class: 'primary', onclick: ok }, 'OK')),
    );
  });
}

export async function confirmBox(title, text) {
  const { el } = S.ctx.ui;
  const r = await modal((box, finish) => {
    box.append(
      el('h2', {}, title),
      el('p', { class: 'note lib-pre' }, text),
      el('div', { class: 'mrow' },
        el('button', { class: 'ghost', onclick: () => finish(false) }, 'Нет'),
        el('button', { class: 'primary', onclick: () => finish(true) }, 'Да')),
    );
  });
  return r === true;
}

// окно дара: получатель + напутствие → {to, message} | null
export function giveDialog(title, users) {
  const { el } = S.ctx.ui;
  return modal((box, finish) => {
    const sel = el('select', {});
    for (const us of users) sel.append(el('option', { value: us.id }, us.login + ' · ' + us.how));
    const msg = el('input', { type: 'text', placeholder: 'пара слов дару вслед' });
    box.append(
      el('h2', {}, 'Предложить в дар'),
      el('p', { class: 'note' }, '«' + title + '» — дар ляжет в ларец получателя.'),
      el('label', {}, 'КОМУ'), sel,
      el('label', {}, 'НАПУТСТВИЕ (необязательно)'), msg,
      el('p', { class: 'note', style: 'margin-top:10px' },
        'Получатель волен принять дар или отказаться — в чужой космос ничто не входит без согласия хозяина.'),
      el('div', { class: 'mrow' },
        el('button', { class: 'ghost', onclick: () => finish(null) }, 'Отмена'),
        el('button', { class: 'primary', onclick: () => finish({ to: parseInt(sel.value, 10), message: msg.value.trim() }) },
          'Подарить')),
    );
  });
}
