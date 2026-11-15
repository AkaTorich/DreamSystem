// Запись нового сна: название, дата, локация (прежняя / своя / «определить из текста»),
// текст, «нарисовать картинку». Затем dream_save и разбор через сайт с окном хода.
import { el } from '../shell/ui.js';
import * as store from './store.js';
import { runPipeline } from './pipeline.js';
import { todayIso, shortLoc, emptyAnalysis, errText } from './util.js';
import { linkByLocation } from './card-edit.js';

let form = null, f = {}, locVal = '', busy = false;
const AUTO = 'Определить из текста сна';

function combo() {
  const head = el('div', { class: 'combo-head' }, AUTO);
  const list = el('div', { class: 'combo-list' });
  const box = el('div', { class: 'combo' }, head, list);
  head.addEventListener('click', e => { e.stopPropagation(); box.classList.toggle('open'); });
  document.addEventListener('click', () => box.classList.remove('open'));
  f.locHead = head; f.locList = list; f.locBox = box;
  return box;
}

function setLoc(v, label) {
  locVal = v;
  f.locHead.textContent = label;
  f.locBox.classList.remove('open');
  for (const it of f.locList.children) it.classList.toggle('sel', it.dataset.v === v);
}

function fillLocations() {
  const online = store.online();
  const auto = online ? AUTO : '— без локации (толкование появится после входа)';
  f.locList.replaceChildren();
  const mk = (v, label) => {
    const it = el('div', { class: 'combo-item', 'data-v': v }, label);
    it.addEventListener('click', e => { e.stopPropagation(); setLoc(v, label); });
    f.locList.append(it);
  };
  mk('', auto);
  for (const l of store.locations()) mk(l.name, l.name + '  ·  снов: ' + l.n);
  setLoc('', auto);
}

function build(ctx) {
  f.title = el('input', { type: 'text', placeholder: 'Сон без имени' });
  f.date = el('input', { type: 'date' });
  f.own = el('input', { type: 'text', placeholder: 'или впишите свою — не длиннее трёх слов' });
  f.text = el('textarea', { placeholder: 'Что снилось…' });
  f.img = el('input', { type: 'checkbox' });
  f.save = el('button', { class: 'primary cd-wide', onclick: () => save(ctx) }, 'Вплести в карту');
  form = el('div', { class: 'cd-form' },
    el('label', {}, 'НАЗВАНИЕ СНА'), f.title,
    el('label', {}, 'ДАТА'), f.date,
    el('label', {}, 'ЛОКАЦИЯ'), combo(), f.own,
    el('div', { class: 'cd-hint' }, 'Прежняя локация соединит сон с её снами в одну сеть.'),
    el('label', {}, 'ЧТО СНИЛОСЬ'), f.text,
    el('label', { class: 'remember' }, f.img, 'нарисовать картинку локации'),
    el('div', { class: 'mrow' }, f.save));
}

export async function showForm(ctx, drawer) {
  if (!form) build(ctx);
  drawer.title('Новый сон');
  drawer.tools();
  drawer.body.replaceChildren(form);
  if (!f.date.value) f.date.value = todayIso();
  fillLocations();
  try { f.img.checked = (await store.getSettings()).GenImages !== false; } catch (e) { f.img.checked = true; }
  drawer.open();
  setTimeout(() => f.title.focus(), 50);
}

async function save(ctx) {
  if (busy) return;
  const text = f.text.value.trim();
  if (!text) { ctx.ui.toast('Опишите сон'); return; }
  const own = shortLoc(f.own.value);
  const forced = own || locVal || null;   // вписанная руками локация главнее списка
  const wantImage = f.img.checked;
  const dream = {
    Id: '', Title: f.title.value.trim() || 'Сон без имени', Date: f.date.value || todayIso(), Text: text,
    Analysis: null, ImagePrompt: '', ImageFile: '', Links: [],
    PosX: null, PosY: null, PosZ: null, PosTime: null,
  };
  busy = true; f.save.disabled = true; f.save.textContent = 'Записываю…';
  try {
    let saved = await store.saveDream(dream);
    f.title.value = ''; f.text.value = ''; f.own.value = '';
    ctx.bus.emit('dreams:close-left');
    ctx.bus.emit('map:focus', saved.Id);   // из космоса — назад на свою карту, к новому сну
    if (!store.online()) {
      // без входа сон ложится на карту без ИИ; локацию берём ту, что назвали
      if (forced) {
        saved.Analysis = emptyAnalysis(forced);
        linkByLocation(saved);
        saved = await store.saveDream(saved);
      }
      await store.reload();
      ctx.bus.emit('dream:open', saved.Id);
      ctx.ui.toast('Сон записан. Толкование и картина появятся после входа на вкладке «Сайт», затем «Достроить» в карточке сна');
      return;
    }
    await runPipeline(ctx, saved.Id, forced, wantImage);
  } catch (e) {
    ctx.ui.toast('Сон не записан: ' + errText(e));
  } finally {
    busy = false; f.save.disabled = false; f.save.textContent = 'Вплести в карту';
  }
}
