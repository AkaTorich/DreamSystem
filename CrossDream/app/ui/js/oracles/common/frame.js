// Каркас окна гадания: своё окно в #overlays со шапкой (название, подзаголовок, «—» и «✕»),
// рамкой «бегущие муравьи» и телом. На узком экране окно на весь экран (css/oracles.css).
// Каждое гадание задаёт свои цвета через класс темы и свой файл стилей (loadCss).

const open = new Map();          // имя гадания → окно (второй раз — просто поднять)

// верхнее окно — последнее видимое в #overlays (поднять = переложить в конец)
export function topOverlay() {
  const kids = [...document.getElementById('overlays').children];
  for (let i = kids.length - 1; i >= 0; i--) {
    const k = kids[i];
    if (!k.hidden && getComputedStyle(k).display !== 'none') return k;
  }
  return null;
}

// подключить файл стилей один раз: loadCss(new URL('./medici.css', import.meta.url))
export function loadCss(href) {
  const url = String(href);
  if (document.querySelector(`link[data-css="${url}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = url; l.dataset.css = url;
  document.head.append(l);
}
loadCss(new URL('../../../css/oracles.css', import.meta.url));

// makeWindow({key, title, subtitle, theme, width, height}) → {root, body, close, onClose} | null (уже открыто)
export function makeWindow({ key, title, subtitle = '', theme = '', width = 920, height = 668 }) {
  const old = open.get(key);
  if (old) { old.raise(); return null; }

  const ov = document.createElement('div');
  ov.className = 'overlay open oracle-ov';
  const win = document.createElement('div');
  win.className = 'oracle-win ' + theme;
  win.style.setProperty('--w', width + 'px');
  win.style.setProperty('--h', height + 'px');

  const bar = document.createElement('div');
  bar.className = 'oracle-bar';
  const t = document.createElement('span'); t.className = 'ob-title'; t.textContent = title;
  const s = document.createElement('span'); s.className = 'ob-sub'; s.textContent = subtitle;
  const btns = document.createElement('span'); btns.className = 'ob-btns';
  const min = document.createElement('button'); min.textContent = '—'; min.title = 'Свернуть';
  const x = document.createElement('button'); x.textContent = '✕'; x.title = 'Закрыть';
  btns.append(min, x);
  bar.append(t, s, btns);

  const body = document.createElement('div');
  body.className = 'oracle-body';
  const ants = document.createElement('div');
  ants.className = 'oracle-ants';
  win.append(bar, body, ants);
  ov.append(win);
  document.getElementById('overlays').append(ov);

  const closers = [];
  const w = {
    root: win, body, overlay: ov,
    raise() { ov.hidden = false; document.getElementById('overlays').append(ov); },
    close() {
      open.delete(key);
      ov.remove();
      closers.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    },
    onClose(f) { closers.push(f); },
  };
  // «свернуть» — окно прячется до следующего вызова того же гадания
  min.addEventListener('click', () => { ov.hidden = true; });
  x.addEventListener('click', () => w.close());
  ov.addEventListener('mousedown', e => { if (e.target === ov) ov.hidden = true; });
  open.set(key, w);
  w.raise();
  return w;
}

// Esc: закрыть окно гадания, только если оно было верхним в миг нажатия
// (верхнее запоминается до того, как другие области успеют закрыть своё)
let escTop = null;
window.addEventListener('keydown', e => { if (e.key === 'Escape') escTop = topOverlay(); }, true);

export function closeTop() {
  for (const w of open.values()) if (w.overlay === escTop) { w.close(); return true; }
  return false;
}

// маленький помощник разметки: h('div', {class:'x', onclick:f}, 'текст', el)
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
