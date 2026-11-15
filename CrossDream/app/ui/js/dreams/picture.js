// Картина сна: взять из прежнего сна, выбрать файл или нарисовать заново через сайт.
import * as api from '../shell/api.js';
import { el } from '../shell/ui.js';
import * as store from './store.js';
import { showModal, row } from './modal.js';
import { runPipeline } from './pipeline.js';
import { dreamLoc, blobToB64, urlToB64, errText } from './util.js';

async function apply(ctx, d, b64, close) {
  try {
    await api.invoke('dream_set_image', { id: d.Id, bytesB64: b64 });
    store.forgetImage(d);
    close();
    await store.reload();
    ctx.bus.emit('dream:open', d.Id);
    ctx.ui.toast('Картина сменилась');
  } catch (e) { ctx.ui.toast('Картина не легла: ' + errText(e)); }
}

export function openPicture(ctx, d) {
  const { box, close } = showModal('cdPicture', 640);
  const gallery = el('div', { class: 'cd-gallery' });
  const used = new Set();
  for (const o of store.state.dreams) {
    if (o.Id === d.Id || !o.ImageFile || used.has(o.ImageFile)) continue;
    used.add(o.ImageFile);
    const pic = el('div', { class: 'cd-gal-pic' });
    const item = el('div', { class: 'cd-gal-item', title: o.Title },
      pic, el('div', { class: 'cd-gal-cap' }, dreamLoc(o) || o.Title));
    store.imageSrc(o).then(src => {
      if (!src) { item.remove(); return; }
      pic.style.backgroundImage = `url("${src}")`;
      item.addEventListener('click', async () => {
        try { await apply(ctx, d, await urlToB64(src), close); }
        catch (e) { ctx.ui.toast('Картина не читается: ' + errText(e)); }
      });
    });
    gallery.append(item);
  }
  if (!used.size) gallery.append(el('p', { class: 'note' }, 'Прежних картин пока нет.'));

  const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  file.addEventListener('change', async () => {
    const fl = file.files && file.files[0];
    if (fl) apply(ctx, d, await blobToB64(fl), close);
  });
  const draw = el('button', { onclick: async () => {
    if (!store.online()) { ctx.ui.toast('Рисует сайт — войдите в аккаунт (вкладка «Сайт»)'); return; }
    close();
    // прежнюю картину снимаем — разбор нарисует новую по образу сна
    d.ImageFile = '';
    try { await store.saveDream(d); } catch (e) { ctx.ui.toast(errText(e)); return; }
    store.forgetImage(d);
    runPipeline(ctx, d.Id, null, true);
  } }, 'Нарисовать заново');

  box.append(el('h2', {}, 'Картина сна'),
    el('p', { class: 'note' }, dreamLoc(d)
      ? 'Локация сна: ' + dreamLoc(d) + '. Взять картину из прежнего сна, выбрать файл или нарисовать заново.'
      : 'Взять картину из прежнего сна, выбрать файл или нарисовать заново.'),
    gallery, file,
    row(el('button', { class: 'ghost', onclick: close }, 'Отмена'),
        el('button', { onclick: () => file.click() }, 'Из файла'), draw));
}
