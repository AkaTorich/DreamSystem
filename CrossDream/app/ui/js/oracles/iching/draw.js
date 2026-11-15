// И Цзин: рисунок обеих гексаграмм с подписями — SVG 760×239, как картинка в старом окне.
// Нижние линии (индекс 0) рисуются сверху, верхние (индекс 5) — снизу.
// Рисунок отдаётся двумя кусками одного полотна (левая половина — исходная, правая —
// результирующая): на широком окне они стоят рядом и сливаются в одну картинку,
// на узком экране встают друг под другом, чтобы подписи не становились мелкими.
import { lineSymbol, lineDescription } from './logic.js';

const WIDTH = 760;
const HEIGHT = 239;
const SPLIT = 346;                 // граница кусков: правая гексаграмма начинается с x = 350

const BACKGROUND = '#0A120C';
const NEON = '#39FF14';
const MUTED = '#5CFF9E';
const GRID = '#112818';
const GLOW = 'rgba(57,255,20,0.353)';
const FONT = "Consolas, 'Cascadia Mono', monospace";
const NS = 'http://www.w3.org/2000/svg';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// текст: (x, y) — левый верхний угол, как у FormattedText
function text(s, color, x, y, size, bold) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="${FONT}" font-size="${size}"` +
    `${bold ? ' font-weight="bold"' : ''} dominant-baseline="text-before-edge">${esc(s)}</text>`;
}

function seg(x1, x2, y, stroke, w) {
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${stroke}" stroke-width="${w}"/>`;
}

// одна линия с символом и подписью
function drawLine(x, y, l) {
  let s = '';
  if (l.isYang) {
    // Для Ян – сплошная линия.
    s += seg(x, x + 100, y, GLOW, 8) + seg(x, x + 100, y, NEON, 4);
  } else {
    // Для Инь – линия с разрывом.
    s += seg(x, x + 40, y, GLOW, 8) + seg(x + 60, x + 100, y, GLOW, 8);
    s += seg(x, x + 40, y, NEON, 4) + seg(x + 60, x + 100, y, NEON, 4);
  }
  s += text(`${lineSymbol(l)} (${lineDescription(l)})`, NEON, x + 105, y - 10, 12, false);
  return s;
}

// всё полотно одной строкой разметки
function canvas(originalLines, finalLines, originalHex, finalHex) {
  const startX = 50;
  const titleY = 25;
  const lineStartY = titleY + 30;
  const spacing = 30;
  const offsetX = 300;

  let s = `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${BACKGROUND}"/>`;

  s += text('ИСХОДНАЯ: ' + originalHex.title, MUTED, startX, titleY - 20, 10, true);
  for (let i = 0; i < 6; i++) s += drawLine(startX, lineStartY + spacing * i, originalLines[i]);

  s += text('РЕЗУЛЬТИРУЮЩАЯ: ' + finalHex.title, MUTED, startX + offsetX, titleY - 20, 10, true);
  for (let i = 0; i < 6; i++) s += drawLine(startX + offsetX, lineStartY + spacing * i, finalLines[i]);

  // Лёгкая «сеточка» и сканлайны для ретро-эффекта.
  for (let y = 24; y < HEIGHT; y += 4) {
    s += `<line x1="6" y1="${y}" x2="${WIDTH - 6}" y2="${y}" stroke="${GRID}" stroke-width="1" stroke-opacity="0.15"/>`;
  }
  return s;
}

// кусок полотна от x0 шириной w
function piece(content, x0, w) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${x0} 0 ${w} ${HEIGHT}`);
  svg.setAttribute('class', 'ic-pic');
  svg.style.aspectRatio = `${w} / ${HEIGHT}`;
  svg.innerHTML = content;
  return svg;
}

// нарисовать в контейнер host (прежний рисунок заменяется)
export function drawHexagrams(host, originalLines, finalLines, originalHex, finalHex) {
  const content = canvas(originalLines, finalLines, originalHex, finalHex);
  host.replaceChildren(
    piece(content, 0, SPLIT),
    piece(content, SPLIT, WIDTH - SPLIT),
  );
}
