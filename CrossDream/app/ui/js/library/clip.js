// Буфер библиотеки и действия над вещами и папками — как в проводнике:
// копировать / вырезать → вставить в открытую папку, переименовать, удалить из библиотеки.
// Удаление убирает только запись из своей библиотеки: файлы на сервере остаются всегда.
// Стереть с сервера совсем (у всех) может только владелец сайта.
// Ключи: 'book:<num>', 'pdf:<Id>', 'file:<id>', 'folder:<id>'.
import { S, errText } from './state.js';
import { siteIdOfBook, siteIdOfPdf, setItemFolder, folderTree, refreshIndex, loadPdfs, loadSuite, saveBooks } from './data.js';
import { render, renderChrome } from './shell.js';
import { renameFolder } from './folders.js';
import { askText, confirmBox } from './dialogs.js';

const toast = m => S.ctx.ui.toast(m);
const site = (a, b) => S.ctx.api.site(a, b);
const split = key => { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; };
export const isOwner = () => !!S.user && S.user.role === 'owner';

// действие над вещью из отбора — над всем отобранным
export function targetsFor(key) {
  return S.picked.has(key) && S.picked.size > 1 ? [...S.picked] : [key];
}

function titleOf(key) {
  const [k, id] = split(key);
  if (k === 'folder') return (S.folders.find(f => f.id === +id) || {}).name || 'папка';
  if (k === 'book') return ((S.books || []).find(b => +b.num === +id) || {}).title || 'книга';
  if (k === 'pdf') return ((S.pdfs || []).find(p => p.Id === id) || {}).Title || 'PDF';
  return ((S.files || []).find(f => +f.id === +id) || {}).title || 'программа';
}

export function toClip(op, keys) {
  if (!S.online) { toast('Копировать и переносить можно после входа на сайт'); return; }
  S.clip = { op, kind: S.mode, keys: [...keys] };
  toast((op === 'cut' ? 'Вырезано: ' : 'Скопировано: ') + (keys.length > 1 ? keys.length + ' шт.' : '«' + titleOf(keys[0]) + '»')
    + ' — откройте нужную папку и нажмите «Вставить»');
  S.picking = false; S.picked.clear();
  render();
}

async function siteIdOf(kind, id) {
  if (kind === 'book') return siteIdOfBook(+id);
  if (kind === 'file') return +id;
  const p = (S.pdfs || []).find(x => x.Id === id);
  return p ? (p.SiteId > 0 ? p.SiteId : siteIdOfPdf(p)) : -1;
}

// вставить в открытую папку (или на полку)
export async function paste() {
  const c = S.clip;
  if (!c || c.kind !== S.mode) return;
  const to = S.curFolder;
  let done = 0;
  try {
    const items = [], localKeys = [];
    for (const key of c.keys) {
      const [k, id] = split(key);
      if (k === 'folder') {
        if (c.op === 'cut' && to !== null && folderTree(+id).has(to)) { toast('Папку нельзя положить в саму себя'); continue; }
        await site(c.op === 'cut' ? 'folder_move' : 'folder_copy', { id: +id, parent: to });
        if (c.op === 'cut') { const f = S.folders.find(x => x.id === +id); if (f) f.parent = to; }
        done++;
      } else {
        const sid = await siteIdOf(k, id);
        if (sid >= 0) { items.push(sid); localKeys.push([k, id]); }
      }
    }
    if (items.length) {
      const r = await site(c.op === 'cut' ? 'items_move' : 'items_copy', { type: c.kind, ids: items, folder: to });
      done += c.op === 'cut' ? r.moved : r.copied;
      if (c.op === 'cut') for (const [k, id] of localKeys) setItemFolder(k, k === 'pdf' ? id : +id, to);
    }
    if (c.op === 'cut') S.clip = null;   // вырезанное вставляется один раз, скопированное — сколько угодно
    else await afterCopy(c.kind);
    await refreshIndex();
    render();
    toast((c.op === 'cut' ? 'Перенесено: ' : 'Скопировано: ') + done);
  } catch (e) { toast(errText(e)); await refreshIndex(); render(); }
}

