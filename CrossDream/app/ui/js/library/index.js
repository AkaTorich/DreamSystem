// Область «Библиотека»: кнопка шапки btnLibrary и шина library:open {tab?, bookNum?, pdfId?}.
// Вкладки: 𓏛 иероглифы (books.json мода или книги с сайта), 📕 PDF, ⚙ сюита «Гермес».
import { S, errText } from './state.js';
import { loadCss, wasTopOnEsc } from './util.js';
import { checkOnline, loadBooks, loadPdfs, loadIndexCached, refreshIndex } from './data.js';
import { openLibraryWindow, closeLibrary, render, libOverlay, libIsOpen } from './shell.js';
import { setMode } from './tabs.js';
import { openBook, closeReader, readerOverlay, rebindCurrent } from './reader.js';
import { bookFormOverlay, closeBookForm } from './bookform.js';
import { cancelLink } from './links.js';
import { wirePdf } from './pdflink.js';
import { loadSuiteIcons } from './suite.js';
import { openPdf } from '../pdf/reader.js';

const TABS = { hiero: 'book', book: 'book', pdf: 'pdf', suite: 'file', file: 'file' };

export async function init(ctx) {
  S.ctx = ctx;
  loadCss(new URL('../../css/library.css', import.meta.url));
  wirePdf();
  ctx.ui.onTop('btnLibrary', () => openLibrary({}));
  ctx.bus.on('library:open', p => openLibrary(p || {}));
  ctx.bus.on('user:changed', u => {
    S.user = u || null;
    S.online = !!u;
    S.files = null;
    if (libIsOpen()) { render(); if (S.online) refreshIndex().then(ch => ch && render()); }
  });
  ctx.bus.on('ui:escape', onEscape);
  try {
    ctx.api.listen('library://changed', async () => {
      const own = Date.now() - S.selfSaveAt < 3000;   // эхо своего же books_save
      if (!libIsOpen()) { if (!own) S.books = null; S.pdfs = null; return; }
      try {
        if (!own) { await loadBooks(); rebindCurrent(S.books); }
        await loadPdfs();
      } catch { /* останется прежнее */ }
      await refreshIndex();
      render();
    });
  } catch (e) { console.error('library://changed', e); }
}

async function openLibrary(p) {
  const { ui } = S.ctx;
  openLibraryWindow();
  await checkOnline();
  if (!S.books) { try { await loadBooks(); } catch (e) { S.books = []; ui.toast('Не удалось прочитать книги: ' + errText(e)); } }
  await loadIndexCached();   // полка сразу рисуется по известной раскладке
  const mode = TABS[p.tab] || (p.pdfId != null ? 'pdf' : S.mode);
  await setMode(mode);
  // тихая сверка раскладки с сайтом: перерисовка, только если что-то поменялось
  refreshIndex().then(changed => {
    if (changed && libIsOpen()) render();
    loadSuiteIcons();   // значки сюиты подтягиваются заранее и оседают в кеше
  });

  if (p.bookNum != null) {
    const b = (S.books || []).find(x => +x.num === +p.bookNum);
    if (b) openBook(b);
  }
  if (p.pdfId != null) {
    if (!S.pdfs) { try { await loadPdfs(); } catch { S.pdfs = []; } }
    const pb = S.pdfs.find(x => x.Id === p.pdfId);
    if (pb) openPdf(S.ctx, pb);
  }
}

// Esc закрывает только то окно библиотеки, что было верхним
function onEscape() {
  if (wasTopOnEsc(readerOverlay())) { closeReader(); return; }
  if (wasTopOnEsc(bookFormOverlay())) { closeBookForm(); return; }
  if (wasTopOnEsc(libOverlay())) {
    if (cancelLink()) return;
    if (S.picking) { S.picking = false; S.picked.clear(); render(); return; }
    closeLibrary();
  }
}
