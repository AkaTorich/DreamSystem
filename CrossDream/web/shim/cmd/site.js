// Сайт: состояние входа, вход/выход, произвольный вызов api.php, отправка и скачивание файлов
// (app\src\commands\site.rs и app\src\auth.rs). Сессия — cookie этой же страницы.
import * as http from '../lib/http.js';
import { session } from '../lib/session.js';
import { loadSettings, editSettings } from '../lib/store.js';
import { applyUser } from '../lib/viewsync.js';
import * as dreams from '../lib/dreams-cache.js';
import * as pdfs from '../lib/pdf-cache.js';
import { dreamsChanged, libraryChanged } from '../lib/events.js';
import { b64ToBytes } from '../lib/util.js';
import { runSync } from './sync.js';

const profileOf = login => String(login ?? '').trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '_');
let appliedFor = null;   // вид карты и палитра уже сверены для этого входа

// вошёл пользователь: другой аккаунт — память прежнего прочь, вид карты и палитра — аккаунта
async function adopt(user) {
  const login = String(user.login ?? '');
  const prev = loadSettings();
  const switched = profileOf(login) !== (prev.Profile || profileOf(prev.SiteLogin));
  editSettings(s => {
    s.ServerUrl = http.SERVER;
    s.SiteLogin = login;
    s.Profile = profileOf(login);
    if (switched) {
      Object.assign(s, { MapZoom: 0, MapPanX: 0, MapPanY: 0, ViewTime: '', Colors: null, ColorsDirty: false });
    }
  });
  session.user = user;
  if (switched) { dreams.reset(); pdfs.reset(); }
  if (appliedFor !== login) {
    appliedFor = login;
    await applyUser(user);
  }
  return switched;
}

async function site_state() {
  try {
    const j = await http.get('me');
    const user = j && j.user && typeof j.user === 'object' ? j.user : null;
    if (user) await adopt(user);
    else { session.user = null; appliedFor = null; }
  } catch (e) {
    if (e.status === 401) session.user = null;   // нет связи — остаётся прежнее знание
  }
  return { online: !!session.user, user: session.user || null, server: http.SERVER };
}

// войти (или зарегистрироваться — если задан инвайт); после входа — сверка всего в фоне
async function site_login({ login, pass, invite, remember }) {
  const l = String(login ?? '').trim();
  if (!l || !pass) throw new Error('Нужны логин и пароль');
  const inv = String(invite ?? '').trim();
  const j = await http.postJson(inv ? 'register' : 'login',
    { login: l, pass, invite: inv, remember: remember !== false });
  const user = j && j.user && typeof j.user === 'object' ? j.user : null;
  if (!user) throw new Error('Сайт не вернул пользователя');
  appliedFor = null;
  const switched = await adopt(user);
  if (switched) { dreamsChanged(); libraryChanged(); }
  setTimeout(() => { runSync().catch(() => {}); }, 0);
  return user;
}

// выйти: сайт забывает сессию; данные остаются на сайте
async function site_logout() {
  try { await http.get('logout'); } catch { /* сессии и так нет */ }
  session.user = null;
  appliedFor = null;
  editSettings(s => { s.SiteLogin = ''; });
  dreams.reset();
  pdfs.reset();
  return null;
}

// любой вызов api.php как есть
async function site_call({ action, method, body }) {
  if (String(method || 'GET').toUpperCase() === 'POST') return http.postJson(action, body ?? {});
  return http.get(action);
}

async function site_upload({ action, field, fileName, bytesB64, extra, mime }) {
  const data = b64ToBytes(bytesB64);
  return http.upload(action, [{ field, name: fileName, data, mime: mime || 'application/octet-stream' }], extra || {});
}

// файл сайта → адрес blob: в памяти страницы (как кеш профиля у ядра: второй раз не качается)
const downloaded = new Map();
async function site_download({ rel }) {
  const key = String(rel ?? '');
  if (downloaded.has(key)) return downloaded.get(key);
  const blob = await http.download(key);
  if (!blob.size) throw new Error('Сайт вернул пустой файл');
  const url = URL.createObjectURL(blob);
  downloaded.set(key, url);
  return url;
}

export const commands = { site_state, site_login, site_logout, site_call, site_upload, site_download };
