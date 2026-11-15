// Звёздное небо как в программе: тёмный градиент, три туманности и звёзды
// своей яркости. Рисуется один раз и заново только после смены размера окна — без мерцания.

import { skin } from '../shell/themes.js';

const AURORAS = [   // левый верх, доля ширины; цвет — из расцветки (--aur-1..3)
  [0.05, 0.02, 0.45],
  [0.62, 0.55, 0.40],
  [0.38, 0.60, 0.28],
];

function rng(seed) {   // свой счётчик случайностей: звёзды не прыгают при каждой перерисовке
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function draw(c) {
  const dpr = Math.max(1, Math.min(4, devicePixelRatio || 1));   // до 4 — и на экранах 8K звёзды чёткие
  const w = innerWidth, h = innerHeight;
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const x = c.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  const g = x.createLinearGradient(0, 0, 0, h);
  const S = skin();
  g.addColorStop(0, S.sky[0]); g.addColorStop(.6, S.sky[1]); g.addColorStop(1, S.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);

  AURORAS.forEach(([ax, ay, as], i) => {
    const col = S.aur[i];
    const size = w * as, r = size / 2;
    const cx = w * ax + r, cy = h * ay + r;
    const rg = x.createRadialGradient(cx, cy, 0, cx, cy, r * 1.25);
    rg.addColorStop(0, `rgba(${col},.35)`);
    rg.addColorStop(.35, `rgba(${col},.2)`);
    rg.addColorStop(.6, `rgba(${col},.09)`);
    rg.addColorStop(.82, `rgba(${col},.03)`);
    rg.addColorStop(1, `rgba(${col},0)`);
    x.fillStyle = rg;
    x.fillRect(cx - r * 1.25, cy - r * 1.25, r * 2.5, r * 2.5);
  });

  const rnd = rng(w * 7919 + h);
  const n = Math.floor(w * h / 6500);
  x.fillStyle = S.star;
  for (let i = 0; i < n; i++) {
    const r = rnd() * 1.2 + 0.3;
    x.globalAlpha = 0.2 + rnd() * 0.8;   // своя яркость, без мерцания
    x.beginPath(); x.arc(rnd() * w, rnd() * h, r, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}

let sky = null;
export function redrawSky() { if (sky) draw(sky); }   // сменилась расцветка

export function startSky(canvas) {
  if (!canvas) return;
  sky = canvas;
  let t = null;
  draw(canvas);
  // пока окно тянут, небо просто растягивается; пересобирается, когда окно замрёт
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => draw(canvas), 220); });
}
