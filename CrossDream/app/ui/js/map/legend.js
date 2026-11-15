// Легенда под картой: глаз «нити» (прячет нити, связи остаются целы) и цвета типов нитей.
// Состояние глаза живёт в Settings.MapLinks.
import { $, el } from '../shell/ui.js';
import { TYPES, linkColor, onPalette } from './palette.js';
import { getSettings, patchSettings } from '../dreams/store.js';

let eye = null, engine = null, bridgeNote = null;

function paintEye() {
  const on = engine.showLinks;
  eye.querySelector('b').textContent = on ? 'вкл' : 'выкл';
  eye.classList.toggle('off', !on);
}

export function paintLegend() {
  document.querySelectorAll('#legend .dot').forEach(d => { d.style.background = linkColor(d.dataset.t); });
}

export async function initLegend(map) {
  engine = map;
  const lg = $('legend');
  eye = el('span', { id: 'linksEye', title: 'Показать или спрятать нити между узлами' }, el('b'), ' нити');
  lg.replaceChildren(eye,
    ...TYPES.map(t => el('span', {}, el('span', { class: 'dot', 'data-t': t }), t)));
  bridgeNote = el('span', { class: 'cd-bridge-note', hidden: true }, '– – мост между картами');
  lg.append(bridgeNote);
  paintLegend();
  onPalette(paintLegend);

  try {
    const s = await getSettings();
    engine.showLinks = s.MapLinks !== false;
  } catch (e) { /* по умолчанию нити видны */ }
  paintEye();

  eye.addEventListener('click', () => {
    engine.showLinks = !engine.showLinks;
    paintEye();
    patchSettings({ MapLinks: engine.showLinks });
  });
}

export function showLegend(on) { $('legend').hidden = !on; }
// в космосе пунктир — мосты между картами
export function showBridgeNote(on) { if (bridgeNote) bridgeNote.hidden = !on; }
