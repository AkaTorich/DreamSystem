// Оби: рисунок четырёх долей ореха — лицо светлое (эфун) с ободком и жилкой, изнанка тёмная.
import { h } from '../common/frame.js';

const EFUN = '#E8E8E8';
const BACK = '#1A1A1A';
const RIM = '#C8C8C8';
const VEIN = '#888888';
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// одна доля 52×68: обводка внутри границ, как у Ellipse в WPF
function lobe(face) {
  const sw = face ? 2 : 1.2;
  const svg = svgEl('svg', { width: 52, height: 68, viewBox: '0 0 52 68', class: 'obi-lobe-pic' });
  svg.append(svgEl('ellipse', {
    cx: 26, cy: 34, rx: 26 - sw / 2, ry: 34 - sw / 2,
    fill: face ? EFUN : BACK, stroke: RIM, 'stroke-width': sw,
  }));
  // на лице — жилка доли ореха
  if (face) svg.append(svgEl('line', { x1: 26, y1: 12, x2: 26, y2: 56, stroke: VEIN, 'stroke-width': 1.5 }));
  return svg;
}

// заменить содержимое host четырьмя долями по массиву up (true — лицо)
export function drawLobes(host, up) {
  host.replaceChildren(...up.map(face =>
    h('div', { class: 'obi-lobe' },
      lobe(face),
      h('div', { class: 'obi-lobe-cap', style: { color: face ? '#C8C8C8' : '#666666' } },
        face ? 'лицо' : 'изнанка'),
    )));
}
