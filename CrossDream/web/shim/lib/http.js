// Клиент сайта (api.php) для браузера: та же сессия по cookie, что у страницы.
// То же, что core\src\site.rs: ответ `{error}` — ошибка с текстом сайта, не-JSON — ошибка с кодом HTTP.

// адрес api.php: window.__CD_API__ либо «../api.php» от страницы (из корня сайта — тот же /api.php)
export const API = new URL(window.__CD_API__ || '../api.php', document.baseURI).href;
export const API_DIR = API.slice(0, API.lastIndexOf('/') + 1);
export const SERVER = new URL(API).origin;

// action может нести и GET-параметры: "user_map&uid=5"
export const actionUrl = action => API + '?action=' + action;
// путь от корня сайта ("api.php?action=img&f=…") → полный адрес; готовый адрес — как есть
export const relUrl = rel => (/^(https?:|blob:|data:)/i.test(String(rel)) ? String(rel)
  : new URL(String(rel).replace(/^\/+/, ''), API_DIR).href);

// ошибка сайта: текст как есть + код HTTP (401 — «Нужен вход»)
export class SiteError extends Error {
  constructor(message, status = 0) { super(message); this.status = status; }
}

// кто слушает «сессии нет» (401): session.js сбрасывает пользователя
export const hooks = { unauthorized: () => {} };

function check(status, err) {
  if (status === 401) hooks.unauthorized();
  return err;
}

// разбор ответа api.php
export function parseReply(status, text) {
  const t = String(text ?? '').replace(/^﻿/, '').trim();
  let v;
  try { v = JSON.parse(t); } catch { throw check(status, new SiteError('Сервер вернул не-JSON (HTTP ' + status + ')', status)); }
  if (v && typeof v === 'object' && v.error != null)
    throw check(status, new SiteError(typeof v.error === 'string' ? v.error : JSON.stringify(v.error), status));
  return v;
}

async function send(url, init = {}) {
  try {
    return await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
  } catch (e) {
    throw new SiteError('связь с сайтом: ' + (e && e.message ? e.message : e), 0);
  }
}

export async function get(action) {
  const r = await send(actionUrl(action));
  return parseReply(r.status, await r.text());
}

export async function postJson(action, body) {
  const r = await send(actionUrl(action), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body == null ? {} : body),
  });
  return parseReply(r.status, await r.text());
}

// multipart: files — [{field, name, data: Blob|Uint8Array, mime}], fields — {k: v}
export function form(files = [], fields = {}) {
  const fd = new FormData();
  for (const f of files) {
    const blob = f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.mime || 'application/octet-stream' });
    fd.append(f.field, blob, f.name);
  }
  for (const [k, v] of Object.entries(fields || {}))
    fd.append(k, typeof v === 'string' ? v : (v == null ? '' : JSON.stringify(v)));
  return fd;
}

export async function upload(action, files, fields) {
  const r = await send(actionUrl(action), { method: 'POST', body: form(files, fields) });
  return parseReply(r.status, await r.text());
}

// ответ-файл: не 2xx — ошибка сайта; JSON {error} при коде 200 — тоже ошибка
async function fileReply(r) {
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    try { parseReply(r.status, txt); } catch (e) { if (e instanceof SiteError) throw e; }
    throw check(r.status, new SiteError('связь с сайтом: HTTP ' + r.status, r.status));
  }
  return r;
}

async function jsonError(blob) {
  if (blob.size >= 4096) return;
  const head = new Uint8Array(await blob.slice(0, 1).arrayBuffer());
  if (head[0] !== 0x7b) return;   // «{»
  let v = null;
  try { v = JSON.parse(await blob.text()); } catch { return; }
  if (v && v.error != null) throw new SiteError(typeof v.error === 'string' ? v.error : JSON.stringify(v.error));
}

// скачать файл по пути от корня сайта ("api.php?action=img&f=…") → Blob
export async function download(rel) {
  const r = await fileReply(await send(relUrl(rel)));
  const blob = await r.blob();
  await jsonError(blob);
  return blob;
}

// скачать с ходом: cb(done, total); total — Content-Length, иначе sizeHint (0 — неизвестен)
export async function downloadProgress(rel, sizeHint, cb) {
  const r = await fileReply(await send(relUrl(rel)));
  const total = +(r.headers.get('Content-Length') || 0) || sizeHint || 0;
  if (!r.body || !r.body.getReader) {
    const buf = new Uint8Array(await r.arrayBuffer());
    cb(true, buf.length, total || buf.length);
    return buf;
  }
  const reader = r.body.getReader();
  const parts = [];
  let done = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    parts.push(value);
    done += value.length;
    cb(false, done, total);
  }
  const out = new Uint8Array(done);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  cb(true, done, total || done);
  if (out.length < 4096) await jsonError(new Blob([out]));
  return out;
}

// отправить с ходом (XMLHttpRequest: у fetch нет хода отправки); cb(force, done, total)
export function uploadProgress(action, files, fields, cb) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', actionUrl(action));
    x.withCredentials = true;
    x.upload.onprogress = e => cb(false, e.loaded, e.lengthComputable ? e.total : 0);
    x.upload.onload = e => cb(true, e.loaded, e.lengthComputable ? e.total : e.loaded);
    x.onload = () => {
      try { resolve(parseReply(x.status, x.responseText)); } catch (e) { reject(e); }
    };
    x.onerror = () => reject(new SiteError('связь с сайтом: отправка оборвалась', 0));
    x.ontimeout = () => reject(new SiteError('связь с сайтом: время вышло', 0));
    x.send(form(files, fields));
  });
}
