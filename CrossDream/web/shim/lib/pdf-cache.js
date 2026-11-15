// PDF сайта в форме PdfBook ядра (core\src\sync\pdfs.rs): последний ответ `pdfs_list` и PDF,
// которые сейчас уходят на сайт (их ещё нет в списке сайта — держим в памяти, как ядро на полке).
import * as http from './http.js';
import { loadSettings, editSettings } from './store.js';
import { jx } from './util.js';

export const P = {
  site: [],            // [{localId, siteId, title, size, lastPage, hasCover}]
  at: 0,
  stale: true,
  inflight: null,
  fp: '',              // отпечаток ответа — для синхронизации
};

// уходящие на сайт: id → {id, title, bytes, siteId, deleted, state: 'send'|'fail', url}
export const pending = new Map();
// свои обложки (JPEG), пока номера на сайте ещё нет: id → {blob, raw (blob:), url (raw + «#c»)}
export const ownCovers = new Map();

// свой id PDF сайта: ext_id либо «webp<id>»
export function localPdfId(sp) {
  const e = jx.s(sp, 'ext_id');
  return e ? e : 'webp' + jx.str(sp, 'id');
}

export function parseList(v) {
  return jx.arr(v, 'pdfs').map(sp => ({
    localId: localPdfId(sp),
    siteId: jx.i(sp, 'id') || 0,
    title: jx.str(sp, 'title'),
    size: Math.max(0, jx.i(sp, 'size') || 0),
    lastPage: jx.i(sp, 'last_page') || 0,
    hasCover: (jx.i(sp, 'has_cover') || 0) !== 0,
  }));
}

// память страницы: на этой машине её ещё нет — берём серверную закладку (take_pages ядра)
function takePages(list) {
  const pages = list.filter(s => s.lastPage > 0);
  const known = loadSettings().PdfPage || {};
  if (!pages.some(s => !(s.localId in known))) return;
  editSettings(st => { for (const s of pages) if (!(s.localId in st.PdfPage)) st.PdfPage[s.localId] = s.lastPage; });
}

export function load(maxAge = 0) {
  if (!P.stale && Date.now() - P.at <= maxAge) return Promise.resolve(P);
  if (P.inflight) return P.inflight;
  P.inflight = http.get('pdfs_list').then(j => {
    P.site = parseList(j);
    P.fp = JSON.stringify(j);
    P.at = Date.now();
    P.stale = false;
    takePages(P.site);
    return P;
  }).finally(() => { P.inflight = null; });
  return P.inflight;
}

export const markStale = () => { P.stale = true; };
export const siteEntry = id => P.site.find(s => s.localId === id) || null;

// «файл» книги: в браузере она доступна прямо с сайта — путь непустой (так читалка не ждёт скачивания)
const fileOf = sid => 'api.php?action=pdf_file&id=' + sid;

function bookOf(s, pages) {
  return { Id: s.localId, Title: s.title, File: fileOf(s.siteId),
    LastPage: pages[s.localId] ?? s.lastPage, SiteId: s.siteId, Size: s.size };
}

function pendingBook(p, pages) {
  return { Id: p.id, Title: p.title, File: 'pending:' + p.id + '.pdf',
    LastPage: pages[p.id] ?? 0, SiteId: p.siteId || 0, Size: p.bytes.length };
}

// весь список: сайт + ещё уходящие; последняя страница — из памяти этой машины
export function books() {
  const pages = loadSettings().PdfPage || {};
  const out = P.site.map(s => bookOf(s, pages));
  for (const p of pending.values()) if (!p.deleted && !out.some(b => b.Id === p.id)) out.push(pendingBook(p, pages));
  return out;
}

export function book(id) {
  return books().find(b => b.Id === id) || null;
}

// номер на сайте, если он известен без запроса: SiteId либо код «webp<номер>»
export function knownSiteId(id) {
  const s = siteEntry(id);
  if (s && s.siteId > 0) return s.siteId;
  const p = pending.get(id);
  if (p && p.siteId > 0) return p.siteId;
  const m = /^webp(\d+)$/.exec(String(id));
  return m ? +m[1] : 0;
}

// номер на сайте; неизвестен — по свежему списку сайта. 0 — на сайте нет
export async function resolveSiteId(id) {
  const n = knownSiteId(id);
  if (n > 0) return n;
  await load(0);
  return knownSiteId(id);
}

// адрес книги для pdf.js: уходящая — из памяти страницы, иначе — с сайта
export function pdfUrl(id) {
  const p = pending.get(id);
  if (p && !p.deleted) {
    if (!p.url) p.url = URL.createObjectURL(new Blob([p.bytes], { type: 'application/pdf' }));
    return p.url;
  }
  return http.actionUrl('pdf_file&id=' + knownSiteId(id));
}

export function coverUrl(sid) {
  return http.actionUrl('pdf_cover&id=' + sid);
}

export function reset() {
  P.site = []; P.at = 0; P.stale = true; P.fp = '';
  for (const p of pending.values()) if (p.url) URL.revokeObjectURL(p.url);
  pending.clear();
  for (const c of ownCovers.values()) URL.revokeObjectURL(c.raw);
  ownCovers.clear();
}
