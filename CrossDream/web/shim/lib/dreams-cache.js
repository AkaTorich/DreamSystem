// Сны сайта в форме программы (core\src\sync\convert.rs и links.rs): последний ответ `dreams`,
// соответствие id (свой ↔ сайта), нити, места планет. Источник — всегда сайт; здесь лишь память
// последнего ответа, чтобы правки знали номера на сайте и что было до них.
import * as http from './http.js';
import { profile } from './session.js';
import { read, write } from './store.js';
import { jx, shortLoc, clone } from './util.js';

export const C = {
  list: [],             // [Dream] — по дате
  planets: {},          // {ключ: {X, Y, Z, Time}}
  sid: new Map(),       // свой id → номер сна на сайте
  lid: new Map(),       // номер на сайте → свой id
  siteImg: new Map(),   // свой id → имя картинки на сайте
  linkId: new Map(),    // «a|b|тип» (номера сайта) → номер нити
  fp: '',               // отпечаток ответа — для «изменилось ли» при синхронизации
  at: 0,                // когда получен
  stale: true,
  inflight: null,
};

// снята в этом окне картина (сайт стереть её не умеет: ждём новую от разбора или из файла)
export const imageCleared = new Set();

// свой id сна сайта: его ext_id (id программы) либо «web<id>»
export function localId(o) {
  const e = jx.s(o, 'ext_id');
  return e ? e : 'web' + jx.str(o, 'id');
}

export const linkKey = (a, b, type) => (a < b ? a + '|' + b : b + '|' + a) + '|' + type;

/* разбор, который сайт пока не хранит при правке (списки и образ картины) — память этого браузера */
const overlayKey = () => 'cd.analysis.' + profile();
export function overlaySet(id, a, imagePrompt) {
  const all = read(overlayKey(), {});
  all[id] = { Characters: a.Characters || [], Emotions: a.Emotions || [], Symbols: a.Symbols || [],
    Motifs: a.Motifs || [], ImagePrompt: imagePrompt || '' };
  write(overlayKey(), all);
}
function overlayApply(list) {
  const all = read(overlayKey(), {});
  let dirty = false;
  for (const d of list) {
    const o = all[d.Id];
    if (!o || !d.Analysis) continue;
    const a = d.Analysis;
    const empty = !a.Characters.length && !a.Emotions.length && !a.Symbols.length && !a.Motifs.length;
    if (!empty) { delete all[d.Id]; dirty = true; continue; }   // сайт уже знает — память не нужна
    Object.assign(a, { Characters: o.Characters, Emotions: o.Emotions, Symbols: o.Symbols, Motifs: o.Motifs });
    if (!d.ImagePrompt) d.ImagePrompt = o.ImagePrompt || '';
  }
  if (dirty) write(overlayKey(), all);
}

// сон сайта → сон программы
export function dreamFromSite(o) {
  const summary = jx.str(o, 'summary');
  const location = jx.str(o, 'location');
  const analysis = !summary && !location ? null : {
    Summary: summary, Location: shortLoc(location),
    Characters: jx.strings(o, 'characters'), Emotions: jx.strings(o, 'emotions'),
    Symbols: jx.strings(o, 'symbols'), Motifs: jx.strings(o, 'motifs'),
  };
  const id = localId(o);
  return {
    Id: id,
    Title: jx.s(o, 'title') || 'Сон без имени',
    Date: jx.str(o, 'dream_date'),
    Text: jx.str(o, 'text'),
    Analysis: analysis,
    ImagePrompt: jx.str(o, 'image_prompt'),
    ImageFile: imageCleared.has(id) ? '' : jx.str(o, 'image_file'),
    Links: [],
    PosX: jx.f(o, 'pos_x'), PosY: jx.f(o, 'pos_y'), PosZ: jx.f(o, 'pos_z'),
    PosTime: jx.s(o, 'pos_time'),
  };
}

function build(j) {
  const dreams = jx.arr(j, 'dreams');
  const list = dreams.map(dreamFromSite);
  const byId = new Map(list.map(d => [d.Id, d]));
  C.sid.clear(); C.lid.clear(); C.siteImg.clear(); C.linkId.clear();
  for (const o of dreams) {
    const sid = jx.i(o, 'id');
    if (sid == null) continue;
    const lid = localId(o);
    C.sid.set(lid, sid);
    C.lid.set(sid, lid);
    C.siteImg.set(lid, jx.str(o, 'image_file'));
  }
  // нити сайта: живут у сна dream_a (как merge_down ядра), без повторов с обеих сторон
  for (const l of jx.arr(j, 'links')) {
    const a = jx.i(l, 'dream_a'), b = jx.i(l, 'dream_b');
    const la = C.lid.get(a), lb = C.lid.get(b);
    const type = jx.str(l, 'type');
    if (la == null || lb == null) continue;
    const lnk = jx.i(l, 'id');
    if (lnk != null) C.linkId.set(linkKey(a, b, type), lnk);
    const da = byId.get(la), db = byId.get(lb);
    if (!da || !db) continue;
    const exists = da.Links.some(x => x.Id === lb && x.Type === type) || db.Links.some(x => x.Id === la && x.Type === type);
    if (!exists) da.Links.push({ Id: lb, Type: type, Reason: jx.str(l, 'reason') });
  }
  overlayApply(list);
  list.sort((x, y) => (x.Date < y.Date ? -1 : x.Date > y.Date ? 1 : 0));
  const planets = {};
  for (const p of jx.arr(j, 'planets')) {
    const key = jx.str(p, 'loc_key');
    const x = jx.f(p, 'x'), y = jx.f(p, 'y'), z = jx.f(p, 'z');
    if (!key || x == null || y == null || z == null) continue;
    planets[key] = { X: x, Y: y, Z: z, Time: jx.str(p, 'pos_time') };
  }
  C.list = list;
  C.planets = planets;
  C.fp = JSON.stringify(j);
  C.at = Date.now();
  C.stale = false;
  return C;
}

// свежий ответ сайта; maxAge — можно взять недавний (мс); одновременные просьбы — один запрос
export function load(maxAge = 0) {
  if (!C.stale && Date.now() - C.at <= maxAge) return Promise.resolve(C);
  if (C.inflight) return C.inflight;
  C.inflight = http.get('dreams').then(build).finally(() => { C.inflight = null; });
  return C.inflight;
}

// вход сменился или вышли — память прежнего аккаунта ни к чему
export function reset() {
  C.list = []; C.planets = {}; C.fp = ''; C.at = 0; C.stale = true;
  C.sid.clear(); C.lid.clear(); C.siteImg.clear(); C.linkId.clear();
  imageCleared.clear();
}

export const markStale = () => { C.stale = true; };
export const find = id => C.list.find(d => d.Id === id) || null;
export const listCopy = () => clone(C.list);

// номер сна на сайте: из последнего ответа либо из самого id («web123»)
export function siteIdOf(id) {
  if (C.sid.has(id)) return C.sid.get(id);
  const m = /^web(\d+)$/.exec(String(id));
  return m ? +m[1] : null;
}

// адрес картинки сна на сайте; s — миниатюра для карты
export function imgUrl(name, s) {
  return http.actionUrl('img&f=' + encodeURIComponent(name) + (s ? '&s=1' : ''));
}
