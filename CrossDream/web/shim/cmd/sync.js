// Синхронизация (app\src\commands\sync.rs). В браузере всё и так лежит на сайте: сверка — это
// перечитать сны, книги, PDF, раскладку и вид карты и сказать интерфейсу, что изменилось.
// Ход — `sync://progress` {text, pct}, итог — `sync://done` {ok, message}; раз в пять минут — сама.
import * as http from '../lib/http.js';
import { session, loggedIn } from '../lib/session.js';
import { applyUser } from '../lib/viewsync.js';
import * as dc from '../lib/dreams-cache.js';
import * as pc from '../lib/pdf-cache.js';
import { retryFailed } from '../lib/pdf-upload.js';
import { emit, EV, dreamsChanged, libraryChanged } from '../lib/events.js';
import { jx } from '../lib/util.js';

const PERIOD = 5 * 60 * 1000;
let syncing = false;
let booksFp = null, indexFp = null;

const progress = (text, pct) => emit(EV.SYNC_PROGRESS, { text, pct: Math.round(pct * 10) / 10 });
const msg = e => (e && e.message ? e.message : String(e));

export async function runSync() {
  if (!loggedIn()) {
    const rep = { ok: false, message: 'Сначала войдите на сайт' };
    emit(EV.SYNC_DONE, rep);
    return rep;
  }
  if (syncing) return { ok: false, message: 'Синхронизация уже идёт' };
  syncing = true;
  const parts = [], errors = [];
  let dreamsCh = false, libCh = false;
  try {
    progress('сны: сверяю список с сайтом', 1);
    try {
      const was = dc.C.fp;
      await dc.load(0);
      dreamsCh = was !== dc.C.fp;
      parts.push('сны: ' + dc.C.list.length);
    } catch (e) { errors.push('сны: ' + msg(e)); }

    progress('книги: беру с сайта новые и трактовки', 50);
    try {
      const j = await http.get('books_list');
      const fp = JSON.stringify(j);
      if (booksFp !== fp) { libCh = libCh || booksFp !== null; booksFp = fp; }
      parts.push('книги: ' + jx.arr(j, 'books').length);
    } catch (e) { errors.push('книги: ' + msg(e)); }

    progress('PDF: сверяю список', 70);
    try {
      const up = await retryFailed();
      const was = pc.P.fp;
      await pc.load(0);
      if (was !== pc.P.fp || up > 0) libCh = true;
      parts.push('PDF: ' + pc.P.site.length + (up ? ', на сайт → ' + up : ''));
    } catch (e) { errors.push('PDF: ' + msg(e)); }

    progress('вид карты и раскладка библиотеки', 96);
    try {
      const me = await http.get('me');
      if (me && me.user) { session.user = me.user; await applyUser(me.user); }
    } catch (e) { errors.push('вид карты: ' + msg(e)); }
    try {
      const fp = JSON.stringify(await http.get('lib_index'));
      if (indexFp !== fp) { libCh = libCh || indexFp !== null; indexFp = fp; }
    } catch (e) { errors.push('раскладка: ' + msg(e)); }
    progress('готово', 100);
  } finally {
    syncing = false;
  }
  const rep = { ok: !errors.length, message: errors.length ? errors.join('; ') : 'сверено с сайтом — ' + parts.join('; ') };
  emit(EV.SYNC_DONE, rep);
  if (dreamsCh) dreamsChanged();
  if (libCh) libraryChanged();
  return rep;
}

async function sync_all() { return runSync(); }

// перенос из прежней программы читает её папку на диске — в браузере это невозможно
async function legacy_import() {
  throw new Error('Перенос из прежней программы — только в программе для Windows');
}

// раз в пять минут, пока страница открыта и есть вход
setInterval(() => { if (loggedIn() && !document.hidden) runSync().catch(() => {}); }, PERIOD);

export const commands = { sync_all, legacy_import };
