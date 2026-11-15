// Связь книги (иероглифы или PDF) со сном — и в обратную сторону, из карточки сна.
// Связи живут на сайте (book_links, род 'dream'); номер сна на сайте — «web<id>» или по ext_id.
import { S, errText } from './state.js';
import { siteIdOfBook, siteIdOfPdf } from './data.js';
import { render } from './shell.js';
import { closeReader } from './reader.js';
import { closePdf, refreshLinks } from '../pdf/reader.js';
import { loadBookLinks } from './links.js';
import { askText } from './dialogs.js';

const toast = m => S.ctx.ui.toast(m);
const site = (a, b) => S.ctx.api.site(a, b);

// номер сна на сайте; -1 — сон туда ещё не дошёл
export async function siteIdOfDream(d) {
  if (/^web\d+$/.test(d.Id)) return +d.Id.slice(3);
  const list = (await site('dreams')).dreams || [];
  const sd = list.find(x => x.ext_id === d.Id);
  return sd ? +sd.id : -1;
}

async function myDreams() {
  const r = await S.ctx.api.invoke('dreams_list');
  return (r && (r.dreams || r)) || [];
}

// окно выбора сна: строка поиска и список; ответ — сон или null
function pickDream(dreams) {
  const { el } = S.ctx.ui;
  return new Promise(res => {
    const ov = el('div', { class: 'overlay lib-dialog open' });
    const box = el('div', { class: 'modal lib-pickdream' });
    const q = el('input', { type: 'text', placeholder: 'Найти сон: слово, место, дата…' });
    const list = el('div', { class: 'lib-dreamlist' });
    const done = v => { ov.remove(); res(v); };
    const draw = () => {
      const t = q.value.trim().toLowerCase();
      list.replaceChildren(...dreams
        .filter(d => !t || [d.Title, d.Date, d.Analysis && d.Analysis.Location].join(' ').toLowerCase().includes(t))
        .sort((a, b) => String(b.Date).localeCompare(String(a.Date)))
        .map(d => el('button', { class: 'ghost', onclick: () => done(d) },
          el('b', {}, d.Title || 'Сон без имени'), el('span', { class: 'lr' }, ' · ' + (d.Date || '')))));
    };
    q.addEventListener('input', draw);
    q.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
    ov.addEventListener('mousedown', e => { if (e.target === ov) done(null); });
    box.append(el('h2', {}, 'Связать со сном'), q, list,
      el('div', { class: 'mrow' }, el('button', { class: 'ghost', onclick: () => done(null) }, 'Отмена')));
    ov.append(box);
    document.getElementById('overlays').append(ov);
    draw();
    setTimeout(() => q.focus(), 30);
  });
}

// из читальни книги или читалки PDF: выбрать сон и связать
export async function linkWithDream(type, item) {
  if (!S.online) { toast('Сначала войдите в аккаунт (вкладка «Сайт»)'); return; }
  try {
    const sid = type === 'pdf' ? await siteIdOfPdf(item) : await siteIdOfBook(+(item.num ?? 0));
    if (sid < 0) { toast('Книга ещё не дошла до сайта — попробуйте через минуту'); return; }
    const d = await pickDream(await myDreams());
    if (!d) return;
    const did = await siteIdOfDream(d);
    if (did < 0) { toast('Сон ещё не дошёл до сайта — попробуйте через минуту'); return; }
    const title = type === 'pdf' ? item.Title : item.title;
    const reason = await askText('Связать со сном', '«' + title + '»  ↔  сон «' + (d.Title || '') + '» — почему связаны (можно оставить пустым):');
    if (reason === null) return;
    await site('book_link_add', { a_type: type, a_id: sid, b_type: 'dream', b_id: did, reason });
    toast('Связано со сном «' + (d.Title || '') + '»');
    if (type === 'pdf') refreshLinks(); else loadBookLinks(item);   // новая связь — сразу в списке
  } catch (e) { toast(errText(e)); }
}

// из карточки сна: режим связывания — щелчок по книге на любой полке завершит связь
export async function startLinkFromDream(d) {
  if (!S.online) { toast('Сначала войдите в аккаунт (вкладка «Сайт»)'); return; }
  try {
    const did = await siteIdOfDream(d);
    if (did < 0) { toast('Сон ещё не дошёл до сайта — попробуйте через минуту'); return; }
    S.link = { type: 'dream', siteId: did, title: d.Title || 'сон' };
    closeReader(); closePdf();
    S.ctx.bus.emit('library:open', {});   // полки с загрузкой книг, как по вкладке
    render();
    toast('Связываю сон «' + (d.Title || '') + '» — щёлкните книгу на любой полке');
  } catch (e) { toast(errText(e)); }
}
