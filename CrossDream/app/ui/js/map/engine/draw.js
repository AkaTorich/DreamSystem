// Отрисовка сферы: нити от грани до грани, сны-звёзды с картинками, планеты-локации,
// кольца фундамента и ранга, подписи. Вызывается только из redraw(). Цвета — из расцветки (skin).
import { skin } from '../../shell/themes.js';

function clip(s, n = 34) {
  s = String(s == null ? '' : s);
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function drawLinks(m, x) {
  if (!m.showLinks) return;   // нити спрятаны — связи целы, но не видны
  for (const l of m.links) {
    const dx = l.nb.px - l.na.px, dy = l.nb.py - l.na.py;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const offA = (l.na.rad || 34) * l.na.k, offB = (l.nb.rad || 34) * l.nb.k;
    if (dist <= offA + offB + 2) continue;   // круги соприкасаются — нить не нужна
    const ux = dx / dist, uy = dy / dist;
    x.strokeStyle = (m.opts.linkColor && m.opts.linkColor(l.type)) || '#888';
    x.globalAlpha = .5 * Math.min(l.na.k, l.nb.k);
    x.lineWidth = (l.cross ? 2.2 : 1.5) / m.zoom * Math.min(1.5, m.zoom);
    x.setLineDash(l.cross ? [7, 5] : []);
    x.beginPath();
    x.moveTo(l.na.px + ux * offA, l.na.py + uy * offA);
    x.lineTo(l.nb.px - ux * offB, l.nb.py - uy * offB);
    x.stroke();
  }
  x.setLineDash([]);
}

function fillBody(x, n, r) {
  if (n.img) {
    x.save(); x.clip();
    x.drawImage(n.img, n.px - r, n.py - r, r * 2, r * 2);
    x.restore();
    return;
  }
  const g = x.createRadialGradient(n.px - r * .33, n.py - r * .33, 0, n.px, n.py, r);
  if (n.planet && n.founded) { g.addColorStop(0, '#3e7d9e'); g.addColorStop(1, '#14283f'); }   // твёрдая
  else if (n.planet) { g.addColorStop(0, 'rgba(72,110,140,.55)'); g.addColorStop(1, 'rgba(16,28,48,.35)'); } // газовая
  else { const S = skin(); g.addColorStop(0, S.node1); g.addColorStop(1, S.node2); }   // цвета расцветки
  x.fillStyle = g; x.fill();
}

function drawRings(x, n, r) {
  if (n.planet && n.founded && !n.rings) {   // кольцо фундамента планеты-локации
    x.save();
    x.globalAlpha *= .8;
    x.strokeStyle = '#fcd34d'; x.lineWidth = 1.4 * n.k;
    x.beginPath(); x.ellipse(n.px, n.py, r * 1.55, r * .45, -0.45, 0, 7); x.stroke();
    x.restore();
  }
  if (n.rings) {   // космос: колец столько, сколько ступеней ранга сновидца
    x.save();
    const ga = x.globalAlpha;
    x.strokeStyle = '#fcd34d'; x.lineWidth = 1.2 * n.k;
    for (let i = 1; i <= n.rings; i++) {
      x.globalAlpha = ga * Math.max(.25, .75 - .1 * i);
      x.beginPath(); x.arc(n.px, n.py, r * (1 + 0.10 * i), 0, 7); x.stroke();
    }
    x.restore();
  }
}

function drawLabel(x, n, r) {
  x.fillStyle = skin().label;
  x.font = ((n.planet ? 12.5 : 11) * Math.min(1.4, n.k)) + 'px "Segoe UI","Segoe UI Emoji",sans-serif';
  x.textAlign = 'center';
  x.fillText(clip(n.label), n.px, n.py + r + 15 * n.k);
  if (n.sub) {   // локация сна без своей планеты — тихой второй строкой
    const a0 = x.globalAlpha;
    x.fillStyle = skin().sub;
    x.globalAlpha = a0 * 0.75;
    x.font = (10 * Math.min(1.4, n.k)) + 'px "Segoe UI",sans-serif';
    x.fillText(clip(n.sub), n.px, n.py + r + 28 * n.k);
    x.globalAlpha = a0;
  }
}

export function render(m) {
  const x = m.x;
  x.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  x.clearRect(0, 0, m.w, m.h);
  if (!m.nodes.length) return;
  m.project();
  x.save();
  x.translate(m.panX, m.panY);
  x.scale(m.zoom, m.zoom);
  drawLinks(m, x);

  const C = (m.opts.colors && m.opts.colors()) || {};
  const order = [...m.nodes].sort((a, b) => b.z2 - a.z2);
  for (const n of order) {
    const r = (n.rad || 34) * n.k;
    const lit = n === m.hover || n === m.flash;
    x.globalAlpha = Math.max(.4, Math.min(1, .75 + (n.k - 1) * .8));
    // свечение — только у кружка под курсором: размытие на каждом кружке и каждом кадре дорого
    x.shadowColor = skin().glow;
    x.shadowBlur = lit ? 24 * n.k : 0;
    x.beginPath(); x.arc(n.px, n.py, r, 0, 7);
    fillBody(x, n, r);
    x.shadowBlur = 0;
    x.lineWidth = (lit ? 3 : 2) * n.k;
    x.strokeStyle = n.planet
      ? (n.founded ? '#fcd34d' : (C.planet || 'rgba(125,211,252,.6)'))
      : (lit ? '#e4dcff' : (C.dream || '#8b7cf8'));
    x.beginPath(); x.arc(n.px, n.py, r, 0, 7); x.stroke();
    drawRings(x, n, r);
    drawLabel(x, n, r);
  }
  x.globalAlpha = 1;
  x.restore();
}
