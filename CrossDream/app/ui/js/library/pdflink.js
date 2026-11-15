// Стык библиотеки и читалки PDF: открыть том с полки (или завершить им связь),
// связи и удаление тома из читалки возвращаются в библиотеку.
import { S } from './state.js';
import { siteIdOfPdf } from './data.js';
import { renderShelves } from './shelves.js';
import { startLink, tryFinishLink, showLinks } from './links.js';
import { linkWithDream } from './dreamlink.js';
import { dropCover, coverOf, coverFromDoc } from './covers.js';
import { openPdf, setPdfHooks } from '../pdf/reader.js';

export function openPdfFromShelf(p) {
  if (tryFinishLink('pdf', p)) return;
  openPdf(S.ctx, p);
}

export function wirePdf() {
  setPdfHooks({
    link: p => startLink('pdf', p),
    linkDream: p => linkWithDream('pdf', p),
    async links(p, box) {
      box.innerHTML = '';
      if (!S.online) return;
      try {
        const sid = await siteIdOfPdf(p);
        if (sid > 0) await showLinks('pdf', sid, box);
      } catch { /* без связей */ }
    },
    deleted(p) {
      if (S.pdfs) S.pdfs = S.pdfs.filter(x => x.Id !== p.Id);
      S.pdfFolder.delete(p.Id);
      dropCover(p.Id);
      renderShelves();
    },
    closed() { if (S.mode === 'pdf') renderShelves(); },   // скачанные и новые обложки — на полку
    opened(p, doc) { if (!coverOf(p.Id)) coverFromDoc(p.Id, doc); },
    fetched() { /* книга скачана: полка обновится при закрытии читалки */ },
  });
}
