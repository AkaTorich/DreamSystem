// Выпадающее меню действий на полке: правая кнопка мыши или долгое нажатие пальцем.
// По вещи или папке — открыть, копировать, вырезать, переименовать, удалить (и стереть с сервера —
// владельцу сайта); по пустому месту — вставить, новая папка. Действие над отобранной вещью —
// над всем отобранным.
import { S } from './state.js';
import { openFolder, newFolder } from './folders.js';
import { targetsFor, toClip, paste, renameKey, deleteKeys, purgeKeys, isOwner, canPaste, clipLabel } from './clip.js';

let menu = null;

function close() {
  if (menu) { menu.remove(); menu = null; }
  document.removeEventListener('pointerdown', outside, true);
  document.removeEventListener('keydown', onKey, true);
}
const outside = e => { if (menu && !menu.contains(e.target)) close(); };
const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };

function show(x, y, entries) {
  close();
  const { el } = S.ctx.ui;
  menu = el('div', { class: 'lib-menu', role: 'menu' });
  for (const it of entries) {
    if (it === '-') { menu.append(el('div', { class: 'sep' })); continue; }
    menu.append(el('button', { class: it.danger ? 'danger' : '', disabled: it.off || false,
      onclick: () => { close(); it.act(); } }, it.label));
  }
  document.body.append(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + 'px';
  menu.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + 'px';
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
  }, 0);
}

function forKey(key, node) {
  const keys = targetsFor(key);
  const many = keys.length > 1;
  const isFolder = key.startsWith('folder:');
  const canPurge = isOwner() && keys.some(k => k.startsWith('pdf:') || k.startsWith('file:'));
  const e = [];
  if (!many) e.push({ label: 'Открыть', act: () => isFolder ? openFolder(+key.slice(7)) : node.click() });
  e.push({ label: many ? 'Копировать (' + keys.length + ')' : 'Копировать', act: () => toClip('copy', keys), off: !S.online },
         { label: many ? 'Вырезать (' + keys.length + ')' : 'Вырезать', act: () => toClip('cut', keys), off: !S.online });
  if (canPaste() && isFolder && !many) e.push({ label: clipLabel() + ' в эту папку', act: () => { openFolder(+key.slice(7)); paste(); } });
  e.push('-');
  if (!many) e.push({ label: 'Переименовать', act: () => renameKey(key) });
  e.push({ label: isFolder && !many ? 'Убрать папку' : 'Удалить из библиотеки', act: () => deleteKeys(keys), danger: true });
  if (canPurge) e.push({ label: 'Стереть с сервера', act: () => purgeKeys(keys), danger: true });
  return e;
}

function forEmpty() {
  return [
    { label: clipLabel(), act: paste, off: !canPaste() },
    { label: 'Новая папка', act: newFolder, off: !S.online },
  ];
}

function open(e, target) {
  const node = target.closest('[data-key]');
  if (node) show(e.clientX, e.clientY, forKey(node.dataset.key, node));
  else show(e.clientX, e.clientY, forEmpty());
}

// повесить меню на полку (один раз)
export function wireMenu(box) {
  if (box._menu) return;
  box._menu = true;
  box.addEventListener('contextmenu', e => { e.preventDefault(); open(e, e.target); });
  // долгое нажатие пальцем — то же меню; щелчок после него не срабатывает
  let t = null, sx = 0, sy = 0, fired = false;
  box.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    fired = false; sx = e.clientX; sy = e.clientY;
    const tgt = e.target;
    t = setTimeout(() => { fired = true; open({ clientX: sx, clientY: sy }, tgt); }, 550);
  });
  const stop = () => clearTimeout(t);
  box.addEventListener('pointerup', stop);
  box.addEventListener('pointercancel', stop);
  box.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 10) stop(); });
  box.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
}
