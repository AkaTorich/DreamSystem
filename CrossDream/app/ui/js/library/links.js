// Связи книг (данные — с сайта; права проверяет сервер по иерархии): режим связывания,
// список связей в читальне и в читалке PDF, переход к связанной книге.
import { S, errText } from './state.js';
import { siteIdOfBook, siteIdOfPdf, saveBooks, pushBooks } from './data.js';
import { askText } from './dialogs.js';
import { renderShelves } from './shelves.js';
import { openLibraryWindow, render } from './shell.js';
import { openBook, closeReader, linksBox, cur, showTranslation } from './reader.js';
import { openPdf, closePdf } from '../pdf/reader.js';

const toast = m => S.ctx.ui.toast(m);
const site = (a, b) => S.ctx.api.site(a, b);

export async function startLink(type, item) {
  if (!S.online) { toast('Сначала войдите в аккаунт (вкладка «Сайт»)'); return; }
  if (!item) return;
  const sid = type === 'pdf' ? await siteIdOfPdf(item) : await siteIdOfBook(+(item.num ?? 0));
  if (sid < 0) {
    toast((type === 'pdf' ? 'PDF ещё нет на сайте — он ' : 'Книги ещё нет на сайте — она ') + 'уедет на сайт сама при ближайшей синхронизации — через несколько секунд');
    return;
  }
  const title = type === 'pdf' ? item.Title : item.title;
  S.link = { type, siteId: sid, title };
  if (type === 'pdf') closePdf(); else closeReader();
  openLibraryWindow();
  render();
  toast('Связываю «' + title + '» — кликните вторую книгу на любой полке');
}

export function cancelLink() {
  if (!S.link) return false;
  S.link = null;
  render();
  return true;
}

// щелчок по книге в режиме связывания вместо открытия завершает связь
export function tryFinishLink(type, item) {
  if (!S.link) return false;
  finish(type, item);
  return true;
}

async function finish(type, item) {
  try {
    const sid = type === 'pdf' ? await siteIdOfPdf(item) : await siteIdOfBook(+(item.num ?? 0));
    const title = type === 'pdf' ? item.Title : item.title;
    if (sid < 0) { toast(type === 'pdf' ? 'Этот PDF ещё не дошёл до сайта — попробуйте через минуту' : 'Эта книга ещё не дошла до сайта — попробуйте через минуту'); return; }
    if (type === S.link.type && sid === S.link.siteId) { toast('Это та же книга'); return; }
    const reason = await askText('Связать книги',
      '«' + S.link.title + '»  ↔  «' + title + '» — почему связаны (можно оставить пустым):');
    if (reason === null) return;
    await site('book_link_add', { a_type: S.link.type, a_id: S.link.siteId, b_type: type, b_id: sid, reason });
    toast('Связано: «' + S.link.title + '» ↔ «' + title + '»');
    cancelLink();
  } catch (e) { toast(errText(e)); }
}

export async function showLinks(type, siteId, box) {
  const { el } = S.ctx.ui;
  box.innerHTML = '';
  if (!S.online) return;
  try {
    const j = await site('book_links_list&type=' + type + '&id=' + siteId);
    const links = j.links || [];
    if (!links.length) return;
    box.append(el('div', { class: 'sect' }, 'СВЯЗИ'));
    const myId = S.user ? +S.user.id : -1;
    for (const l of links) {
      const mine = +l.owner_id === myId;
      const del = el('span', { class: 'del', title: 'Развязать (нужен доступ к обоим концам)' }, '✕');
      del.addEventListener('click', async ev => {
        ev.stopPropagation();
        try { await site('book_link_del', { id: +l.id }); await showLinks(type, siteId, box); }
        catch (e) { toast(errText(e)); }
      });
      box.append(el('div', { class: 'link-row' + (mine ? '' : ' lib-foreign'), onclick: () => openLinked(l) },
        el('span', {}, (l.type === 'pdf' ? 'PDF · ' : l.type === 'dream' ? 'Сон · ' : '') + l.title),
        mine ? null : el('span', { class: 'lr' }, '· ' + l.owner),
        l.reason ? el('span', { class: 'lr' }, '— ' + l.reason) : null,
        del));
    }
  } catch { /* связей не показать — не беда */ }
}

// при открытии книги: живой обмен трактовкой с сайтом и список связей
export async function loadBookLinks(b) {
  if (!S.online) return;
  try {
    const num = +(b.num ?? -1);
    const sb = ((await site('books_list')).books || []).find(x => +x.num === num);
    if (!sb) return;
    S.bookSiteId.set(num, +sb.id);
    if (cur === b) {
      const siteTr = sb.translation || '', localTr = b.translation || '';
      if (siteTr && siteTr !== localTr) {
        b.translation = siteTr;
        try { await saveBooks(); } catch { /* останется до следующего раза */ }
        showTranslation(siteTr);
        renderShelves();
      } else if (!siteTr && localTr) {
        pushBooks().catch(() => {});   // местная трактовка ещё не на сайте — тихо доносим
      }
    }
    await showLinks('book', +sb.id, linksBox());
  } catch { /* без связей */ }
}

async function openLinked(l) {
  if (!S.user || +l.owner_id !== +S.user.id) { toast('Том сновидца «' + l.owner + '» — открыть можно на сайте'); return; }
  const bid = +l.bid;
  if (l.type === 'dream') { S.ctx.bus.emit('dream:open', l.ext_id || 'web' + bid); return; }   // карточка сна
  try {
    // из карточки сна библиотеку могли ещё не открывать — подгрузить полки
    const dataMod = await import('./data.js');
    if (!S.books) await dataMod.loadBooks().catch(() => {});
    if (!S.pdfs) await dataMod.loadPdfs().catch(() => {});
    if (l.type === 'book') {
      const sb = ((await site('books_list')).books || []).find(x => +x.id === bid);
      const b = sb && (S.books || []).find(x => +x.num === +sb.num);
      if (b) { closePdf(); openBook(b); return; }
    } else {
      const sp = ((await site('pdfs_list')).pdfs || []).find(x => +x.id === bid);
      const localId = sp ? (sp.ext_id || 'webp' + bid) : null;
      const p = localId && (S.pdfs || []).find(x => x.Id === localId);
      if (p) { closeReader(); openPdf(S.ctx, p); return; }
    }
    toast('Этой книги ещё нет на устройстве — она придёт с сайта сама при ближайшей синхронизации');
  } catch (e) { toast('Связь: ' + errText(e)); }
}
