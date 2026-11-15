// Карточка сна (правая панель): картина, толкование, локация, образы, нити,
// запись с правкой, гадания, книга-фундамент, показ на карте, достройка и удаление.
import { el } from '../shell/ui.js';
import * as store from './store.js';
import { toolBtn } from './panels.js';
import { richText, dreamLoc } from './util.js';
import { linkColor } from '../map/palette.js';
import { editText, editLocation, deleteDream, removeLink, redo } from './card-edit.js';
import { openPicture } from './picture.js';

const ORACLES = [   // имена — по договору (oracle:open)
  ['iching', 'И Цзин', 'Книга Перемен: бросить монеты и прочесть гексаграмму'],
  ['medici', 'Пасьянс Медичи', 'Расклад Медичи: сойдётся ли задуманное'],
  ['tonalpohualli', 'Тональпоуалли', 'Ацтекский счёт дней: что день делает с образом сна'],
  ['tzite', 'Цитэ', 'Гадание майя: цолькин и красные семена, разложенные по четыре'],
  ['obi', 'Оби', 'Оби (йоруба): проверка догадки — орех отвечает «да/нет»'],
];

let currentId = null;
export const currentDream = () => currentId;

const sect = t => el('div', { class: 'sect' }, t);
const small = (label, onclick, title) => el('button', { class: 'ghost cd-small', onclick, title }, label);

function chips(title, arr, cls = '') {
  const list = (arr || []).filter(Boolean);
  if (!list.length) return [];
  return [sect(title), el('div', { class: 'chips' },
    list.map(x => el('span', { class: 'chip ' + cls + (String(x).length > 40 ? ' long' : '') }, x)))];
}

// нити в обе стороны: записанные у этого сна и у других снов на этот
function related(d) {
  const out = [];
  for (const l of d.Links || []) {
    const o = store.byId(l.Id);
    if (o && o.Id !== d.Id) out.push({ other: o, link: l, holder: d });
  }
  for (const o of store.state.dreams) {
    if (o.Id === d.Id) continue;
    for (const l of o.Links || []) if (l.Id === d.Id) out.push({ other: o, link: l, holder: o });
  }
  return out;
}

function linkRow(ctx, d, r) {
  const c = linkColor(r.link.Type);
  const del = el('span', { class: 'del', title: 'Снять нить' }, '✕');
  del.addEventListener('click', e => {
    e.stopPropagation();
    removeLink(ctx, r.holder, r.holder === d ? r.other.Id : d.Id, r.link.Type, d.Id);
  });
  return el('div', { class: 'link-row', onclick: () => ctx.bus.emit('dream:open', r.other.Id) },
    el('span', { class: 'lt', style: `background:${c}22;color:${c}` }, r.link.Type),
    el('span', { class: 'cd-link-title' }, r.other.Title || 'Сон без имени'),
    r.link.Reason ? el('span', { class: 'lr' }, '— ' + r.link.Reason) : null,
    del);
}

export function renderCard(ctx, drawer, id) {
  const d = store.byId(id);
  if (!d) return false;
  const keep = currentId === id && drawer.isOpen() ? drawer.body.scrollTop : 0;   // перечитали — место то же
  currentId = id;
  const a = d.Analysis;
  drawer.title('Сон');
  drawer.tools(
    toolBtn('На карте', 'Показать на карте', () => ctx.bus.emit('map:focus', d.Id)),
    toolBtn('Достроить', 'Достроить недостающее: толкование, картину, нити', () => redo(ctx, d)),
    toolBtn('Удалить', 'Удалить сон', () => deleteDream(ctx, d, () => drawer.close()), 'ghost danger'));

  const body = [];
  const img = el('div', { class: 'cd-det-img', title: 'Сменить картину', onclick: () => openPicture(ctx, d) });
  if (d.ImageFile) {
    store.imageSrc(d).then(src => {
      if (src && currentId === d.Id) img.replaceChildren(el('img', { class: 'det-img', src, alt: '' }));
    });
  } else img.append(el('div', { class: 'cd-noimg' }, 'Выбрать картину'));
  body.push(img);
  body.push(el('div', { class: 'det-title' }, d.Title || 'Сон без имени'),
    el('div', { class: 'det-date' }, d.Date || ''));
  if (a && a.Summary) body.push(el('div', { class: 'det-summary' }, a.Summary));

  body.push(sect('Локация'));
  const loc = dreamLoc(d);
  body.push(el('div', { class: 'chips' }, el('span', { class: 'chip loc' }, loc || 'не названа')));
  body.push(small('Сменить локацию', () => editLocation(ctx, d)));
  const book = store.foundationOf(d);
  if (book) body.push(small('Книга-фундамент: «' + (book.title || book.Title || 'книга') + '»',
    () => ctx.bus.emit('library:open', { tab: 'books', bookNum: book.num }), 'Открыть книгу в библиотеке'));

  if (a) body.push(...chips('Персонажи', a.Characters), ...chips('Эмоции', a.Emotions),
    ...chips('Символы', a.Symbols), ...chips('Мотивы', a.Motifs));

  const rel = related(d);
  if (rel.length) body.push(sect('Нити к другим снам'), ...rel.map(r => linkRow(ctx, d, r)));

  // книги и PDF, связанные с этим сном (связи на сайте); щелчок — открыть книгу
  const books = el('div', { class: 'cd-booklinks' });
  body.push(books, small('Связать с книгой', () =>
    import('../library/dreamlink.js').then(m => m.startLinkFromDream(d)), 'Щёлкните потом книгу на любой полке библиотеки'));
  if (store.online()) import('../library/dreamlink.js').then(async m => {
    const sid = await m.siteIdOfDream(d).catch(() => -1);
    if (sid > 0 && currentId === d.Id) (await import('../library/links.js')).showLinks('dream', sid, books);
  });

  body.push(sect('Запись'), el('div', { class: 'det-text', html: richText(d.Text) }),
    small('Править запись', () => editText(ctx, d)));

  body.push(sect('Спросить у знаков'), el('div', { class: 'cd-oracles' },
    ORACLES.map(([name, label, tip]) =>
      el('button', { title: tip, onclick: () => ctx.bus.emit('oracle:open', { name, dream: d }) }, label))));

  drawer.body.replaceChildren(...body);
  drawer.body.scrollTop = keep;
  drawer.open();
  return true;
}

export function forgetCard() { currentId = null; }
