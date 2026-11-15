// Библиотека (app\src\commands\library.rs): раскладка по папкам, книги, инструменты сюиты,
// сохранение и чтение текста. Мода books.json в браузере нет — книги всегда с сайта.
import * as http from '../lib/http.js';
import { isAuthError, requireLogin, profile } from '../lib/session.js';
import { read, write } from '../lib/store.js';
import { fileOf, saveName, isSaveToken, downloadBlob, downloadUrl } from '../lib/dialog.js';
import { libraryChanged } from '../lib/events.js';
import { jx } from '../lib/util.js';

// раскладка папок — прямо с сайта; без входа — null (как у ядра без сохранённого слепка)
async function lib_index() {
  try { return await http.get('lib_index'); } catch (e) { if (isAuthError(e)) return null; throw e; }
}

/* поля книг, которых сайт не хранит (размер шрифта, строк на странице, свои пометки), —
   память этого браузера по номеру книги */
const SITE_FIELDS = ['num', 'title', 'text', 'translation', 'location'];
const extraKey = () => 'cd.books.' + profile();

// книга сайта → книга программы (как sync\books.rs merge для копии с сайта)
function bookFromSite(sb, extra) {
  const num = jx.i(sb, 'num');
  return {
    num,
    title: jx.str(sb, 'title'),
    text: jx.str(sb, 'text'),
    size: 34,
    per_page: 600,
    translation: jx.str(sb, 'translation'),
    location: jx.str(sb, 'location'),
    ...(extra[num] || {}),
  };
}

async function books_get() {
  let j;
  try { j = await http.get('books_list'); } catch (e) { if (isAuthError(e)) return { path: null, books: [] }; throw e; }
  const extra = read(extraKey(), {});
  const books = jx.arr(j, 'books').filter(sb => jx.i(sb, 'num') != null).map(sb => bookFromSite(sb, extra));
  return { path: null, books };
}

// вся библиотека — на сайт (books_import: сервер сводит по номеру, трактовки и печати не теряет)
async function books_save({ books }) {
  requireLogin();
  const list = Array.isArray(books) ? books : [];
  const extra = {};
  for (const b of list) {
    if (!b || b.num == null) continue;
    const own = {};
    for (const [k, v] of Object.entries(b)) if (!SITE_FIELDS.includes(k)) own[k] = v;
    extra[b.num] = own;
  }
  write(extraKey(), extra);
  const json = new Blob([JSON.stringify(list)], { type: 'application/json' });
  await http.upload('books_import', [{ field: 'books', name: 'books.json', data: json }], {});
  libraryChanged();
  return null;
}

// инструмент сюиты — скачать через браузер; ответ — имя файла (в «Загрузках» браузера)
async function suite_download({ id, fileName }) {
  requireLogin();
  const name = String(fileName || 'file').split(/[\\/]/).pop();
  downloadUrl(http.actionUrl('file_get&id=' + (+id || 0)), name);
  return name;
}

// записать текст в файл, «выбранный» диалогом сохранения, — скачивание под этим именем
async function save_text_file({ path, text }) {
  const p = String(path ?? '').trim();
  if (!p) throw new Error('Не задан путь');
  const name = isSaveToken(p) ? saveName(p) : p.split(/[\\/]/).pop();
  downloadBlob(new Blob([String(text ?? '')], { type: 'text/plain;charset=utf-8' }), name || 'file.txt');
  return null;
}

// прочитать текстовый файл, выбранный в диалоге открытия (BOM в начале снимается)
async function read_text_file({ path }) {
  const f = fileOf(path);
  if (!f) throw new Error('файл: выбранный файл недоступен — выберите его снова');
  let u8 = new Uint8Array(await f.arrayBuffer());
  if (u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) u8 = u8.subarray(3);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { throw new Error('Файл не в UTF-8'); }
}

export const commands = { lib_index, books_get, books_save, suite_download, save_text_file, read_text_file };
