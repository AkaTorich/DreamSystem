// Окно «Цитэ»: день сна и вопрос → горсть семян по четыре, день-ответ и толкование.
import { makeWindow, loadCss, h } from '../common/frame.js';
import { parseDay, formatDay, jdn, tzolkin } from './tzolkin.js';
import { cast } from './cast.js';
import {
  dayTexts, answerTexts, handLine, readingText,
  BAD_DAY, BAD_DAY_SHORT, NOT_THROWN, START_TEXT,
} from './reading.js';

loadCss(new URL('./tzite.css', import.meta.url));

export function open(ctx, opts = {}) {
  const w = makeWindow({
    key: 'tzite',
    title: "TZ'ITE // AJQ'IJ",
    subtitle: 'семена считают четвёрками — день отвечает',
    theme: 'tzite',
    width: 920, height: 660,
  });
  if (!w) return;

  // день сна и вопрос
  const dateBox = h('input', { type: 'date', class: 'tz-date', title: 'ГГГГ-ММ-ДД' });
  const askBox = h('input', { type: 'text', class: 'tz-ask',
    title: 'о чём спрашиваешь семена: сбудется ли, к добру ли, идти ли' });
  const castBtn = h('button', { class: 'tz-btn', type: 'button' }, 'БРОСИТЬ СЕМЕНА');
  const inputRow = h('div', { class: 'o-panel tz-panel tz-input' },
    h('label', { class: 'tz-field tz-field-date' },
      h('span', { class: 'tz-label' }, 'ДЕНЬ СНА'), dateBox),
    h('label', { class: 'tz-field tz-field-ask' },
      h('span', { class: 'tz-label tz-label-ask' }, 'ВОПРОС'), askBox),
    castBtn);

  // день цолькина: день сна и день-ответ
  const dayName = h('div', { class: 'tz-name tz-name-day' }, '—');
  const dayRu = h('div', { class: 'tz-ru' });
  const ansName = h('div', { class: 'tz-name tz-name-ans' }, '—');
  const ansRu = h('div', { class: 'tz-ru' });
  const days = h('div', { class: 'o-panel tz-panel tz-days' },
    h('div', { class: 'tz-daycol' },
      h('div', { class: 'tz-cap' }, 'ДЕНЬ, В КОТОРЫЙ ПРИСНИЛОСЬ'), dayName, dayRu),
    h('div', { class: 'tz-daycol' },
      h('div', { class: 'tz-cap' }, 'ДЕНЬ-ОТВЕТ, НА КОТОРОМ ЗАМЕР СЧЁТ'), ansName, ansRu));

  // горсть семян, разложенная по четыре
  const hand = h('div', { class: 'tz-cap tz-hand' }, NOT_THROWN);
  const seeds = h('div', { class: 'tz-seeds' });
  const seedPanel = h('div', { class: 'o-panel tz-panel tz-seedpanel' }, hand, seeds);

  // ответ
  const reading = h('div', { class: 'o-reading tz-reading' }, START_TEXT);
  const readPanel = h('div', { class: 'o-panel tz-panel tz-read' }, reading);

  w.body.append(h('div', { class: 'tz-main' }, inputRow, days, seedPanel, readPanel));

  function showDay() {
    const d = parseDay(dateBox.value);
    if (!d) { dayName.textContent = '—'; dayRu.textContent = BAD_DAY_SHORT; return; }
    const t = dayTexts(tzolkin(jdn(d)));
    dayName.textContent = t.name;
    dayRu.textContent = t.ru;
  }

  function pile(count, rest) {
    const p = h('div', { class: 'tz-pile' });
    for (let k = 0; k < count; k++) p.append(h('span', { class: rest ? 'tz-seed tz-rest' : 'tz-seed' }));
    return p;
  }

  function drawSeeds(n) {
    seeds.replaceChildren();
    const piles = Math.floor(n / 4);
    for (let p = 0; p < piles; p++) seeds.append(pile(4, false));
    // остаток — нефритом: он и говорит, каков ответ
    const r = n % 4;
    if (r > 0) seeds.append(pile(r, true));
  }

  function doCast() {
    const d = parseDay(dateBox.value);
    if (!d) { reading.textContent = BAD_DAY; return; }
    showDay();
    const c = cast(d);
    drawSeeds(c.hand);
    hand.textContent = handLine(c);
    const a = answerTexts(c.answer);
    ansName.textContent = a.name;
    ansRu.textContent = a.ru;
    reading.textContent = readingText(c, askBox.value.trim());
    readPanel.scrollTop = 0;
  }

  castBtn.addEventListener('click', doCast);

  // как конструктор старой программы: день сна или сегодня, вопрос — образ сна, если есть
  dateBox.value = formatDay(opts.day instanceof Date ? opts.day : new Date());
  const question = typeof opts.image === 'string' ? opts.image : '';
  if (question.trim()) askBox.value = question.trim();
  showDay();
}
