// Оби: окно гадания йоруба (перенос ObiWindow из DreamMap один в один).
// Сон о … и догадка → бросок четырёх долей ореха → фигура и ответ «да/нет».
// Образ сна (opts.image) встаёт в поле «СОН О», как в конструкторе старого окна.
import { makeWindow, loadCss, h } from '../common/frame.js';
import { castLobes, castLine, figureLine } from './logic.js';
import { accentOf } from './data/figures.js';
import { buildReading } from './reading.js';
import { drawLobes } from './lobes.js';
import { ABOUT_TIP, GUESS_TIP, PRESETS, GLOSSARY, NOT_CAST, INTRO } from './data/texts.js';

loadCss(new URL('./obi.css', import.meta.url));

export function open(ctx, opts = {}) {
  const w = makeWindow({
    key: 'obi',
    title: 'OBI // ELÉGBÁRA',
    subtitle: 'орех не толкует сон — он подтверждает или отвергает догадку',
    theme: 'obi',
    width: 920,
    height: 668,
  });
  if (!w) return;

  let castNo = 0;

  const aboutBox = h('input', { type: 'text', class: 'obi-about', title: ABOUT_TIP, spellcheck: 'false' });
  const guessBox = h('input', { type: 'text', class: 'obi-guess', title: GUESS_TIP, spellcheck: 'false' });
  const image = opts.image == null ? '' : String(opts.image);
  if (image.trim()) aboutBox.value = image.trim();

  const lobes = h('div', { class: 'obi-lobes' });
  const castLineEl = h('div', { class: 'obi-castline' }, NOT_CAST);
  const figName = h('div', { class: 'obi-figname' }, '—');
  const figRu = h('div', { class: 'obi-figru' }, '');
  const reading = h('div', { class: 'obi-reading' }, INTRO);

  function cast() {
    const { up, faces, figure: f } = castLobes();
    drawLobes(lobes, up);
    castNo++;

    castLineEl.textContent = castLine(castNo, faces);
    figName.textContent = f.yo;
    figRu.textContent = figureLine(f);
    figName.style.color = accentOf(f.kind);

    const about = aboutBox.value.trim();
    const guess = guessBox.value.trim();
    reading.textContent = buildReading(about, guess, faces, f);
    reading.scrollTop = 0;
  }

  // сон и догадка
  const ask = h('div', { class: 'obi-panel obi-ask' },
    h('div', { class: 'obi-field obi-field-about' },
      h('span', { class: 'obi-lbl' }, 'СОН О'), aboutBox),
    h('div', { class: 'obi-field obi-field-guess' },
      h('span', { class: 'obi-lbl obi-lbl-guess' }, 'ДОГАДКА'), guessBox),
    h('button', { class: 'obi-cast', type: 'button', onclick: cast }, 'БРОСИТЬ ОРЕХ'),
  );

  // готовые вопросы обряда и перевод терминов
  const chips = PRESETS.map(p => h('button', {
    class: 'obi-chip', type: 'button',
    onclick: () => { guessBox.value = p.text; },
  }, p.label));
  const presets = h('div', { class: 'obi-presets' },
    h('div', { class: 'obi-chips' }, h('span', { class: 'obi-ask-lbl' }, 'СПРОСИТЬ:'), ...chips),
    h('div', { class: 'obi-glossary' },
      ...GLOSSARY.flatMap((g, i) => [
        i ? ' ' : null,
        h('span', { class: 'obi-term' }, g.term),
        h('span', {}, g.rest),
      ])),
  );

  // четыре доли ореха и фигура
  const figure = h('div', { class: 'obi-panel obi-figure' },
    lobes,
    h('div', { class: 'obi-figtext' }, castLineEl, figName, figRu),
  );

  // ответ
  const answer = h('div', { class: 'obi-panel obi-answer' }, reading);

  w.body.append(h('div', { class: 'obi-layout' }, ask, presets, figure, answer));
}
