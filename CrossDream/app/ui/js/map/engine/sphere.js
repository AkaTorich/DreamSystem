// Сфера снов: 3D-раскладка узлов, проекция на экран, сдвиг и зум.
// Рисует только по redraw() — пока ничего не меняется, кадров нет вовсе.
import { stepOnce } from './physics.js';
import { render } from './draw.js';
import { bindInput, ZMIN, ZMAX } from './input.js';

const F = 1400;                       // глубина перспективы

function hash01(s, salt) {             // позиция из хэша id: сеть одна и та же при каждом открытии
  let h = 2166136261;
  const str = String(s) + '|' + salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

export class SphereMap {
  // opts: {colors(), linkColor(type), onSelect(id,node), onMove({id,x,y,z}), onAlign(id), onView(v)}
  constructor(canvas, opts = {}) {
    this.c = canvas; this.x = canvas.getContext('2d');
    this.opts = opts;
    this._frame = 0;
    this.nodes = []; this.links = []; this.centers = [{ x: 0, y: 0, z: 0 }];
    this._showLinks = true;
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.w = 0; this.h = 0; this.dpr = 1;
    this.active = 0; this.dragNode = null; this.hover = null; this.flash = null;
    this._imgs = new Map();             // адрес → загруженная картинка (без мигания при перечтении)
    bindInput(this);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  redraw() {
    if (this._frame) return;
    if (document.body.classList.contains('paged')) return;   // карта закрыта страницей — не рисовать
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      if (this.active > 0 && this.nodes.length) { this.active--; stepOnce(this); }
      render(this);
      if (this.active > 0) this.redraw();
    });
  }

  get showLinks() { return this._showLinks; }
  set showLinks(v) { this._showLinks = !!v; this.redraw(); }

  resize() {
    this.dpr = Math.max(1, Math.min(4, devicePixelRatio || 1));
    this.w = this.c.clientWidth || innerWidth;
    this.h = this.c.clientHeight || innerHeight;
    this.c.width = Math.round(this.w * this.dpr);
    this.c.height = Math.round(this.h * this.dpr);
    this.redraw();
  }

  /* nodes: [{id,label,sub,image,pos,planet,founded,rings,cluster}], links: [{id,a,b,type,cross}] */
  setData(nodes, links, clusterCount = 1) {
    const n = Math.max(1, clusterCount);
    const ringR = n > 1 ? 300 + 55 * n : 0;
    this.centers = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      this.centers.push({ x: Math.cos(a) * ringR, y: Math.sin(a * 2) * ringR * 0.12, z: Math.sin(a) * ringR });
    }
    const R = 190;
    this.nodes = nodes.map(nd => {
      const c = this.centers[nd.cluster || 0] || this.centers[0];
      const authored = Array.isArray(nd.pos);
      const node = {
        ...nd, rad: nd.planet ? 18 : 26, pinned: authored,
        cx: c.x, cy: c.y, cz: c.z,
        x: authored ? c.x + nd.pos[0] : c.x + (hash01(nd.id, 1) - .5) * 2 * R,
        y: authored ? c.y + nd.pos[1] : c.y + (hash01(nd.id, 2) - .5) * 1.5 * R,
        z: authored ? c.z + nd.pos[2] : c.z + (hash01(nd.id, 3) - .5) * 1.5 * R,
        vx: 0, vy: 0, vz: 0, px: 0, py: 0, k: 1, z2: 0, img: null,
      };
      if (nd.image) this._loadImage(node, nd.image);
      return node;
    });
    const byId = {};
    this.nodes.forEach(nd => { byId[nd.id] = nd; });
    this.links = links.filter(l => byId[l.a] && byId[l.b]).map(l => ({ ...l, na: byId[l.a], nb: byId[l.b] }));

    // планеты закреплены; спутники без авторских координат — ровным кольцом по орбите
    for (const p of this.nodes) {
      if (!p.planet) continue;
      p.pinned = true;
      const sats = this.links.filter(l => l.na === p || l.nb === p).map(l => (l.na === p ? l.nb : l.na))
        .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
      const orbR = Math.max(120, 55 + sats.length * 20);
      sats.forEach((s, i) => {
        if (Array.isArray(s.pos)) { s.pinned = true; return; }   // авторская позиция дороже
        const ang = 2 * Math.PI * i / sats.length - Math.PI / 2;
        s.x = p.x + Math.cos(ang) * orbR;
        s.y = p.y + Math.sin(ang) * orbR * 0.8;
        s.z = p.z + Math.sin(ang * 2) * 28;
        s.pinned = true;
      });
    }
    for (let i = 0; i < 300; i++) stepOnce(this);   // раскладка считается сразу и замирает
    this.active = 0;
    this.hover = null;
    this.redraw();
  }

  // image — адрес или обещание адреса
  _loadImage(node, image) {
    Promise.resolve(image).then(src => {
      if (!src) return;
      const ready = this._imgs.get(src);
      if (ready) { node.img = ready; this.redraw(); return; }
      const im = new Image();
      im.decoding = 'async';
      im.onload = async () => {
        // в пузырь — уменьшенный квадрат из середины картинки (160×160), а не вся 640×480 на каждом кадре
        let pic = im;
        try {
          const s = Math.min(im.naturalWidth, im.naturalHeight);
          pic = await createImageBitmap(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s,
            { resizeWidth: 160, resizeHeight: 160, resizeQuality: 'medium' });
        } catch { /* старый движок — рисуем как есть */ }
        this._imgs.set(src, pic); node.img = pic; this.redraw();
      };
      im.src = src;
    }).catch(() => {});
  }

  project() {
    const cx = this.w / 2, cy = this.h / 2;
    for (const n of this.nodes) {
      const k = Math.max(.15, Math.min(4, F / (F + n.z)));
      n.px = cx + n.x * k; n.py = cy + n.y * k; n.k = k; n.z2 = n.z;
    }
  }

  // точка указателя: экранная (sx, sy) и в координатах проекции (x, y)
  local(e) {
    const b = this.c.getBoundingClientRect();
    const sx = e.clientX - b.left, sy = e.clientY - b.top;
    return { sx, sy, x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  nodeAt(p, extra = 6) {
    const order = [...this.nodes].sort((a, b) => a.z2 - b.z2);
    for (const n of order) {
      const r = (n.rad || 34) * n.k + extra;
      if ((p.x - n.px) ** 2 + (p.y - n.py) ** 2 < r * r) return n;
    }
    return null;
  }

  // узел под пальцем/мышью тянут: экран → сфера, глубина узла сохраняется
  dragTo(n, p) {
    const k = n.k <= 0 ? 1 : n.k;
    n.x = (p.x - this.w / 2) / k;
    n.y = (p.y - this.h / 2) / k;
    n.vx = n.vy = n.vz = 0;
  }

  fireView() {
    this.redraw();
    if (this.opts.onView) this.opts.onView({ zoom: this.zoom, panx: this.panX, pany: this.panY });
  }

  // зум в точке экрана (mx, my) — точка под курсором остаётся на месте
  zoomAt(mx, my, nz) {
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    const k = nz / this.zoom;
    if (Math.abs(k - 1) < .0001) return false;
    this.panX = mx - k * (mx - this.panX);
    this.panY = my - k * (my - this.panY);
    this.zoom = nz;
    return true;
  }

  setView(v) {
    if (!v) return;
    this.zoom = Math.max(ZMIN, Math.min(ZMAX, v.zoom || 1));
    this.panX = v.panx || 0; this.panY = v.pany || 0;
    this.redraw();
  }

  resetView() {
    this.zoom = 1; this.panX = this.panY = 0;
    this.fireView();
  }

  // виден ли на экране хоть один узел при текущем виде
  anyVisible() {
    if (!this.nodes.length) return true;
    this.project();
    return this.nodes.some(n => {
      const x = this.panX + this.zoom * n.px, y = this.panY + this.zoom * n.py;
      return x > 0 && x < this.w && y > 60 && y < this.h - 30;
    });
  }

  // вписать все узлы в экран (шапка сверху и легенда снизу их не закрывают)
  fitAll() {
    if (!this.nodes.length) return;
    this.project();
    const xs = this.nodes.map(n => n.px), ys = this.nodes.map(n => n.py);
    const x0 = Math.min(...xs) - 90, x1 = Math.max(...xs) + 90, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 90;
    const top = 70, bottom = 110, side = 20;
    const aw = Math.max(100, this.w - 2 * side), ah = Math.max(100, this.h - top - bottom);
    this.zoom = Math.max(ZMIN, Math.min(1.6, aw / (x1 - x0), ah / (y1 - y0)));
    this.panX = side + aw / 2 - this.zoom * (x0 + x1) / 2;
    this.panY = top + ah / 2 - this.zoom * (y0 + y1) / 2;
    this.fireView();
  }

  // показать узел посреди экрана и подсветить его
  focusNode(id) {
    const n = this.nodes.find(x => String(x.id) === String(id));
    if (!n) return false;
    this.project();
    this.zoom = Math.max(this.zoom, 1.3);
    this.panX = this.w / 2 - this.zoom * n.px;
    this.panY = this.h / 2 - this.zoom * n.py;
    this.flash = n;
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { this.flash = null; this.redraw(); }, 1800);
    this.fireView();
    return true;
  }
}