// копии появились на сайте — подтянуть их на полку сразу
async function afterCopy(kind) {
  const api = S.ctx.api;
  if (kind === 'pdf') { try { await api.invoke('pdfs_refresh'); } catch { /* увидим при синхронизации */ } await loadPdfs(); }
  else if (kind === 'file') await loadSuite();
  else { try { await api.invoke('sync_all'); } catch { /* книги придут при синхронизации */ } }
}

export async function renameKey(key) {
  const [k, id] = split(key);
  if (k === 'folder') { const f = S.folders.find(x => x.id === +id); if (f) await renameFolder(f); return; }
  const old = titleOf(key);
  const name = (await askText('Переименование', 'Новое название:', old) || '').trim();
  if (!name || name === old) return;
  try {
    if (k === 'book') {
      const b = (S.books || []).find(x => +x.num === +id);
      if (!b) return;
      b.title = name;
      await saveBooks();
      if (S.online) { const sid = await siteIdOfBook(+id); if (sid >= 0) await site('book_edit', { id: sid, title: name }); }
    } else if (k === 'pdf') {
      await S.ctx.api.invoke('pdf_rename', { id, title: name });
      const p = (S.pdfs || []).find(x => x.Id === id); if (p) p.Title = name;
    } else {
      await site('file_rename', { id: +id, title: name });
      const f = (S.files || []).find(x => +x.id === +id); if (f) f.title = name;
    }
    render();
  } catch (e) { toast(errText(e)); }
}

// убрать из своей библиотеки (файлы на сервере остаются)
export async function deleteKeys(keys) {
  const what = keys.length > 1 ? keys.length + ' шт.' : '«' + titleOf(keys[0]) + '»';
  if (!await confirmBox('Библиотека', 'Убрать из вашей библиотеки: ' + what + '?\n\nПапки убираются, их содержимое поднимается на уровень выше. Файлы на сервере сохраняются.')) return;
  for (const key of keys) {
    const [k, id] = split(key);
    try {
      if (k === 'folder') await site('folder_del', { id: +id });
      else if (k === 'pdf') { await S.ctx.api.invoke('pdf_delete', { id }); S.pdfs = (S.pdfs || []).filter(p => p.Id !== id); }
      else if (k === 'file') { await site('file_del', { id: +id }); S.files = (S.files || []).filter(f => +f.id !== +id); }
      else {
        if (S.online) { const sid = await siteIdOfBook(+id); if (sid >= 0) await site('book_del', { id: sid }); }
        S.books = (S.books || []).filter(b => +b.num !== +id); S.bookFolder.delete(+id); S.bookSiteId.delete(+id);
        await saveBooks();
      }
    } catch (e) { toast(titleOf(key) + ': ' + errText(e)); }
  }
  S.picking = false; S.picked.clear();
  await refreshIndex();
  if (S.curFolder !== null && !S.folders.some(f => f.id === S.curFolder)) S.curFolder = null;
  render();
}

// стереть с сервера совсем — файл и все записи на него у всех (только владелец сайта)
export async function purgeKeys(keys) {
  if (!isOwner()) return;
  const list = keys.filter(k => k.startsWith('pdf:') || k.startsWith('file:'));
  if (!list.length) return;
  const what = list.length > 1 ? list.length + ' файлов' : '«' + titleOf(list[0]) + '»';
  if (!await confirmBox('Стереть с сервера', 'Стереть с сервера ' + what + '?\n\nФайл исчезнет у всех, кому он был передан. Вернуть его будет нельзя.')) return;
  for (const key of list) {
    const [k, id] = split(key);
    try {
      const sid = await siteIdOf(k, id);
      if (sid < 0) continue;
      await site('lib_purge', { type: k, id: sid });
      if (k === 'pdf') { await S.ctx.api.invoke('pdf_delete', { id, localOnly: true }); S.pdfs = (S.pdfs || []).filter(p => p.Id !== id); }
      else S.files = (S.files || []).filter(f => +f.id !== +id);
    } catch (e) { toast(titleOf(key) + ': ' + errText(e)); }
  }
  S.picking = false; S.picked.clear();
  await refreshIndex();
  render();
}

export const canPaste = () => !!S.clip && S.clip.kind === S.mode;
export function clipLabel() { return S.clip ? 'Вставить (' + S.clip.keys.length + ')' : 'Вставить'; }
export { renderChrome };
