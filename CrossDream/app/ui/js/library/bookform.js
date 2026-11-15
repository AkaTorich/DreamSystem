// Новая книга и правка книги: books_save локально, на сайт — book_edit или вся библиотека разом.
// Печать скилла хранится только на сайте: книга с печатью уезжает туда, а местный текст чистится.
import { S, errText } from './state.js';
import { showOverlay, hideOverlay } from './util.js';
import { saveBooks, pushBooks, siteIdOfBook } from './data.js';
import { extractLeadingSeal, stripLocalSeals } from './seals.js';
import { renderShelves } from './shelves.js';

let ov = null, editing = null;
const R = {};
const toast = m => S.ctx.ui.toast(m);

function build() {
  const { el } = S.ctx.ui;
  R.head = el('h2', {}, 'Новая книга');
  R.note = el('p', { class: 'note' }, 'Книга встанет на полку и в books.json мода — Писец вошьёт её в игру.');
  R.name = el('input', { type: 'text' });
  R.text = el('textarea', { class: 'hiero-text lib-bftext' });
  const box = el('div', { class: 'modal lib-bookform' }, R.head, R.note,
    el('label', {}, 'НАЗВАНИЕ'), R.name,
    el('label', {}, 'ТЕКСТ (иероглифы и русский)'), R.text,
    el('div', { class: 'mrow' },
      el('button', { class: 'ghost', onclick: closeBookForm }, 'Отмена'),
      el('button', { class: 'primary', onclick: save }, 'На полку')));
  ov = el('div', { class: 'overlay lib-form-ov' }, box);
  document.getElementById('overlays').append(ov);
}

export function bookFormOverlay() { return ov; }

export function openBookForm(b) {
  if (!S.books) return;
  if (!ov) build();
  editing = b || null;
  R.head.textContent = b ? 'Правка книги' : 'Новая книга';
  R.note.hidden = !S.booksPath;
  R.name.value = b ? b.title || '' : '';
  R.text.value = b ? b.text || '' : '';
  showOverlay(ov);
  setTimeout(() => R.name.focus(), 30);
}

export function closeBookForm() {
  editing = null;
  if (ov) hideOverlay(ov);
}

async function save() {
  const title = R.name.value.trim();
  const text = R.text.value;
  if (!title) { toast('Нужно название книги'); return; }
  if (editing) return saveEdit(editing, title, text);

  const num = S.books.reduce((m, b) => Math.max(m, +(b.num ?? 0)), 0) + 1;
  S.books.push({ num, title, text, size: 34, per_page: 600, translation: '' });
  try { await saveBooks(); } catch (e) { toast('Не сохранилось: ' + errText(e)); S.books.pop(); return; }
  closeBookForm();
  renderShelves();

  const { seal } = extractLeadingSeal(text);
  if (seal) {
    if (!S.online) { toast('Печать переедет на сайт при следующей синхронизации (войдите на вкладке «Сайт»)'); return; }
    try {
      await pushBooks();
      if (stripLocalSeals(S.books)) await saveBooks();
      renderShelves();
      toast('Книга на полке; печать ' + seal + ' сохранена на сайте');
    } catch (e) { toast('Печать доедет позже: ' + errText(e)); }
    return;
  }
  toast(S.booksPath ? 'Книга «' + title + '» на полке (в игру попадёт после пересборки в Писце)'
    : 'Книга «' + title + '» на полке');
  // новая книга сразу тихо уезжает на сайт
  if (S.online) { try { await pushBooks(); } catch { /* доедет при синхронизации */ } }
}

// правка существующей: локально + на сайт
async function saveEdit(b, title, text) {
  b.title = title;
  b.text = text;
  try { await saveBooks(); } catch (e) { toast('books.json: ' + errText(e)); return; }
  closeBookForm();
  renderShelves();
  if (S.online) {
    try {
      const sid = await siteIdOfBook(+(b.num ?? 0));
      if (sid >= 0) await S.ctx.api.site('book_edit', { id: sid, title, text });
      else await pushBooks();
    } catch (e) { toast('На сайт правка не доехала: ' + errText(e)); return; }
  }
  toast('Книга обновлена');
}
