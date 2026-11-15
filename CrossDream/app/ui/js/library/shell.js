// Страница библиотеки: шапка (вкладки Иероглифы / PDF / Сюита, счёт, панель действий с папками
// и вещами), путь открытой папки «Все полки / А / Б», полоса отбора, полки.
// Действия — и на панели, и в выпадающем меню по правой кнопке (ctxmenu.js).
import { S } from './state.js';
import { icon } from '../shell/icons.js';
import { showOverlay, hideOverlay, isOpen } from './util.js';
import { renderShelves } from './shelves.js';
import { setMode, newItem, browseBooks } from './tabs.js';
import { togglePick, pickOff, openFolder, folderBack, renameFolder, delFolder, newFolder, curPath, selectAll } from './folders.js';
import { toClip, paste, deleteKeys, purgeKeys, isOwner, canPaste, clipLabel } from './clip.js';
import { wireMenu } from './ctxmenu.js';
import { cancelLink } from './links.js';

let ov = null;
const R = {};   // ссылки на элементы окна

function build() {
  const { el } = S.ctx.ui;
  const b = (label, title, onclick, cls = '') => el('button', { class: cls, title, onclick }, label);
  const tab = (mode, ic, text) => el('button', { class: 'lib-tab', 'data-mode': mode, onclick: () => setMode(mode) },
    icon(ic, 16), el('span', {}, text));
  R.tabs = [tab('book', 'book', 'Иероглифы'), tab('pdf', 'pdf', 'PDF'), tab('file', 'tool', 'Сюита')];
  R.newFolder = el('button', { title: 'Новая папка в открытой папке', onclick: newFolder }, icon('folderPlus', 16), 'Новая папка');
  R.paste = b('Вставить', 'Вставить скопированное или вырезанное в открытую папку', paste);
  R.pick = b('Выбрать', 'Отметить несколько вещей и папок и работать с ними разом', togglePick);
  R.newLbl = el('span', {}, 'Новая книга');
  R.newBtn = el('button', { class: 'primary', onclick: newItem }, icon('plus', 15), R.newLbl);
  R.browse = b('books.json…', 'Открыть другой books.json…', browseBooks, 'ghost');
  R.close = el('button', { class: 'lib-close', title: 'Закрыть библиотеку', onclick: closeLibrary, hidden: true }, 'Закрыть');
  R.status = el('div', { class: 'lib-status' });
  R.linkCancel = b('Отменить связывание', 'Выйти из режима связывания (Esc)', () => cancelLink(), 'primary');

  R.crumbs = el('div', { class: 'lib-crumbs' });
  R.folderHead = el('div', { class: 'lib-folderhead', hidden: true },
    el('button', { class: 'ghost icon', title: 'На уровень выше', onclick: folderBack }, icon('back', 16)),
    R.crumbs, el('div', { class: 'spacer' }),
    b('Переименовать', 'Переименовать эту папку', () => renameFolder(), 'ghost'),
    b('Убрать папку', 'Убрать папку — её вещи и подпапки поднимутся на уровень выше', () => delFolder(), 'ghost danger'));

  R.pickCount = el('span', { class: 'note' });
  const picked = () => [...S.picked];
  R.purge = b('Стереть с сервера', 'Стереть файлы с сервера совсем — у всех (только владелец сайта)', () => purgeKeys(picked()), 'ghost danger');
  R.pickBtns = [b('Копировать', '', () => S.picked.size && toClip('copy', picked())),
    b('Вырезать', '', () => S.picked.size && toClip('cut', picked())),
    b('Удалить', 'Убрать из библиотеки (файлы на сервере сохраняются)', () => S.picked.size && deleteKeys(picked()), 'danger')];
  R.pickBar = el('div', { class: 'lib-pickbar', hidden: true },
    R.pickCount, b('Выбрать всё', 'Отметить все папки и вещи здесь (Ctrl+A)', selectAll, 'ghost'),
    el('div', { class: 'spacer' }), ...R.pickBtns, R.purge, b('Отмена', '', pickOff, 'ghost'));

  R.shelves = el('div', { class: 'shelves lib-shelves' });
  R.scroll = el('div', { class: 'lib-scroll' }, R.shelves);
  wireMenu(R.scroll);
  document.addEventListener('keydown', onKeys);

  const win = el('div', { class: 'lib-win' },
    el('div', { class: 'lib-head' },
      el('div', { class: 'lib-tabs' }, R.tabs),
      R.status,
      el('div', { class: 'lib-actions' }, R.linkCancel, R.browse, R.newFolder, R.paste, R.pick, R.newBtn, R.close)),
    R.folderHead, R.pickBar, R.scroll);
  ov = el('div', { class: 'overlay lib-ov' }, win);
  document.getElementById('overlays').append(ov);
}

