// Карточка сна на чужой карте (космос): правка названия, локации и записи, удаление,
// снятие нитей и мост 🔗 к сну другого сновидца. Всё — через сайт, права проверяет сервер.
import * as api from '../shell/api.js';
import { $, el } from '../shell/ui.js';
import { makeDrawer, toolBtn } from '../dreams/panels.js';
import { showModal, row, ask } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';
import { linkColor, TYPES } from '../map/palette.js';

let drawer = null, from = null;   // from — первый сон моста {id, title, login}

export const linking = () => !!from;

function linkbar(show) {
  let b = $('linkbar');
  if (!b) {
    b = el('div', { id: 'linkbar' }, 'Выберите второй сон — на этой карте или через «Назад в космос» у другого сновидца… ',
      el('button', { class: 'ghost', onclick: () => cancelLink() }, 'отмена'));
    document.body.append(b);
  }
  b.style.display = show ? 'block' : 'none';
}

export function cancelLink() { from = null; linkbar(false); }

export function finishLink(ctx, to, reload) {
  if (!from || to.id === from.id) return;
  const { box, close } = showModal('cdBridge', 440);
  const type = el('select', {}, TYPES.map(t => el('option', { value: t, selected: t === 'сюжет' }, t)));
  const reason = el('input', { type: 'text', placeholder: 'кратко' });
  const go = async () => {
    try {
      await api.site('add_link', { a: from.id, b: to.id, type: type.value, reason: reason.value });
      ctx.ui.toast('Мост создан');
    } catch (e) { ctx.ui.toast(errText(e)); }
    close(); cancelLink(); reload();
  };
  box.append(el('h2', {}, 'Новый мост'),
    el('p', { class: 'note' }, '«' + from.title + '» (' + from.login + ')  ↔  «' + to.title + '» (' + to._login + ')'),
    el('label', {}, 'ТИП СВЯЗИ'), type, el('label', {}, 'ПОЧЕМУ СВЯЗАНЫ'), reason,
    row(el('button', { class: 'ghost', onclick: close }, 'Отмена'), el('button', { class: 'primary', onclick: go }, 'Связать')));
}

export function closeForeignCard() { if (drawer) drawer.close(); }
export function foreignCardOpen() { return !!drawer && drawer.isOpen(); }

export function openForeignCard(ctx, d, map, reload) {
  if (!drawer) drawer = makeDrawer('cdForeign', 'right');
  const title = el('input', { type: 'text' }); title.value = d.title || '';
  const loc = el('input', { type: 'text' }); loc.value = d.location || '';
  const text = el('textarea', { rows: 8 }); text.value = d.text || '';
  drawer.title('Сон');
  drawer.tools(
    toolBtn('Связать', 'Связать с другим сном (мост)', () => {
      from = { id: d.id, title: d.title, login: d._login };
      drawer.close(); linkbar(true);
    }),
    toolBtn('Удалить', 'Удалить сон', async () => {
      if (!await ask('Удалить сон «' + d.title + '» сновидца ' + d._login + '?', { title: 'Удалить сон', ok: 'Удалить', danger: true })) return;
      try { await api.site('del_dream', { id: d.id }); drawer.close(); reload(); }
      catch (e) { ctx.ui.toast(errText(e)); }
    }, 'ghost danger'));

  const body = [el('div', { class: 'sect' }, 'Сновидец: ' + d._login)];
  if (d.image_file) {
    const img = el('div', { class: 'cd-det-img' });
    api.invoke('site_download', { rel: 'api.php?action=img&f=' + encodeURIComponent(d.image_file) })
      .then(p => p && img.append(el('img', { class: 'det-img', src: api.fileSrc(p), alt: '' }))).catch(() => {});
    body.push(img);
  }
  body.push(el('label', {}, 'НАЗВАНИЕ'), title, el('div', { class: 'det-date' }, d.dream_date || ''));
  if (d.summary) body.push(el('div', { class: 'det-summary' }, d.summary));
  body.push(el('label', {}, 'ЛОКАЦИЯ'), loc);
  for (const [t, arr] of [['Персонажи', d.characters], ['Эмоции', d.emotions], ['Символы', d.symbols], ['Мотивы', d.motifs]])
    if (Array.isArray(arr) && arr.length)
      body.push(el('div', { class: 'sect' }, t), el('div', { class: 'chips' }, arr.map(x => el('span', { class: 'chip' }, x))));

  const byId = {};
  map.dreams.forEach(x => { byId[x.id] = x; });
  const rel = (map.links || []).filter(l => Number(l.dream_a) === d.id || Number(l.dream_b) === d.id);
  if (rel.length) body.push(el('div', { class: 'sect' }, 'Нити и мосты'));
  for (const l of rel) {
    const oid = Number(l.dream_a) === d.id ? Number(l.dream_b) : Number(l.dream_a);
    const o = byId[oid];
    const c = linkColor(l.type);
    const del = el('span', { class: 'del', title: 'Снять нить' }, '✕');
    del.addEventListener('click', async e => {
      e.stopPropagation();
      try { await api.site('del_link', { id: l.id }); reload(); } catch (err) { ctx.ui.toast(errText(err)); }
    });
    body.push(el('div', { class: 'link-row', onclick: () => o && openForeignCard(ctx, o, map, reload) },
      el('span', { class: 'lt', style: `background:${c}22;color:${c}` }, l.type),
      el('span', {}, o ? o.title : 'сон на другой карте'), l.reason ? el('span', { class: 'lr' }, '— ' + l.reason) : null, del));
  }
  body.push(el('label', {}, 'ЗАПИСЬ'), text,
    row(el('button', { class: 'primary', onclick: async () => {
      try {
        await api.site('edit_dream', { id: d.id, title: title.value, location: loc.value, text: text.value });
        ctx.ui.toast('Сохранено'); reload();
      } catch (e) { ctx.ui.toast(errText(e)); }
    } }, 'Сохранить правки')));
  drawer.body.replaceChildren(...body);
  drawer.open();
}
