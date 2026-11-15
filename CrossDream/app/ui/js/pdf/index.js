// Область «Читалка PDF». Тома открывает библиотека (полка 📕 или library:open {pdfId}),
// здесь — стили и Esc для читалки.
import { loadCss, wasTopOnEsc } from '../library/util.js';
import { pdfOverlay, closePdf } from './reader.js';

export async function init(ctx) {
  loadCss(new URL('../../css/pdf.css', import.meta.url));
  ctx.bus.on('ui:escape', () => { if (wasTopOnEsc(pdfOverlay())) closePdf(); });
}
