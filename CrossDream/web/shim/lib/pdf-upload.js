// Отправка добавленного PDF на сайт с ходом (core\src\pdfnet.rs push + app\src\commands\pdf_add.rs send):
// `upload://progress` {id, title, done, total}, в конце `upload://done` {id, title, ok, message}.
// Пока уходил, его удалили — удаляем и там; переименовали — новое название вслед; своя обложка — следом.
import * as http from './http.js';
import { P, pending, ownCovers, load, markStale, knownSiteId, siteEntry } from './pdf-cache.js';
import { emit, EV, libraryChanged } from './events.js';
import { jx, throttle } from './util.js';

export const COVER_MAX = 300 * 1024;   // обложка не больше этого — так велит сайт

// своя обложка (JPEG) на сайт: pdf_cover_set, сайт сам переводит её в WebP
export async function pushCover(id, sid, blob) {
  if (blob.size > COVER_MAX) throw new Error('Обложка — только JPEG до 300 КБ');
  await http.upload('pdf_cover_set&id=' + sid, [{ field: 'cover', name: id + '.jpg', data: blob, mime: 'image/jpeg' }],
    { id: String(sid) });
  const s = siteEntry(id);
  if (s) s.hasCover = true;
}

export async function send(p) {
  if (p.state === 'send') return;
  p.state = 'send';
  const title = p.title;
  const prog = throttle(100, (done, total) => emit(EV.UPLOAD_PROGRESS, { id: p.id, title, done, total }));
  try {
    const r = await http.uploadProgress('pdf_add',
      [{ field: 'pdf', name: p.id + '.pdf', data: p.bytes, mime: 'application/pdf' }],
      { title, ext_id: p.id }, prog);
    let sid = jx.i(r, 'id') || 0;
    if (sid <= 0) {   // сайт уже знал этот PDF — номер из списка
      markStale();
      await load(0);
      sid = knownSiteId(p.id);
    }
    p.siteId = sid;
    if (sid > 0 && p.deleted) {
      await http.postJson('pdf_del', { id: sid });
    } else if (sid > 0) {
      if (p.title !== title) await http.postJson('pdf_rename', { id: sid, title: p.title }).catch(() => {});
      const own = ownCovers.get(p.id);
      if (own) {
        try { await pushCover(p.id, sid, own.blob); } catch (e) { console.warn('обложка', e); }
      }
    }
    markStale();
    await load(0).catch(() => P);
    pending.delete(p.id);   // теперь книга — в списке сайта под тем же Id
    emit(EV.UPLOAD_DONE, { id: p.id, title: p.title, ok: true, message: '«' + p.title + '» — на сайте' });
    libraryChanged();
  } catch (e) {
    p.state = 'fail';   // повторится при синхронизации
    emit(EV.UPLOAD_DONE, { id: p.id, title, ok: false, message: e && e.message ? e.message : String(e) });
  }
}

// не ушедшие — ещё раз (шаг синхронизации); ответ — сколько ушло
export async function retryFailed() {
  let n = 0;
  for (const p of [...pending.values()]) {
    if (p.state !== 'fail') continue;
    if (p.deleted) { pending.delete(p.id); continue; }
    await send(p);
    if (!pending.has(p.id)) n++;
  }
  return n;
}
