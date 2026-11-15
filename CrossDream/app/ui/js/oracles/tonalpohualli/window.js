// Окно «Тональпоуалли»: день сна и образ → клетка календаря и толкование.
import { makeWindow, loadCss, h } from '../common/frame.js';
import { parseDay, formatDay, dayOf } from './calendar.js';
import { cellTexts, readingText, BAD_DAY, START_TEXT } from './reading.js';

loadCss(new URL('./tonalpohualli.css', import.meta.url));

export function open(ctx, opts = {}) {
  const w = makeWindow({
    key: 'tonalpohualli',
    title: 'TONALPOHUALLI // 260',
    subtitle: 'счёт дней — день говорит за сон',
    theme: 'tonalpohualli',
    width: 900, height: 640,
  });
  if (!w) return;

  // ввод: день сна и его образ
  const dateBox = h('input', { type: 'date', class: 'tp-date', title: 'ГГГГ-ММ-ДД' });
  const signBox = h('input', { type: 'text', class: 'tp-image',
    title: 'что виделось: змея, вода, дом, погоня…' });
  const askBtn = h('button', { class: 'tp-btn', type: 'button' }, 'СПРОСИТЬ ДЕНЬ');
  const inputRow = h('div', { class: 'o-panel tp-panel tp-input' },
    h('label', { class: 'tp-field tp-field-date' },
      h('span', { class: 'tp-label' }, 'ДЕНЬ СНА'), dateBox),
    h('label', { class: 'tp-field tp-field-image' },
      h('span', { class: 'tp-label tp-label-image' }, 'ОБРАЗ'), signBox),
    askBtn);

  // клетка календаря: число точками, как в кодексах
  const numBig = h('div', { class: 'tp-num' }, '—');
  const dots = h('div', { class: 'tp-dots' });
  const signName = h('div', { class: 'tp-sign' }, 'день не назван');
  const signRu = h('div', { class: 'tp-sign-ru' });
  const meta = h('div', { class: 'tp-meta' });
  const cell = h('div', { class: 'o-panel tp-panel tp-cell' },
    h('div', { class: 'tp-numcol' }, numBig, dots),
    h('div', { class: 'tp-signcol' }, signName, signRu, meta));

  // толкование
  const reading = h('div', { class: 'o-reading tp-reading' }, START_TEXT);
  const readPanel = h('div', { class: 'o-panel tp-panel tp-read' }, reading);

  w.body.append(h('div', { class: 'tp-main' }, inputRow, cell, readPanel));

  function drawDots(n) {
    dots.replaceChildren();
    for (let i = 0; i < n; i++) dots.append(h('span', { class: 'tp-dot' }));
  }

  function ask() {
    const d = parseDay(dateBox.value);
    if (!d) { reading.textContent = BAD_DAY; return; }
    const day = dayOf(d);
    const c = cellTexts(day);
    numBig.textContent = String(day.number);
    drawDots(day.number);
    signName.textContent = c.name;
    signRu.textContent = c.ru;
    meta.textContent = c.meta;
    reading.textContent = readingText(day, signBox.value.trim());
    readPanel.scrollTop = 0;
  }

  askBtn.addEventListener('click', ask);

  // как конструктор старой программы: день сна или сегодня, образ — если есть
  dateBox.value = formatDay(opts.day instanceof Date ? opts.day : new Date());
  const image = typeof opts.image === 'string' ? opts.image : '';
  if (image.trim()) signBox.value = image.trim();
  ask();
}
