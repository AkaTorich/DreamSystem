// Данные библиотеки: книги, PDF, сюита, раскладка по папкам и id вещей на сайте.
// Раскладка сначала берётся сохранённая (lib_index ядра) — полка рисуется сразу как была,
// потом тихо сверяется с сайтом и перерисовывается, только если что-то поменялось.
import { S } from './state.js';
import { utf8ToB64 } from './util.js';

const api = () => S.ctx.api;

export async function checkOnline() {
  try {
    const st = await api().invoke('site_state');
    S.online = !!(st && st.online && st.user);
    S.user = st ? st.user : null;
  } catch { S.online = false; S.user = null; }
  return S.online;
}

export async function loadBooks() {
  const r = await api().invoke('books_get');
  S.books = (r && r.books) || [];
  S.booksPath = r ? r.path : null;
}

export async function saveBooks() {
  S.selfSaveAt = Date.now();   // своё сохранение: library://changed после него книги не перечитывает
  await api().invoke('books_save', { books: S.books });
}

export async function loadPdfs() {
  S.pdfs = (await api().invoke('pdfs_list')) || [];
}

const intOrNull = v => (v === null || v === undefined || v === '' ? null : parseInt(v, 10));

export function applyIndex(ix) {
  S.bookFolder.clear(); S.pdfFolder.clear(); S.bookSiteId.clear(); S.pdfSiteId.clear();
  S.folders = (ix.folders || []).map(f => ({ id: +f.id, name: f.name, kind: f.kind, parent: intOrNull(f.parent_id) }));
  for (const b of ix.books || []) {
    const num = intOrNull(b.num);
    if (num === null || num < 0) continue;
    S.bookFolder.set(num, intOrNull(b.folder_id));
    S.bookSiteId.set(num, +b.id);
  }
  for (const p of ix.pdfs || []) {
    const ext = p.ext_id ? String(p.ext_id) : 'webp' + p.id;
    S.pdfFolder.set(ext, intOrNull(p.folder_id));
    S.pdfSiteId.set(ext, +p.id);
  }
  if (Array.isArray(ix.files)) S.files = ix.files;
}

// сохранённая раскладка — без похода на сайт
export async function loadIndexCached() {
  if (S.indexJson) return;
  try {
    const ix = await api().invoke('lib_index');
    if (ix && typeof ix === 'object') { applyIndex(ix); S.indexJson = JSON.stringify(ix); }
  } catch { /* раскладки ещё нет — всё на общей полке */ }
}

// тихая сверка с сайтом; true — раскладка изменилась
export async function refreshIndex() {
  if (!S.online) return false;
  try {
    const ix = await api().site('lib_index');
    const json = JSON.stringify(ix);
    if (json === S.indexJson) return false;
    applyIndex(ix);
    S.indexJson = json;
    if (S.curFolder !== null && !S.folders.some(f => f.id === S.curFolder)) S.curFolder = null;
    return true;
  } catch { return false; }   // нет связи — остаётся прежняя раскладка
}

export async function loadSuite() {
  if (!S.online) return;
  try { S.files = (await api().site('files_list')).files || []; } catch { /* остаётся из раскладки */ }
}

// id книги на сайте по её номеру; -1 — книги там нет
export async function siteIdOfBook(num) {
  if (S.bookSiteId.has(num)) return S.bookSiteId.get(num);
  const j = await api().site('books_list');
  const sb = (j.books || []).find(b => +b.num === +num);
  if (!sb) return -1;
  S.bookSiteId.set(+num, +sb.id);
  return +sb.id;
}

export async function siteBookByNum(num) {
  const j = await api().site('books_list');
  return (j.books || []).find(b => +b.num === +num) || null;
}

export async function siteIdOfPdf(p) {
  if (p.Id.startsWith('webp')) { const n = parseInt(p.Id.slice(4), 10); return isNaN(n) ? -1 : n; }
  if (S.pdfSiteId.has(p.Id)) return S.pdfSiteId.get(p.Id);
  const j = await api().site('pdfs_list');
  const sp = (j.pdfs || []).find(x => x.ext_id === p.Id);
  if (!sp) return -1;
  S.pdfSiteId.set(p.Id, +sp.id);
  return +sp.id;
}

// вся библиотека — на сайт (сервер сводит по номеру, трактовки и печати не теряет)
export async function pushBooks() {
  await api().invoke('site_upload', {
    action: 'books_import', field: 'books', fileName: 'books.json',
    bytesB64: utf8ToB64(JSON.stringify(S.books)), extra: {}, mime: 'application/json',
  });
  S.bookSiteId.clear();   // новые книги получили id — узнаем заново
}

// вещь лежит в открытой сейчас папке
export function inFolder(kind, key) {
  const m = kind === 'book' ? S.bookFolder : kind === 'pdf' ? S.pdfFolder : null;
  let f = null;
  if (m) f = m.has(key) ? m.get(key) : null;
  else {
    const sf = (S.files || []).find(x => +x.id === +key);
    f = sf ? intOrNull(sf.folder_id) : null;
  }
  return f === S.curFolder;
}

export function kindFolders() {
  return S.folders.filter(f => f.kind === S.mode);
}

// папки прямо внутри parent (null — на полке); вложенность любая
export function childFolders(parent) {
  return kindFolders().filter(f => (f.parent ?? null) === parent)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
}

// путь от полки до папки: [корневая, …, сама]
export function folderPath(id) {
  const out = [], seen = new Set();
  for (let f = S.folders.find(x => x.id === id); f && !seen.has(f.id); f = S.folders.find(x => x.id === f.parent)) {
    seen.add(f.id); out.unshift(f);
  }
  return out;
}

// сама папка и все её подпапки — куда её переносить нельзя
export function folderTree(id) {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of S.folders) if (f.parent != null && ids.has(f.parent) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
  }
  return ids;
}

// подпись папки в списках: «А / Б / В»
export const folderLabel = f => folderPath(f.id).map(x => x.name).join(' / ');

// счётчик папки по местной раскладке — без походов на сервер: вещи и подпапки прямо в ней
export function folderCount(f) {
  let n = S.folders.filter(x => x.parent === f.id).length;
  if (f.kind === 'book') S.bookFolder.forEach(v => { if (v === f.id) n++; });
  else if (f.kind === 'pdf') S.pdfFolder.forEach(v => { if (v === f.id) n++; });
  else (S.files || []).forEach(x => { if (intOrNull(x.folder_id) === f.id) n++; });
  return n;
}

export function setItemFolder(kind, key, fid) {
  if (kind === 'book') S.bookFolder.set(+key, fid);
  else if (kind === 'pdf') S.pdfFolder.set(key, fid);
  else (S.files || []).forEach(x => { if (+x.id === +key) x.folder_id = fid; });
}
