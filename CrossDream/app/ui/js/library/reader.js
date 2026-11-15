// Читальня книги иероглифов: текст (иероглифы крупнее, шрифтом иероглифов), связи,
// трактовка жреца-ИИ, ключ трактовки и кнопки 🪐 🔗 ✏ 🎁 🗑.
import { S } from './state.js';
import { showOverlay, hideOverlay, isOpen } from './util.js';
import { puaToUni, stripTags, stripSeals, hieroRuns } from './seals.js';
import { keysFromBooks } from './keys.js';
import { interpret, setFoundation, giveBook, delBook, editBook } from './bookactions.js';
import { startLink, tryFinishLink, loadBookLinks } from './links.js';
import { linkWithDream } from './dreamlink.js';

let ov = null;
const R = {};
export let cur = null;   // открытая книга

function build() {
  const { el } = S.ctx.ui;
  const g = (t, title, f, cls = 'ghost') => el('button', { class: cls, title, onclick: f }, t);
  R.title = el('h2', { class: 'lib-rtitle' });
  R.links = el('div', { class: 'lib-links' });
  R.text = el('div', { class: 'hiero-text lib-rtext' });
  R.transHead = el('div', { class: 'sect', hidden: true }, 'ТРАКТОВКА ЖРЕЦА-ИИ');
  R.trans = el('div', { class: 'det-summary lib-trans', hidden: true });
  R.status = el('span', { class: 'note lib-rstatus' });
  R.keys = el('select', { class: 'lib-keys', title: 'Ключ трактовки — из книги «Ключи к трактовке»' });
  R.btn = el('button', { class: 'primary', onclick: () => interpret(cur) }, 'Трактовать через ИИ');
  const box = el('div', { class: 'modal lib-reader' },
    el('div', { class: 'lib-rhead' }, R.title,
      el('div', { class: 'lib-rbtns' },
        g('Фундамент', 'Фундамент: книга подпирает планету-локацию', () => setFoundation(cur)),
        g('Связать с книгой', 'Связать с другой книгой (нужен вход на сайт)', () => startLink('book', cur)),
        g('Связать со сном', 'Связать с одним из ваших снов (нужен вход на сайт)', () => linkWithDream('book', cur)),
        g('Изменить', 'Изменить книгу', () => editBook(cur)),
        g('В дар', 'Предложить книгу в дар', () => giveBook(cur)),
        g('Удалить', 'Удалить книгу', () => delBook(cur), 'ghost danger'),
        g('Закрыть', 'Закрыть', closeReader))),
    el('div', { class: 'lib-rbody' }, R.links, R.text, R.transHead, R.trans),
    el('div', { class: 'lib-rfoot' }, R.status,
      el('span', { class: 'lib-keylabel' }, 'КЛЮЧ:'), R.keys, R.btn));
  ov = el('div', { class: 'overlay lib-read-ov' }, box);
  ov.addEventListener('mousedown', e => { if (e.target === ov) closeReader(); });
  document.getElementById('overlays').append(ov);
}

export function readerOverlay() { return ov; }

function fillKeys() {
  const keep = R.keys.value;
  R.keys.innerHTML = '';
  keysFromBooks(S.books).forEach((k, i) => {
    const o = new Option(k.label, k.clause ?? '');
    if (k.header) o.disabled = true;
    if (i === 0) o.selected = true;
    R.keys.append(o);
  });
  if ([...R.keys.options].some(o => !o.disabled && o.value === keep)) R.keys.value = keep;
}

export function keyClause() { return R.keys ? R.keys.value : ''; }

export function showTranslation(text) {
  const has = !!text;
  R.trans.textContent = text || '';
  R.trans.hidden = R.transHead.hidden = !has;
  R.btn.textContent = has ? 'Истолковать заново' : 'Трактовать через ИИ';
}

export function setReaderStatus(t) { if (R.status) R.status.textContent = t; }
export function setBusy(b) { if (R.btn) R.btn.disabled = b; }
export function linksBox() { return R.links; }

export function openBook(b) {
  if (tryFinishLink('book', b)) return;
  if (!ov) build();
  cur = b;
  R.title.textContent = b.title || '';
  // как в моде: иероглифы шрифтом size, текст — size-12; здесь тот же коэффициент
  const sz = b.size != null ? +b.size : 34;
  const ratio = Math.max(1.3, Math.min(2.2, sz / Math.max(10, sz - 12)));
  R.text.innerHTML = '';
  for (const run of hieroRuns(stripSeals(puaToUni(stripTags(b.text))))) {
    if (!run.hiero) { R.text.append(run.text); continue; }
    const s = document.createElement('span');
    s.className = 'lib-hi';
    s.style.fontSize = (16 * ratio) + 'px';
    s.textContent = run.text;
    R.text.append(s);
  }
  showTranslation(b.translation);
  setReaderStatus(b.location ? 'фундамент: ' + b.location : '');
  setBusy(false);
  fillKeys();
  R.links.innerHTML = '';
  showOverlay(ov);
  ov.querySelector('.lib-rbody').scrollTop = 0;
  loadBookLinks(b);
}

export function closeReader() {
  if (ov) hideOverlay(ov);
  cur = null;
}

export function readerIsOpen() { return isOpen(ov); }

// книги перечитаны (синхронизация) — открытая книга теперь другой объект с тем же номером
export function rebindCurrent(books) {
  if (!cur) return;
  const b = (books || []).find(x => +x.num === +cur.num);
  if (b) cur = b;
}
