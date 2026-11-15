// Список снов в левой панели: поиск, миниатюры, новые сверху. Тап — карточка сна.
import { el } from '../shell/ui.js';
import { state, thumbSrc } from './store.js';
import { dreamLoc } from './util.js';

let wrap = null, search = null, items = null, shown = false;

function build(ctx) {
  search = el('input', { type: 'text', class: 'cd-search', placeholder: 'Найти сон: слово, место, дата…' });
  search.addEventListener('input', () => fill(ctx));
  items = el('div', { class: 'cd-list' });
  wrap = el('div', {}, search, items);
}

function card(ctx, d) {
  const thumb = el('div', { class: 'noimg' }, '☾');
  if (d.ImageFile)
    thumbSrc(d).then(src => {
      if (src) thumb.replaceWith(el('img', { src, alt: '', loading: 'lazy' }));
    });
  const sum = (d.Analysis && d.Analysis.Summary) || d.Text || '';
  return el('div', { class: 'dream-card', onclick: () => ctx.bus.emit('dream:open', d.Id) },
    thumb,
    el('div', { class: 'cd-card-text' },
      el('div', { class: 't' }, d.Title || 'Сон без имени'),
      el('div', { class: 'd' }, [d.Date, dreamLoc(d)].filter(Boolean).join(' · ')),
      el('div', { class: 's' }, sum.length > 160 ? sum.slice(0, 160) + '…' : sum)));
}

function fill(ctx) {
  const q = search.value.trim().toLowerCase();
  const list = state.dreams.slice().reverse().filter(d => !q ||
    [d.Title, d.Text, d.Date, dreamLoc(d), d.Analysis && d.Analysis.Summary]
      .some(s => String(s || '').toLowerCase().includes(q)));
  items.replaceChildren(...list.map(d => card(ctx, d)));
  if (!list.length)
    items.append(el('p', { class: 'cd-empty-note' }, state.dreams.length ? 'Ничего не нашлось.' : 'Пока пусто.'));
}

export function showList(ctx, drawer) {
  if (!wrap) build(ctx);
  drawer.title('Сны · ' + state.dreams.length);
  drawer.tools();
  drawer.body.replaceChildren(wrap);
  fill(ctx);
  shown = true;
  drawer.open();
}

// сны перечитаны — обновить список, если он сейчас на виду
export function refreshList(ctx, drawer) {
  if (!shown || !drawer.isOpen() || !wrap || !wrap.isConnected) return;
  drawer.title('Сны · ' + state.dreams.length);
  fill(ctx);
}

export const listShown = drawer => shown && drawer.isOpen() && !!wrap && wrap.isConnected;
