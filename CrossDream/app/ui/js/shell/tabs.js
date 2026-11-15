// Вкладки шапки. Каждая вкладка — страница на всё окно под шапкой (окна областей открываются
// страницами: css/pages.css). Кнопки вкладок — те же, что вызывали окна областей (btnLibrary…),
// поэтому области ничего не знают о вкладках: здесь только закрыть прежнюю страницу и подсветить.
// Открытый PDF — своя вкладка с названием книги: уйти с неё — книга ждёт (класс parked), × — закрыть.
// Пока открыта страница, карта не рисуется (body.paged) — зря не тратит силы машины.
import { $, el } from './ui.js';
import { icon } from './icons.js';

// страница → вкладка (по селектору открытого окна)
const PAGES = [
  ['#cdLeft.open', 'dreams'],
  ['#overlays > .lib-ov.open', 'library'],
  ['#cdSettings.open', 'settings'],
  ['#cdSite.open', 'site'],
  ['#cdUsers.open', 'users'],
  ['#cdGifts.open', 'gifts'],
  ['#cdTrust.open', 'trust'],
  ['#cdImport.open', 'import'],
];
// читальня книг и форма книги — часть вкладки «Библиотека», поверх её полок
const READERS = '#overlays > .lib-read-ov.open, #overlays > .lib-form-ov.open';

const visible = e => !e.hidden && getComputedStyle(e).display !== 'none';
const shown = sel => [...document.querySelectorAll(sel)].filter(visible);

let bus = null, wasPaged = false, tabPdf = null;

const pdfEl = () => document.querySelector('#overlays > .pdf-ov.open');   // открыт (может ждать)
const pdfShown = () => { const p = pdfEl(); return !!p && !p.classList.contains('parked'); };
const park = on => { const p = pdfEl(); if (p) p.classList.toggle('parked', on); };

function openPages() { return PAGES.flatMap(([sel, tab]) => shown(sel).map(e => ({ el: e, tab }))); }

function cosmosOn() { const b = $('cosmosBar'); return !!b && !b.hidden; }

export function activeTab() {
  if (pdfShown()) return 'pdf';
  if (shown(READERS).length) return 'library';
  const p = openPages();
  if (p.length) return p[p.length - 1].tab;
  return cosmosOn() ? 'cosmos' : 'map';
}

// закрыть окно его же кнопкой «закрыть» (у каждой области свои хвосты при закрытии)
function closeEl(e) {
  if (e.classList.contains('cd-ov')) {   // окна dreams/modal.js: как hideModal — с их onClose
    e.classList.remove('open');
    const f = e._onClose; e._onClose = null;
    if (f) try { f(); } catch (err) { console.error(err); }
    return;
  }
  const btns = [...e.querySelectorAll('button')];   // и скрытые: у страниц кнопка «закрыть» спрятана
  const b = btns.find(x => /^Закрыть/.test(x.title || '')) || btns.find(x => x.textContent.trim() === '✕')
    || btns.find(x => x.textContent.trim() === 'Закрыть') || btns.find(x => x.textContent.trim() === 'Отмена');
  if (b) b.click(); else e.classList.remove('open');
}

// закрыть страницы; открытая книга не закрывается, а ждёт на своей вкладке
export function closePages() {
  park(true);
  shown(READERS).forEach(closeEl);
  openPages().forEach(p => closeEl(p.el));
}

function sync() {
  const p = pdfEl();
  tabPdf.hidden = !p;
  if (p) {
    const t = (p.querySelector('.pdf-title') || {}).textContent || 'PDF';
    tabPdf.querySelector('.lbl').textContent = t;
    tabPdf.title = t;
  }
  const t = activeTab();
  document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  const paged = t !== 'map' && t !== 'cosmos';
  document.body.classList.toggle('paged', paged);
  if (wasPaged && !paged && bus) bus.emit('map:shown');   // карта снова на виду — перерисовать
  wasPaged = paged;
}

function onTabClick(e) {
  const tab = e.target.closest('.tab');
  if (!tab) return;
  const want = tab.dataset.tab;
  if (want === 'pdf') {                       // своя вкладка книги: × закрывает, иначе — вернуться к ней
    e.stopPropagation();
    if (e.target.closest('.x')) { const p = pdfEl(); if (p) { p.classList.remove('parked'); closeEl(p); } return; }
    if (pdfShown()) return;
    closePages(); park(false);
    return;
  }
  if (want === activeTab()) { e.stopPropagation(); return; }
  if (pdfShown()) {                           // с книги — она ждёт; под ней уже нужная страница?
    park(true);
    if (want === activeTab()) { e.stopPropagation(); return; }
  }
  const leaveCosmos = cosmosOn();
  closePages();
  if (want === 'map' && leaveCosmos) bus.emit('cosmos:close');
}

export function initTabs(b) {
  bus = b;
  tabPdf = el('button', { class: 'tab pdftab', 'data-tab': 'pdf', id: 'tabPdf', hidden: true },
    el('span', { class: 'ti' }, icon('pdf', 18)), el('span', { class: 'lbl' }, 'PDF'),
    el('span', { class: 'x', title: 'Закрыть книгу' }, icon('close', 14)));
  $('btnLibrary').after(tabPdf);
  // щелчок по вкладке: своя уже открыта — ничего; иначе закрыть прежнюю страницу,
  // а открытие сделает обработчик самой кнопки (области вешают его через onTop)
  $('tabs').addEventListener('click', onTabClick, true);
  // космос — режим карты, а не окно: его включение видно не сразу
  $('tabs').addEventListener('click', () => { setTimeout(sync, 60); setTimeout(sync, 600); });

  let queued = false;
  const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; sync(); }); } };
  const watch = { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] };
  new MutationObserver(later).observe($('overlays'), watch);
  new MutationObserver(later).observe($('panels'), watch);
  new MutationObserver(later).observe(document.body, { childList: true });
  bus.on('cosmos:shown', later);
  bus.on('map:focus', () => closePages());   // «показать на карте» — к карте
  sync();
}
