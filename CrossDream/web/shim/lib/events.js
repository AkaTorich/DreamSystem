// События «ядра» → интерфейс: та же форма, что у Tauri (`listen` отдаёт обещание функции отписки,
// обработчик получает {event, id, payload}). Имена — как в docs\CONTRACT.md.

const subs = new Map();   // имя события → Map(id → обработчик)
let seq = 0;

export function listen(event, handler) {
  const id = ++seq;
  if (!subs.has(event)) subs.set(event, new Map());
  subs.get(event).set(id, handler);
  return Promise.resolve(() => { const m = subs.get(event); if (m) m.delete(id); });
}

export function once(event, handler) {
  let stop = null;
  const p = listen(event, e => { if (stop) stop(); handler(e); });
  p.then(f => { stop = f; });
  return p;
}

// разослать событие подписчикам; сбой одного не мешает другим
export function emit(event, payload = null) {
  const m = subs.get(event);
  if (!m) return;
  for (const [id, h] of [...m]) {
    try { h({ event, id, payload }); } catch (e) { console.error(event, e); }
  }
}

export const EV = {
  SYNC_PROGRESS: 'sync://progress',
  SYNC_DONE: 'sync://done',
  PIPELINE_STEP: 'pipeline://step',
  DREAMS_CHANGED: 'dreams://changed',
  LIBRARY_CHANGED: 'library://changed',
  PDF_PROGRESS: 'pdf://progress',
  UPLOAD_PROGRESS: 'upload://progress',
  UPLOAD_DONE: 'upload://done',
  SITE_LOGIN: 'site://login',
};

export const dreamsChanged = () => emit(EV.DREAMS_CHANGED);
export const libraryChanged = () => emit(EV.LIBRARY_CHANGED);
