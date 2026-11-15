// Папки на полках — живут на сайте, вложенность любая (у папки есть родитель).
// Переход по папкам, путь «Все полки / А / Б», новая папка, переименовать, убрать папку,
// и отбор нескольких вещей разом (с отобранным работают «Копировать», «Вырезать», «Удалить»).
import { S, errText } from './state.js';
import { folderPath } from './data.js';
import { render, renderChrome, shelvesEl } from './shell.js';
import { askText, confirmBox } from './dialogs.js';

const toast = m => S.ctx.ui.toast(m);
const site = (a, b) => S.ctx.api.site(a, b);

export function openFolder(id) {
  S.curFolder = id; S.picked.clear();
  render();
}

// на уровень выше
export function folderBack() {
  const f = S.folders.find(x => x.id === S.curFolder);
  openFolder(f ? (f.parent ?? null) : null);
}

export const curFolderObj = () => S.folders.find(f => f.id === S.curFolder) || null;
export const curPath = () => (S.curFolder === null ? [] : folderPath(S.curFolder));

export async function newFolder() {
  if (!S.online) { toast('Папки живут на сайте — войдите на вкладке «Сайт»'); return; }
  const where = S.curFolder === null ? 'на полке' : 'в папке «' + curFolderObj().name + '»';
  const name = await askText('Новая папка', 'Имя новой папки ' + where + ':');
  if (!name || !name.trim()) return;
  try {
    const r = await site('folder_create', { name: name.trim(), kind: S.mode, parent: S.curFolder });
    S.folders.push({ id: +r.id, name: r.name, kind: r.kind, parent: S.curFolder });
    render();
  } catch (e) { toast(errText(e)); }
}

export async function renameFolder(f = curFolderObj()) {
  if (!f) return;
  const name = await askText('Переименование папки', 'Новое имя папки:', f.name);
  if (!name || !name.trim() || name.trim() === f.name) return;
  try {
    await site('folder_rename', { id: f.id, name: name.trim() });
    f.name = name.trim();
    render();
  } catch (e) { toast(errText(e)); }
}

// убрать папку: её вещи и подпапки поднимаются на уровень выше (так же делает сайт)
export async function delFolder(f = curFolderObj()) {
  if (!f) return;
  const up = f.parent ?? null;
  const upName = up === null ? 'на полку' : 'в папку «' + (S.folders.find(x => x.id === up) || {}).name + '»';
  if (!await confirmBox('Полка', 'Убрать папку «' + f.name + '»?\n\nВсё, что в ней лежит, и её подпапки переедут ' + upName + '.')) return;
  try {
    await site('folder_del', { id: f.id });
    S.folders = S.folders.filter(x => x.id !== f.id);
    S.folders.forEach(x => { if (x.parent === f.id) x.parent = up; });
    S.bookFolder.forEach((v, k) => { if (v === f.id) S.bookFolder.set(k, up); });
    S.pdfFolder.forEach((v, k) => { if (v === f.id) S.pdfFolder.set(k, up); });
    (S.files || []).forEach(x => { if (parseInt(x.folder_id, 10) === f.id) x.folder_id = up; });
    if (S.curFolder === f.id) S.curFolder = up;
    render();
    // имена поднятых подпапок сайт мог дополнить номером — сверим раскладку
    import('./data.js').then(d => d.refreshIndex()).then(ch => ch && render());
  } catch (e) { toast(errText(e)); }
}

/* ===== отбор нескольких вещей ===== */
export function togglePick() {
  S.picking = !S.picking;
  S.picked.clear();
  render();
}

export function pickOff() {
  S.picking = false; S.picked.clear();
  render();
}

// щелчок по вещи или папке с выбором как в проводнике: Ctrl — отметить/снять, Shift — всё подряд
// от прошлой отметки; в режиме «Выбрать» — просто отметить. true — щелчок ушёл на выбор.
let lastKey = null;
export function selectClick(key, ev) {
  const keys = () => [...shelvesEl().querySelectorAll('[data-key]')].map(n => n.dataset.key);
  if (ev && ev.shiftKey && lastKey) {
    const all = keys(), a = all.indexOf(lastKey), b = all.indexOf(key);
    if (a >= 0 && b >= 0) {
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.picked.add(all[i]);
      S.picking = true; render(); return true;
    }
  }
  if (ev && (ev.ctrlKey || ev.metaKey)) {
    if (S.picked.has(key)) S.picked.delete(key); else S.picked.add(key);
    S.picking = true; lastKey = key; render(); return true;
  }
  if (S.picking) { pickItem(key, ev); lastKey = key; return true; }
  return false;
}

// отметить всё, что видно на полке (папки и вещи)
export function selectAll() {
  shelvesEl().querySelectorAll('[data-key]').forEach(n => S.picked.add(n.dataset.key));
  S.picking = true;
  render();
}

export function pickItem(key, ev) {
  if (ev) ev.stopPropagation();
  if (S.picked.has(key)) S.picked.delete(key); else S.picked.add(key);
  // без перерисовки полки: только галочка на карточке или папке и счётчик
  const box = shelvesEl();
  const card = box && box.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (card) {
    card.classList.toggle('picked', S.picked.has(key));
    const m = card.querySelector('.pickmark');
    if (m) m.textContent = S.picked.has(key) ? '✓' : '';
  }
  renderChrome();
}
