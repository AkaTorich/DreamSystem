// Ларец даров 🎁: предложенные, принятые (их ещё можно скормить чёрной дыре) и свои дары.
import * as api from '../shell/api.js';
import { $, el } from '../shell/ui.js';
import { showModal, isOpen, row } from '../dreams/modal.js';
import { errText } from '../dreams/util.js';
import { syncAll } from '../account/site.js';

const KIND = { book: 'Книга', pdf: 'PDF', file: 'Программа' };
const STATUS = { pending: 'ожидает', accepted: 'принят', declined: 'отклонён', devoured: 'поглощён дырой' };

export async function refreshBadge() {
  try {
    const r = await api.site('gifts_list');
    $('giftBadge').textContent = r.count ? ' ' + r.count : '';
    return r;
  } catch (e) { return null; }
}

export function clearBadge() { $('giftBadge').textContent = ''; }

// лик дара: своя иконка продукта или знак его рода
function face(g) {
  const box = el('span', { class: 'cd-gift-face' }, KIND[g.item_type] || 'Дар');
  if (Number(g.has_icon))
    api.invoke('site_download', { rel: 'api.php?action=gift_icon&id=' + g.id })
      .then(p => { if (p) box.replaceChildren(el('img', { src: api.fileSrc(p), alt: '' })); })
      .catch(() => {});
  return box;
}

function about(g) {
  return el('span', { class: 'cd-gift-about' },
    g.note ? el('span', { class: 'lr' }, g.note) : null,
    g.descr ? el('div', { class: 'cd-gift-descr' }, g.descr) : null);
}

function feedHole() {
  const bh = $('blackHole');
  if (!bh) return;
  bh.classList.add('feeding');
  setTimeout(() => bh.classList.remove('feeding'), 1400);
}

async function act(ctx, fn) {
  try { await fn(); } catch (e) { ctx.ui.toast(errText(e)); }
  refreshBadge();
  if (isOpen('cdGifts')) openGifts(ctx);
}

const decide = (ctx, id, accept) => act(ctx, async () => {
  const r = await api.site('gift_decide', { id, accept });
  ctx.ui.toast(r && r.accepted ? 'Дар принят — вещь ляжет на вашу полку' : 'Дар отклонён');
  if (r && r.accepted) syncAll(ctx);   // вещь приходит в библиотеку синхронизацией
});

const devour = (ctx, id) => act(ctx, async () => {
  await api.site('gift_devour', { id });
  feedHole();
  ctx.ui.toast('Чёрная дыра приняла подношение — дара больше нет');
});

export async function openGifts(ctx) {
  let r;
  try { r = await api.site('gifts_list'); } catch (e) { ctx.ui.toast('Ларец: ' + errText(e)); return; }
  $('giftBadge').textContent = r.count ? ' ' + r.count : '';
  const { box, close } = showModal('cdGifts', 660);
  const btn = (label, f, cls = 'ghost', title = null) => el('button', { class: cls, title, onclick: f }, label);

  const inc = (r.incoming || []).map(g => el('div', { class: 'link-row cd-gift' }, face(g),
    el('span', { class: 'cd-grow' }, el('b', {}, g.from_login), ' дарит «' + g.title + '» ', about(g),
      g.message ? el('div', { class: 'cd-gift-descr' }, '— «' + g.message + '»') : null),
    el('span', { class: 'cd-gift-btns' },
      btn('Принять', () => decide(ctx, g.id, true)),
      btn('отклонить', () => decide(ctx, g.id, false), 'ghost danger'),
      btn('Скормить дыре', () => devour(ctx, g.id), 'ghost', 'Скормить чёрной дыре — нейтрализовать без следа'))));
  const acc = (r.accepted || []).map(g => el('div', { class: 'link-row cd-gift' }, face(g),
    el('span', { class: 'cd-grow' }, '«' + g.title + '» от ' + g.from_login + ' ', about(g)),
    el('span', { class: 'cd-gift-btns' },
      btn('Скормить дыре', () => devour(ctx, g.id), 'ghost', 'Разонравился — чёрная дыра сотрёт его с полки'))));
  const out = (r.outgoing || []).map(g => el('div', { class: 'link-row cd-gift' },
    el('span', { class: 'cd-grow' }, (KIND[g.item_type] || 'Дар') + ' «' + g.title + '» → ' + g.to_login),
    el('span', { class: 'lr' }, STATUS[g.status] || g.status)));
  const none = t => el('p', { class: 'note' }, t);

  box.append(el('h2', {}, 'Ларец даров'),
    el('div', { class: 'sect' }, 'ВАМ ПРЕДЛАГАЮТ'), ...(inc.length ? inc : [none('Новых даров нет.')]),
    el('div', { class: 'sect' }, 'ПРИНЯТЫЕ — ЕЩЁ МОЖНО СКОРМИТЬ ДЫРЕ'), ...(acc.length ? acc : [none('Принятых даров на полках нет.')]),
    el('div', { class: 'sect' }, 'ВАШИ ДАРЫ'), ...(out.length ? out : [none('Вы пока ничего не дарили.')]),
    row(el('button', { class: 'ghost', onclick: close }, 'Закрыть')));
}