export function libOverlay() { return ov; }
export function shelvesEl() { return R.shelves; }
export function libIsOpen() { return isOpen(ov); }

export function openLibraryWindow() {
  if (!ov) build();
  showOverlay(ov);
}

export function closeLibrary() {
  if (ov) hideOverlay(ov);
  S.link = null;
}

// строка счёта: что на полке; где лежит — в подсказке, чтобы путь не съедал шапку
export function setStatus(text, where) {
  if (!R.status) return;
  R.status.textContent = S.link ? 'Связываю «' + S.link.title + '» — щёлкните книгу на любой полке' : text;
  R.status.title = where ? 'Где лежит: ' + where : '';
  R.browse.title = 'Открыть другой books.json…' + (where && S.mode === 'book' ? '\nСейчас открыт: ' + where : '');
}

// путь «Все полки / А / Б»: каждое звено — переход
function renderCrumbs() {
  const { el } = S.ctx.ui;
  const path = curPath();
  R.crumbs.replaceChildren(el('button', { class: 'crumb', onclick: () => openFolder(null) }, 'Все полки'));
  path.forEach((f, i) => {
    R.crumbs.append(el('span', { class: 'sep' }, '/'));
    R.crumbs.append(i === path.length - 1 ? el('b', { class: 'crumb cur' }, f.name)
      : el('button', { class: 'crumb', onclick: () => openFolder(f.id) }, f.name));
  });
}

export function renderChrome() {
  if (!ov) return;
  R.tabs.forEach(t => t.classList.toggle('on', t.dataset.mode === S.mode));
  R.newBtn.hidden = S.mode === 'file';
  R.newLbl.textContent = S.mode === 'pdf' ? 'Добавить PDF' : 'Новая книга';
  R.newBtn.title = S.mode === 'pdf' ? 'Добавить PDF' : 'Новая книга';
  R.browse.hidden = S.mode !== 'book' || !S.booksPath;
  R.newFolder.hidden = R.pick.hidden = !S.online;
  R.paste.hidden = !canPaste();
  R.paste.textContent = clipLabel();
  R.pick.classList.toggle('primary', S.picking);
  R.linkCancel.hidden = !S.link;

  R.folderHead.hidden = S.curFolder === null;
  if (S.curFolder !== null) renderCrumbs();

  R.pickBar.hidden = !S.picking;
  if (S.picking) {
    R.pickCount.textContent = S.picked.size ? 'Выбрано: ' + S.picked.size : 'Отметьте вещи и папки щелчком';
    R.purge.hidden = !isOwner() || S.mode === 'book';
  }
}

export function render() {
  renderChrome();
  renderShelves();
}

// клавиши как в проводнике, пока на виду полки и курсор не в поле ввода:
// Ctrl+A — всё, Ctrl+C / Ctrl+X — в буфер отмеченное, Ctrl+V — вставить, Delete — убрать отмеченное
function onKeys(e) {
  if (!isOpen(ov) || getComputedStyle(ov).display === 'none') return;
  if (document.querySelector('#overlays > .lib-read-ov.open, #overlays > .pdf-ov.open:not(.parked), .lib-dialog')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
  const k = e.key.toLowerCase(), ctl = e.ctrlKey || e.metaKey, picked = [...S.picked];
  if (ctl && (k === 'a' || k === 'ф')) { e.preventDefault(); selectAll(); }
  else if (ctl && (k === 'c' || k === 'с') && picked.length) { e.preventDefault(); toClip('copy', picked); }
  else if (ctl && (k === 'x' || k === 'ч') && picked.length) { e.preventDefault(); toClip('cut', picked); }
  else if (ctl && (k === 'v' || k === 'м') && canPaste()) { e.preventDefault(); paste(); }
  else if (e.key === 'Delete' && picked.length) { e.preventDefault(); deleteKeys(picked); }
}
