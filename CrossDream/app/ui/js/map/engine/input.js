// Управление картой мышью и пальцами (Pointer Events — одно на всё):
//  пустое место тянут — карта сдвигается; узел тянут — он переезжает и запоминается;
//  колесо — зум к курсору; два пальца — щипок (зум + сдвиг);
//  клик/тап по узлу — открыть; двойной по планете — ровная орбита, по пустому — сброс вида.
export const ZMIN = 0.25, ZMAX = 3.5;   // пределы зума
const DOUBLE_MS = 350;

export function bindInput(m) {
  const c = m.c;
  c.style.touchAction = 'none';
  const pts = new Map();          // pointerId → {sx, sy}
  let mode = null;                // 'node' | 'pan' | 'pinch'
  let start = null, last = null, moved = false, pinch = null;
  let lastTap = { t: 0, sx: 0, sy: 0 };

  const scr = e => {
    const b = c.getBoundingClientRect();
    return { sx: e.clientX - b.left, sy: e.clientY - b.top };
  };

  function beginPinch() {
    const [a, b] = [...pts.values()];
    const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
    pinch = {
      d: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, zoom: m.zoom,
      wx: (mx - m.panX) / m.zoom, wy: (my - m.panY) / m.zoom,   // точка мира под серединой
    };
    if (m.dragNode) m.dragNode = null;
    mode = 'pinch'; moved = true;
  }

  function movePinch() {
    const [a, b] = [...pts.values()];
    const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
    const d = Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1;
    const nz = Math.max(ZMIN, Math.min(ZMAX, pinch.zoom * d / pinch.d));
    m.zoom = nz;
    m.panX = mx - pinch.wx * nz;
    m.panY = my - pinch.wy * nz;
    m.redraw();
  }

  function tap(p) {
    const n = m.nodeAt(p, 10);
    const now = performance.now();
    const dbl = now - lastTap.t < DOUBLE_MS && Math.abs(p.sx - lastTap.sx) + Math.abs(p.sy - lastTap.sy) < 30;
    lastTap = dbl ? { t: 0, sx: 0, sy: 0 } : { t: now, sx: p.sx, sy: p.sy };
    if (dbl) {
      if (!n) m.resetView();
      else if (n.planet && m.opts.onAlign) m.opts.onAlign(n.id, n);
      return;
    }
    if (n && m.opts.onSelect) m.opts.onSelect(n.id, n);
  }

  c.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { c.setPointerCapture(e.pointerId); } catch (_) { /* указатель уже ушёл */ }
    pts.set(e.pointerId, scr(e));
    if (pts.size === 2) { beginPinch(); return; }
    if (pts.size > 2) return;
    const p = m.local(e);
    start = last = p; moved = false;
    const n = m.nodeAt(p, e.pointerType === 'mouse' ? 6 : 12);
    if (n) { m.dragNode = n; mode = 'node'; } else mode = 'pan';
  });

  c.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) {        // мышь без нажатия — только подсветка
      if (e.pointerType !== 'mouse') return;
      const n = m.nodeAt(m.local(e));
      if (n !== m.hover) { m.hover = n; c.style.cursor = n ? 'pointer' : 'grab'; m.redraw(); }
      return;
    }
    pts.set(e.pointerId, scr(e));
    if (mode === 'pinch') { if (pts.size >= 2) movePinch(); return; }
    if (!start) return;
    const p = m.local(e);
    const slop = e.pointerType === 'mouse' ? 4 : 10;
    if (!moved && Math.abs(p.sx - start.sx) + Math.abs(p.sy - start.sy) > slop) moved = true;
    if (!moved) return;
    if (mode === 'pan') { m.panX += p.sx - last.sx; m.panY += p.sy - last.sy; c.style.cursor = 'grabbing'; }
    else if (mode === 'node' && m.dragNode) m.dragTo(m.dragNode, p);
    last = p;
    m.redraw();
  });

  function finish(e) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (mode === 'pinch') {
      if (pts.size === 1) {             // один палец остался — дальше просто сдвиг
        const r = [...pts.values()][0];
        start = last = { sx: r.sx, sy: r.sy }; mode = 'pan'; moved = true;
      } else if (pts.size === 0) { mode = null; start = null; m.fireView(); }
      return;
    }
    if (pts.size) return;
    const p = m.local(e);
    if (e.type !== 'pointercancel') {
      if (!moved) tap(p);
      else if (mode === 'node' && m.dragNode) {
        const n = m.dragNode;
        n.pinned = true;                // авторская позиция
        if (m.opts.onMove) m.opts.onMove({ id: n.id, x: n.x - n.cx, y: n.y - n.cy, z: n.z - n.cz, node: n });
      } else if (mode === 'pan') m.fireView();
    }
    m.dragNode = null; mode = null; start = last = null;
    c.style.cursor = m.hover ? 'pointer' : 'grab';
    m.redraw();
  }
  c.addEventListener('pointerup', finish);
  c.addEventListener('pointercancel', finish);

  c.addEventListener('pointerleave', e => {
    if (e.pointerType === 'mouse' && !pts.size && m.hover) { m.hover = null; m.redraw(); }
  });

  c.addEventListener('wheel', e => {
    e.preventDefault();
    const p = scr(e);
    const k = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    if (m.zoomAt(p.sx, p.sy, m.zoom * k)) m.fireView();
  }, { passive: false });

  c.addEventListener('contextmenu', e => e.preventDefault());
  c.style.cursor = 'grab';
}
