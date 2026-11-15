// Обложки PDF (app\src\commands\covers.rs). Готовые — на сайте (pdf_cover, их печёт сайт);
// свою (JPEG, рисует интерфейс pdf.js-ом) — на сайт pdf_cover_set. «Путь» — адрес для <img>.
import * as pc from '../lib/pdf-cache.js';
import { pushCover, COVER_MAX } from '../lib/pdf-upload.js';
import { loggedIn, isAuthError } from '../lib/session.js';
import { b64ToBytes, isJpeg } from '../lib/util.js';

// адрес обложки или null: своя (ещё не на сайте) — из памяти страницы, иначе — сайта, если там есть
async function cover_get({ id }) {
  const own = pc.ownCovers.get(id);
  if (own) return own.url;
  try { await pc.load(5000); } catch (e) { if (isAuthError(e)) return null; throw e; }
  const s = pc.siteEntry(id);
  return s && s.hasCover && s.siteId > 0 ? pc.coverUrl(s.siteId) : null;
}

// своя обложка: при известном номере и входе — сразу на сайт; ответ — адрес картинки.
// Интерфейс дописывает к адресу «?v=…»: у адреса сайта он ложится в значение «&v=»,
// у адреса blob: — после «#», то есть не мешает.
async function cover_put({ id, jpegB64 }) {
  const jpeg = b64ToBytes(jpegB64);
  if (!isJpeg(jpeg)) throw new Error('Обложка — только JPEG');
  const blob = new Blob([jpeg], { type: 'image/jpeg' });
  const sid = pc.knownSiteId(id);
  if (sid > 0 && loggedIn() && jpeg.length <= COVER_MAX) {
    try {
      await pushCover(id, sid, blob);
      return pc.coverUrl(sid) + '&v=';   // «?v=…» интерфейса ляжет в значение v, номер останется чистым
    } catch (e) { console.warn('обложка', e); }
  }
  // номера ещё нет (PDF уходит в фоне) — обложку отправит сама отправка
  const old = pc.ownCovers.get(id);
  if (old) URL.revokeObjectURL(old.raw);
  const raw = URL.createObjectURL(blob);
  const url = raw + '#c';
  pc.ownCovers.set(id, { blob, raw, url });
  return url;
}

export const commands = { cover_get, cover_put };
