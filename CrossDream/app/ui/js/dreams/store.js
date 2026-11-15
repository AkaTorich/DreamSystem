// Общая память областей «Карта и дневник»: сны, планеты, книги-фундаменты,
// вошедший сновидец и настройки. Карта, дневник и космос читают её отсюда.
import * as api from '../shell/api.js';
import { locKey, dreamLoc, errText } from './util.js';

export const state = {
  dreams: [],          // [Dream] — свои, по дате
  planets: {},         // {ключ локации: {X, Y, Z, Time}}
  books: [],           // книги мода/сайта: у кого есть location — фундамент планеты
  founded: new Set(),  // ключи локаций с книгой-фундаментом
  user: null,          // вошедший на сайт или null
  settings: null,      // Settings ядра (без пароля)
};

const subs = new Set();
let ctx = null, loading = null, again = false, booksLoaded = false;

export function onChange(cb) { subs.add(cb); }
function notify() {
  for (const cb of subs) {
    try { cb(state); } catch (e) { console.error('store', e); }
  }
}

export function init(c) {
  if (ctx) return;
  ctx = c;
  c.bus.on('dreams:reload', () => reload());
  // вошли или вышли — у аккаунта свой набор снов: перечитываем
  c.bus.on('user:changed', u => { state.user = u || null; reload(); });
  const sub = (name, cb) => {
    try { Promise.resolve(api.listen(name, cb)).catch(e => console.error(name, e)); }
    catch (e) { console.error(name, e); }
  };
  sub('dreams://changed', () => reload());
  sub('library://changed', () => loadBooks().then(notify));
  getSettings().catch(() => {});
  reload();
}

export const online = () => !!state.user;
export const byId = id => state.dreams.find(d => d.Id === id) || null;

// приводим сон к полной форме: пустые списки вместо null
export function norm(d) {
  d = d || {};
  d.Links = Array.isArray(d.Links) ? d.Links : [];
  const a = d.Analysis;
  if (a) for (const k of ['Characters', 'Emotions', 'Symbols', 'Motifs']) if (!Array.isArray(a[k])) a[k] = [];
  return d;
}

export function reload() {
  if (loading) { again = true; return loading; }
  loading = (async () => {
    do {
      again = false;
      const [dreams, planets] = await Promise.all([
        api.invoke('dreams_list'),
        api.invoke('planets_get').catch(() => ({})),
      ]);
      state.dreams = (dreams || []).map(norm);
      state.planets = planets || {};
      if (!booksLoaded) await loadBooks();
    } while (again);
    notify();
  })().catch(e => {
    console.error('dreams_list', e);
    if (ctx) ctx.ui.toast('Сны не загрузились: ' + errText(e));
  }).finally(() => { loading = null; });
  return loading;
}

export async function loadBooks() {
  try {
    const r = await api.invoke('books_get');
    state.books = (r && r.books) || [];
  } catch (e) { state.books = []; }
  booksLoaded = true;
  state.founded = new Set(state.books.map(b => locKey(b.location)).filter(Boolean));
}

// книга-фундамент локации сна (или null)
export function foundationOf(d) {
  const k = locKey(dreamLoc(d));
  if (!k) return null;
  return state.books.find(b => locKey(b.location) === k) || null;
}

// прежние локации: [{name, n}] — сначала самые населённые
export function locations() {
  const g = new Map();
  for (const d of state.dreams) {
    const name = dreamLoc(d);
    if (!name) continue;
    const k = locKey(name);
    if (!g.has(k)) g.set(k, { name, n: 0 });
    g.get(k).n++;
  }
  return [...g.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

// сохранить сон через ядро и заменить его в памяти
export async function saveDream(d) {
  const saved = norm(await api.invoke('dream_save', { dream: d }));
  const i = state.dreams.findIndex(x => x.Id === saved.Id);
  if (i >= 0) state.dreams[i] = saved; else state.dreams.push(saved);
  return saved;
}

/* картинки снов: путь из ядра → адрес для <img>; удачные ответы запоминаются */
const imgCache = new Map();
export function imageSrc(d) {
  if (!d || !d.ImageFile) return Promise.resolve('');
  const k = d.Id + '|' + d.ImageFile;
  if (!imgCache.has(k)) {
    const p = api.invoke('dream_image', { id: d.Id })
      .then(path => api.fileSrc(path))
      .catch(() => '')
      .then(src => { if (!src) imgCache.delete(k); return src; });
    imgCache.set(k, p);
  }
  return imgCache.get(k);
}
export function forgetImage(d) {
  for (const k of [...imgCache.keys()]) if (k.startsWith(d.Id + '|')) imgCache.delete(k);
}

/* кружок на карте — готовая миниатюра 160×160 WebP с сайта (ядро хранит её в профиле);
   нет миниатюры — полная картинка (карта уменьшит её сама) */
export function thumbSrc(d) {
  if (!d || !d.ImageFile) return Promise.resolve('');
  const k = d.Id + '|' + d.ImageFile + '|s';
  if (!imgCache.has(k)) {
    const p = api.invoke('dream_thumb', { id: d.Id })
      .then(path => path ? api.fileSrc(path) : imageSrc(d))
      .catch(() => imageSrc(d))
      .then(src => { if (!src) imgCache.delete(k); return src; });
    imgCache.set(k, p);
  }
  return imgCache.get(k);
}

/* настройки: читаются один раз, правки идут цепочкой — без гонок между окнами */
let chain = Promise.resolve();
export async function getSettings() {
  if (!state.settings) state.settings = (await api.invoke('settings_get')) || {};
  return state.settings;
}
export function patchSettings(patch) {
  chain = chain.then(async () => {
    const s = await getSettings();
    Object.assign(s, patch);
    await api.invoke('settings_set', { settings: s });
  }).catch(e => console.error('settings_set', e));
  return chain;
}
