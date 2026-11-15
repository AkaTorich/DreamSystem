// Полки: строка папок сверху и вещи текущей вкладки — книги, PDF с обложками, инструменты сюиты.
import { S } from './state.js';
import { inFolder, childFolders, folderCount } from './data.js';
import { shelvesEl, setStatus } from './shell.js';
import { openFolder, selectClick } from './folders.js';
import { openBook } from './reader.js';
import { openPdfFromShelf } from './pdflink.js';
import { suiteCard } from './suite.js';
import { coverOf, fillCovers } from './covers.js';
import { icon } from '../shell/icons.js';

const el = (...a) => S.ctx.ui.el(...a);

function slot(card) {
  return el('div', { class: 'bookslot' }, card);
}

// уголок с галочкой в пору отбора
export function pickMark(key) {
  return S.picking ? el('div', { class: 'pickmark' }, S.picked.has(key) ? '✓' : '') : null;
}

// карточка вещи: щелчок открывает или (в пору отбора) отмечает
export function itemCard(cls, key, onOpen, ...kids) {
  const card = el('div', { class: 'bookcard ' + cls + (S.picked.has(key) ? ' picked' : ''), 'data-key': key });
  card.append(...[pickMark(key), ...kids].filter(Boolean));
  card.addEventListener('click', ev => { if (!selectClick(key, ev)) onOpen(); });
  return card;
}

// подпапки открытой папки (или папки полки) — одинаковые плитки по сетке над вещами
function folderRow(box) {
  const row = el('div', { class: 'lib-folders' });
  for (const f of childFolders(S.curFolder)) {
    const key = 'folder:' + f.id;
    const t = el('div', { class: 'lib-folder' + (S.picked.has(key) ? ' picked' : ''), title: f.name, 'data-key': key },
      pickMark(key), icon('folder', 16), el('span', { class: 'fn' }, f.name), el('span', { class: 'fc' }, String(folderCount(f))));
    t.addEventListener('click', ev => { if (!selectClick(key, ev)) openFolder(f.id); });
    row.append(t);
  }
  if (row.children.length) box.append(row);
}

// здесь нет и подпапок — значит, правда пусто
const bare = () => !childFolders(S.curFolder).length;

function empty(box, text) {
  box.append(el('p', { class: 'note lib-empty' }, text));
}

const mb = n => n > 0 ? (n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' КБ' : (n / 1048576).toFixed(1).replace('.', ',') + ' МБ') : '';

function bookShelf(grid) {
  const books = S.books || [];
  setStatus(S.books ? 'книг: ' + books.length : '', S.booksPath);
  let shown = 0;
  for (const b of books) {
    const num = b.num != null ? +b.num : -1;
    if (!inFolder('book', num)) continue;
    shown++;
    const has = !!b.translation;
    grid.append(slot(itemCard('lib-book', 'book:' + num, () => openBook(b),
      el('div', { class: 'bnum' }, 'том ' + (b.num ?? '')),
      el('div', { class: 'btitle' }, b.title || ''),
      el('div', { class: 'bsub' + (has ? ' lib-done' : '') }, has ? 'истолкована' : ''))));
  }
  if (!shown && bare() && (S.curFolder !== null || !books.length))   // всё в папках — не «пусто»
    empty(grid, S.curFolder === null ? 'На общей полке пусто' : 'В этой папке пока пусто');
}

function pdfShelf(grid) {
  const pdfs = S.pdfs || [];
  setStatus('PDF: ' + pdfs.length, '');
  let shown = 0;
  for (const p of pdfs) {
    if (!inFolder('pdf', p.Id)) continue;
    shown++;
    const away = !p.File;   // ещё не скачан на это устройство
    const card = itemCard('lib-pdf' + (away ? ' away' : ''), 'pdf:' + p.Id, () => openPdfFromShelf(p),
      el('div', { class: 'covertitle' }, p.Title),
      away && p.Size ? el('div', { class: 'csize', title: 'Скачается при открытии' }, mb(p.Size)) : null);
    const cov = coverOf(p.Id);
    if (cov) {
      const img = new Image(); img.className = 'coverimg'; img.alt = ''; img.src = cov;
      card.prepend(img); card.classList.add('cover');
    }
    grid.append(slot(card));
  }
  if (!shown && bare() && (S.curFolder !== null || !pdfs.length)) empty(grid, S.curFolder !== null ? 'В этой папке нет PDF.'
    : 'Полка PDF пуста — добавьте файл кнопкой «Добавить PDF» или получите книгу с сайта.');
}

function suiteShelf(grid) {
  if (!S.online) {
    setStatus('', '');
    empty(grid, 'Сюита «Гермес» живёт на сайте.\nВойдите в аккаунт на вкладке «Сайт» — и полка с инструментами откроется здесь.');
    return;
  }
  if (!S.files) { setStatus('', ''); empty(grid, 'Полка сюиты загружается…'); return; }
  setStatus('инструментов: ' + S.files.length, '');
  let shown = 0;
  for (const f of S.files) {
    if (!inFolder('file', f.id)) continue;
    shown++;
    grid.append(slot(suiteCard(f)));
  }
  // всё разложено по папкам — это не «пусто»: вещи в папках выше
  if (!shown && bare() && (S.curFolder !== null || !S.files.length))
    empty(grid, S.curFolder !== null ? 'В этой папке нет инструментов.'
      : 'Полка сюиты пуста — инструменты приходят даром от владельца.');
}

export function renderShelves() {
  const box = shelvesEl();
  if (!box) return;
  box.innerHTML = '';
  folderRow(box);
  const grid = el('div', { class: 'lib-grid' });
  box.append(grid);
  if (S.mode === 'book') bookShelf(grid);
  else if (S.mode === 'pdf') { pdfShelf(grid); fillCovers(); }
  else suiteShelf(grid);
}
