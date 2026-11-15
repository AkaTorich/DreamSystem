// Окно хода разбора сна: толкование → картина → нити. Шаги приходят из ядра
// событием pipeline://step {step, state: run|ok|fail, text}.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import { showModal, hideModal, row } from './modal.js';
import { reload } from './store.js';
import { errText } from './util.js';

const STEPS = [['analysis', 'Толкование сна'], ['image', 'Картина локации'], ['links', 'Нити к другим снам']];
const LOOK = {   // знак и цвет состояния — как на сайте
  wait: ['◇', '#655D8F'], run: ['◈', '#CABEFC'], ok: ['✓', '#8FD8B8'],
  fail: ['✕', '#E08A8A'], skip: ['—', '#4A4470'],
};

let rows = null, closeBtn = null, failed = false, listening = false, toast = null;

function set(step, st, text) {
  const r = rows && rows[step];
  if (!r) return;
  const [sign, color] = LOOK[st] || LOOK.wait;
  r.mark.textContent = sign;
  r.mark.classList.toggle('pulse', st === 'run');
  r.row.style.color = color;
  r.state = st;
  if (text != null) r.note.textContent = text;
  if (st === 'fail') { failed = true; if (text && toast) toast(text); }
}

function listenOnce() {
  if (listening) return;
  listening = true;
  try {
    Promise.resolve(api.listen('pipeline://step', p => p && set(p.step, p.state, p.text || '')))
      .catch(e => console.error('pipeline://step', e));
  } catch (e) { console.error('pipeline://step', e); }
}

function show(wantImage) {
  const { box } = showModal('cdPipeline', 420);
  box.classList.add('cd-pipe');
  rows = {};
  box.append(el('div', { class: 'cd-pipe-stars' }, '✦ ☾ ✦'));
  for (const [step, label] of STEPS) {
    const mark = el('span', { class: 'pmark' }, '◇');
    const note = el('div', { class: 'cd-pipe-note' });
    const r = el('div', { class: 'cd-pipe-row' }, mark, el('div', {}, el('span', {}, label), note));
    box.append(r);
    rows[step] = { row: r, mark, note, state: 'wait' };
    set(step, 'wait');
  }
  if (!wantImage) set('image', 'skip');
  closeBtn = el('button', { class: 'ghost', hidden: true, onclick: () => hideModal('cdPipeline') }, 'Закрыть');
  box.append(row(closeBtn));
  failed = false;
}

// разобрать сон через сайт; по окончании — перечитать сны и открыть карточку
export async function runPipeline(ctx, id, forcedLocation, wantImage) {
  toast = ctx.ui.toast;
  listenOnce();
  show(wantImage);
  set('analysis', 'run');
  try {
    await api.invoke('dream_analyze', { id, forcedLocation: forcedLocation || null, wantImage: !!wantImage });
    // ядро могло не прислать конечный знак — дорисуем сами
    for (const [step] of STEPS) if (rows[step].state === 'run' || rows[step].state === 'wait') set(step, 'ok');
  } catch (e) {
    for (const [step] of STEPS) if (rows[step].state === 'run' || rows[step].state === 'wait') set(step, 'fail');
    ctx.ui.toast('Разбор сна: ' + errText(e));
    failed = true;
  }
  await reload();
  if (failed) closeBtn.hidden = false;
  else setTimeout(() => hideModal('cdPipeline'), 700);
  ctx.bus.emit('dream:open', id);
}
