// PDF: список и быстрая сверка с сайтом, открытие для читалки, чтение в память с ходом,
// переименование, удаление, память страницы (app\src\commands\pdf.rs). Добавление — pdf-add.js.
import * as http from '../lib/http.js';
import { requireLogin, isAuthError, loggedIn } from '../lib/session.js';
import * as pc from '../lib/pdf-cache.js';
import { editSettings } from '../lib/store.js';
import { emit, EV, libraryChanged } from '../lib/events.js';
import { isPdf, throttle } from '../lib/util.js';

const RECENT = 5000;

async function pdfs_list() {
  try { await pc.load(RECENT); } catch (e) { if (!isAuthError(e)) throw e; }
  return pc.books();
}

// быстрая сверка только списка с сайтом; затем library://changed
async function pdfs_refresh() {
  if (!loggedIn()) throw new Error('Сначала войдите на сайт');
  await pc.load(0);
  libraryChanged();
  return pc.books();
}

async function find(id) {
  let b = pc.book(id);
  if (!b) { await pc.load(0); b = pc.book(id); }
  if (!b) throw new Error('PDF не найден');
  return b;
}

// открыть книгу для читалки: ничего не грузим — pdf.js возьмёт её по адресу (convertFileSrc(id, 'cdpdf'))
async function pdf_open({ id }) {
  const b = await find(id);
  return b.Size;
}

// байты PDF (ArrayBuffer): с сайта с ходом `pdf://progress` (не чаще ~10 раз в секунду)
async function pdf_read({ id }) {
  const b = await find(id);
  const p = pc.pending.get(id);
  if (p && !p.deleted) return p.bytes.slice().buffer;
  const sid = await pc.resolveSiteId(id);
  if (sid <= 0) throw new Error('PDF «' + b.Title + '» на сайте не найден');
  const prog = throttle(100, (done, total) => emit(EV.PDF_PROGRESS, { id, done, total }));
  const bytes = await http.downloadProgress('api.php?action=pdf_file&id=' + sid, Math.max(0, b.Size || 0), prog);
  if (!isPdf(bytes)) throw new Error('Сайт прислал не PDF вместо «' + b.Title + '»');
  const s = pc.siteEntry(id);
  if (s) s.size = bytes.length;
  return bytes.buffer;
}

// память страницы: здесь (localStorage) и на сайте
async function pdf_page_set({ id, page }) {
  const n = Math.max(0, Math.trunc(+page || 0));
  editSettings(s => { s.PdfPage[id] = n; });
  const s = pc.siteEntry(id);
  if (s) s.lastPage = n;
  if (loggedIn()) {
    // номер на сайте надёжнее своего кода: PDF без кода живёт здесь как «webp<номер>»
    const sid = pc.knownSiteId(id);
    const body = sid > 0 ? { id: sid, page: n } : { ext_id: id, page: n };
    await http.postJson('pdf_page', body).catch(() => {});
  }
  return null;
}

// переименовать: сперва на сайте (ошибка сайта — здесь ничего не меняется)
async function pdf_rename({ id, title }) {
  const t = String(title ?? '').trim();
  if (!t) throw new Error('Название не может быть пустым');
  requireLogin();
  await find(id);
  const p = pc.pending.get(id);
  if (p && !p.deleted) {
    p.title = t;   // номера ещё нет — новое название донесёт сама отправка
    if (p.siteId > 0) await http.postJson('pdf_rename', { id: p.siteId, title: t });
  } else {
    const sid = await pc.resolveSiteId(id);
    if (sid > 0) await http.postJson('pdf_rename', { id: sid, title: t });
    const s = pc.siteEntry(id);
    if (s) s.title = t;
  }
  libraryChanged();
  return pc.book(id);
}

// удалить: на сайте — pdf_del (файл там остаётся); localOnly — сайт не трогать (уже стёрт lib_purge)
async function pdf_delete({ id, localOnly }) {
  const p = pc.pending.get(id);
  if (p) {
    p.deleted = true;   // ещё уходит — отправка сама удалит его там по окончании
    if (p.state !== 'send') pc.pending.delete(id);
  } else if (!localOnly) {
    requireLogin();
    const sid = await pc.resolveSiteId(id);
    if (sid > 0) await http.postJson('pdf_del', { id: sid });
  }
  const own = pc.ownCovers.get(id);
  if (own) { URL.revokeObjectURL(own.raw); pc.ownCovers.delete(id); }
  pc.P.site = pc.P.site.filter(s => s.localId !== id);
  pc.markStale();
  libraryChanged();
  return null;
}

export const commands = { pdfs_list, pdfs_refresh, pdf_open, pdf_read, pdf_page_set, pdf_rename, pdf_delete };
