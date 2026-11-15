// Обложки PDF на полке — маленькие JPEG-файлы в профиле (ядро: cover_get / cover_put).
// Готовые приходят с сайта при синхронизации; недостающие рисуются pdf.js только для книг,
// которые уже лежат на этом устройстве, и только когда карточка видна на экране.
// Сразу после открытия книги в читалке обложка снимается с уже разобранного документа — даром.
import { S } from './state.js';
import { shelvesEl } from './shell.js';
import { getPdfjs } from '../pdf/loader.js';
import { pdfReaderIsOpen } from '../pdf/reader.js';

const urls = new Map();     // id → адрес картинки (или '' — обложки нет)
const failed = new Set();   // битые тома — не мучить снова до перезапуска
let observer = null;
const queue = [];
let busy = false;

// старые обложки жили в localStorage и переполняли его — убрать один раз
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('pdfcover:')) localStorage.removeItem(k);
  }
} catch { /* нет хранилища — и не надо */ }

export function coverOf(id) { return urls.get(id) || null; }
export function dropCover(id) { urls.delete(id); }

async function known(id) {
  if (urls.has(id)) return urls.get(id);
  let path = null;
  try { path = await S.ctx.api.invoke('cover_get', { id }); } catch { /* нет команды или файла */ }
  const url = path ? S.ctx.api.fileSrc(path) : '';
  urls.set(id, url);
  return url;
}

// первая страница уже разобранного документа → JPEG ~240 точек → файл профиля (+ на сайт)
export async function coverFromDoc(id, doc) {
  if (urls.get(id)) return;
  try {
    const page = await doc.getPage(1);
    const scale = 240 / page.getViewport({ scale: 1 }).width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    const b64 = c.toDataURL('image/jpeg', 0.75).split(',')[1];
    const path = await S.ctx.api.invoke('cover_put', { id, jpegB64: b64 });
    urls.set(id, S.ctx.api.fileSrc(path) + '?v=' + Date.now());
  } catch { failed.add(id); }
}

async function renderCover(p) {
  const pdfjs = await getPdfjs();
  const buf = await S.ctx.api.invoke('pdf_read', { id: p.Id });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  try { await coverFromDoc(p.Id, doc); } finally { doc.destroy(); }
}

function apply(card, url) {
  if (!card || !url || card.classList.contains('cover')) return;
  const img = new Image();
  img.className = 'coverimg'; img.alt = ''; img.decoding = 'async';
  img.onload = () => card.classList.add('cover');
  img.src = url;
  card.prepend(img);
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const card = queue.shift();
      if (!card.isConnected || card.classList.contains('cover')) continue;
      const id = card.dataset.key.slice(4);
      let url = await known(id);
      const p = (S.pdfs || []).find(x => x.Id === id);
      // рисуем сами только то, что уже на устройстве, и не пока читают
      if (!url && p && p.File && !failed.has(id) && !pdfReaderIsOpen()) {
        try { await renderCover(p); } catch { failed.add(id); }
        url = urls.get(id) || '';
      }
      apply(card, url);
    }
  } finally { busy = false; }
}

// карточки PDF на полке встают в очередь, когда показываются на экране
export function fillCovers() {
  const box = shelvesEl();
  if (!box) return;
  if (!observer)
    observer = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { observer.unobserve(e.target); queue.push(e.target); }
      pump();
    }, { rootMargin: '200px' });
  box.querySelectorAll('.bookcard.lib-pdf:not(.cover)').forEach(c => {
    const url = urls.get(c.dataset.key.slice(4));
    if (url) apply(c, url); else observer.observe(c);
  });
}
