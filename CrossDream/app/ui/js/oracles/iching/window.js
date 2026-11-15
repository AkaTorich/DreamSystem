// И Цзин: окно генератора гексаграмм (перенос IChingWindow из DreamMap один в один).
// Кнопка «ГЕНЕРАЦИЯ» бросает монеты, пишет обе гексаграммы в консоль и рисует их.
import { makeWindow, loadCss, h } from '../common/frame.js';
import { castReading, resultText } from './logic.js';
import { drawHexagrams } from './draw.js';

loadCss(new URL('./iching.css', import.meta.url));

export function open(ctx, opts = {}) {
  const w = makeWindow({
    key: 'iching',
    title: 'I CHING // GEN',
    subtitle: '00x — CONSOLE',
    theme: 'iching',
    width: 800,
    height: 520,
  });
  if (!w) return;

  const result = h('textarea', { class: 'ic-result', spellcheck: 'false' });
  const pics = h('div', { class: 'ic-pics' });

  function generate() {
    const r = castReading();
    result.value = resultText(r);
    drawHexagrams(pics, r.originalLines, r.finalLines, r.originalHex, r.finalHex);
  }

  const head = h('div', { class: 'ic-panel ic-head' },
    h('span', { class: 'ic-name' }, 'I CHING :: GEN'),
    h('span', { class: 'ic-ver' }, 'v1.0'),
    h('button', { class: 'ic-gen', type: 'button', onclick: generate }, 'ГЕНЕРАЦИЯ'),
  );

  const consolePanel = h('div', { class: 'ic-panel ic-console' },
    h('div', { class: 'ic-label' }, 'CONSOLE OUTPUT'),
    result,
  );

  const displayPanel = h('div', { class: 'ic-panel ic-display' },
    h('div', { class: 'ic-label' }, 'HEXAGRAM DISPLAY'),
    pics,
  );

  w.body.append(
    h('div', { class: 'ic-layout' },
      head,
      consolePanel,
      displayPanel,
      h('div', { class: 'ic-scan' }),
    ),
  );
}
