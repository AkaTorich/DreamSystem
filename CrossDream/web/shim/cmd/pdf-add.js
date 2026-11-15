// Добавление PDF (app\src\commands\pdf_add.rs): сразу ответ PdfBook и library://changed;
// на сайт — в фоне с ходом (`upload://progress`, в конце `upload://done`).
// В браузере полки на устройстве нет: пока PDF уходит, он живёт в памяти страницы.
import { requireLogin } from '../lib/session.js';
import { fileOf } from '../lib/dialog.js';
import { pending, book } from '../lib/pdf-cache.js';
import { send } from '../lib/pdf-upload.js';
import { libraryChanged } from '../lib/events.js';
import { isPdf, newPdfId, b64ToBytes } from '../lib/util.js';

function add(title, bytes) {
  if (!isPdf(bytes)) throw new Error('Это не PDF-файл');
  requireLogin();
  const id = newPdfId();
  const t = String(title ?? '').trim() || 'Без названия';
  const p = { id, title: t, bytes, siteId: 0, deleted: false, state: 'new', url: '' };
  pending.set(id, p);
  libraryChanged();
  setTimeout(() => { send(p); }, 0);
  return book(id);
}

// PDF по «пути» из диалога открытия (в браузере — указатель на выбранный файл)
async function pdf_add({ path, title }) {
  const f = fileOf(path);
  if (!f) throw new Error('файл: выбранный файл недоступен — выберите его снова');
  const bytes = new Uint8Array(await f.arrayBuffer());
  const t = String(title ?? '').trim() || f.name.replace(/\.[^.]*$/, '');
  return add(t, bytes);
}

// PDF байтами (телефоны: диалог отдаёт не путь, а содержимое)
async function pdf_add_bytes({ title, bytesB64 }) {
  return add(title, b64ToBytes(bytesB64));
}

export const commands = { pdf_add, pdf_add_bytes };
