// Читалка PDF: страницы — картинки (текст не выделяется и не копируется), масштаб из
// настроек (Settings.PdfZoom), возврат на страницу, где остановились (pdf_page_set).
// На узком экране страница — по ширине экрана. Связи и удаление — через крючки библиотеки.
import { getPdfjs } from './loader.js';
import { createPages } from './pages.js';
import { showOverlay, hideOverlay, isOpen } from '../library/util.js';

const BASE_W = 840, MAX_PAGES = 500, NARROW = 700;
let ctx = null, ov = null, hooks = {};
const R = {};
let cur = null, doc = null, view = null, gen = 0;
let zoom = 1, phoneZoom = 1, shownPage = 0, pageT = null, zoomT = null;

export function setPdfHooks(h) { hooks = h || {}; }
export function pdfOverlay() { return ov; }
export function pdfReaderIsOpen() { return isOpen(ov); }

function build() {
  const { el } = ctx.ui;
  const g = (t, title, f, cls = 'ghost') => el('button', { class: cls, title, onclick: f }, t);
  R.title = el('h2', { class: 'pdf-title' });
  R.status = el('span', { class: 'note pdf-status' });
  R.zoom = el('span', { class: 'note pdf-zoom' }, '100%');
  R.links = el('div', { class: 'pdf-links' });
  R.box = el('div', { class: 'pdf-pages' });
  const win = el('div', { class: 'modal pdf-win' },
    el('div', { class: 'pdf-head' }, R.title,
      el('div', { class: 'pdf-btns' }, R.status,
        g('−', 'Отдалить (Ctrl+колёсико)', () => zoomStep(-1)), R.zoom,
        g('+', 'Приблизить (Ctrl+колёсико)', () => zoomStep(1)),
        g('Связать с книгой', 'Связать с другой книгой (нужен вход на сайт)', () => { const p = cur; if (p && hooks.link) hooks.link(p); }),
        g('Связать со сном', 'Связать с одним из ваших снов (нужен вход на сайт)', () => { const p = cur; if (p && hooks.linkDream) hooks.linkDream(p); }),
        g('Удалить', 'Удалить PDF', delCurrent, 'ghost danger'),
        g('Закрыть', 'Закрыть', closePdf))),
    R.links, R.box);
  ov = el('div', { class: 'overlay pdf-ov' }, win);
  win.addEventListener('contextmenu', e => e.preventDefault());
  R.box.addEventListener('scroll', onScroll, { passive: true });
  R.box.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  window.addEventListener('resize', () => { if (view && pdfReaderIsOpen()) { view.resize(); showZoom(); } });
  // защита от копирования: Ctrl+C / S / P в открытой читалке не работают
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && ['c', 's', 'p'].includes(e.key.toLowerCase()) && pdfReaderIsOpen()) e.preventDefault();
  });
  document.getElementById('overlays').append(ov);
}

const narrow = () => R.box.clientWidth < NARROW;
function pageWidth() {
  if (narrow()) return Math.max(200, Math.round((R.box.clientWidth - 4) * phoneZoom));
  return Math.round(BASE_W * zoom);
}
function showZoom() { R.zoom.textContent = Math.round((narrow() ? phoneZoom : zoom) * 100) + '%'; }

export async function openPdf(c, p) {
  ctx = c;
  if (!ov) build();
  const my = ++gen;
  dropDoc();
  cur = p;
  shownPage = 0;
  R.title.textContent = p.Title;
  R.status.textContent = 'открываю…';
  R.box.innerHTML = '';
  R.links.innerHTML = '';
  ov.classList.remove('parked');   // книга ждала на своей вкладке — снова на виду
  showOverlay(ov);
  if (hooks.links) hooks.links(p, R.links);
  let start = 1;
  try {
    const st = await ctx.api.invoke('settings_get');
    zoom = st && st.PdfZoom > 0 ? st.PdfZoom : 1;
    const saved = st && st.PdfPage ? +st.PdfPage[p.Id] : 0;
    start = saved > 0 ? saved : (p.LastPage > 0 ? p.LastPage : 1);   // серверное — запасное
  } catch { zoom = 1; }
  showZoom();
  // книги ещё нет на устройстве — ядро качает её с сайта и шлёт ход
  let stop = null;
  if (!p.File) {
    R.status.textContent = 'скачиваю с сайта…';
    stop = await ctx.api.listen('pdf://progress', e => {
      if (e.id !== p.Id || my !== gen) return;
      const t = e.total || p.Size || 0;
      R.status.textContent = t ? 'скачиваю ' + mb(e.done) + ' из ' + mb(t) + ' — ' + Math.round(e.done * 100 / t) + ' %'
        : 'скачиваю ' + mb(e.done);
    }).catch(() => null);
  }
  try {
    const pdfjs = await getPdfjs();
    const d = await openDoc(pdfjs, p);
    if (stop) stop();
    if (my !== gen) { d.destroy(); return; }
    if (!p.File) { p.File = p.Id + '.enc'; if (hooks.fetched) hooks.fetched(p); }   // теперь книга на устройстве
    if (my !== gen) { d.destroy(); return; }
    doc = d;
    if (hooks.opened) hooks.opened(p, d);   // обложка, если её ещё нет, — с уже разобранного документа
    const count = Math.min(d.numPages, MAX_PAGES);
    const first = (await d.getPage(1)).getViewport({ scale: 1 });
    R.status.textContent = 'страниц: ' + d.numPages;
    view = createPages(d, R.box, { count, aspect: first.height / first.width, width: pageWidth });
    if (d.numPages > count) R.box.append(ctx.ui.el('p', { class: 'note' }, '…показаны первые 500 страниц'));
    if (start > 1) view.scrollTo(Math.min(start, count));
    shownPage = view.current();
  } catch (e) {
    if (stop) stop();
    if (my !== gen) return;
    R.status.textContent = '';
    ctx.ui.toast('PDF: ' + (e.message || e));
  }
}

