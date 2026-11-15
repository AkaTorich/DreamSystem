// Правки сна из карточки: запись, локация, удаление сна и нити, достройка через сайт.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import * as store from './store.js';
import { showModal, hideModal, row, ask, askText } from './modal.js';
import { runPipeline } from './pipeline.js';
import { shortLoc, locKey, dreamLoc, emptyAnalysis, errText } from './util.js';

// сны одной локации всегда соединены в сеть — даже без ИИ
export function linkByLocation(d) {
  const loc = dreamLoc(d);
  if (!loc) return d;
  d.Links = d.Links || [];
  for (const o of store.state.dreams) {
    if (o.Id === d.Id || locKey(dreamLoc(o)) !== locKey(loc)) continue;
    const already = d.Links.some(l => l.Id === o.Id && l.Type === 'локация') ||
      (o.Links || []).some(l => l.Id === d.Id && l.Type === 'локация');
    if (!already) d.Links.push({ Id: o.Id, Type: 'локация', Reason: 'та же локация — ' + loc });
  }
  return d;
}

export function editText(ctx, d) {
  const { box, close } = showModal('cdEditText', 580);
  const title = el('input', { type: 'text' });
  const text = el('textarea', { rows: 12, class: 'cd-edit-text' });
  title.value = d.Title || '';
  text.value = d.Text || '';
  const save = async () => {
    const t = text.value.trim();
    if (!t) { ctx.ui.toast('Запись не может быть пустой'); return; }
    d.Title = title.value.trim() || 'Сон без имени';
    d.Text = t;
    try {
      await store.saveDream(d);
      close();
      ctx.ui.toast('Запись сохранена');
      await store.reload();
      ctx.bus.emit('dream:open', d.Id);
    } catch (e) { ctx.ui.toast('Не сохранилось: ' + errText(e)); }
  };
  box.append(el('h2', {}, 'Правка записи'),
    el('p', { class: 'note' }, 'Толкование, картина и нити остаются прежними — их можно достроить кнопкой «Достроить».'),
    el('label', {}, 'НАЗВАНИЕ'), title, el('label', {}, 'ЧТО СНИЛОСЬ'), text,
    row(el('button', { class: 'ghost', onclick: close }, 'Отмена'),
        el('button', { class: 'primary', onclick: save }, 'Сохранить')));
  setTimeout(() => text.focus(), 40);
}

export async function editLocation(ctx, d) {
  const cur = dreamLoc(d);
  const val = await askText('Локация', 'Сны одной локации становятся спутниками одной планеты. Не длиннее трёх слов.',
    cur, { list: store.locations().map(l => l.name), placeholder: 'пусто — снять локацию' });
  if (val == null) return;
  const loc = shortLoc(val);
  if (loc === cur) return;
  if (!d.Analysis) d.Analysis = emptyAnalysis();
  d.Analysis.Location = loc;
  // прежние нити «локация» рвутся с обеих сторон, новые вяжутся по новому месту
  d.Links = (d.Links || []).filter(l => l.Type !== 'локация');
  const touched = [];
  for (const o of store.state.dreams) {
    if (o.Id === d.Id || !(o.Links || []).some(l => l.Id === d.Id && l.Type === 'локация')) continue;
    o.Links = o.Links.filter(l => !(l.Id === d.Id && l.Type === 'локация'));
    touched.push(o);
  }
  linkByLocation(d);
  try {
    await store.saveDream(d);
    for (const o of touched) await store.saveDream(o);
    ctx.ui.toast(loc ? 'Локация: ' + loc : 'Локация снята');
    await store.reload();
    ctx.bus.emit('dream:open', d.Id);
  } catch (e) { ctx.ui.toast('Локация не сохранилась: ' + errText(e)); }
}

export async function deleteDream(ctx, d, onGone) {
  const ok = await ask('Удалить сон «' + (d.Title || 'без имени') + '»? Он исчезнет и здесь, и на сайте.',
    { title: 'Удалить сон', ok: 'Удалить', danger: true });
  if (!ok) return;
  try {
    await api.invoke('dream_delete', { id: d.Id });
    store.forgetImage(d);
    if (onGone) onGone();
    await store.reload();
    ctx.ui.toast('Сон удалён');
  } catch (e) { ctx.ui.toast('Не удалилось: ' + errText(e)); }
}

// нить живёт у одного из двух снов — снимаем её там, где она записана
export async function removeLink(ctx, holder, otherId, type, reopenId) {
  holder.Links = (holder.Links || []).filter(l => !(l.Id === otherId && l.Type === type));
  try {
    await store.saveDream(holder);
    await store.reload();
    ctx.bus.emit('dream:open', reopenId);
  } catch (e) { ctx.ui.toast('Нить не снялась: ' + errText(e)); }
}

// ↻ достроить недостающее: толкование, картину, нити — через сайт
export async function redo(ctx, d) {
  if (!store.online()) { ctx.ui.toast('Достройка идёт через сайт — войдите в аккаунт (вкладка «Сайт»)'); return; }
  hideModal('cdPicture');
  await runPipeline(ctx, d.Id, null, !d.ImageFile);
}
