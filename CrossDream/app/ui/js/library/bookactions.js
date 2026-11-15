// Действия над книгой из читальни: трактовка ИИ (через сайт — ритуал оракула живёт на сервере),
// фундамент, дар, удаление, переход к правке.
import { S, errText } from './state.js';
import { saveBooks, pushBooks, siteIdOfBook } from './data.js';
import { stripLocalSeals } from './seals.js';
import { renderShelves } from './shelves.js';
import { askText, confirmBox, giveDialog } from './dialogs.js';
import { closeReader, keyClause, showTranslation, setReaderStatus, setBusy } from './reader.js';
import { openBookForm } from './bookform.js';

const toast = m => S.ctx.ui.toast(m);
const site = (a, b) => S.ctx.api.site(a, b);
const NEED_LOGIN = 'Сначала войдите в аккаунт (вкладка «Сайт»)';
const NOT_ON_SITE = 'Книги ещё нет на сайте — она уедет на сайт сама при ближайшей синхронизации — через несколько секунд';

export async function interpret(b) {
  if (!b) return;
  if (!S.online) { toast('Трактовка идёт через сайт — войдите в аккаунт (вкладка «Сайт»)'); return; }
  setBusy(true);
  setReaderStatus('Ищу книгу на сайте…');
  try {
    const num = +(b.num ?? 0);
    let sid = await siteIdOfBook(num);
    if (sid < 0) {
      // книги ещё нет на сайте — тихо отправляем библиотеку и пробуем снова
      await pushBooks();
      if (stripLocalSeals(S.books)) await saveBooks();
      sid = await siteIdOfBook(num);
    }
    if (sid < 0) throw new Error('книга не нашлась на сайте');
    setReaderStatus('Оракул на сервере вглядывается в знаки…');
    const j = await site('book_interpret', { id: sid, key_clause: keyClause() });
    b.translation = j.translation;
    await saveBooks();
    showTranslation(j.translation);
    setReaderStatus(S.booksPath ? 'Трактовка оракула сохранена в мод и на сайт' : 'Трактовка оракула сохранена');
    renderShelves();
  } catch (e) {
    setReaderStatus('');
    toast('Трактовка: ' + errText(e));
  }
  setBusy(false);
}

export async function setFoundation(b) {
  if (!S.online) { toast(NEED_LOGIN); return; }
  if (!b) return;
  let mine = '';
  try {
    const names = ((await site('locations')).locations || []).map(l => l.loc);
    if (names.length) mine = ' (ваши: ' + names.join(', ') + ')';
  } catch { /* без подсказки */ }
  const pick = await askText('Фундамент', 'Локация-планета для фундамента' + mine + ':', b.location || '');
  if (!pick || !pick.trim()) return;   // фундамент не снимается — лишь меняется
  try {
    const sid = await siteIdOfBook(+(b.num ?? 0));
    if (sid < 0) { toast(NOT_ON_SITE); return; }
    await site('book_edit', { id: sid, title: b.title, location: pick.trim() });
    b.location = pick.trim();
    try { await saveBooks(); } catch { /* на сайте уже есть */ }
    setReaderStatus('фундамент: ' + b.location);
    toast('Книга легла фундаментом: ' + b.location);
  } catch (e) { toast('Фундамент: ' + errText(e)); }
}

export async function giveBook(b) {
  if (!S.online) { toast(NEED_LOGIN); return; }
  if (!b) return;
  try {
    const sid = await siteIdOfBook(+(b.num ?? 0));
    if (sid < 0) { toast(NOT_ON_SITE); return; }
    const users = (await site('gift_recipients')).users || [];
    if (!users.length) { toast('Дарить пока некому: предложите связь доверия (вкладка «Сайт» → «Доверие»)'); return; }
    const g = await giveDialog(b.title, users);
    if (!g) return;
    const r = await site('book_give', { id: sid, to: g.to, message: g.message });
    toast(r.auto ? 'Дар принят сразу (автоприём): ' + r.to : 'Дар предложен — ждёт согласия: ' + r.to);
  } catch (e) { toast('Дар: ' + errText(e)); }
}

export async function delBook(b) {
  if (!b) return;
  if (!await confirmBox('Библиотека', 'Удалить книгу «' + b.title + '»?')) return;
  const num = +(b.num ?? 0);
  // сначала с сайта (там же умирают её связи), потом с местной полки
  if (S.online) {
    try {
      const sid = await siteIdOfBook(num);
      if (sid >= 0) await site('book_del', { id: sid });
    } catch (e) { toast('С сайта не убралась: ' + errText(e)); }
  } else toast('Без входа книга удалена только локально — на сайте уберите после входа');
  S.books = S.books.filter(x => x !== b);
  S.bookFolder.delete(num); S.bookSiteId.delete(num);
  try { await saveBooks(); } catch (e) { toast('books.json: ' + errText(e)); }
  closeReader();
  renderShelves();
  toast('Книга удалена');
}

export function editBook(b) {
  if (!b) return;
  closeReader();
  openBookForm(b);
}