const mb = n => (n / 1048576).toFixed(1).replace('.', ',') + ' МБ';

// книга из ядра: расшифрованная лежит в памяти ядра, pdf.js берёт её по своему адресу кусками
// (сперва только нужное первым страницам); не вышло — по-старому, всей книгой через вызов
export async function openDoc(pdfjs, p) {
  await ctx.api.invoke('pdf_open', { id: p.Id });
  try {
    const url = window.__TAURI__.core.convertFileSrc(p.Id, 'cdpdf');
    return await pdfjs.getDocument({ url, rangeChunkSize: 1 << 20, disableAutoFetch: true, disableStream: true }).promise;
  } catch (e) {
    console.warn('cdpdf:', e);
    const buf = await ctx.api.invoke('pdf_read', { id: p.Id });
    return pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  }
}

function dropDoc() {
  if (view) { view.destroy(); view = null; }
  if (doc) { doc.destroy(); doc = null; }
}

function onScroll() {
  if (!view || !cur) return;
  const page = view.current();
  if (page === shownPage) return;
  shownPage = page;
  clearTimeout(pageT);
  pageT = setTimeout(savePage, 900);   // запоминаем не чаще раза в секунду
}

function savePage() {
  if (!cur || shownPage < 1) return;
  cur.LastPage = shownPage;
  ctx.api.invoke('pdf_page_set', { id: cur.Id, page: shownPage }).catch(() => {});
}

function zoomStep(dir) {
  const f = dir > 0 ? 1.15 : 1 / 1.15;
  if (narrow()) phoneZoom = Math.max(0.5, Math.min(3, phoneZoom * f));
  else {
    zoom = Math.max(0.5, Math.min(3, zoom * f));
    clearTimeout(zoomT);
    zoomT = setTimeout(saveZoom, 600);
  }
  showZoom();
  if (view) view.resize();
}

async function saveZoom() {
  try {
    const st = await ctx.api.invoke('settings_get');
    st.PdfZoom = +zoom.toFixed(3);
    await ctx.api.invoke('settings_set', { settings: st });
  } catch { /* масштаб останется до перезапуска */ }
}

export function closePdf() {
  if (!ov || !isOpen(ov)) return;
  clearTimeout(pageT);
  savePage();   // запомнить страницу, на которой закрыли
  gen++;
  dropDoc();
  ov.classList.remove('parked');
  hideOverlay(ov);
  R.box.innerHTML = '';
  R.links.innerHTML = '';
  cur = null;
  if (hooks.closed) hooks.closed();   // читалка освободила движок — дорисуются отложенные обложки
}

async function delCurrent() {
  const p = cur;
  if (!p) return;
  const yes = await ctx.api.dialog().ask('Удалить PDF «' + p.Title + '»?', { title: 'Библиотека', kind: 'warning' });
  if (!yes) return;
  try {
    await ctx.api.invoke('pdf_delete', { id: p.Id });
  } catch (e) { ctx.ui.toast('PDF не удалился: ' + (e.message || e)); return; }
  closePdf();
  if (hooks.deleted) hooks.deleted(p);
}

// связи открытой книги перечитать (после новой связи)
export function refreshLinks() { if (cur && hooks.links && R.links) hooks.links(cur, R.links); }
